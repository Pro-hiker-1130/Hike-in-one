// ---- Route planner: draw a route on the map before a trip, save it to
// the trip as a planned route and download it as GPX. ----
//
// Between two tapped points the line either follows trails (BRouter, a
// free router on OpenStreetMap data that needs no key) or is a straight
// line whose elevation comes from Open-Meteo (also free, no key). The
// route is saved as an ordinary track with planned: true and the tapped
// points in plan.waypoints, so it can be reopened and changed here.

const BROUTER_URL = 'https://brouter.de/brouter';
const BROUTER_PROFILE = 'hiking-mountain';
const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';

let rpMap = null, rpLineLayer = null, rpMarkerLayer = null;
let rp = null;                 // {tripId, trackId, waypoints: [{ll, mode}], history: []}
let rpMode = 'trail';
let rpRoute = null;            // the route as a track, once every part is known
const rpSegPromise = new Map();  // segment key -> Promise of {points, ele, routed, failed}
const rpSegDone = new Map();     // segment key -> the same, once it has arrived

function rpSegKey(a, b, mode){ return mode + '|' + a.join(',') + '|' + b.join(','); }

async function rpFetchTrail(a, b){
  const url = BROUTER_URL + '?lonlats=' + a[1] + ',' + a[0] + '|' + b[1] + ',' + b[0] +
    '&profile=' + BROUTER_PROFILE + '&alternativeidx=0&format=geojson';
  const res = await fetch(url);
  if(!res.ok) throw new Error('No trail found');
  const seg = TrackCore.parseBrouter(await res.json());
  if(!seg) throw new Error('No trail found');
  return seg;
}

async function rpFetchElevation(points){
  const url = ELEVATION_URL + '?latitude=' + points.map(p => p[0]).join(',') + '&longitude=' + points.map(p => p[1]).join(',');
  const res = await fetch(url);
  if(!res.ok) throw new Error('No elevation');
  const j = await res.json();
  if(!Array.isArray(j.elevation) || j.elevation.length !== points.length) throw new Error('No elevation');
  return j.elevation.map(e => Number.isFinite(e) ? e : null);
}

async function rpStraightSegment(a, b){
  const points = TrackCore.densifyLine(a, b, 0.05, 100);
  let ele = null;
  try{ ele = await rpFetchElevation(points); }catch(e){ /* distance still works without it */ }
  return { points, ele, routed: false };
}

function rpSegment(a, b, mode){
  const key = rpSegKey(a, b, mode);
  if(!rpSegPromise.has(key)){
    const p = (mode === 'trail'
      ? rpFetchTrail(a, b).then(s => Object.assign(s, { routed: true }))
          .catch(() => rpStraightSegment(a, b).then(s => Object.assign(s, { failed: true })))
      : rpStraightSegment(a, b)
    ).then(s => { rpSegDone.set(key, s); return s; });
    rpSegPromise.set(key, p);
  }
  return rpSegPromise.get(key);
}

function openRoutePlanner(tripId, trackId){
  const trip = tripId ? trips.find(t => t.id === tripId) : null;
  const existing = trackId ? tracks.find(t => t.id === trackId) : null;
  rp = {
    tripId: trip ? trip.id : null,
    trackId: existing ? existing.id : null,
    waypoints: existing && existing.plan && Array.isArray(existing.plan.waypoints)
      ? existing.plan.waypoints.map(w => ({ ll: [w.ll[0], w.ll[1]], mode: w.mode === 'line' ? 'line' : 'trail' })) : [],
    history: [],
  };
  rpRoute = null;
  document.getElementById('rpTitle').textContent = existing ? 'Edit planned route' : 'Plan a route';
  document.getElementById('rpName').value = existing ? existing.name : (trip ? trip.name : 'New route');
  document.getElementById('rpDeleteBtn').hidden = !existing;
  document.getElementById('rpSaveBtn').textContent = trip ? 'Save to trip' : 'Save';
  document.getElementById('rpError').textContent = '';
  rpSetMode('trail');
  document.getElementById('routePlannerOverlay').style.display = 'flex';
  onModalOpened('routePlannerOverlay');
  rpEnsureMap();
  requestAnimationFrame(()=>{
    rpMap.invalidateSize();
    // Start where the route is, else where the trip's tracks are, else
    // wherever the main map is looking.
    const pts = rp.waypoints.length ? rp.waypoints.map(w => w.ll)
      : (trip ? tripTracks(trip).flatMap(t => t.points) : []);
    if(pts.length > 1) rpMap.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 });
    else if(pts.length === 1) rpMap.setView(pts[0], 14);
    else rpMap.setView(map.getCenter(), Math.max(map.getZoom(), 5));
  });
  rpChanged();
}

function closeRoutePlanner(){
  document.getElementById('routePlannerOverlay').style.display = 'none';
  rp = null;
  onModalClosed('routePlannerOverlay');
}

