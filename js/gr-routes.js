// ---- GR routes: on the planner map, and how much of each you've walked ----
// Routes come from Waymarked Trails (OpenStreetMap hiking relations; free,
// no key). What is sent: the map area being looked at, or the ~40 km
// squares your hikes are in. Answers are kept on the device (areas for 30
// days, routes for 90), so each is only downloaded once. The geometry
// logic is in gr-core.js (GrCore).

const WMT_API = 'https://hiking.waymarkedtrails.org/api/v1';
const GR_AREA_DAYS = 30, GR_ROUTE_DAYS = 90;
const GR_TILE_ZOOM = 10;          // ~40 km squares for area listings
const GR_MIN_MAP_ZOOM = 9;        // below this the planner doesn't load GR routes
const grMemory = new Map();       // key -> parsed cache entry, this session

async function grCached(key, days, load){
  if(grMemory.has(key)) return grMemory.get(key);
  let hit = null;
  try{ hit = JSON.parse(await storeGet(key) || 'null'); }catch(e){}
  if(hit && Date.now() - hit.at < days * 86400000){ grMemory.set(key, hit.v); return hit.v; }
  const v = await load();
  grMemory.set(key, v);
  try{ await storeSet(key, JSON.stringify({ at: Date.now(), v })); }catch(e){}
  return v;
}

async function wmtJson(path){
  const res = await fetch(WMT_API + path);
  if(!res.ok) throw new Error('Waymarked Trails answered ' + res.status);
  return res.json();
}

// The GR routes listed in one tile: [{id, ref, name}].
function grRoutesInTile(tile){
  return grCached('gr:area:' + tile.key, GR_AREA_DAYS, async ()=>{
    const d = await wmtJson('/list/by_area?bbox=' + tile.bbox.join(',') + '&limit=100');
    return (d.results || []).filter(r => r.type === 'relation' && GrCore.isGrRef(r.ref))
      .map(r => ({ id: r.id, ref: r.ref, name: r.name || r.ref }));
  });
}

// One route's simplified lines, or null for an umbrella relation.
function grRoute(id){
  return grCached('gr:route:' + id, GR_ROUTE_DAYS, async ()=> GrCore.detailsToRoute(await wmtJson('/details/relation/' + id)));
}

// Runs fn over items, a few at a time.
async function grEach(items, n, fn){
  const queue = items.slice();
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async ()=>{
    while(queue.length){ const it = queue.shift(); try{ await fn(it); }catch(e){} }
  }));
}

function grLabel(r){
  return r.name && r.name !== r.ref ? r.name : r.ref;
}

// ---- The GR layer for a map (the route planner) ----
// Red-and-white lines, like the waymarks, under the planned route.
function makeGrOverlay(m){
  if(!m.getPane('grRoutes')){ m.createPane('grRoutes').style.zIndex = 380; }
  // Canvas: one drawing for all routes, however many pieces they have.
  const renderer = L.canvas({ pane: 'grRoutes', padding: 0.3, tolerance: 6 });
  const group = L.layerGroup();
  const drawn = new Map();             // route id -> layer
  let on = false, timer = null, run = 0;
  const note = L.control({ position: 'bottomleft' });
  note.onAdd = () => { const el = L.DomUtil.create('div', 'gr-map-note'); el.hidden = true; return el; };
  note.addTo(m);
  const say = text => { const el = note.getContainer(); el.textContent = text || ''; el.hidden = !text; };

  function draw(r){
    if(!r || drawn.has(r.id)) return;
    const layer = L.layerGroup();
    const tip = r.ref + (grLabel(r) !== r.ref ? ' · ' + grLabel(r) : '') + ' · ' + Math.round(r.lengthKm) + ' km';
    r.lines.forEach(line=>{
      L.polyline(line, { renderer, color: '#FFFFFF', weight: 7, opacity: 0.9, interactive: false }).addTo(layer);
      L.polyline(line, { renderer, color: '#D7261E', weight: 3.5, opacity: 0.95, dashArray: '12 8', grRoute: r.id })
        .bindTooltip(tip, { sticky: true, direction: 'top', opacity: 0.92 }).addTo(layer);
    });
    layer.addTo(group);
    drawn.set(r.id, layer);
  }

  async function refresh(){
    if(!on) return;
    if(m.getZoom() < GR_MIN_MAP_ZOOM){ say('Zoom in to see GR routes'); return; }
    const mine = ++run;
    const b = m.getBounds();
    const tiles = GrCore.tilesInBounds(b.getSouth(), b.getWest(), b.getNorth(), b.getEast(), GR_TILE_ZOOM);
    say('Loading GR routes…');
    let failed = false;
    const ids = new Map();
    await grEach(tiles, 3, async t=>{
      try{ (await grRoutesInTile(t)).forEach(r => ids.set(r.id, r)); }catch(e){ failed = true; }
    });
    if(mine !== run || !on) return;
    await grEach([...ids.keys()].filter(id => !drawn.has(id)), 3, async id=>{
      try{ const r = await grRoute(id); if(on) draw(r); }catch(e){ failed = true; }
    });
    if(mine !== run || !on) return;
    say(failed ? 'Some GR routes could not be loaded (offline?)' : (ids.size ? '' : 'No GR routes here'));
    if(!failed && !ids.size) setTimeout(()=>{ if(mine === run) say(''); }, 2500);
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 400); };
  m.on('moveend', schedule);

  return {
    key: 'gr', label: 'GR routes',
    on: () => on,
    set(v){
      on = !!v;
      if(on){ group.addTo(m); schedule(); }
      else { m.removeLayer(group); say(''); run++; }
    },
  };
}

