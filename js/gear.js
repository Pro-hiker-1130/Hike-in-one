// Hike-in-one — The Gear Room: stats, breakdown chart, weight-by-category list, shelf scene, gear cards and the gear form.
// Plain scripts loaded in order by index.html; they share one global scope.
'use strict';

// ---- Gear Room logic ----
const GEAR_CATEGORY_COLORS = {
  'Backpack':'#3A5A40','Shelter':'#C4501C','Sleep system':'#1F6FA8','Clothing':'#6A4C93',
  'Footwear':'#8A6A00','Cooking':'#A3366B','Water':'#2F8F83','Navigation':'#5B5F97',
  'Electronics':'#7A8B3A','Safety':'#B3261E','Hygiene':'#4F8FBF','Food':'#B87333','Other':'#A3B18A'
};
const GEAR_CATEGORIES = [
  'Backpack','Shelter','Sleep system','Clothing','Footwear','Cooking',
  'Water','Navigation','Electronics','Safety','Hygiene','Food','Other'
];
// How the garage scene groups categories into shelves/hooks/a bench —
// every GEAR_CATEGORIES entry appears in exactly one band.
const GEAR_SCENE_BANDS = [
  {type:'hook', label:'On the hooks', categories:['Backpack','Clothing']},
  {type:'shelf', label:'Upper shelf', categories:['Shelter','Sleep system','Cooking','Water']},
  {type:'shelf', label:'Lower shelf', categories:['Navigation','Electronics','Safety','Hygiene','Food','Other']},
  {type:'bench', label:'Boot bench', categories:['Footwear']}
];
// Phones fit three items per row: hanging the sleeping bag on the hooks
// leaves 3 on the hooks, 3 on the upper shelf and 2 even rows below,
// instead of a lone item wrapping onto its own line.
const NARROW_SCENE = window.matchMedia('(max-width:760px)');
function gearSceneBands(){
  if(!NARROW_SCENE.matches) return GEAR_SCENE_BANDS;
  return GEAR_SCENE_BANDS.map(band => band.type === 'hook'
    ? Object.assign({}, band, {categories: band.categories.concat('Sleep system')})
    : Object.assign({}, band, {categories: band.categories.filter(c => c !== 'Sleep system')}));
}
const ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const GEAR_ICONS = {
  All: '<svg '+ICON_ATTRS+'><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  Backpack: '<svg '+ICON_ATTRS+'><path d="M8 8V6a4 4 0 0 1 8 0v2"/><rect x="5" y="8" width="14" height="13" rx="2.5"/><path d="M9 8v3.5h6V8"/><line x1="9" y1="16" x2="15" y2="16"/></svg>',
  Shelter: '<svg '+ICON_ATTRS+'><path d="M12 3 21 20H3Z"/><path d="M8 20 12 12 16 20"/></svg>',
  'Sleep system': '<svg '+ICON_ATTRS+'><path d="M9 3.5a3 3 0 0 1 6 0V7H9Z"/><path d="M8 7c-1.6 2-1.6 5.5-1.6 8.5C6.4 19.5 8.7 21.5 12 21.5s5.6-2 5.6-6c0-3 0-6.5-1.6-8.5"/><line x1="12" y1="10" x2="12" y2="18"/></svg>',
  Clothing: '<svg '+ICON_ATTRS+'><path d="M8 4 4 7v4h3v9h10v-9h3V7l-4-3-3 2Z"/><line x1="12" y1="10" x2="12" y2="20"/></svg>',
  Footwear: '<svg '+ICON_ATTRS+'><path d="M5 3v8.5L2 14v4.5C2 19.5 2.5 20 3.5 20h17c1 0 1.5-.5 1.5-1.5v-1c0-1.3-.9-2.4-2.2-2.9L13 12V3Z"/><line x1="5" y1="8" x2="9.5" y2="8"/></svg>',
  Cooking: '<svg '+ICON_ATTRS+'><rect x="4" y="9" width="16" height="10" rx="1.5"/><line x1="2" y1="9" x2="4" y2="9"/><line x1="20" y1="9" x2="22" y2="9"/><path d="M8 9V6.5a4 4 0 0 1 8 0V9"/></svg>',
  Water: '<svg '+ICON_ATTRS+'><path d="M12 2.5s7 8 7 12.7a7 7 0 0 1-14 0C5 10.5 12 2.5 12 2.5Z"/></svg>',
  Navigation: '<svg '+ICON_ATTRS+'><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13 13l-4.5 2.5L11 11Z"/></svg>',
  Electronics: '<svg '+ICON_ATTRS+'><rect x="7" y="2.5" width="10" height="19" rx="2"/><line x1="7" y1="17.5" x2="17" y2="17.5"/></svg>',
  Safety: '<svg '+ICON_ATTRS+'><path d="M12 2.5 20 5.5V11c0 5-3.5 8.7-8 10.5-4.5-1.8-8-5.5-8-10.5V5.5Z"/><line x1="12" y1="8" x2="12" y2="14"/><line x1="9" y1="11" x2="15" y2="11"/></svg>',
  Hygiene: '<svg '+ICON_ATTRS+'><path d="M10 2h4v3l2 2.3V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V7.3L10 5Z"/><line x1="9" y1="11" x2="15" y2="11"/></svg>',
  Food: '<svg '+ICON_ATTRS+'><path d="M6 2v7.5M4 2v4a2 2 0 0 0 4 0V2M6 11v11"/><path d="M18 2c-2 0-3.2 3-3.2 6.2S16 11 18 11v11"/></svg>',
  Other: '<svg '+ICON_ATTRS+'><path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><line x1="12" y1="13" x2="12" y2="21"/></svg>'
};
const OWNED_STATUSES = ['active','retired','loaned']; // everything except wishlist counts as "owned"