function rpEnsureMap(){
  if(rpMap) return;
  rpMap = L.map('rpMap', { zoomControl: true, doubleClickZoom: false });
  // Start on the main map's basemap when it's a hiking one, else Terrain.
  const start = ['terrain', 'satellite', 'relief'].includes(currentBasemapKey) ? currentBasemapKey : 'terrain';
  addMapLayerSwitcher(rpMap, start, 'topleft');
  rpLineLayer = L.layerGroup().addTo(rpMap);
  rpMarkerLayer = L.layerGroup().addTo(rpMap);
  rpMap.on('click', e=>{
    if(!rp) return;
    rpRemember();
    rp.waypoints.push({ ll: [+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)], mode: rpMode });
    rpChanged();
  });
}

function rpSetMode(mode){
  rpMode = mode;
  document.querySelectorAll('#rpModeToggle button').forEach(b=>{
    const on = b.dataset.mode === mode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

// Before every change, so Undo can step back.
function rpRemember(){
  rp.history.push(rp.waypoints.map(w => ({ ll: w.ll.slice(), mode: w.mode })));
  if(rp.history.length > 100) rp.history.shift();
}

function rpChanged(){
  rpDrawMarkers();
  rpDrawRoute();
  document.getElementById('rpUndoBtn').disabled = !rp.history.length;
  document.getElementById('rpClearBtn').disabled = !rp.waypoints.length;
  document.getElementById('rpLoopBtn').disabled = !rpCanLoop();
  document.getElementById('rpHint').hidden = rp.waypoints.length > 1;
  document.getElementById('rpHint').textContent = rp.waypoints.length
    ? 'Now tap where the route goes next.'
    : 'Tap the map to set the start, then tap where the route goes. Drag a point to move it.';
}

function rpDrawMarkers(){
  rpMarkerLayer.clearLayers();
  const n = rp.waypoints.length;
  rp.waypoints.forEach((w, i)=>{
    const kind = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'via');
    const m = L.marker(w.ll, {
      draggable: true, keyboard: false,
      title: kind === 'start' ? 'Start' : (kind === 'end' ? 'End' : 'Point ' + (i + 1)),
      icon: L.divIcon({ className: 'rp-wp rp-wp-' + kind, iconSize: kind === 'via' ? [14, 14] : [20, 20] }),
    });
    m.on('dragstart', ()=> rpRemember());
    m.on('dragend', ()=>{
      const ll = m.getLatLng();
      w.ll = [+ll.lat.toFixed(6), +ll.lng.toFixed(6)];
      rpChanged();
    });
    m.addTo(rpMarkerLayer);
  });
}

// Draws what is known and fetches the rest; called again as parts arrive.
function rpDrawRoute(){
  if(!rp) return;
  rpLineLayer.clearLayers();
  const wps = rp.waypoints;
  const segs = [];
  let pending = 0, failed = 0;
  for(let i = 1; i < wps.length; i++){
    const a = wps[i-1].ll, b = wps[i].ll, mode = wps[i].mode;
    const key = rpSegKey(a, b, mode);
    const done = rpSegDone.get(key);
    if(done){
      segs.push(done);
      if(done.failed) failed++;
      L.polyline(done.points, { color: '#C4501C', weight: 4, opacity: 0.95, dashArray: done.routed ? null : '2 7' }).addTo(rpLineLayer);
      // The router starts and ends on the nearest trail; show how a tap
      // off the trail connects to it.
      [[a, done.points[0]], [b, done.points[done.points.length-1]]].forEach(([p, q])=>{
        if(TrackCore.haversine(p, q) > 0.01) L.polyline([p, q], { color: '#8A938C', weight: 2, dashArray: '2 5' }).addTo(rpLineLayer);
      });
    } else {
      pending++;
      L.polyline([a, b], { color: '#8A938C', weight: 3, opacity: 0.7, dashArray: '4 6' }).addTo(rpLineLayer);
      const myWaypoints = rp.waypoints;
      rpSegment(a, b, mode).then(()=>{ if(rp && rp.waypoints === myWaypoints) rpDrawRoute(); });
    }
  }
  const stats = document.getElementById('rpStats');
  const profileEl = document.getElementById('rpProfile');
  const ready = wps.length > 1 && !pending;
  rpRoute = ready ? TrackCore.buildTrack({ id: rp.trackId || 'plan', name: '', sport: 'Hike', planned: true }, TrackCore.joinSegments(segs)) : null;
  document.getElementById('rpSaveBtn').disabled = !ready;
  document.getElementById('rpDownloadBtn').disabled = !ready;
  document.getElementById('rpError').textContent = failed
    ? 'No trail found for ' + (failed === 1 ? 'one part' : failed + ' parts') + ' of the route, so a straight line is drawn there.' : '';
  profileEl.innerHTML = '';
  if(wps.length < 2){ stats.textContent = ''; return; }
  if(!ready){ stats.textContent = 'Finding the route…'; return; }
  stats.textContent = rpRoute.distanceKm.toFixed(1) + ' km · ' + trackClimbSummary(rpRoute);
  // Distance markers along the route, so it's easy to see where 5 km is.
  TrackCore.kmMarkers(rpRoute.points).forEach(m => L.marker(m.ll, {
    interactive: false, keyboard: false,
    icon: L.divIcon({ className: 'rp-km', html: '<span>' + m.km + '</span>', iconSize: null }),
  }).addTo(rpLineLayer));
  if(rpRoute.profile && rpRoute.profile.length > 1) profileEl.appendChild(buildElevationProfile(rpRoute));
}

// rp.waypoints is replaced (not changed in place) on Undo and Clear, which
// is how a segment arriving late knows the route moved on.
function rpUndo(){
  if(!rp || !rp.history.length) return;
  rp.waypoints = rp.history.pop();
  rpChanged();
}
// A round trip: one more leg, drawn the current way, back to the start.
function rpCanLoop(){
  const w = rp ? rp.waypoints : [];
  return w.length > 1 && TrackCore.haversine(w[0].ll, w[w.length-1].ll) > 0.02;
}
function rpLoop(){
  if(!rpCanLoop()) return;
  rpRemember();
  rp.waypoints = rp.waypoints.concat({ ll: rp.waypoints[0].ll.slice(), mode: rpMode });
  rpChanged();
}
function rpClear(){
  if(!rp || !rp.waypoints.length) return;
  rpRemember();
  rp.waypoints = [];
  rpChanged();
}

function rpFinishedTrack(){
  const name = document.getElementById('rpName').value.trim() || 'Planned route';
  const trip = rp.tripId ? trips.find(t => t.id === rp.tripId) : null;
  const existing = rp.trackId ? tracks.find(t => t.id === rp.trackId) : null;
  return Object.assign({}, rpRoute, {
    id: existing ? existing.id : 't_' + Math.random().toString(36).slice(2,10),
    name,
    sport: existing ? existing.sport : 'Hike',
    date: existing ? existing.date : (trip && trip.date) || null,
    sourceKey: null,
    planned: true,
    plan: { waypoints: rp.waypoints.map(w => ({ ll: w.ll.slice(), mode: w.mode })) },
  });
}

async function saveRoutePlan(){
  if(!rp || !rpRoute) return;
  const out = rpFinishedTrack();
  const tripId = rp.tripId;
  const isNew = !rp.trackId;
  closeRoutePlanner();
  await commitTrackChange(isNew ? 'Route saved.' : 'Route updated.', ()=>{
    if(isNew) tracks.push(out); else tracks = tracks.map(t => t.id === out.id ? out : t);
    const trip = tripId && trips.find(t => t.id === tripId);
    if(trip && !(trip.trackIds || []).includes(out.id)) trip.trackIds = (trip.trackIds || []).concat(out.id);
    return [out.id];
  });
}

async function deleteRoutePlan(){
  if(!rp || !rp.trackId) return;
  const id = rp.trackId;
  closeRoutePlanner();
  await commitTrackChange('Route deleted.', ()=>{
    tracks = tracks.filter(t => t.id !== id);
    trips.forEach(tr=>{ tr.trackIds = (tr.trackIds || []).filter(x => x !== id); });
    return [];
  });
}

function downloadRoutePlan(){
  if(!rp || !rpRoute) return;
  const t = rpFinishedTrack();
  const blob = new Blob([TrackCore.toGpx(t)], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = TrackCore.gpxFileName(t);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

document.getElementById('rpClose').addEventListener('click', closeRoutePlanner);
document.getElementById('routePlannerOverlay').addEventListener('click', e=>{
  if(e.target.id === 'routePlannerOverlay') closeRoutePlanner();
});
document.querySelectorAll('#rpModeToggle button').forEach(b=> b.addEventListener('click', ()=> rpSetMode(b.dataset.mode)));
document.getElementById('rpUndoBtn').addEventListener('click', rpUndo);
document.getElementById('rpClearBtn').addEventListener('click', rpClear);
document.getElementById('rpLoopBtn').addEventListener('click', rpLoop);
document.getElementById('rpSaveBtn').addEventListener('click', saveRoutePlan);
document.getElementById('rpDeleteBtn').addEventListener('click', deleteRoutePlan);
document.getElementById('rpDownloadBtn').addEventListener('click', downloadRoutePlan);
document.getElementById('tripPlanRouteBtn').addEventListener('click', ()=> openRoutePlanner(currentTripId, null));
// Ctrl+Z / Cmd+Z undoes the last point while the planner is open (but
// not while typing in the name field, where it undoes the typing).
document.addEventListener('keydown', e=>{
  if(!rp || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
  if(e.target.closest && e.target.closest('input, textarea, select')) return;
  e.preventDefault();
  rpUndo();
});