// ---- How much of each GR route you've walked ----
let grProgressBusy = false;
let grProgressTimer = null;

// Changes when hikes are added, removed or edited, so the result is redone.
function grTracksSignature(list){
  return list.map(t => t.id + ':' + Math.round(t.distanceKm * 100)).sort().join(',');
}

function scheduleGrProgress(){
  clearTimeout(grProgressTimer);
  grProgressTimer = setTimeout(updateGrProgress, 1500);
}

async function updateGrProgress(force){
  const box = document.getElementById('grProgress');
  if(!box || grProgressBusy) return;
  const walked = walkedTracks().filter(t => t.points && t.points.length > 1);
  if(!walked.length){ box.hidden = true; return; }
  const sig = grTracksSignature(walked);
  let cached = null;
  try{ cached = JSON.parse(await storeGet('gr:progress') || 'null'); }catch(e){}
  if(cached && cached.sig === sig && !force && Date.now() - cached.at < GR_AREA_DAYS * 86400000){
    renderGrProgress(cached.rows);
    return;
  }
  if(!navigator.onLine){ if(cached) renderGrProgress(cached.rows); return; }
  grProgressBusy = true;
  box.hidden = false;
  document.getElementById('grProgressTotal').textContent = 'Looking up GR routes near your hikes…';
  try{
    // Every ~40 km square a hike passes through (a sample of points is enough).
    const tiles = GrCore.tilesFor(walked.map(t => t.points.filter((p, i) => i % 10 === 0 || i === t.points.length - 1)), GR_TILE_ZOOM);
    const ids = new Map();
    let failed = 0;
    await grEach(tiles, 3, async tile=>{
      try{ (await grRoutesInTile(tile)).forEach(r => ids.set(r.id, r)); }catch(e){ failed++; }
    });
    const rows = [];
    await grEach([...ids.keys()], 3, async id=>{
      let r = null;
      try{ r = await grRoute(id); }catch(e){ failed++; return; }
      if(!r) return;
      // Only tracks whose box touches the route's box.
      const rb = L.latLngBounds(r.lines.flat()).pad(0.01);
      const near = walked.filter(t => rb.intersects(L.latLngBounds(t.points))).map(t => t.points);
      if(!near.length) return;
      const c = GrCore.coverage(r, near);
      if(c.walkedKm >= 0.3) rows.push({ id: r.id, ref: r.ref, name: grLabel(r), lengthKm: Math.max(r.lengthKm, c.mappedKm), walkedKm: c.walkedKm, pct: c.pct });
    });
    rows.sort((a, b) => b.pct - a.pct || b.walkedKm - a.walkedKm);
    // Don't keep a result that is missing routes because the network failed.
    if(!failed) await storeSet('gr:progress', JSON.stringify({ sig, at: Date.now(), rows }));
    renderGrProgress(rows, failed > 0);
  }catch(e){
    document.getElementById('grProgressTotal').textContent = 'GR routes could not be looked up right now.';
  }finally{
    grProgressBusy = false;
  }
}

function renderGrProgress(rows, partial){
  const box = document.getElementById('grProgress');
  const total = document.getElementById('grProgressTotal');
  const list = document.getElementById('grProgressList');
  box.hidden = false;
  list.innerHTML = '';
  if(!rows.length){
    total.textContent = 'None of your hikes follow a GR route yet.' + (partial ? ' (Some areas could not be checked.)' : '');
    return;
  }
  const walkedKm = rows.reduce((s, r) => s + r.walkedKm, 0);
  const lengthKm = rows.reduce((s, r) => s + r.lengthKm, 0);
  const pct = lengthKm ? walkedKm / lengthKm * 100 : 0;
  total.innerHTML = '<strong>' + fmtGrPct(pct) + '</strong> of the ' + rows.length + ' GR route' + (rows.length > 1 ? 's' : '') +
    ' you have set foot on: ' + Math.round(walkedKm) + ' of ' + Math.round(lengthKm).toLocaleString('en-US') + ' km.' +
    (partial ? ' Some areas could not be checked.' : '');
  rows.forEach(r=>{
    const li = document.createElement('li');
    li.className = 'gr-progress-row';
    li.innerHTML =
      '<div class="gr-progress-head"><span class="gr-badge"></span><span class="gr-progress-name"></span><span class="gr-progress-pct"></span></div>' +
      '<div class="gr-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span></span></div>' +
      '<div class="gr-progress-km"></div>';
    li.querySelector('.gr-badge').textContent = r.ref;
    li.querySelector('.gr-progress-name').textContent = r.name.replace(new RegExp('^' + r.ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[-–:]?\\s*'), '') || r.ref;
    li.querySelector('.gr-progress-pct').textContent = fmtGrPct(r.pct);
    li.querySelector('.gr-progress-bar').setAttribute('aria-valuenow', String(Math.round(r.pct)));
    li.querySelector('.gr-progress-bar').setAttribute('aria-label', r.ref + ' walked');
    li.querySelector('.gr-progress-bar span').style.width = Math.max(1.5, r.pct).toFixed(1) + '%';
    li.querySelector('.gr-progress-km').textContent = r.walkedKm.toFixed(1) + ' of ' + Math.round(r.lengthKm) + ' km';
    list.appendChild(li);
  });
}

function fmtGrPct(p){ return (p > 0 && p < 1 ? '<1' : Math.round(p)) + '%'; }