// ---- Gear breakdown chart (donut, shared by the Gear Room and Loadout detail) ----
const GEAR_CHART_METRICS = [
  {key:'count', label:'item count', calc:g=>(g.quantity||1)},
  {key:'weight', label:'total weight', calc:g=>(g.weightGrams||0)*(g.quantity||1)},
  {key:'value', label:'total value', calc:g=>(g.price||0)*(g.quantity||1)}
];
// Categorical hues validated against this app's --panel-alt chart surface
// (see dataviz skill: fixed hue order, OKLab CVD-separation + contrast checks).
// Colors are assigned by rank within each render, always paired with the
// legend shown alongside it, so nothing relies on remembering a color.
const CHART_COLORS = ['#3987e5','#d95926','#199e70','#c98500','#d55181','#008300'];
const CHART_OTHER_COLOR = '#5B6B85';
const CHART_MAX_SLICES = 6; // top 5 distinct + "Other" once a 6th+ category appears

function formatBreakdownValue(metricKey, value){
  if(metricKey === 'weight') return formatWeight(value);
  if(metricKey === 'value') return value ? value.toFixed(0) : '0';
  return String(value);
}

function computeGearBreakdown(items, metricKey){
  const metric = GEAR_CHART_METRICS.find(m=>m.key===metricKey) || GEAR_CHART_METRICS[0];
  const byCat = {};
  items.forEach(g=>{
    const v = metric.calc(g);
    if(!v) return;
    const cat = g.category || 'Other';
    byCat[cat] = (byCat[cat]||0) + v;
  });
  let rows = Object.keys(byCat).map(category=>({category, value:byCat[category]}));
  rows.sort((a,b)=>b.value-a.value);
  if(rows.length > CHART_MAX_SLICES){
    const keep = CHART_MAX_SLICES - 1;
    const top = rows.slice(0, keep);
    const restVal = rows.slice(keep).reduce((s,r)=>s+r.value,0);
    rows = top.concat([{category:'Other', value:restVal, isOther:true}]);
  }
  const total = rows.reduce((s,r)=>s+r.value,0);
  rows.forEach((r,i)=>{
    r.color = r.isOther ? CHART_OTHER_COLOR : CHART_COLORS[i];
    r.pct = total ? r.value/total : 0;
  });
  return {rows, total, metric};
}

