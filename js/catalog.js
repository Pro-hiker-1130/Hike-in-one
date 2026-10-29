// Hike-in-one — The shared gear catalog: search and linking in the gear form, product form and page, reviews, photos, the catalog browser, link lookup, bulk add, quick add and barcode scanning.
// Plain scripts loaded in order by index.html; they share one global scope.
'use strict';

// ---- Shared gear catalog ----
// Product definitions everyone shares live in Supabase (see
// supabase/migrations/002_catalog.sql); the gear room only stores a
// catalogProductId + snapshot on each item (see catalog-core.js), so
// owned gear keeps working offline and signed out. Searching and
// contributing need a connection; contributing also needs sign-in.
const CC = window.CatalogCore || null;
const CATALOG_ENABLED = !!(CC && sb);

function catalogPhotoUrl(path){ return CC ? CC.photoPublicUrl(SUPABASE_URL, path) : ''; }
function catalogTitle(p){ return [p.brand, p.name, p.model].filter(Boolean).join(' '); }
// Exact grams where small differences matter (formatWeight rounds kg).
function gramsLabel(g){ return Math.round(g).toLocaleString('en-US') + ' g'; }

const catalogApi = {
  // One page of the catalog for the browser: { rows, total }.
  async browse({ q = '', category = '', brand = '', source = '', sort = 'name', offset = 0, limit = 30 }){
    let req = sb.from('catalog_products')
      .select('id, name, brand, model, category, weight_g, origin, catalog_photos(storage_path)', { count: 'exact' });
    if(category) req = req.eq('category', category);
    if(brand) req = req.eq('brand', brand);
    if(source === 'researched') req = req.eq('origin', 'seed');
    if(source === 'hikers') req = req.neq('origin', 'seed');
    // PostgREST's or=() syntax uses , ( ) * as delimiters, so they can't
    // appear in the search text itself.
    const term = String(q).replace(/[,()*%\\:"']/g, ' ').trim().replace(/\s+/g, ' ');
    if(term) req = req.or(['name', 'brand', 'model'].map(c => c + '.ilike.*' + term + '*').join(','));
    if(sort === 'light') req = req.order('weight_g', { ascending: true, nullsFirst: false });
    else if(sort === 'heavy') req = req.order('weight_g', { ascending: false, nullsFirst: false });
    else if(sort === 'new') req = req.order('created_at', { ascending: false });
    req = req.order('brand', { ascending: true }).order('name', { ascending: true }).range(offset, offset + limit - 1);
    const { data, error, count } = await req;
    if(error) throw error;
    return { rows: data || [], total: count == null ? (data || []).length : count };
  },
  // Brand and category counts for the filters (the catalog is small
  // enough to fetch these two columns whole).
  async facets(){
    const { data, error } = await sb.from('catalog_products').select('brand, category, origin').limit(10000);
    if(error) throw error;
    return data || [];
  },
  async search(q){
    const { data, error } = await sb.rpc('search_catalog', { q, max_results: 8 });
    if(error) throw error;
    return data || [];
  },
  async similar(v){
    const { data, error } = await sb.rpc('find_similar_products', { p_brand: v.brand, p_name: v.name, p_model: v.model });
    if(error) throw error;
    return data || [];
  },
  async get(id){
    const { data, error } = await sb.from('catalog_products')
      .select('*, catalog_photos(id, storage_path, uploaded_by, created_at)').eq('id', id).maybeSingle();
    if(error) throw error;
    if(data) data.catalog_photos = (data.catalog_photos || []).slice().sort((a,b)=> a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);
    return data;
  },
  async create(v){
    const { data, error } = await sb.from('catalog_products').insert(v).select('*').single();
    if(error) throw error;
    return data;
  },
  async update(id, v){
    const { data, error } = await sb.from('catalog_products').update(v).eq('id', id).select('*').single();
    if(error) throw error;
    return data;
  },
  async revisionCount(id){
    const { count, error } = await sb.from('catalog_product_revisions').select('id', { count: 'exact', head: true }).eq('product_id', id);
    if(error) throw error;
    return count || 0;
  },
  async reviews(id){
    const { data, error } = await sb.from('reviews')
      .select('id, user_id, rating, text, created_at, updated_at, profiles(display_name)')
      .eq('product_id', id).order('created_at', { ascending: false });
    if(error) throw error;
    return data || [];
  },
  async saveReview(productId, rating, text){
    const { error } = await sb.from('reviews').upsert(
      { product_id: productId, user_id: cloudUser.id, rating, text: text || null },
      { onConflict: 'product_id,user_id' });
    if(error) throw error;
  },
  async deleteReview(id){
    const { error } = await sb.from('reviews').delete().eq('id', id);
    if(error) throw error;
  },
  async profile(){
    const { data, error } = await sb.from('profiles').select('display_name').eq('user_id', cloudUser.id).maybeSingle();
    if(error) throw error;
    return data;
  },
  async saveProfile(name){
    const { error } = await sb.from('profiles').upsert({ user_id: cloudUser.id, display_name: name });
    if(error) throw error;
  },
  async addPhoto(productId, blob){
    const path = cloudUser.id + '/' + productId + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2,6) + '.jpg';
    const up = await sb.storage.from('catalog-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if(up.error) throw up.error;
    const { error } = await sb.from('catalog_photos').insert({ product_id: productId, storage_path: path, uploaded_by: cloudUser.id });
    if(error){
      // Don't leave an orphaned file behind (e.g. the 12-photo cap hit).
      await sb.storage.from('catalog-photos').remove([path]).catch(()=>{});
      throw error;
    }
  },
  async removePhoto(photo){
    const { error } = await sb.from('catalog_photos').delete().eq('id', photo.id);
    if(error) throw error;
    await sb.storage.from('catalog-photos').remove([photo.storage_path]).catch(()=>{});
  },
};

function catalogErrorMessage(err){
  const msg = String((err && (err.message || err.error_description)) || err || '');
  if(err instanceof TypeError || /fetch|network|load failed/i.test(msg)) return 'Couldn\'t reach the gear catalog — check your connection.';
  if(err && err.code === '23505') return 'That product is already in the catalog.';
  if(/maximum of 12 photos/.test(msg)) return 'This product already has the maximum of 12 photos.';
  if(/row-level security|permission denied|JWT/i.test(msg)) return 'Please sign in again to contribute to the catalog.';
  if(err && err.code === '23514') return 'Some details weren\'t accepted — check the fields and try again.';
  return 'Something went wrong with the gear catalog (' + msg.slice(0, 120) + ').';
}

// ---- Gear form <-> catalog ----
const GEAR_LINKED_INPUTS = {
  name: 'gearName', brand: 'gearBrand', model: 'gearModel', category: 'gearCategory',
  weightGrams: 'gearWeight', imageUrl: 'gearImageUrl', productUrl: 'gearProductUrl',
  waterproof: 'gearWaterproof', tempRating: 'gearTempRating',
};
let gearFormCatalog = null;    // {product, photoUrl} picked or refreshed in this form session
let gearFormUnlinked = false;  // the user unlinked an item that was linked
let catalogSearchSeq = 0, catalogSearchTimer = null, catalogSearchedValue = null;

function gearFormValues(){
  const out = {};
  for(const [f, id] of Object.entries(GEAR_LINKED_INPUTS)){
    const v = document.getElementById(id).value;
    out[f] = f === 'weightGrams' ? (v === '' ? null : Number(v)) : v.trim();
  }
  return out;
}
function setGearFormValues(values){
  for(const [f, id] of Object.entries(GEAR_LINKED_INPUTS)){
    if(!(f in values)) continue;
    const el = document.getElementById(id);
    const v = values[f];
    el.value = v == null ? '' : v;
    // A select silently keeps its old value for an unknown option.
    if(el.tagName === 'SELECT' && el.value !== String(v == null ? '' : v)) el.value = f === 'category' ? 'Other' : '';
  }
  syncGearMoreDetails(false);
}
function editingGearItem(){
  const id = document.getElementById('gearId').value;
  return id ? gearItems.find(x=>x.id===id) || null : null;
}
// The link as it stands in the open form: a fresh pick, or the item's
// existing link (unless unlinked).
function currentFormLink(){
  if(gearFormCatalog) return {
    id: gearFormCatalog.product.id,
    snapshot: CC.productToGearFields(gearFormCatalog.product, gearFormCatalog.photoUrl),
    fresh: true,
  };
  const item = editingGearItem();
  if(item && item.catalogProductId && !gearFormUnlinked) return { id: item.catalogProductId, snapshot: item.catalogSnapshot || {}, fresh: false };
  return null;
}

function setCatalogStatus(msg, isError){
  const el = document.getElementById('catalogStatus');
  el.textContent = msg || '';
  el.className = isError ? 'upload-error' : 'upload-status';
}

function resetGearCatalogUI(item){
  gearFormCatalog = null;
  gearFormUnlinked = false;
  catalogSearchedValue = null;
  clearTimeout(catalogSearchTimer);
  catalogSearchSeq++;
  const field = document.getElementById('catalogField');
  field.hidden = !CATALOG_ENABLED;
  if(!CATALOG_ENABLED) return;
  const input = document.getElementById('catalogSearchInput');
  // Existing, unlinked items get a ready-made query to link them later.
  input.value = item && !item.catalogProductId ? CC.suggestQueryForItem(item) : '';
  hideCatalogResults();
  setCatalogStatus('');
  renderCatalogLink();
}

function renderCatalogLink(){
  if(!CATALOG_ENABLED) return;
  const link = currentFormLink();
  const editing = !!editingGearItem();
  document.getElementById('catalogSearchLabel').textContent = link ? 'Linked to the gear catalog'
    : editing ? 'Link this item to the gear catalog' : 'Find it in the gear catalog';
  document.getElementById('catalogSearchWrap').hidden = !!link;
  document.getElementById('catalogLink').hidden = !link;
  if(link){
    const snap = link.snapshot;
    document.getElementById('catalogLinkTitle').textContent = catalogTitle(snap) || 'Catalog product';
    document.getElementById('catalogLinkSub').textContent = [snap.category, snap.weightGrams ? 'catalog weight ' + gramsLabel(snap.weightGrams) : ''].filter(Boolean).join(' · ');
    const thumb = document.getElementById('catalogLinkThumb');
    thumb.style.backgroundImage = snap.imageUrl ? 'url("' + snap.imageUrl.replace(/"/g, '%22') + '")' : '';
    thumb.textContent = snap.imageUrl ? '' : '▣';
    // "Update" only makes sense for a link saved earlier.
    document.getElementById('catalogLinkRefresh').hidden = link.fresh;
  }
  renderCatalogOverrides();
}

const LINKED_FIELD_LABELS = { name:'name', brand:'brand', model:'model', category:'category', weightGrams:'weight',
  imageUrl:'image', productUrl:'product link', waterproof:'waterproof', tempRating:'temp rating' };
function renderCatalogOverrides(){
  const el = document.getElementById('catalogOverrides');
  const link = CATALOG_ENABLED ? currentFormLink() : null;
  if(!link){ el.hidden = true; return; }
  const item = Object.assign(gearFormValues(), { catalogProductId: link.id, catalogSnapshot: link.snapshot });
  const fields = CC.overriddenFields(item);
  if(!fields.length){ el.hidden = true; return; }
  const cmp = CC.weightComparison(item);
  const parts = fields.map(f => f === 'weightGrams' && cmp
    ? 'weight <strong>' + gramsLabel(cmp.mine) + '</strong> (catalog ' + gramsLabel(cmp.catalog) + ')'
    : escapeHtml(LINKED_FIELD_LABELS[f] || f));
  el.innerHTML = 'Your own values, kept on your item only — the shared catalog isn\'t changed: ' + parts.join(', ') + '.';
  el.hidden = false;
}

function hideCatalogResults(){
  const r = document.getElementById('catalogResults');
  r.hidden = true;
  r.innerHTML = '';
  document.getElementById('catalogSearchInput').setAttribute('aria-expanded', 'false');
}

function onCatalogSearchInput(){
  clearTimeout(catalogSearchTimer);
  const q = document.getElementById('catalogSearchInput').value.trim();
  if(q.length < 2){ catalogSearchSeq++; hideCatalogResults(); return; }
  catalogSearchTimer = setTimeout(()=> runCatalogSearch(q), 250);
}

async function runCatalogSearch(q){
  const seq = ++catalogSearchSeq;
  catalogSearchedValue = q;
  const box = document.getElementById('catalogResults');
  box.hidden = false;
  document.getElementById('catalogSearchInput').setAttribute('aria-expanded', 'true');
  box.innerHTML = '<div class="catalog-result-msg">Searching…</div>';
  let rows, err = null;
  try{ rows = await catalogApi.search(q); }catch(e){ err = e; }
  if(seq !== catalogSearchSeq) return; // a newer search is running
  box.innerHTML = '';
  if(err){
    box.innerHTML = '<div class="catalog-result-msg"></div>';
    box.firstChild.textContent = catalogErrorMessage(err);
  } else if(!rows.length){
    box.innerHTML = '<div class="catalog-result-msg">No matches in the catalog yet.</div>';
  }
  (rows || []).forEach(p=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'catalog-result';
    b.setAttribute('role', 'option');
    const meta = [p.category, p.weight_g ? gramsLabel(p.weight_g) : '',
      p.review_count ? '★ ' + Number(p.avg_rating).toFixed(1) + ' (' + p.review_count + ')' : ''].filter(Boolean).join(' · ');
    b.innerHTML = '<span class="catalog-thumb"></span><span class="catalog-result-info"><span class="catalog-result-title"></span><span class="catalog-result-meta"></span></span>';
    const thumb = b.querySelector('.catalog-thumb');
    if(p.photo_path) thumb.style.backgroundImage = 'url("' + catalogPhotoUrl(p.photo_path) + '")';
    else thumb.textContent = '▣';
    b.querySelector('.catalog-result-title').textContent = catalogTitle(p);
    b.querySelector('.catalog-result-meta').textContent = meta;
    b.addEventListener('click', ()=> pickCatalogProduct(p.id));
    // Reviews and photos before choosing; "Use this product" there picks it.
    const row = document.createElement('div');
    row.className = 'catalog-result-row';
    const details = document.createElement('button');
    details.type = 'button';
    details.className = 'link-btn';
    details.textContent = 'Details';
    details.setAttribute('aria-label', 'Details for ' + catalogTitle(p));
    details.addEventListener('click', ()=> openCatalogDetail(p.id, { onUse: id => pickCatalogProduct(id) }));
    row.appendChild(b);
    row.appendChild(details);
    box.appendChild(row);
  });
  if(!err){
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'catalog-result';
    add.innerHTML = '<span class="catalog-thumb">+</span><span class="catalog-result-info"><span class="catalog-result-title catalog-result-add"></span><span class="catalog-result-meta"></span></span>';
    add.querySelector('.catalog-result-add').textContent = cloudUser ? 'Can\'t find it? Add "' + q + '" to the catalog' : 'Can\'t find it? Sign in to add it to the catalog';
    add.querySelector('.catalog-result-meta').textContent = 'Shared with everyone — your own details stay private';
    add.addEventListener('click', ()=>{
      if(!cloudUser){ openCloudSignInModal(); return; }
      openCatalogProductModal({ mode: 'create', seed: catalogSeedFromGearForm(q), onSaved: p => pickCatalogProduct(p.id, p), onPickExisting: id => pickCatalogProduct(id) });
    });
    box.appendChild(add);
  }
}

function catalogSeedFromGearForm(q){
  const f = gearFormValues();
  return {
    brand: f.brand, name: f.name || q, model: f.model,
    category: f.category && f.category !== 'Other' ? f.category : 'Other',
    weight_g: f.weightGrams, product_url: f.productUrl,
  };
}

// Pre-fill the open gear form from a catalog product. A new item takes
// the catalog's values; an item the user already had keeps what they'd
// entered (it becomes their override) and only gains the missing bits.
async function pickCatalogProduct(id, already){
  hideCatalogResults();
  setCatalogStatus('Loading product…');
  let product = null;
  try{ product = already && already.catalog_photos ? already : await catalogApi.get(id); }
  catch(e){ setCatalogStatus(catalogErrorMessage(e), true); return; }
  if(!product){ setCatalogStatus('That product is no longer in the catalog.', true); return; }
  const photos = product.catalog_photos || [];
  const photoUrl = photos.length ? catalogPhotoUrl(photos[0].storage_path) : '';
  const keepExisting = !!editingGearItem();
  setGearFormValues(CC.prefillFields(gearFormValues(), product, photoUrl, keepExisting));
  gearFormCatalog = { product, photoUrl };
  gearFormUnlinked = false;
  document.getElementById('catalogSearchInput').value = '';
  renderCatalogLink();
  setCatalogStatus(keepExisting
    ? 'Linked — your existing values were kept. Save to keep the link.'
    : 'Filled in from the catalog — add your own details (price, purchase date, condition, notes) and save.');
}

async function refreshGearFromCatalog(){
  const item = editingGearItem();
  if(!item || !item.catalogProductId) return;
  setCatalogStatus('Checking the catalog…');
  let product;
  try{ product = await catalogApi.get(item.catalogProductId); }
  catch(e){ setCatalogStatus(catalogErrorMessage(e), true); return; }
  if(!product){ setCatalogStatus('That product is no longer in the catalog.', true); return; }
  const photos = product.catalog_photos || [];
  const photoUrl = photos.length ? catalogPhotoUrl(photos[0].storage_path) : '';
  const current = Object.assign(gearFormValues(), { catalogProductId: item.catalogProductId, catalogSnapshot: item.catalogSnapshot || {} });
  const { item: out, updated, kept } = CC.refreshFromCatalog(current, product, photoUrl);
  setGearFormValues(out);
  gearFormCatalog = { product, photoUrl };
  renderCatalogLink();
  const names = fs => fs.map(f => LINKED_FIELD_LABELS[f] || f).join(', ');
  if(!updated.length && !kept.length) setCatalogStatus('Already up to date with the catalog.');
  else setCatalogStatus([updated.length ? 'Updated ' + names(updated) + ' from the catalog.' : '',
    kept.length ? 'Kept your own ' + names(kept) + '.' : '', 'Save to apply.'].filter(Boolean).join(' '));
}

function unlinkGearFromCatalog(){
  gearFormCatalog = null;
  gearFormUnlinked = true;
  renderCatalogLink();
  setCatalogStatus('Unlinked — save to keep it that way. Your item\'s details stay as they are.');
}

// Applied by handleGearFormSubmit to the item being saved.
function applyCatalogLinkOnSave(data, existing){
  if(gearFormCatalog && CC) return CC.linkItem(data, gearFormCatalog.product, gearFormCatalog.photoUrl);
  if(existing && existing.catalogProductId && !gearFormUnlinked){
    return Object.assign({}, data, { catalogProductId: existing.catalogProductId, catalogSnapshot: existing.catalogSnapshot });
  }
  return data;
}

// ---- Add / edit a catalog product ----
let cpState = null; // {mode, product?, seed?, onSaved, onPickExisting, confirmedDifferent}

function renderSpecFields(category, specs){
  const wrap = document.getElementById('cpSpecs');
  wrap.innerHTML = '';
  (CC.SPEC_FIELDS[category] || []).forEach(def=>{
    const field = document.createElement('div');
    field.className = 'form-field';
    const id = 'cpSpec_' + def.key;
    const label = def.label + (def.unit ? ' (' + def.unit + ')' : '');
    const val = specs && specs[def.key] != null ? specs[def.key] : '';
    if(def.type === 'yesno'){
      field.innerHTML = '<label for="'+id+'"></label><select id="'+id+'" data-spec="'+def.key+'"><option value="">Not set</option><option value="yes">Yes</option><option value="no">No</option></select>';
      field.querySelector('select').value = val === true ? 'yes' : val === false ? 'no' : '';
    } else {
      field.innerHTML = '<label for="'+id+'"></label><input id="'+id+'" data-spec="'+def.key+'" '+(def.type === 'number' ? 'type="number" step="any"' : 'type="text" maxlength="120"')+'>';
      field.querySelector('input').value = val;
    }
    field.querySelector('label').textContent = label;
    const err = document.createElement('span');
    err.className = 'field-error';
    err.dataset.for = 'spec_' + def.key;
    field.appendChild(err);
    wrap.appendChild(field);
  });
}

function openCatalogProductModal(opts){
  if(!cloudUser){ openCloudSignInModal(); return; }
  cpState = Object.assign({ confirmedDifferent: false }, opts);
  const p = opts.mode === 'edit' ? opts.product : (opts.seed || {});
  const sel = document.getElementById('cpCategory');
  if(!sel.options.length) CC.CATEGORIES.forEach(c=>{ const o = document.createElement('option'); o.textContent = c; sel.appendChild(o); });
  document.getElementById('cpTitle').textContent = opts.mode === 'edit' ? 'Edit catalog product' : 'Add to the gear catalog';
  document.getElementById('cpNote').textContent = opts.mode === 'edit'
    ? 'Changes are visible to everyone and kept in the product\'s history. Fix what the product is as sold — your own measured weight belongs on your gear item.'
    : 'The catalog is shared with everyone using Hike-in-one. Describe the product as sold — your own measured weight, price and notes stay private on your gear item.';
  document.getElementById('cpBrand').value = p.brand || '';
  document.getElementById('cpName').value = p.name || '';
  document.getElementById('cpModel').value = p.model || '';
  sel.value = CC.CATEGORIES.includes(p.category) ? p.category : 'Other';
  document.getElementById('cpWeight').value = p.weight_g ? p.weight_g + ' g' : '';
  document.getElementById('cpUrl').value = p.product_url || '';
  document.getElementById('cpDescription').value = p.description || '';
  renderSpecFields(sel.value, p.specs || {});
  // Link lookup only when adding — edits keep the product's recorded source.
  document.getElementById('cpLookupField').hidden = opts.mode === 'edit';
  document.getElementById('cpLookupUrl').value = opts.mode === 'edit' ? '' : (p.product_url || '');
  document.getElementById('cpLookupStatus').textContent = '';
  document.getElementById('cpLookupStatus').className = 'upload-status';
  document.querySelectorAll('#catalogProductForm .field-error').forEach(e=> e.textContent = '');
  document.getElementById('cpError').textContent = '';
  document.getElementById('cpSimilar').hidden = true;
  const submit = document.getElementById('cpSubmitBtn');
  submit.disabled = false;
  submit.textContent = opts.mode === 'edit' ? 'Save changes' : 'Add to catalog';
  document.getElementById('catalogProductModalOverlay').style.display = 'flex';
  document.getElementById(p.brand ? 'cpName' : 'cpBrand').focus();
  onModalOpened('catalogProductModalOverlay');
}
function closeCatalogProductModal(){
  document.getElementById('catalogProductModalOverlay').style.display = 'none';
  cpState = null;
  onModalClosed('catalogProductModalOverlay');
}

function readCatalogProductForm(){
  const specs = {};
  document.querySelectorAll('#cpSpecs [data-spec]').forEach(el=>{ specs[el.dataset.spec] = el.value; });
  const weightText = document.getElementById('cpWeight').value.trim();
  const weight = CC.parseWeightInput(weightText);
  const v = CC.validateProduct({
    brand: document.getElementById('cpBrand').value,
    name: document.getElementById('cpName').value,
    model: document.getElementById('cpModel').value,
    category: document.getElementById('cpCategory').value,
    weight_g: weight,
    product_url: document.getElementById('cpUrl').value,
    description: document.getElementById('cpDescription').value,
    specs,
  });
  if(weightText && weight == null){ v.ok = false; v.errors.weight_g = 'Couldn\'t read that weight — try "1240 g", "1.2 kg" or "42 oz"'; }
  return v;
}

function showSimilarProducts(list){
  const box = document.getElementById('cpSimilar');
  const exact = list.some(p => p.exact);
  box.innerHTML = '';
  const msg = document.createElement('p');
  msg.textContent = exact
    ? 'This product is already in the catalog — use it instead:'
    : 'Is it one of these? Using an existing product keeps the catalog tidy.';
  box.appendChild(msg);
  list.forEach(p=>{
    const row = document.createElement('div');
    row.className = 'catalog-similar-row';
    row.innerHTML = '<span></span><button type="button" class="ghost-btn">Use this</button>';
    row.querySelector('span').textContent = catalogTitle(p) + (p.weight_g ? ' · ' + gramsLabel(p.weight_g) : '');
    row.querySelector('button').addEventListener('click', ()=>{
      const pick = cpState && cpState.onPickExisting;
      closeCatalogProductModal();
      if(pick) afterModalCleanup(()=> pick(p.id));
    });
    box.appendChild(row);
  });
  if(!exact){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'link-btn';
    btn.style.marginTop = '6px';
    btn.textContent = 'None of these — add mine as a new product';
    btn.addEventListener('click', ()=>{
      cpState.confirmedDifferent = true;
      box.hidden = true;
      document.getElementById('catalogProductForm').requestSubmit();
    });
    box.appendChild(btn);
  }
  box.hidden = false;
}

async function submitCatalogProduct(e){
  e.preventDefault();
  if(!cpState) return;
  const v = readCatalogProductForm();
  document.querySelectorAll('#catalogProductForm .field-error').forEach(el=> el.textContent = v.errors[el.dataset.for] || '');
  const errEl = document.getElementById('cpError');
  errEl.textContent = '';
  if(!v.ok) return;
  const submit = document.getElementById('cpSubmitBtn');
  submit.disabled = true;
  const state = cpState;
  try{
    if(state.mode === 'create' && !state.confirmedDifferent){
      const similar = await catalogApi.similar(v.value);
      if(similar.length){ showSimilarProducts(similar); return; }
    }
    const saved = state.mode === 'edit'
      ? await catalogApi.update(state.product.id, v.value)
      : await catalogApi.create(state.lookup
          ? Object.assign({}, v.value, { origin: 'link', source_url: state.lookup.source_url.slice(0, 500) })
          : v.value);
    closeCatalogProductModal();
    if(state.onSaved) afterModalCleanup(()=> state.onSaved(saved));
  }catch(err){
    if(err && err.code === '23505'){
      if(state.mode === 'create'){
        try{ showSimilarProducts((await catalogApi.similar(v.value)).filter(p => p.exact)); return; }catch(_e){}
      }
      errEl.textContent = 'Another catalog product already has this brand, name and model.';
    } else errEl.textContent = catalogErrorMessage(err);
  }finally{
    submit.disabled = false;
  }
}

// ---- Product page: info, photos, reviews ----
let cdState = null; // {id, product, reviews, revisions, onUse}

async function openCatalogDetail(id, opts = {}){
  if(!CATALOG_ENABLED) return;
  cdState = { id, onUse: opts.onUse || null, product: null, reviews: [] };
  document.getElementById('cdTitle').textContent = 'Product';
  document.getElementById('cdBody').hidden = true;
  document.getElementById('cdLoading').textContent = 'Loading…';
  document.getElementById('cdLoading').className = 'upload-status';
  document.getElementById('catalogDetailModalOverlay').style.display = 'flex';
  onModalOpened('catalogDetailModalOverlay');
  await loadCatalogDetail();
}
function closeCatalogDetail(){
  document.getElementById('catalogDetailModalOverlay').style.display = 'none';
  cdState = null;
  onModalClosed('catalogDetailModalOverlay');
}

// Where a catalog product's details came from: researched from brand and
// shop pages (the starter catalog and the catalog bot), or added by a
// hiker in the app (typed in, or filled from a product link).
function catalogSource(p){
  return p && p.origin === 'seed'
    ? { key: 'researched', label: 'Researched', title: 'Weight and specs researched from brand and shop pages' }
    : { key: 'hiker', label: 'Added by a hiker', title: 'Added in the app by someone who uses it' };
}

// ---- Catalog browser: "+ Add item" starts here ----
const CB_PAGE = 30;
let cbState = null;     // { presetCategory, rows, total, offset, seq }
let cbFacets = null, cbFacetsAt = 0;
let cbSearchTimer = 0;

function openCatalogBrowser(presetCategory){
  if(!CATALOG_ENABLED){ openGearModal(null, presetCategory || null); return; }
  cbState = { presetCategory: presetCategory || null, rows: [], total: 0, offset: 0, seq: 0 };
  document.getElementById('cbSearch').value = '';
  document.getElementById('cbSort').value = 'name';
  document.getElementById('cbSource').value = '';
  const cat = document.getElementById('cbCategory');
  if(!cat.options.length){
    cat.appendChild(new Option('All categories', ''));
    CC.CATEGORIES.forEach(c => cat.appendChild(new Option(c, c)));
  }
  cat.value = presetCategory && CC.CATEGORIES.includes(presetCategory) ? presetCategory : '';
  document.getElementById('cbContributeBtn').textContent = cloudUser ? 'Add a product to the catalog' : 'Sign in to add products to the catalog';
  document.getElementById('catalogBrowseModalOverlay').style.display = 'flex';
  onModalOpened('catalogBrowseModalOverlay');
  loadCatalogFacets().then(()=> cbState && renderCatalogFilters());
  renderCatalogFilters();
  loadCatalogPage(true);
}
function closeCatalogBrowser(){
  document.getElementById('catalogBrowseModalOverlay').style.display = 'none';
  cbState = null;
  onModalClosed('catalogBrowseModalOverlay');
}

async function loadCatalogFacets(){
  if(cbFacets && Date.now() - cbFacetsAt < 5 * 60000) return;
  try{ cbFacets = await catalogApi.facets(); cbFacetsAt = Date.now(); }catch(e){ cbFacets = cbFacets || []; }
}

// Category options show how many products each has; the brand list
// narrows to brands in the chosen category.
function renderCatalogFilters(){
  const rows = cbFacets || [];
  const catSel = document.getElementById('cbCategory');
  const counts = {};
  rows.forEach(r => counts[r.category] = (counts[r.category] || 0) + 1);
  Array.from(catSel.options).forEach(o => {
    o.textContent = o.value ? o.value + (rows.length ? ' (' + (counts[o.value] || 0) + ')' : '') : 'All categories';
  });
  const researched = rows.filter(r => r.origin === 'seed').length;
  Array.from(document.getElementById('cbSource').options).forEach(o => {
    const n = o.value === 'researched' ? researched : o.value === 'hikers' ? rows.length - researched : null;
    o.textContent = (o.value === 'researched' ? 'Researched' : o.value === 'hikers' ? 'Added by hikers' : 'All sources') + (n != null && rows.length ? ' (' + n + ')' : '');
  });
  const brandSel = document.getElementById('cbBrand');
  const keep = brandSel.value;
  const inCat = rows.filter(r => !catSel.value || r.category === catSel.value);
  const brandCounts = {};
  inCat.forEach(r => { if(r.brand) brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1; });
  const brands = Object.keys(brandCounts).sort((a,b) => a.localeCompare(b));
  brandSel.innerHTML = '';
  brandSel.appendChild(new Option('All brands', ''));
  brands.forEach(b => brandSel.appendChild(new Option(b + ' (' + brandCounts[b] + ')', b)));
  brandSel.value = brands.includes(keep) ? keep : '';
}

async function loadCatalogPage(reset){
  const state = cbState;
  if(!state) return;
  if(reset){ state.rows = []; state.offset = 0; state.total = 0; }
  const seq = ++state.seq;
  const list = document.getElementById('cbList');
  const countEl = document.getElementById('cbCount');
  if(reset){ list.innerHTML = ''; countEl.textContent = 'Loading…'; }
  const more = list.querySelector('.cb-more');
  if(more){ more.disabled = true; more.textContent = 'Loading…'; }
  try{
    const page = await catalogApi.browse({
      q: document.getElementById('cbSearch').value,
      category: document.getElementById('cbCategory').value,
      brand: document.getElementById('cbBrand').value,
      source: document.getElementById('cbSource').value,
      sort: document.getElementById('cbSort').value,
      offset: state.offset, limit: CB_PAGE,
    });
    if(cbState !== state || seq !== state.seq) return;   // a newer search took over
    state.rows = state.rows.concat(page.rows);
    state.total = page.total;
    state.offset += page.rows.length;
    renderCatalogList();
  }catch(err){
    if(cbState !== state || seq !== state.seq) return;
    countEl.textContent = '';
    list.innerHTML = '<div class="cb-empty"></div>';
    list.querySelector('.cb-empty').textContent = catalogErrorMessage(err) + ' You can still add the item yourself.';
  }
}

function renderCatalogList(){
  const state = cbState;
  const list = document.getElementById('cbList');
  const countEl = document.getElementById('cbCount');
  countEl.textContent = state.total === 1 ? '1 product' : state.total.toLocaleString('en-US') + ' products';
  list.innerHTML = '';
  if(!state.rows.length){
    list.innerHTML = '<div class="cb-empty">Nothing in the catalog matches. Try fewer filters, or add the item yourself below.</div>';
    return;
  }
  state.rows.forEach(p=>{
    const row = document.createElement('div');
    row.className = 'cb-row';
    const photo = (p.catalog_photos || [])[0];
    row.innerHTML =
      '<button type="button" class="cb-open">'+
        '<span class="cb-thumb"></span>'+
        '<span class="cb-text"><span class="cb-name"></span><span class="cb-meta"></span></span>'+
        '<span class="cb-weight"></span>'+
      '</button>'+
      '<button type="button" class="ghost-btn cb-use">Add</button>';
    const thumb = row.querySelector('.cb-thumb');
    if(photo){
      const img = document.createElement('img');
      img.src = catalogPhotoUrl(photo.storage_path); img.alt = ''; img.loading = 'lazy';
      thumb.appendChild(img);
    } else {
      thumb.innerHTML = GEAR_ICONS[p.category] || GEAR_ICONS.Other;
    }
    row.querySelector('.cb-name').textContent = p.name;
    const src = catalogSource(p);
    const badge = document.createElement('span');
    badge.className = 'cb-source is-' + src.key;
    badge.textContent = src.key === 'researched' ? 'Researched' : 'Hiker';
    badge.title = src.title;
    const meta = row.querySelector('.cb-meta');
    meta.appendChild(badge);
    meta.appendChild(document.createTextNode([p.brand, p.model, p.category].filter(Boolean).join(' · ')));
    row.querySelector('.cb-weight').textContent = p.weight_g ? gramsLabel(p.weight_g) : '';
    row.querySelector('.cb-open').setAttribute('aria-label', 'Details for ' + [p.brand, p.name, p.model].filter(Boolean).join(' '));
    row.querySelector('.cb-use').setAttribute('aria-label', 'Add ' + [p.brand, p.name].filter(Boolean).join(' ') + ' to your gear');
    row.querySelector('.cb-open').addEventListener('click', ()=> openCatalogDetail(p.id, { onUse: useCatalogProductFromBrowser }));
    row.querySelector('.cb-use').addEventListener('click', ()=> useCatalogProductFromBrowser(p.id));
    list.appendChild(row);
  });
  if(state.rows.length < state.total){
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'ghost-btn cb-more';
    more.textContent = 'Show more (' + (state.total - state.rows.length) + ' left)';
    more.addEventListener('click', ()=> loadCatalogPage(false));
    list.appendChild(more);
  }
}

// From the browser (or a product page opened from it) into a new gear
// item, filled in from the catalog.
function useCatalogProductFromBrowser(id){
  const preset = cbState ? cbState.presetCategory : null;
  const go = ()=>{ openGearModal(null, preset); pickCatalogProduct(id); };
  if(cbState){ closeCatalogBrowser(); afterModalCleanup(go); } else go();
}

async function loadCatalogDetail(){
  const state = cdState;
  if(!state) return;
  try{
    const [product, reviews, revisions] = await Promise.all([
      catalogApi.get(state.id), catalogApi.reviews(state.id), catalogApi.revisionCount(state.id).catch(()=>0)]);
    if(cdState !== state) return;
    if(!product){
      document.getElementById('cdLoading').textContent = 'That product is no longer in the catalog.';
      document.getElementById('cdLoading').className = 'upload-error';
      return;
    }
    Object.assign(state, { product, reviews, revisions });
    document.getElementById('cdLoading').textContent = '';
    renderCatalogDetail();
  }catch(e){
    if(cdState !== state) return;
    document.getElementById('cdLoading').textContent = catalogErrorMessage(e);
    document.getElementById('cdLoading').className = 'upload-error';
  }
}

function starsHtml(rating){
  const r = Math.round(rating);
  return '<span class="stars" aria-label="'+rating+' out of 5">' + '★'.repeat(r) + '<span class="off">' + '★'.repeat(5 - r) + '</span></span>';
}

function renderCatalogDetail(){
  const { product: p, reviews, revisions } = cdState;
  document.getElementById('cdBody').hidden = false;
  document.getElementById('cdTitle').textContent = catalogTitle(p);
  document.getElementById('cdSub').textContent = [p.category, p.weight_g ? gramsLabel(p.weight_g) + ' listed' : ''].filter(Boolean).join(' · ');

  const photos = p.catalog_photos || [];
  const grid = document.getElementById('cdPhotos');
  grid.innerHTML = '';
  photos.forEach((ph, i)=>{
    const t = document.createElement('div');
    t.className = 'photo-thumb';
    t.innerHTML = '<img loading="lazy" alt="">';
    t.querySelector('img').src = catalogPhotoUrl(ph.storage_path);
    t.querySelector('img').alt = catalogTitle(p) + ' photo ' + (i + 1);
    t.addEventListener('click', ()=> openPhotoLightbox({ photoUrls: photos.map(x => catalogPhotoUrl(x.storage_path)) }, i));
    if(cloudUser && ph.uploaded_by === cloudUser.id){
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'photo-thumb-remove';
      rm.setAttribute('aria-label', 'Remove your photo');
      rm.textContent = '×';
      rm.addEventListener('click', async ev=>{
        ev.stopPropagation();
        setCdPhotoStatus('Removing…');
        try{ await catalogApi.removePhoto(ph); setCdPhotoStatus(''); await loadCatalogDetail(); }
        catch(err){ setCdPhotoStatus(catalogErrorMessage(err), true); }
      });
      t.appendChild(rm);
    }
    grid.appendChild(t);
  });
  document.getElementById('cdAddPhotoLabel').textContent = cloudUser ? '+ Add photos' : 'Sign in to add photos';
  document.getElementById('cdAddPhotoLabel').htmlFor = cloudUser ? 'cdPhotoInput' : '';

  const facts = [];
  if(p.model) facts.push(['Model', escapeHtml(p.model)]);
  facts.push(['Category', escapeHtml(p.category)]);
  if(p.weight_g) facts.push(['Listed weight', gramsLabel(p.weight_g)]);
  (CC.SPEC_FIELDS[p.category] || []).forEach(def=>{
    const v = p.specs ? p.specs[def.key] : null;
    if(v == null || v === '') return;
    const shown = def.type === 'yesno' ? (v ? 'Yes' : 'No') : escapeHtml(String(v)) + (def.unit ? ' ' + escapeHtml(def.unit) : '');
    facts.push([escapeHtml(def.label), shown]);
  });
  if(p.product_url && /^https?:\/\//i.test(p.product_url)){
    facts.push(['Link', '<a target="_blank" rel="noopener noreferrer nofollow" href="'+escapeHtml(p.product_url)+'">'+escapeHtml(p.product_url.replace(/^https?:\/\/(www\.)?/i, '').slice(0, 60))+'</a>']);
  }
  document.getElementById('cdFacts').innerHTML = facts.map(([k, v]) => '<dt>'+k+'</dt><dd>'+v+'</dd>').join('');
  document.getElementById('cdDescription').textContent = p.description || '';
  {
    const src = catalogSource(p);
    const link = p.source_url && /^https?:\/\//i.test(p.source_url)
      ? '<a target="_blank" rel="noopener noreferrer nofollow" href="'+escapeHtml(p.source_url)+'">'+escapeHtml(hostOf(p.source_url))+'</a>' : '';
    const text = src.key === 'researched'
      ? '<span class="cb-source is-researched">Researched</span>' + (link ? 'from ' + link : 'from brand and shop pages') +
        ' <span class="cd-origin">— sizes and versions vary, check before relying on it</span>'
      : '<span class="cb-source is-hiker">Added by a hiker</span>' + (link ? 'specs from ' + link : '');
    facts.push(['Source', text]);
    document.getElementById('cdFacts').innerHTML = facts.map(([k, v]) => '<dt>'+k+'</dt><dd>'+v+'</dd>').join('');
  }
  document.getElementById('cdMeta').textContent = 'Added ' + String(p.created_at).slice(0, 10) +
    (revisions ? ' · edited ' + revisions + ' time' + (revisions !== 1 ? 's' : '') + ', last ' + String(p.updated_at).slice(0, 10) : '');
  document.getElementById('cdEditBtn').textContent = cloudUser ? 'Edit details' : 'Sign in to edit';
  document.getElementById('cdUseBtn').hidden = !cdState.onUse;

  // Reviews
  const count = reviews.length;
  const avg = count ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;
  document.getElementById('cdRatingSummary').innerHTML = count
    ? starsHtml(avg) + ' ' + avg.toFixed(1) + ' · ' + count + ' review' + (count !== 1 ? 's' : '') : 'No reviews yet';
  const mine = cloudUser ? reviews.find(r => r.user_id === cloudUser.id) : null;
  const writeBtn = document.getElementById('cdWriteReviewBtn');
  writeBtn.textContent = !cloudUser ? 'Sign in to review' : mine ? 'Edit your review' : 'Write a review';
  writeBtn.hidden = !document.getElementById('cdReviewForm').hidden;
  const list = document.getElementById('cdReviews');
  list.innerHTML = count ? '' : '<div class="cd-empty">Be the first to share how it held up on the trail.</div>';
  reviews.forEach(r=>{
    const el = document.createElement('div');
    el.className = 'cd-review';
    const edited = new Date(r.updated_at) - new Date(r.created_at) > 60000;
    el.innerHTML = '<div class="cd-review-head">' + starsHtml(r.rating) + '<span class="cd-review-author"></span><span class="cd-review-date"></span></div><p class="cd-review-text"></p>';
    el.querySelector('.cd-review-author').textContent = (r.profiles && r.profiles.display_name) || 'A hiker';
    el.querySelector('.cd-review-date').textContent = String(r.created_at).slice(0, 10) + (edited ? ' · edited' : '');
    el.querySelector('.cd-review-text').textContent = r.text || '';
    list.appendChild(el);
  });
}

function setCdPhotoStatus(msg, isError){
  const el = document.getElementById('cdPhotoStatus');
  el.textContent = msg || '';
  el.className = isError ? 'upload-error' : 'upload-status';
}

async function addCatalogPhotos(fileList){
  if(!cdState || !cdState.product || !cloudUser) return;
  const files = Array.from(fileList).filter(f => /^image\//.test(f.type));
  if(!files.length) return;
  const id = cdState.product.id;
  let added = 0;
  for(const file of files){
    setCdPhotoStatus('Uploading photo ' + (added + 1) + ' of ' + files.length + '…');
    try{
      const dataUrl = await downscaleImage(file, 1600, 0.82);
      const blob = await (await fetch(dataUrl)).blob();
      await catalogApi.addPhoto(id, blob);
      added++;
    }catch(err){
      setCdPhotoStatus(catalogErrorMessage(err), true);
      break;
    }
  }
  if(added) setCdPhotoStatus('Added ' + added + ' photo' + (added !== 1 ? 's' : '') + ' — thanks!');
  if(cdState && cdState.id === id) await loadCatalogDetail();
}

async function openReviewForm(){
  if(!cloudUser){ openCloudSignInModal(); return; }
  const form = document.getElementById('cdReviewForm');
  const mine = cdState.reviews.find(r => r.user_id === cloudUser.id);
  form.dataset.reviewId = mine ? mine.id : '';
  setReviewStars(mine ? mine.rating : 0);
  document.getElementById('cdReviewText').value = mine ? (mine.text || '') : '';
  document.getElementById('cdReviewDeleteBtn').hidden = !mine;
  document.getElementById('cdReviewSubmitBtn').textContent = mine ? 'Save review' : 'Post review';
  document.getElementById('cdReviewError').textContent = '';
  form.hidden = false;
  document.getElementById('cdWriteReviewBtn').hidden = true;
  // Reviews are signed with a display name, asked for once.
  let profile = null;
  try{ profile = await catalogApi.profile(); }catch(e){}
  document.getElementById('cdNameField').hidden = !!profile;
  if(!profile) document.getElementById('cdDisplayName').focus();
}
function closeReviewForm(){
  document.getElementById('cdReviewForm').hidden = true;
  document.getElementById('cdWriteReviewBtn').hidden = false;
}
function setReviewStars(n){
  document.querySelectorAll('#cdStars label').forEach((l, i)=>{
    const input = l.querySelector('input');
    input.checked = i + 1 === n;
    l.classList.toggle('on', i < n);
  });
}

async function submitReview(e){
  e.preventDefault();
  const err = document.getElementById('cdReviewError');
  const checked = document.querySelector('#cdStars input:checked');
  const rating = checked ? Number(checked.value) : 0;
  const text = document.getElementById('cdReviewText').value.trim();
  const needName = !document.getElementById('cdNameField').hidden;
  const name = document.getElementById('cdDisplayName').value.trim();
  if(needName && (name.length < 2 || name.length > 40)){ err.textContent = 'Choose a display name of 2–40 characters.'; return; }
  if(rating < 1 || rating > 5){ err.textContent = 'Pick a star rating.'; return; }
  if(text.length > 4000){ err.textContent = 'Reviews can be up to 4000 characters.'; return; }
  err.textContent = '';
  const btn = document.getElementById('cdReviewSubmitBtn');
  btn.disabled = true;
  try{
    if(needName){ await catalogApi.saveProfile(name); document.getElementById('cdNameField').hidden = true; }
    await catalogApi.saveReview(cdState.product.id, rating, text);
    closeReviewForm();
    await loadCatalogDetail();
  }catch(ex){
    err.textContent = catalogErrorMessage(ex);
  }finally{
    btn.disabled = false;
  }
}

async function deleteMyReview(){
  const btn = document.getElementById('cdReviewDeleteBtn');
  if(btn.dataset.armed !== '1'){
    btn.dataset.armed = '1';
    btn.textContent = 'Click again to delete';
    setTimeout(()=>{ btn.dataset.armed = ''; btn.textContent = 'Delete review'; }, 3000);
    return;
  }
  btn.dataset.armed = '';
  btn.textContent = 'Delete review';
  try{
    await catalogApi.deleteReview(document.getElementById('cdReviewForm').dataset.reviewId);
    closeReviewForm();
    await loadCatalogDetail();
  }catch(ex){
    document.getElementById('cdReviewError').textContent = catalogErrorMessage(ex);
  }
}

// ---- Free product lookup from a link (supabase/functions/product-lookup) ----
async function lookupProductLink(url){
  const { data, error } = await sb.functions.invoke('product-lookup', { body: { url } });
  if(error){
    let msg = null;
    try{ const body = error.context && await error.context.json(); msg = body && body.error; }catch(_e){}
    const status = error.context && error.context.status;
    if(!msg && status === 404) msg = 'Link lookup isn\'t set up yet (the product-lookup function isn\'t deployed).';
    if(!msg && status === 401) msg = 'Please sign in again to use link lookup.';
    const err = new Error(msg || 'Couldn\'t look up that link — check your connection.');
    err.userFacing = true;
    throw err;
  }
  if(!data || !data.product) throw Object.assign(new Error('Couldn\'t find product details on that page.'), { userFacing: true });
  return data.product;
}
function hostOf(url){ try{ return new URL(url).hostname.replace(/^www\./, ''); }catch(_e){ return ''; } }

async function runProductFormLookup(){
  const input = document.getElementById('cpLookupUrl');
  const status = document.getElementById('cpLookupStatus');
  const url = input.value.trim();
  if(!/^https?:\/\//i.test(url)){ status.className = 'upload-error'; status.textContent = 'Paste a full link starting with https://'; return; }
  const btn = document.getElementById('cpLookupBtn');
  btn.disabled = true;
  status.className = 'upload-status';
  status.textContent = 'Reading ' + hostOf(url) + '…';
  try{
    const p = await lookupProductLink(url);
    if(!cpState) return;
    if(p.brand) document.getElementById('cpBrand').value = p.brand;
    if(p.name) document.getElementById('cpName').value = p.name;
    if(p.model) document.getElementById('cpModel').value = p.model;
    if(p.category && p.category !== 'Other'){
      document.getElementById('cpCategory').value = p.category;
      renderSpecFields(p.category, {});
    }
    if(p.weight_g) document.getElementById('cpWeight').value = p.weight_g + ' g';
    document.getElementById('cpUrl').value = p.product_url || url;
    cpState.lookup = { source_url: p.source_url || url };
    cpState.confirmedDifferent = false;
    const missing = ['brand', 'weight'].filter(f => !p.found.includes(f));
    status.textContent = 'Filled in from ' + hostOf(p.source_url || url) +
      (p.weight_g ? ' (weight from "' + (p.weight_text || gramsLabel(p.weight_g)) + '")' : '') +
      ' — please check before saving.' + (missing.length ? ' Not found: ' + missing.join(', ') + '.' : '');
  }catch(err){
    status.className = 'upload-error';
    status.textContent = err.userFacing ? err.message : catalogErrorMessage(err);
  }finally{
    btn.disabled = false;
  }
}

// ---- Bulk: add products to the catalog from a list of links ----
let bulkRun = null;   // {cancelled}
let bulkRows = [];    // {url, product?, error?, dup?, similar?, selected, result?}
const BULK_MAX = 25;

function showBulkStep(step){
  ['Paste','Progress','Review','Done'].forEach(n=>{
    document.getElementById('bulkStep' + n).style.display = n.toLowerCase() === step ? 'flex' : 'none';
  });
}
function openCatalogBulkModal(){
  if(!cloudUser){ openCloudSignInModal(); return; }
  bulkRows = [];
  document.getElementById('bulkPasteError').textContent = '';
  showBulkStep('paste');
  document.getElementById('catalogBulkModalOverlay').style.display = 'flex';
  document.getElementById('bulkUrls').focus();
  onModalOpened('catalogBulkModalOverlay');
}
function closeCatalogBulkModal(){
  if(bulkRun) bulkRun.cancelled = true;
  bulkRun = null;
  document.getElementById('catalogBulkModalOverlay').style.display = 'none';
  onModalClosed('catalogBulkModalOverlay');
}

function parseBulkUrls(text){
  const seen = new Set(), urls = [];
  for(const line of text.split(/[\s,]+/)){
    const u = line.trim();
    if(!/^https?:\/\/\S+\.\S+/i.test(u) || seen.has(u)) continue;
    seen.add(u);
    urls.push(u);
  }
  return urls;
}

async function runBulkLookup(){
  const urls = parseBulkUrls(document.getElementById('bulkUrls').value);
  const err = document.getElementById('bulkPasteError');
  if(!urls.length){ err.textContent = 'Paste at least one link starting with https://'; return; }
  if(urls.length > BULK_MAX){ err.textContent = 'That\'s ' + urls.length + ' links — please do at most ' + BULK_MAX + ' at a time.'; return; }
  err.textContent = '';
  const run = bulkRun = { cancelled: false };
  bulkRows = urls.map(url => ({ url, selected: false }));
  showBulkStep('progress');
  for(let i = 0; i < bulkRows.length && !run.cancelled; i++){
    const row = bulkRows[i];
    document.getElementById('bulkProgressLabel').textContent = 'Looking up ' + (i + 1) + ' of ' + bulkRows.length + '…';
    document.getElementById('bulkProgressFill').style.width = (i / bulkRows.length * 100) + '%';
    document.getElementById('bulkProgressSub').textContent = hostOf(row.url);
    try{
      row.product = await lookupProductLink(row.url);
      try{
        const sim = await catalogApi.similar({ brand: row.product.brand, name: row.product.name, model: row.product.model || null });
        row.dup = sim.find(s => s.exact) || null;
        row.similar = row.dup ? null : (sim[0] || null);
      }catch(_e){}
      row.selected = !row.dup;
    }catch(e){
      row.error = e.userFacing ? e.message : catalogErrorMessage(e);
    }
  }
  if(run.cancelled) return;
  bulkRun = null;
  renderBulkReview();
  showBulkStep('review');
}

function renderBulkReview(){
  const ok = bulkRows.filter(r => r.product && !r.dup).length;
  const dups = bulkRows.filter(r => r.dup).length, failed = bulkRows.filter(r => r.error).length;
  document.getElementById('bulkSummary').innerHTML = '<strong>' + ok + ' product' + (ok !== 1 ? 's' : '') + '</strong> ready to review' +
    (dups ? ' · ' + dups + ' already in the catalog' : '') + (failed ? ' · ' + failed + ' couldn\'t be read' : '') +
    '. Fix anything that looks off — it\'s shared with everyone.';
  const list = document.getElementById('bulkList');
  list.innerHTML = '<div class="bulk-head">Brand · Name · Model · Category · Weight (g)</div>';
  bulkRows.forEach((row, i)=>{
    const el = document.createElement('div');
    el.className = 'bulk-row' + (row.selected ? '' : ' is-off');
    el.dataset.index = i;
    if(row.product){
      const p = row.product;
      el.innerHTML =
        '<input type="checkbox" aria-label="Add this product">' +
        '<input type="text" data-f="brand" maxlength="80" placeholder="Brand *" aria-label="Brand">' +
        '<input type="text" data-f="name" maxlength="120" placeholder="Name *" aria-label="Name">' +
        '<input type="text" data-f="model" maxlength="80" placeholder="Model" aria-label="Model">' +
        '<select data-f="category" aria-label="Category"></select>' +
        '<input type="number" data-f="weight_g" min="1" max="50000" step="1" placeholder="g" aria-label="Weight in grams">' +
        '<div class="bulk-row-note"></div>';
      const sel = el.querySelector('select');
      CC.CATEGORIES.forEach(c=>{ const o = document.createElement('option'); o.textContent = c; sel.appendChild(o); });
      el.querySelector('[data-f="brand"]').value = p.brand || '';
      el.querySelector('[data-f="name"]').value = p.name || '';
      el.querySelector('[data-f="model"]').value = p.model || '';
      sel.value = CC.CATEGORIES.includes(p.category) ? p.category : 'Other';
      el.querySelector('[data-f="weight_g"]').value = p.weight_g || '';
      const cb = el.querySelector('input[type="checkbox"]');
      cb.checked = row.selected;
      cb.disabled = !!row.dup || !!(row.result && row.result.ok);
      // Keep the user's corrections if the list is redrawn.
      el.querySelectorAll('[data-f]').forEach(inp=>{
        inp.addEventListener('input', ()=>{
          p[inp.dataset.f] = inp.dataset.f === 'weight_g' ? (inp.value === '' ? null : Number(inp.value)) : inp.value;
        });
      });
      cb.addEventListener('change', ()=>{ row.selected = cb.checked; el.classList.toggle('is-off', !cb.checked); updateBulkAddBtn(); });
      const note = el.querySelector('.bulk-row-note');
      if(row.result){ note.textContent = row.result.text; note.className = 'bulk-row-note ' + (row.result.ok ? '' : 'err'); }
      else if(row.dup){ note.textContent = 'Already in the catalog as "' + catalogTitle(row.dup) + '" — skipped.'; note.className = 'bulk-row-note warn'; }
      else {
        const bits = [hostOf(p.source_url || row.url)];
        if(p.weight_g && p.weight_text) bits.push('weight from "' + p.weight_text + '"');
        if(!p.weight_g) bits.push('no weight found');
        if(row.similar) bits.push('similar to "' + catalogTitle(row.similar) + '" — make sure it\'s a different product');
        note.textContent = bits.join(' · ');
        note.className = 'bulk-row-note' + (row.similar || !p.weight_g ? ' warn' : '');
      }
    } else {
      el.innerHTML = '<input type="checkbox" disabled aria-label="Could not be read"><div class="bulk-row-note err" style="grid-column:2 / -1"></div>';
      el.querySelector('.bulk-row-note').textContent = row.url + ' — ' + row.error;
    }
    list.appendChild(el);
  });
  updateBulkAddBtn();
}
function updateBulkAddBtn(){
  const n = bulkRows.filter(r => r.selected && r.product && !r.dup && !(r.result && r.result.ok)).length;
  const btn = document.getElementById('bulkAddBtn');
  btn.disabled = !n;
  btn.textContent = n ? 'Add ' + n + ' to catalog' : 'Add to catalog';
}

async function addBulkToCatalog(){
  const err = document.getElementById('bulkReviewError');
  err.textContent = '';
  const rows = bulkRows.map((row, i)=> ({ row, el: document.querySelector('#bulkList .bulk-row[data-index="' + i + '"]') }))
    .filter(x => x.row.selected && x.row.product && !x.row.dup && !(x.row.result && x.row.result.ok));
  // Validate everything first so one bad row doesn't leave a half-done batch.
  const prepared = [];
  for(const { row, el } of rows){
    const f = k => el.querySelector('[data-f="' + k + '"]').value;
    const v = CC.validateProduct({ brand: f('brand'), name: f('name'), model: f('model'), category: f('category'),
      weight_g: f('weight_g') === '' ? null : Number(f('weight_g')), product_url: row.product.product_url || row.url });
    if(!v.ok){
      row.result = { ok: false, text: Object.values(v.errors).join(' · ') };
      continue;
    }
    prepared.push({ row, value: Object.assign(v.value, { origin: 'link', source_url: (row.product.source_url || row.url).slice(0, 500) }) });
  }
  const btn = document.getElementById('bulkAddBtn');
  btn.disabled = true;
  let added = 0, skipped = 0, failed = 0;
  for(const { row, value } of prepared){
    btn.textContent = 'Adding ' + (added + skipped + failed + 1) + ' of ' + prepared.length + '…';
    try{
      const saved = await catalogApi.create(value);
      row.result = { ok: true, text: 'Added as "' + catalogTitle(saved) + '".' };
      row.selected = false;
      added++;
    }catch(e){
      if(e && e.code === '23505'){ row.result = { ok: false, text: 'Already in the catalog — skipped.' }; row.selected = false; skipped++; }
      else { row.result = { ok: false, text: catalogErrorMessage(e) }; failed++; }
    }
  }
  const invalid = rows.length - prepared.length;
  if(invalid || failed){
    renderBulkReview();
    err.textContent = (added ? 'Added ' + added + '. ' : '') + (invalid ? invalid + ' need fixing (see notes). ' : '') + (failed ? failed + ' failed.' : '');
    return;
  }
  document.getElementById('bulkDoneTitle').textContent = added ? 'Added ' + added + ' product' + (added !== 1 ? 's' : '') + ' to the catalog' : 'Nothing new added';
  document.getElementById('bulkDoneSub').textContent = (skipped ? skipped + ' turned out to be in the catalog already. ' : '') +
    'They\'re now searchable for everyone when adding gear.';
  showBulkStep('done');
}

// ---- Quick add: product link preview ----
// Uses microlink.io's free, keyless, browser-friendly link-unfurl API to
// pull a title + image from a pasted product URL. Free tier is capped at
// 25 requests/day (per IP) — plenty for occasionally adding gear.
async function fetchGearFromUrl(url){
  const statusEl = document.getElementById('gearQuickAddStatus');
  statusEl.className = 'upload-status';
  statusEl.textContent = 'Fetching preview…';
  try{
    const res = await fetch('https://api.microlink.io/?url='+encodeURIComponent(url)+'&palette=false');
    if(res.status === 429){
      const err = new Error('quota'); err.kind = 'quota'; throw err;
    }
    let json;
    try{
      json = await res.json();
    }catch(parseErr){
      const err = new Error('Preview service returned something unexpected (HTTP '+res.status+').');
      err.kind = 'bad-response';
      throw err;
    }
    if(json.status !== 'success' || !json.data){
      const err = new Error(json.message || 'No preview data for that link.');
      err.kind = 'no-preview';
      throw err;
    }
    const data = json.data;
    if(data.title) document.getElementById('gearName').value = data.title;
    if(data.image && data.image.url) document.getElementById('gearImageUrl').value = data.image.url;
    document.getElementById('gearProductUrl').value = url;
    statusEl.textContent = 'Filled in name and image from the link — check weight, price and category.';
  }catch(err){
    console.error('Link preview failed:', err);
    statusEl.className = 'upload-error';
    if(err.kind === 'quota'){
      statusEl.textContent = "Today's free preview quota is used up (it resets daily) — fill in the fields manually for now.";
    } else if(err instanceof TypeError){
      // fetch() itself rejected before any response came back — almost
      // always a network failure or the browser blocking a cross-origin
      // request (CORS), which JS is never told the specifics of.
      statusEl.textContent = "Couldn't reach the preview service at all (blocked or offline) — check the browser console for details, or fill in manually.";
    } else {
      statusEl.textContent = "Couldn't get a preview for that link (" + err.message + ") — you can still fill in the fields manually.";
    }
  }
}

// ---- Quick add: barcode scan ----
// ZXing decodes frames from the camera stream entirely client-side; once a
// barcode is read, the code is looked up against UPCitemdb's free "trial"
// endpoint (no key, 100 lookups/day) for a title/brand/image/weight.
let barcodeReader = null;

// Chrome on Android supports requesting continuous autofocus on a live
// camera track; without it, some phones default to a fixed-focus preview
// that never sharpens up close, which reads as "the camera won't focus."
// iOS Safari and desktop browsers don't expose this — silently a no-op there.
async function enableContinuousFocus(stream){
  try{
    const track = stream.getVideoTracks()[0];
    if(!track || !track.getCapabilities) return;
    const caps = track.getCapabilities();
    if(caps.focusMode && caps.focusMode.includes('continuous')){
      await track.applyConstraints({advanced:[{focusMode:'continuous'}]});
    }
  }catch(err){
    // Best-effort only — never block scanning on this.
  }
}

async function openBarcodeScanner(){
  const overlay = document.getElementById('barcodeModalOverlay');
  const statusEl = document.getElementById('barcodeScanStatus');
  statusEl.className = 'upload-status';
  statusEl.textContent = 'Hold the barcode flat, a few inches from the camera…';
  overlay.style.display = 'flex';
  onModalOpened('barcodeModalOverlay');

  if(typeof ZXing === 'undefined'){
    statusEl.className = 'upload-error';
    statusEl.textContent = 'Barcode scanning failed to load. Check your connection and try again.';
    return;
  }
  try{
    // Get the stream ourselves (rather than letting ZXing's
    // decodeFromConstraints do it) so focus can be settled *before* the
    // decode loop starts. ZXing caches its internal capture canvas at
    // whatever size the video is on the first decoded frame; applying
    // focus constraints afterward can make the camera briefly renegotiate
    // resolution, desyncing that cached canvas from the live feed and
    // silently corrupting every scan after — the video still looks fine,
    // but nothing ever decodes.
    const constraints = {
      video: { facingMode: 'environment', width: {ideal: 1280}, height: {ideal: 720} }
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    await enableContinuousFocus(stream);

    barcodeReader = new ZXing.BrowserMultiFormatReader();
    const videoEl = document.getElementById('barcodeVideo');
    await barcodeReader.decodeFromStream(stream, videoEl, (result)=>{
      if(result){
        const code = result.getText();
        closeBarcodeScanner();
        lookupBarcodeAndFill(code);
      }
      // The callback also fires a NotFoundException on every frame with no
      // match — that's expected while scanning, not an error.
    });
  }catch(err){
    console.error('Camera error:', err);
    statusEl.className = 'upload-error';
    statusEl.textContent = 'Could not access the camera. Check permissions and try again.';
  }
}

function closeBarcodeScanner(){
  if(barcodeReader){
    barcodeReader.reset();
    barcodeReader = null;
  }
  document.getElementById('barcodeModalOverlay').style.display = 'none';
  onModalClosed('barcodeModalOverlay');
}

function parseWeightToGrams(weightStr){
  if(!weightStr) return null;
  const m = String(weightStr).match(/([\d.]+)\s*(kilograms?|kg|grams?|g|pounds?|lbs?|ounces?|oz)\b/i);
  if(!m) return null;
  const val = parseFloat(m[1]);
  if(!isFinite(val)) return null;
  const unit = m[2].toLowerCase();
  if(unit.startsWith('kg') || unit.startsWith('kilo')) return Math.round(val*1000);
  if(unit.startsWith('lb') || unit.startsWith('pound')) return Math.round(val*453.592);
  if(unit.startsWith('oz') || unit.startsWith('ounce')) return Math.round(val*28.3495);
  if(unit.startsWith('g')) return Math.round(val);
  return null;
}

async function lookupBarcodeAndFill(code){
  const statusEl = document.getElementById('gearQuickAddStatus');
  statusEl.className = 'upload-status';
  statusEl.textContent = 'Looking up barcode '+code+'…';
  try{
    const res = await fetch('https://api.upcitemdb.com/prod/trial/lookup?upc='+encodeURIComponent(code));
    const json = await res.json();
    const item = json.items && json.items[0];
    if(!item) throw new Error('not found');
    if(item.title) document.getElementById('gearName').value = item.title;
    if(item.brand) document.getElementById('gearBrand').value = item.brand;
    if(item.images && item.images.length) document.getElementById('gearImageUrl').value = item.images[0];
    const weightG = parseWeightToGrams(item.weight);
    if(weightG) document.getElementById('gearWeight').value = weightG;
    statusEl.textContent = 'Filled in from barcode lookup — check weight, price and category.';
  }catch(err){
    statusEl.className = 'upload-error';
    statusEl.textContent = "Couldn't find that barcode in the product database. You can still fill in the fields manually.";
  }
}

async function handleGearFormSubmit(e){
  e.preventDefault();
  const name = document.getElementById('gearName').value.trim();
  if(!name) return;
  const id = document.getElementById('gearId').value;
  const tags = document.getElementById('gearTags').value.split(',').map(s=>s.trim()).filter(Boolean);
  const data = {
    id: id || uid(),
    name,
    category: document.getElementById('gearCategory').value,
    brand: document.getElementById('gearBrand').value.trim(),
    model: document.getElementById('gearModel').value.trim(),
    weightGrams: document.getElementById('gearWeight').value ? Number(document.getElementById('gearWeight').value) : null,
    quantity: Math.max(1, Number(document.getElementById('gearQuantity').value) || 1),
    status: document.getElementById('gearStatus').value,
    price: document.getElementById('gearPrice').value ? Number(document.getElementById('gearPrice').value) : null,
    currency: document.getElementById('gearCurrency').value,
    purchaseDate: document.getElementById('gearPurchaseDate').value,
    condition: document.getElementById('gearCondition').value,
    lifespanKm: document.getElementById('gearLifespanKm').value ? Number(document.getElementById('gearLifespanKm').value) : null,
    waterproof: document.getElementById('gearWaterproof').value,
    tempRating: document.getElementById('gearTempRating').value.trim(),
    productUrl: document.getElementById('gearProductUrl').value.trim(),
    imageUrl: document.getElementById('gearImageUrl').value.trim(),
    tags,
    notes: document.getElementById('gearNotes').value.trim()
  };

  const existing = id ? gearItems.find(x=>x.id===id) : null;
  const saved = applyCatalogLinkOnSave(data, existing);
  if(id){
    const idx = gearItems.findIndex(x=>x.id===id);
    if(idx > -1) gearItems[idx] = saved;
  } else {
    gearItems.push(saved);
  }
  await saveGear();
  closeGearModal();
  refreshGear();
}

async function handleGearDelete(){
  const btn = document.getElementById('gearDeleteBtn');
  if(btn.dataset.armed !== '1'){
    btn.dataset.armed = '1';
    btn.textContent = 'Click again to confirm';
    setTimeout(()=>{ btn.dataset.armed=''; btn.textContent='Delete'; }, 3000);
    return;
  }
  const id = document.getElementById('gearId').value;
  gearItems = gearItems.filter(x=>x.id!==id);
  await saveGear();
  closeGearModal();
  refreshGear();
}
