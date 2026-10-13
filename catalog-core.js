// Shared gear catalog — the pure logic behind linking gear-room items to
// catalog products. No DOM and no network here, so it runs unchanged in
// the browser (window.CatalogCore) and under `node --test`.
//
// How linking works: a gear item keeps its OWN copy of the catalog fields
// (so weights, loadouts and charts keep working offline), plus
//   catalogProductId  — which product it is
//   catalogSnapshot   — the catalog's values at the time it was linked
// A field whose value differs from the snapshot is the user's personal
// override (e.g. their measured weight). Nothing here ever writes to the
// catalog: refreshing from it only touches fields the user hasn't changed.
(function(root, factory){
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else root.CatalogCore = factory();
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  const CATEGORIES = ['Backpack','Shelter','Sleep system','Clothing','Footwear','Cooking','Water',
    'Navigation','Electronics','Safety','Hygiene','Food','Other'];

  // Gear-item fields that come from the catalog. Everything else on an
  // item (price, purchase date, condition, notes, quantity, status, tags,
  // lifespan…) is personal and never touched by linking.
  const LINKED_FIELDS = ['name','brand','model','category','weightGrams','imageUrl','productUrl','waterproof','tempRating'];

  // Category-specific details, stored in catalog_products.specs.
  const SPEC_FIELDS = {
    'Backpack':     [{key:'volume_l', label:'Volume', unit:'L', type:'number'}],
    'Shelter':      [{key:'capacity_persons', label:'Sleeps', unit:'persons', type:'number'},
                     {key:'packed_size', label:'Packed size', type:'text'}],
    'Sleep system': [{key:'temp_comfort_c', label:'Comfort temp', unit:'°C', type:'number'},
                     {key:'temp_limit_c', label:'Limit temp', unit:'°C', type:'number'},
                     {key:'r_value', label:'R-value', type:'number'}],
    'Clothing':     [{key:'waterproof', label:'Waterproof', type:'yesno'},
                     {key:'insulation', label:'Insulation', type:'text'}],
    'Footwear':     [{key:'waterproof', label:'Waterproof', type:'yesno'},
                     {key:'drop_mm', label:'Drop', unit:'mm', type:'number'}],
    'Cooking':      [{key:'capacity_ml', label:'Capacity', unit:'ml', type:'number'}],
    'Water':        [{key:'capacity_ml', label:'Capacity', unit:'ml', type:'number'},
                     {key:'filter_type', label:'Filter type', type:'text'}],
    'Electronics':  [{key:'battery_mah', label:'Battery', unit:'mAh', type:'number'}],
  };

  // Mirrors catalog_normalize() in supabase/migrations/002_catalog.sql.
  function normalize(t){
    return String(t == null ? '' : t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }
  // Mirrors catalog_key(): brand|name|model, with a brand repeated at the
  // start of the name ignored ("Osprey Exos 58" by Osprey = "Exos 58").
  function productKey(brand, name, model){
    const b = normalize(brand);
    let n = normalize(name);
    if(b && n.startsWith(b + ' ')) n = n.slice(b.length + 1);
    return b + '|' + n + '|' + normalize(model);
  }

  // "1.2 kg", "850g", "2 lb 3 oz", "42 oz", or a bare number (grams).
  function parseWeightInput(input){
    const s = String(input == null ? '' : input).trim().toLowerCase().replace(',', '.');
    if(!s) return null;
    if(/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s));
    const re = /(\d+(?:\.\d+)?)\s*(kg|kilograms?|g|grams?|lbs?|pounds?|oz|ounces?)\b/g;
    let total = 0, matched = false, m, consumed = '';
    while((m = re.exec(s))){
      matched = true;
      consumed += m[0];
      const v = parseFloat(m[1]), u = m[2];
      if(u.startsWith('k')) total += v * 1000;
      else if(u.startsWith('l') || u.startsWith('p')) total += v * 453.59237;
      else if(u.startsWith('o')) total += v * 28.349523125;
      else total += v;
    }
    // Reject leftovers like "about 2 kg-ish" being half-understood.
    if(!matched || s.replace(/\s+/g, '').length !== consumed.replace(/\s+/g, '').length) return null;
    return Math.round(total);
  }

  // Same rules as the table's CHECK constraints, so the form can explain
  // a problem before the database rejects it. Returns the cleaned value.
  function validateProduct(p){
    const errors = {};
    const s = v => (v == null ? '' : String(v)).trim();
    const value = {
      name: s(p.name), brand: s(p.brand), model: s(p.model) || null,
      category: s(p.category) || 'Other',
      weight_g: p.weight_g == null || p.weight_g === '' ? null : Number(p.weight_g),
      description: s(p.description) || null,
      product_url: s(p.product_url) || null,
      specs: {},
    };
    if(value.name.length < 2) errors.name = 'Name needs at least 2 characters';
    else if(value.name.length > 120) errors.name = 'Name is too long (120 max)';
    if(!value.brand) errors.brand = 'Brand is required';
    else if(value.brand.length > 80) errors.brand = 'Brand is too long (80 max)';
    if(value.model && value.model.length > 80) errors.model = 'Model is too long (80 max)';
    if(!CATEGORIES.includes(value.category)) errors.category = 'Pick a category from the list';
    if(value.weight_g != null){
      if(!Number.isFinite(value.weight_g) || value.weight_g < 1 || value.weight_g > 50000) errors.weight_g = 'Weight must be between 1 g and 50 kg';
      else value.weight_g = Math.round(value.weight_g);
    }
    if(value.description && value.description.length > 2000) errors.description = 'Description is too long (2000 max)';
    if(value.product_url && (!/^https?:\/\//i.test(value.product_url) || value.product_url.length > 500)) errors.product_url = 'Link must start with http:// or https://';
    const specDefs = SPEC_FIELDS[value.category] || [];
    for(const def of specDefs){
      const raw = p.specs ? p.specs[def.key] : undefined;
      if(raw == null || raw === '') continue;
      if(def.type === 'number'){
        const n = Number(raw);
        if(!Number.isFinite(n)) errors['spec_' + def.key] = def.label + ' must be a number';
        else value.specs[def.key] = n;
      } else if(def.type === 'yesno'){
        if(raw === true || raw === 'yes') value.specs[def.key] = true;
        else if(raw === false || raw === 'no') value.specs[def.key] = false;
      } else {
        const t = String(raw).trim().slice(0, 120);
        if(t) value.specs[def.key] = t;
      }
    }
    return { ok: Object.keys(errors).length === 0, errors, value };
  }

  // The gear-item view of a catalog product: what pre-fills the form and
  // what's remembered as the snapshot.
  function productToGearFields(product, photoUrl){
    const specs = product.specs || {};
    const waterproof = specs.waterproof === true ? 'yes' : specs.waterproof === false ? 'no' : '';
    const tempRating = specs.temp_comfort_c != null ? specs.temp_comfort_c + '°C'
      : specs.temp_limit_c != null ? specs.temp_limit_c + '°C' : '';
    return {
      name: product.name || '',
      brand: product.brand || '',
      model: product.model || '',
      category: CATEGORIES.includes(product.category) ? product.category : 'Other',
      weightGrams: product.weight_g != null ? product.weight_g : null,
      imageUrl: photoUrl || '',
      productUrl: product.product_url || '',
      waterproof,
      tempRating,
    };
  }

  function sameValue(a, b){
    const norm = v => (v == null ? '' : typeof v === 'number' ? String(v) : String(v).trim());
    return norm(a) === norm(b);
  }

  // Filling in the add/edit form after a catalog pick.
  //   keepExisting=false (new item): catalog values replace the form's.
  //   keepExisting=true (linking an item the user already had): only
  //     empty fields are filled; what they'd entered — say a weighed
  //     1,212 g — stays, and becomes an override against the catalog.
  // Category "Other" is the form's default, so it counts as empty.
  function prefillFields(current, product, photoUrl, keepExisting){
    const fromCatalog = productToGearFields(product, photoUrl);
    const out = Object.assign({}, current);
    for(const f of LINKED_FIELDS){
      const have = current[f];
      const empty = have == null || have === '' || (f === 'category' && have === 'Other');
      if(!keepExisting || empty){
        if(fromCatalog[f] !== '' && fromCatalog[f] != null) out[f] = fromCatalog[f];
        else if(!keepExisting) out[f] = fromCatalog[f];
      }
    }
    return out;
  }

  // Attach the link to an item that's being saved.
  function linkItem(item, product, photoUrl){
    return Object.assign({}, item, {
      catalogProductId: product.id,
      catalogSnapshot: productToGearFields(product, photoUrl),
    });
  }
  function unlinkItem(item){
    const out = Object.assign({}, item);
    delete out.catalogProductId;
    delete out.catalogSnapshot;
    return out;
  }
  function isLinked(item){ return !!(item && item.catalogProductId); }

  // Fields where the user's item deliberately differs from the catalog.
  function overriddenFields(item){
    if(!isLinked(item) || !item.catalogSnapshot) return [];
    return LINKED_FIELDS.filter(f => !sameValue(item[f], item.catalogSnapshot[f]));
  }

  // Pull later catalog corrections into a linked item without clobbering
  // the user's own values. Returns the new item plus what happened, so the
  // UI can say "weight updated; kept your name".
  function refreshFromCatalog(item, product, photoUrl){
    if(!isLinked(item)) return { item, updated: [], kept: [] };
    const overrides = new Set(overriddenFields(item));
    const latest = productToGearFields(product, photoUrl);
    const out = Object.assign({}, item);
    const updated = [], kept = [];
    for(const f of LINKED_FIELDS){
      if(sameValue(item.catalogSnapshot ? item.catalogSnapshot[f] : undefined, latest[f])) continue; // catalog unchanged
      if(overrides.has(f)){ kept.push(f); continue; }
      out[f] = latest[f];
      updated.push(f);
    }
    out.catalogSnapshot = latest;
    return { item: out, updated, kept };
  }

  // A weight difference worth showing: "your 1,212 g · catalog 1,240 g".
  function weightComparison(item){
    if(!isLinked(item) || !item.catalogSnapshot) return null;
    const mine = item.weightGrams, cat = item.catalogSnapshot.weightGrams;
    if(mine == null || cat == null || mine === cat) return null;
    return { mine, catalog: cat, diff: mine - cat };
  }

  function photoPublicUrl(supabaseUrl, storagePath){
    if(!storagePath) return '';
    return supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/catalog-photos/' +
      storagePath.split('/').map(encodeURIComponent).join('/');
  }

  // Existing items aren't migrated — they're simply unlinked. This picks
  // a search query for the "Find in catalog" button on them.
  function suggestQueryForItem(item){
    const brand = (item.brand || '').trim(), name = (item.name || '').trim();
    if(brand && normalize(name).startsWith(normalize(brand))) return name;
    return [brand, name].filter(Boolean).join(' ');
  }

  return {
    CATEGORIES, LINKED_FIELDS, SPEC_FIELDS,
    normalize, productKey, parseWeightInput, validateProduct,
    productToGearFields, prefillFields, linkItem, unlinkItem, isLinked,
    overriddenFields, refreshFromCatalog, weightComparison, photoPublicUrl,
    suggestQueryForItem,
  };
});