function buildDonutSvg(rows, total){
  const R = 45, CX = 60, CY = 60, SW = 16, GAP = 3;
  const C = 2*Math.PI*R;
  let offset = 0;
  let segsHtml = '';
  rows.forEach(r=>{
    const frac = total ? r.value/total : 0;
    const len = Math.max(0, frac*C - GAP);
    segsHtml +=
      '<circle class="donut-seg" cx="'+CX+'" cy="'+CY+'" r="'+R+'" fill="none" stroke="'+r.color+'" '+
      'stroke-width="'+SW+'" stroke-linecap="round" '+
      'stroke-dasharray="'+len.toFixed(2)+' '+(C-len).toFixed(2)+'" '+
      'stroke-dashoffset="'+(-offset).toFixed(2)+'" transform="rotate(-90 '+CX+' '+CY+')" '+
      'tabindex="0" data-category="'+escapeHtml(r.category)+'" data-value="'+r.value+'" data-pct="'+r.pct+'"/>';
    offset += frac*C;
  });
  if(!total){
    segsHtml = '<circle cx="'+CX+'" cy="'+CY+'" r="'+R+'" fill="none" stroke="var(--line)" stroke-width="'+SW+'"/>';
  }
  return '<svg viewBox="0 0 120 120">'+segsHtml+
    '<text x="60" y="57" text-anchor="middle" class="donut-center-value"></text>'+
    '<text x="60" y="72" text-anchor="middle" class="donut-center-label"></text>'+
    '</svg>';
}

function showChartTooltip(x, y, category, value, pct){
  const tip = document.getElementById('chartTooltip');
  tip.innerHTML = '<strong></strong><span></span>';
  tip.querySelector('strong').textContent = category;
  tip.querySelector('span').textContent = value + (pct != null ? ' · ' + Math.round(pct*100) + '%' : '');
  tip.hidden = false;
  const pad = 14;
  let left = x + pad, top = y + pad;
  const rect = tip.getBoundingClientRect();
  if(left + rect.width > window.innerWidth - 8) left = x - rect.width - pad;
  if(top + rect.height > window.innerHeight - 8) top = y - rect.height - pad;
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}
function hideChartTooltip(){
  document.getElementById('chartTooltip').hidden = true;
}

function renderBreakdownChart(prefix, items){
  const metricSelect = document.getElementById(prefix+'BreakdownMetric');
  const metricKey = metricSelect.value;
  const {rows, total, metric} = computeGearBreakdown(items, metricKey);

  const body = document.getElementById(prefix+'BreakdownBody');
  const emptyEl = document.getElementById(prefix+'BreakdownEmpty');
  const chartEl = document.getElementById(prefix+'BreakdownChart');
  const legendEl = document.getElementById(prefix+'BreakdownLegend');
  const tableEl = document.getElementById(prefix+'BreakdownTable');
  const toggleBtn = document.getElementById(prefix+'BreakdownTableToggle');

  const wasShowingTable = tableEl.style.display === 'block';
  emptyEl.style.display = rows.length ? 'none' : 'block';
  toggleBtn.style.display = rows.length ? 'block' : 'none';
  if(!rows.length){
    body.style.display = 'none';
    tableEl.style.display = 'none';
    toggleBtn.textContent = 'View as table';
    return;
  }
  body.style.display = wasShowingTable ? 'none' : 'flex';

  chartEl.innerHTML = buildDonutSvg(rows, total);
  const centerValue = chartEl.querySelector('.donut-center-value');
  const centerLabel = chartEl.querySelector('.donut-center-label');
  centerValue.textContent = formatBreakdownValue(metricKey, total);
  centerLabel.textContent = metric.label;

  legendEl.innerHTML = '';
  rows.forEach(r=>{
    const row = document.createElement('div');
    row.className = 'legend-row';
    row.dataset.category = r.category;
    row.innerHTML =
      '<span class="legend-swatch" style="background:'+r.color+'"></span>'+
      '<span class="legend-name"></span>'+
      '<span class="legend-value"></span>'+
      '<span class="legend-pct">'+Math.round(r.pct*100)+'%</span>';
    row.querySelector('.legend-name').textContent = r.category;
    row.querySelector('.legend-value').textContent = formatBreakdownValue(metricKey, r.value);
    legendEl.appendChild(row);
  });

  tableEl.innerHTML =
    '<thead><tr><th>Category</th><th>'+escapeHtml(metric.label)+'</th><th>Share</th></tr></thead>'+
    '<tbody></tbody>';
  const tbody = tableEl.querySelector('tbody');
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    const catTd = document.createElement('td');
    catTd.textContent = r.category;
    const valTd = document.createElement('td');
    valTd.textContent = formatBreakdownValue(metricKey, r.value);
    const pctTd = document.createElement('td');
    pctTd.textContent = Math.round(r.pct*100) + '%';
    tr.append(catTd, valTd, pctTd);
    tbody.appendChild(tr);
  });

  const setHover = (category)=>{
    const wrap = chartEl.closest('.donut-wrap') || chartEl;
    wrap.classList.toggle('is-hovered', !!category);
    chartEl.querySelectorAll('.donut-seg').forEach(seg=>{
      seg.classList.toggle('is-hovered', seg.dataset.category === category);
    });
    legendEl.classList.toggle('has-hover', !!category);
    legendEl.querySelectorAll('.legend-row').forEach(row=>{
      row.classList.toggle('is-hovered', row.dataset.category === category);
    });
  };

  chartEl.querySelectorAll('.donut-seg').forEach(seg=>{
    const cat = seg.dataset.category, val = Number(seg.dataset.value), pct = Number(seg.dataset.pct);
    const show = (e)=>{
      const p = e.touches ? e.touches[0] : e;
      showChartTooltip(p.clientX, p.clientY, cat, formatBreakdownValue(metricKey, val), pct);
      setHover(cat);
    };
    seg.addEventListener('mousemove', show);
    seg.addEventListener('mouseenter', show);
    seg.addEventListener('mouseleave', ()=>{ hideChartTooltip(); setHover(null); });
    seg.addEventListener('focus', ()=>{
      const box = seg.getBoundingClientRect();
      showChartTooltip(box.left+box.width/2, box.top+box.height/2, cat, formatBreakdownValue(metricKey, val), pct);
      setHover(cat);
    });
    seg.addEventListener('blur', ()=>{ hideChartTooltip(); setHover(null); });
  });
  legendEl.querySelectorAll('.legend-row').forEach(row=>{
    row.addEventListener('mouseenter', ()=> setHover(row.dataset.category));
    row.addEventListener('mouseleave', ()=> setHover(null));
  });

  toggleBtn.textContent = wasShowingTable ? 'View as chart' : 'View as table';
}

let currentGearCategory = null; // null = garage view, 'ALL' = all items, or a category string

function uid(){ return 'g_' + Math.random().toString(36).slice(2,10); }

function filteredSortedGear(){
  const q = (document.getElementById('gearSearch').value || '').trim().toLowerCase();
  const status = document.getElementById('gearStatusFilter').value;
  const sortBy = document.getElementById('gearSort').value;

  let list = gearItems.filter(g=>{
    if(currentGearCategory && currentGearCategory !== 'ALL' && g.category !== currentGearCategory) return false;
    if(status && g.status !== status) return false;
    if(q){
      const hay = [g.name, g.brand, g.model, g.category, (g.tags||[]).join(' ')].join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });

  list.sort((a,b)=>{
    if(sortBy === 'weight') return (b.weightGrams||0) - (a.weightGrams||0);
    if(sortBy === 'category') return (a.category||'').localeCompare(b.category||'') || a.name.localeCompare(b.name);
    if(sortBy === 'price') return (b.price||0) - (a.price||0);
    return a.name.localeCompare(b.name);
  });
  return list;
}

function formatWeight(g){
  if(!g) return '—';
  return g >= 1000 ? (g/1000).toFixed(g % 1000 === 0 ? 0 : 1) + ' kg' : g + ' g';
}

// "€2,280"; mixed currencies or an unknown code fall back to "2,280 XYZ".
function formatMoney(amount, currency){
  try{
    if(/^[A-Z]{3}$/.test(currency)) return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  }catch(e){}
  return Math.round(amount).toLocaleString('en-US') + ' ' + currency;
}

function renderGearStats(){
  const owned = gearItems.filter(g=>OWNED_STATUSES.includes(g.status));
  const count = owned.reduce((s,g)=>s+(g.quantity||1),0);
  const weight = owned.reduce((s,g)=>s+(g.weightGrams||0)*(g.quantity||1),0);
  const priced = owned.filter(g=>g.price);
  const value = priced.reduce((s,g)=>s+(g.price||0)*(g.quantity||1),0);
  const currencies = new Set(priced.map(g=>g.currency||'EUR'));

  document.getElementById('gearStatCount').textContent = count;
  document.getElementById('gearStatWeight').textContent = weight ? formatWeight(weight) : '0 g';
  const currencyLabel = currencies.size === 1 ? [...currencies][0] : (currencies.size > 1 ? 'mixed' : 'EUR');
  document.getElementById('gearStatValue').textContent = value ? formatMoney(value, currencyLabel) : '0';
}

function renderGearGrid(){
  const grid = document.getElementById('gearGrid');
  const list = filteredSortedGear();
  grid.innerHTML = '';

  if(!list.length){
    const q = document.getElementById('gearSearch').value.trim();
    const status = document.getElementById('gearStatusFilter').value;
    const msg = (q || status)
      ? 'No gear matches your search or filters.'
      : 'Nothing on this shelf yet — click "+ Add item" to add one.';
    grid.innerHTML = '<div class="gear-empty" style="grid-column:1/-1;">'+msg+'</div>';
    return;
  }

  list.forEach(g=>{
    const card = document.createElement('div');
    card.className = 'gear-card';
    const color = GEAR_CATEGORY_COLORS[g.category] || GEAR_CATEGORY_COLORS.Other;
    const qtyLabel = g.quantity > 1 ? ' ×' + g.quantity : '';
    card.innerHTML =
      '<div class="gear-card-top">'+
        '<div>'+
          '<div class="gear-card-name">'+escapeHtml(g.name)+qtyLabel+'</div>'+
          '<div class="gear-card-cat"><span class="gear-cat-dot" style="background:'+color+'"></span>'+escapeHtml(g.category||'Other')+'</div>'+
        '</div>'+
        '<span class="gear-badge status-'+g.status+'">'+escapeHtml(g.status)+'</span>'+
      '</div>'+
      (g.brand || g.model ? '<div class="gear-card-meta">'+escapeHtml([g.brand,g.model].filter(Boolean).join(' '))+'</div>' : '')+
      '<div class="gear-card-weight">'+formatWeight(g.weightGrams)+'</div>'+
      (gearUsageSummary(g.id) ? '<div class="gear-card-meta">'+escapeHtml(gearUsageSummary(g.id))+'</div>' : '')+
      gearWearHtml(g)+
      '<div class="gear-card-actions">'+
        '<button class="icon-btn" data-action="edit">Edit</button>'+
        '<button class="icon-btn" data-action="duplicate">Duplicate</button>'+
        '<button class="icon-btn" data-action="toggle-retire">'+(g.status==='retired' ? 'Reactivate' : 'Retire')+'</button>'+
        (g.catalogProductId && CATALOG_ENABLED ? '<button class="icon-btn" data-action="catalog" title="Product info, photos and reviews">Reviews</button>' : '')+
      '</div>';
    card.querySelector('[data-action="edit"]').addEventListener('click', ()=> openGearModal(g.id));
    card.querySelector('[data-action="duplicate"]').addEventListener('click', ()=> duplicateGear(g.id));
    card.querySelector('[data-action="toggle-retire"]').addEventListener('click', ()=> toggleRetireGear(g.id));
    if(card.querySelector('[data-action="catalog"]')) card.querySelector('[data-action="catalog"]').addEventListener('click', ()=> openCatalogDetail(g.catalogProductId));
    grid.appendChild(card);
  });
}

// ---- Gear list: categories as weight bars, each opening to its items ----
let gearView = 'list';
try{ if(localStorage.getItem('hio-gear-view') === 'shelves') gearView = 'shelves'; }catch(e){}
const openPackCategories = new Set();

function setGearView(view){
  gearView = view;
  try{ localStorage.setItem('hio-gear-view', view); }catch(e){}
  document.querySelectorAll('#gearViewToggle button').forEach(b=>{
    const on = b.dataset.gearview === view;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  document.getElementById('gearPackList').hidden = view !== 'list';
  document.getElementById('gearRoomIntro').textContent = view === 'list'
    ? 'Your gear by weight — open a category to see what\'s in it'
    : 'Your gear, where it lives — click a shelf, hook or bench to see what\'s on it';
  document.getElementById('gearScene').hidden = view !== 'shelves';
}

function renderGearPackList(){
  const el = document.getElementById('gearPackList');
  el.innerHTML = '';
  const owned = gearItems.filter(g=>OWNED_STATUSES.includes(g.status));
  const itemWeight = g => (g.weightGrams||0)*(g.quantity||1);
  const cats = GEAR_CATEGORIES.map(cat=>{
    const items = owned.filter(g=>(GEAR_CATEGORIES.includes(g.category) ? g.category : 'Other') === cat)
      .sort((a,b)=> itemWeight(b) - itemWeight(a) || a.name.localeCompare(b.name));
    return {cat, items, count: items.reduce((s,g)=>s+(g.quantity||1),0), weight: items.reduce((s,g)=>s+itemWeight(g),0)};
  }).filter(c=>c.items.length).sort((a,b)=> b.weight - a.weight || b.count - a.count);
  if(!cats.length){
    el.innerHTML = '<div class="pack-empty">No gear yet — click "+ Add item" to start your list.</div>';
    return;
  }
  const max = Math.max(1, ...cats.map(c=>c.weight));
  cats.forEach(c=>{
    const open = openPackCategories.has(c.cat);
    const row = document.createElement('div');
    row.className = 'pack-cat' + (open ? ' is-open' : '');
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'pack-cat-head';
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    head.innerHTML =
      '<span class="pack-cat-line">'+
        '<span class="pack-cat-name"><span class="track-color-dot" style="background:'+(GEAR_CATEGORY_COLORS[c.cat]||GEAR_CATEGORY_COLORS.Other)+'"></span>'+escapeHtml(c.cat)+
          ' <span class="pack-cat-count">· '+c.count+'</span></span>'+
        '<span class="pack-cat-weight">'+(c.weight ? escapeHtml(formatWeight(c.weight)) : '—')+'</span>'+
      '</span>'+
      '<span class="pack-bar"><span style="width:'+(c.weight / max * 100).toFixed(1)+'%"></span></span>';
    head.addEventListener('click', ()=>{
      if(openPackCategories.has(c.cat)) openPackCategories.delete(c.cat); else openPackCategories.add(c.cat);
      renderGearPackList();
    });
    row.appendChild(head);
    if(open){
      const list = document.createElement('div');
      list.className = 'pack-items';
      c.items.forEach(g=>{
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'pack-item';
        item.innerHTML = '<span class="pack-item-text"><span class="pack-item-name"></span><span class="pack-item-brand"></span></span><span class="pack-item-weight"></span>';
        item.querySelector('.pack-item-name').textContent = g.name + ((g.quantity||1) > 1 ? ' ×'+g.quantity : '');
        item.querySelector('.pack-item-brand').textContent = [g.brand, g.status !== 'active' ? g.status : ''].filter(Boolean).join(' · ');
        item.querySelector('.pack-item-weight').textContent = g.weightGrams ? formatWeight(itemWeight(g)) : '—';
        item.addEventListener('click', ()=> openGearModal(g.id, null));
        list.appendChild(item);
      });
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'pack-open-shelf';
      more.textContent = 'Open '+c.cat+' →';
      more.addEventListener('click', ()=> showCategory(c.cat));
      list.appendChild(more);
      row.appendChild(list);
    }
    el.appendChild(row);
  });
}

function renderGarage(){
  renderGearPackList();
  const scene = document.getElementById('gearScene');
  scene.innerHTML = '';

  gearSceneBands().forEach(band=>{
    const bandEl = document.createElement('div');
    bandEl.className = 'scene-band';

    const label = document.createElement('p');
    label.className = 'scene-band-label';
    label.textContent = band.label;
    bandEl.appendChild(label);

    if(band.type === 'bench'){
      // Special-cased: a bench only ever holds one category (Footwear), so
      // instead of one lonely icon on a wide, empty-looking plank, show one
      // boot per owned pair (capped) sized to the row — a proper row of
      // boots, with a single shared label/click-target underneath.
      const cat = band.categories[0];
      const owned = gearItems.filter(g=>g.category===cat && OWNED_STATUSES.includes(g.status));
      const count = owned.reduce((s,g)=>s+(g.quantity||1),0);
      const weight = owned.reduce((s,g)=>s+(g.weightGrams||0)*(g.quantity||1),0);
      const iconCount = Math.max(1, Math.min(count, 6));

      const wrap = document.createElement('div');
      wrap.className = 'bench-wrap' + (count ? '' : ' is-empty');
      wrap.addEventListener('click', ()=> showCategory(cat));

      const iconRow = document.createElement('div');
      iconRow.className = 'bench-icon-row';
      for(let i=0;i<iconCount;i++){
        const icon = document.createElement('div');
        icon.className = 'bench-boot-icon';
        icon.innerHTML = GEAR_ICONS[cat] || GEAR_ICONS.Other;
        iconRow.appendChild(icon);
      }
      wrap.appendChild(iconRow);

      const plank = document.createElement('div');
      plank.className = 'bench-plank';
      wrap.appendChild(plank);

      const labelEl = document.createElement('div');
      labelEl.className = 'bench-label';
      labelEl.innerHTML =
        '<span class="scene-item-name">'+escapeHtml(cat)+'</span>'+
        '<span class="scene-item-count">'+count+' owned'+(weight?' · '+formatWeight(weight):'')+'</span>';
      wrap.appendChild(labelEl);

      bandEl.appendChild(wrap);
      scene.appendChild(bandEl);
      return;
    }

    if(band.type === 'hook'){
      const rail = document.createElement('div');
      rail.className = 'hook-rail';
      bandEl.appendChild(rail);
    }

    const row = document.createElement('div');
    row.className = 'scene-row' + (band.type === 'hook' ? ' hook-row' : '');

    band.categories.forEach(cat=>{
      const owned = gearItems.filter(g=>g.category===cat && OWNED_STATUSES.includes(g.status));
      const count = owned.reduce((s,g)=>s+(g.quantity||1),0);
      const weight = owned.reduce((s,g)=>s+(g.weightGrams||0)*(g.quantity||1),0);

      const item = document.createElement('div');
      item.className = 'scene-item' + (count ? '' : ' is-empty');
      item.innerHTML =
        (band.type === 'hook' ? '<div class="hook-peg"></div><div class="hook-strap"></div>' : '') +
        '<div class="scene-item-icon">'+(GEAR_ICONS[cat]||GEAR_ICONS.Other)+'</div>'+
        '<div class="scene-item-name">'+escapeHtml(cat)+'</div>'+
        '<div class="scene-item-count">'+count+' owned'+(weight?' · '+formatWeight(weight):'')+'</div>';
      item.addEventListener('click', ()=> showCategory(cat));
      row.appendChild(item);
    });
    bandEl.appendChild(row);

    if(band.type === 'shelf'){
      const plank = document.createElement('div');
      plank.className = 'shelf-plank';
      bandEl.appendChild(plank);
    }

    scene.appendChild(bandEl);
  });

  const floor = document.createElement('div');
  floor.className = 'scene-floor';
  scene.appendChild(floor);

  renderBreakdownChart('gear', gearItems.filter(g=>OWNED_STATUSES.includes(g.status)));
}

function updateCategoryViewHeader(){
  const cat = currentGearCategory;
  const items = cat === 'ALL' ? gearItems : gearItems.filter(g=>g.category===cat);
  const owned = items.filter(g=>OWNED_STATUSES.includes(g.status));
  const count = owned.reduce((s,g)=>s+(g.quantity||1),0);
  const weight = owned.reduce((s,g)=>s+(g.weightGrams||0)*(g.quantity||1),0);
  document.getElementById('categoryViewTitle').textContent = cat === 'ALL' ? 'All items' : cat;
  document.getElementById('categoryViewCount').textContent = count + ' owned' + (weight ? ' · ' + formatWeight(weight) : '');
}

function showGarage(){
  currentGearCategory = null;
  currentLoadoutId = null;
  document.getElementById('garageView').style.display = 'flex';
  document.getElementById('categoryView').style.display = 'none';
  document.getElementById('loadoutDetailView').style.display = 'none';
  renderGearStats();
  renderGarage();
  renderLoadoutCards();
  pushRouteState();
}

function showCategory(cat){
  currentGearCategory = cat;
  currentLoadoutId = null;
  document.getElementById('garageView').style.display = 'none';
  document.getElementById('categoryView').style.display = 'flex';
  document.getElementById('loadoutDetailView').style.display = 'none';
  document.getElementById('gearSearch').value = '';
  document.getElementById('gearStatusFilter').value = '';
  updateCategoryViewHeader();
  renderGearGrid();
  pushRouteState();
}

function refreshGear(){
  if(currentLoadoutId !== null){
    renderLoadoutDetail();
    renderLoadoutCards();
  } else if(currentGearCategory === null){
    renderGearStats();
    renderGarage();
    renderLoadoutCards();
  } else {
    updateCategoryViewHeader();
    renderGearGrid();
  }
}

async function duplicateGear(id){
  const g = gearItems.find(x=>x.id===id);
  if(!g) return;
  const copy = Object.assign({}, g, {id: uid(), name: g.name + ' (copy)'});
  gearItems.push(copy);
  await saveGear();
  refreshGear();
}

async function toggleRetireGear(id){
  const g = gearItems.find(x=>x.id===id);
  if(!g) return;
  g.status = g.status === 'retired' ? 'active' : 'retired';
  await saveGear();
  refreshGear();
}

function openGearModal(id, presetCategory){
  const g = id ? gearItems.find(x=>x.id===id) : null;
  document.getElementById('gearModalTitle').textContent = g ? 'Edit gear' : 'Add gear';
  document.getElementById('gearId').value = g ? g.id : '';
  document.getElementById('gearName').value = g ? g.name : '';
  document.getElementById('gearCategory').value = g
    ? (g.category || 'Other')
    : (presetCategory && presetCategory !== 'ALL' ? presetCategory : 'Other');
  document.getElementById('gearBrand').value = g ? (g.brand || '') : '';
  document.getElementById('gearModel').value = g ? (g.model || '') : '';
  document.getElementById('gearWeight').value = g && g.weightGrams != null ? g.weightGrams : '';
  document.getElementById('gearQuantity').value = g ? (g.quantity || 1) : 1;
  document.getElementById('gearStatus').value = g ? (g.status || 'active') : 'active';
  document.getElementById('gearPrice').value = g && g.price != null ? g.price : '';
  document.getElementById('gearCurrency').value = g ? (g.currency || 'EUR') : 'EUR';
  document.getElementById('gearPurchaseDate').value = g ? (g.purchaseDate || '') : '';
  document.getElementById('gearCondition').value = g ? (g.condition || '') : '';
  document.getElementById('gearLifespanKm').value = g && g.lifespanKm ? g.lifespanKm : '';
  document.getElementById('gearWaterproof').value = g ? (g.waterproof || '') : '';
  document.getElementById('gearTempRating').value = g ? (g.tempRating || '') : '';
  document.getElementById('gearProductUrl').value = g ? (g.productUrl || '') : '';
  document.getElementById('gearImageUrl').value = g ? (g.imageUrl || '') : '';
  document.getElementById('gearTags').value = g ? (g.tags || []).join(', ') : '';
  document.getElementById('gearNotes').value = g ? (g.notes || '') : '';

  const delBtn = document.getElementById('gearDeleteBtn');
  delBtn.style.display = g ? 'inline-block' : 'none';
  delBtn.textContent = 'Delete';
  delBtn.dataset.armed = '';

  resetGearCatalogUI(g);
  document.getElementById('gearUrlInput').value = '';
  document.getElementById('gearQuickAddStatus').textContent = '';
  document.getElementById('gearQuickAddStatus').className = 'upload-status';

  document.getElementById('gearModalOverlay').style.display = 'flex';
  document.getElementById(!g && CATALOG_ENABLED ? 'catalogSearchInput' : 'gearName').focus();
  onModalOpened('gearModalOverlay');
}

function closeGearModal(){
  document.getElementById('gearModalOverlay').style.display = 'none';
  closeBarcodeScanner();
  onModalClosed('gearModalOverlay');
}
