// Hike-in-one — Drawing tracks and the heatmap, track/trip colors, the map overview stats and Settings data summary.
// Plain scripts loaded in order by index.html; they share one global scope.
'use strict';

// ---- Rendering ----
function allPoints(){
  const pts = [];
  tracks.forEach(t=>{ if(!t.planned) pts.push(...t.points); });
  pts.push(...googlePoints);
  return pts;
}

// ---- Track ↔ trip coloring ----
// Tracks that belong to the same trip share one color, so a multi-day
// trip reads as a single line family on the map; tracks with no trip yet
// each get their own color.
function findTrackTrip(trackId){
  return trips.find(tr => (tr.trackIds||[]).includes(trackId)) || null;
}
// A color the user picked for a trip, if it's a valid #rrggbb (the value
// ends up in style attributes, so nothing else gets through).
function tripOwnColor(trip){
  return trip && typeof trip.color === 'string' && /^#[0-9a-f]{6}$/i.test(trip.color) ? trip.color : null;
}
function tripColor(trip, trackColors){
  const tks = tripTracks(trip);
  return tripOwnColor(trip) || (tks.length ? trackColors[tks[0].id] : null);
}
function computeTrackColors(){
  const groupKey = {};
  tracks.forEach(t=>{
    const trip = findTrackTrip(t.id);
    groupKey[t.id] = trip ? 'trip:'+trip.id : 'track:'+t.id;
  });
  const order = [];
  const seen = new Set();
  tracks.forEach(t=>{
    const k = groupKey[t.id];
    if(!seen.has(k)){ seen.add(k); order.push(k); }
  });
  const keyColor = {};
  order.forEach((k,i)=>{
    const own = k.startsWith('trip:') ? tripOwnColor(trips.find(tr => 'trip:'+tr.id === k)) : null;
    keyColor[k] = own || COLORS[i % COLORS.length];
  });
  const result = {};
  tracks.forEach(t=> result[t.id] = keyColor[groupKey[t.id]]);
  return result;
}

function goToTripFromMap(tripId){
  document.querySelector('.nav-tab[data-page="trips"]').click();
  showTripDetail(tripId);
}

function goToTripPhotosFromMap(tripId){
  goToTripFromMap(tripId);
  const section = document.getElementById('tripPhotoSection');
  if(section) section.scrollIntoView({behavior:'smooth', block:'start'});
}

// ---- How tracks are drawn ----
// Each track is a coloured line over a white outline (its "casing"), so it
// stays readable on busy topo maps and satellite photos. Lines are thin and
// see-through when zoomed out, so many trips overlap like a heatmap, and
// get bolder as you zoom in. Picking a trip fades the others. From zoom 12,
// tracks in view get start and finish dots. Everything is drawn on canvas
// (fast with hundreds of tracks) with a wide tap tolerance for fingers.
map.createPane('trackCasings').style.zIndex = 390;
map.createPane('trackEnds').style.zIndex = 420;
const trackCasingRenderer = L.canvas({pane:'trackCasings', padding:0.3});
const trackLineRenderer = L.canvas({padding:0.3, tolerance:8});
const trackEndRenderer = L.canvas({pane:'trackEnds', padding:0.3});
const trackDrawn = new Map();       // track id -> {t, line, casing}
const trackEndGroup = L.layerGroup();
const trackKmGroup = L.layerGroup();   // km markers on the trip or hike in focus
let trackFocus = null;              // {tripId} or {trackId}: the others fade
let hoveredTrackId = null;
const TRACK_ENDS_MIN_ZOOM = 12;

function trackZoomStyle(z){
  if(z <= 6)  return {weight:2,   opacity:0.6,  casing:0};
  if(z <= 9)  return {weight:2.5, opacity:0.8,  casing:1.5};
  if(z <= 12) return {weight:3.5, opacity:0.9,  casing:2};
  return            {weight:4.5, opacity:0.95, casing:2.5};
}

function trackInFocus(t){
  if(!trackFocus) return true;
  if(trackFocus.tripId){
    const trip = trips.find(tr => tr.id === trackFocus.tripId);
    return !!trip && (trip.trackIds || []).includes(t.id);
  }
  return t.id === trackFocus.trackId;
}

function styleTracks(){
  const base = trackZoomStyle(map.getZoom());
  trackDrawn.forEach(({t, line, casing}, id)=>{
    const focused = trackInFocus(t);
    const hovered = id === hoveredTrackId;
    const weight = base.weight + (hovered ? 2 : 0);
    const opacity = hovered ? 1 : focused ? base.opacity : 0.28;
    line.setStyle({ weight, opacity, dashArray: t.planned ? (weight*2)+' '+(weight*1.6) : null });
    casing.setStyle({ weight: weight + base.casing*2, opacity: base.casing && focused ? 0.85 : 0 });
  });
  // Focused tracks on top of the faded ones.
  if(trackFocus) trackDrawn.forEach(({t, line, casing})=>{ if(trackInFocus(t)){ casing.bringToFront(); line.bringToFront(); } });
  renderTrackEnds();
}

function renderTrackEnds(){
  trackEndGroup.clearLayers();
  trackKmGroup.clearLayers();
  if(map.getZoom() < TRACK_ENDS_MIN_ZOOM) return;
  const view = map.getBounds().pad(0.2);
  const dot = (ll, fill, ring) => L.circleMarker(ll, { renderer: trackEndRenderer, interactive: false,
    radius: 5, weight: 2.5, color: ring, fillColor: fill, fillOpacity: 1 }).addTo(trackEndGroup);
  trackDrawn.forEach(({t, line})=>{
    if(!trackInFocus(t) || t.points.length < 2 || !line.getBounds().intersects(view)) return;
    const start = t.points[0], end = t.points[t.points.length-1];
    // A loop ends where it started: one dot, green with a red ring.
    if(haversine(start, end) < 0.05){ dot(start, '#3A5A40', '#B3261E'); return; }
    dot(end, '#B3261E', '#FFFFFF');
    dot(start, '#3A5A40', '#FFFFFF');
  });
  // A trip or hike in focus also gets kilometre markers along its route.
  const fresh = focusMarkersFresh ? ' is-fresh' : '';
  if(trackFocus && map.getZoom() >= TRACK_ENDS_MIN_ZOOM) focusMarkersFresh = false;
  if(trackFocus) trackDrawn.forEach(({t, line})=>{
    if(!trackInFocus(t) || t.points.length < 2 || !line.getBounds().intersects(view)) return;
    TrackCore.kmMarkers(t.points).forEach(m => addKmMarker(m, trackKmGroup, fresh));
    // Its high point, unless the walk is about flat.
    const top = TrackCore.highestPoint(t);
    if(top && !(t.maxEleM - t.minEleM < 30)) L.marker(top.ll, { interactive: false, keyboard: false,
      icon: L.divIcon({ className: 'summit-marker' + fresh, html: '<span>\u25B2 ' + top.eleM.toLocaleString('en-US') + ' m</span>', iconSize: null }) }).addTo(trackKmGroup);
  });
}

// A small "5" label on a route at km 5 (route planner, focused trips on
// the map, the shared-route page).
function addKmMarker(m, group, extraClass){
  L.marker(m.ll, { interactive: false, keyboard: false,
    icon: L.divIcon({ className: 'km-marker' + (extraClass || ''), html: '<span>' + m.km + '</span>', iconSize: null }) }).addTo(group);
}

// Markers and the chip animate in only when what's in focus changes, not
// on every pan or redraw (CSS: is-fresh, chip-in).
let focusMarkersFresh = false;
const focusKey = f => f ? (f.tripId || '') + '|' + (f.trackId || '') : '';
function setTrackFocus(focus){
  const changed = focusKey(focus) !== focusKey(trackFocus);
  trackFocus = focus;
  if(changed) focusMarkersFresh = !!focus;
  const chip = document.getElementById('trackFocusChip');
  if(chip && changed && focus){ chip.classList.remove('chip-in'); void chip.offsetWidth; chip.classList.add('chip-in'); }
  if(chip){
    let label = '';
    if(focus && focus.tripId){ const tr = trips.find(x => x.id === focus.tripId); label = tr ? tr.name : ''; }
    else if(focus && focus.trackId){ const t = tracks.find(x => x.id === focus.trackId); label = t ? t.name : ''; }
    chip.hidden = !focus;
    chip.querySelector('.track-focus-name').textContent = label;
  }
  styleTracks();
}

function renderTracks(){
  trackLayerGroup.clearLayers();
  trackDrawn.clear();
  hoveredTrackId = null;
  const trackColors = computeTrackColors();
  tracks.forEach((t)=>{
    const color = trackColors[t.id];
    const casing = L.polyline(t.points, { renderer: trackCasingRenderer, color: '#FFFFFF', interactive: false, lineCap: 'round', lineJoin: 'round' });
    // Planned routes are dashed: drawn, not walked.
    const line = L.polyline(t.points, { renderer: trackLineRenderer, color, lineCap: 'round', lineJoin: 'round', bubblingMouseEvents: false });
    const trip = findTrackTrip(t.id);
    const photoCount = trip ? (trip.photoIds||[]).length : 0;
    let popupHtml =
      '<strong>'+escapeHtml(t.name)+'</strong>'+(t.planned ? ' <em>(planned route)</em>' : '')+'<br>'+
      (t.date ? escapeHtml(friendlyDate(t.date))+', ' : '') +
      (sportLabel(t.sport) ? escapeHtml(sportLabel(t.sport))+', ' : '') +
      t.distanceKm.toFixed(1)+' km';
    const climbLine = trackClimbSummary(t);
    if(climbLine) popupHtml += '<br>'+climbLine;
    popupHtml += '<br><a href="#" class="popup-track-edit" data-track-id="'+t.id+'">'+(t.planned ? 'Edit route' : 'Edit track')+'</a>';
    if(trip){
      const tripGear = tripGearItemsList(trip);
      if(tripGear.length){
        const tripWeight = tripGearWeight(trip);
        popupHtml += '<br>Gear: '+tripGear.length+' item'+(tripGear.length>1?'s':'')+(tripWeight?' · '+formatWeight(tripWeight):'');
      }
      popupHtml += '<br><a href="#" class="popup-trip-link" data-trip-id="'+trip.id+'">'+escapeHtml(trip.name)+' &rarr;</a>';
      if(photoCount){
        popupHtml += '<br><a href="#" class="popup-photo-link" data-trip-id="'+trip.id+'">&#128247; '+photoCount+' photo'+(photoCount>1?'s':'')+' &rarr;</a>';
      }
    }
    line.bindPopup(popupHtml);
    // Opening a track's popup puts its trip in focus; closing it lets go.
    line.on('popupopen', ()=> setTrackFocus(trip ? {tripId: trip.id, fromPopup: true} : {trackId: t.id, fromPopup: true}));
    line.on('popupclose', ()=>{ if(trackFocus && trackFocus.fromPopup) setTrackFocus(null); });
    // Hover tooltip stays plain text (Leaflet tooltips ignore pointer
    // events by default, so a real clickable link here would vanish
    // before it could be clicked) — it just hints that photos exist;
    // the actual link lives in the click popup above.
    const tooltipText = (trip ? trip.name : t.name) + (photoCount ? ' · \u{1F4F7} '+photoCount : '');
    line.bindTooltip(tooltipText, {sticky:true, direction:'top', opacity:0.92});
    line.on('mouseover', ()=>{ hoveredTrackId = t.id; styleTracks(); casing.bringToFront(); line.bringToFront(); });
    line.on('mouseout', ()=>{ if(hoveredTrackId === t.id){ hoveredTrackId = null; styleTracks(); } });
    trackLayerGroup.addLayer(line);
    trackLayerGroup.addLayer(casing);
    trackDrawn.set(t.id, {t, line, casing});
  });
  trackLayerGroup.addLayer(trackEndGroup);
  trackLayerGroup.addLayer(trackKmGroup);
  // A focused trip that no longer exists lets go.
  if(trackFocus && ![...trackDrawn.values()].some(d => trackInFocus(d.t))) trackFocus = null;
  setTrackFocus(trackFocus);
}

map.on('zoomend', styleTracks);
map.on('moveend', renderTrackEnds);
// Tapping empty map lets go of a trip picked with "View on map".
map.on('click', ()=>{ if(trackFocus) setTrackFocus(null); });

// "Showing <trip> · Show all", top left under the zoom buttons.
const TrackFocusControl = L.Control.extend({
  options: { position: 'topleft' },
  onAdd(){
    const el = L.DomUtil.create('div', 'track-focus-chip');
    el.id = 'trackFocusChip';
    el.hidden = true;
    el.innerHTML = '<span>Showing <strong class="track-focus-name"></strong></span><button type="button">Show all</button>';
    L.DomEvent.disableClickPropagation(el);
    el.querySelector('button').addEventListener('click', ()=> setTrackFocus(null));
    return el;
  },
});
new TrackFocusControl().addTo(map);

map.on('popupopen', (e)=>{
  const el = e.popup.getElement();
  const link = el && el.querySelector('.popup-trip-link');
  if(link){
    link.addEventListener('click', (evt)=>{
      evt.preventDefault();
      goToTripFromMap(link.dataset.tripId);
    });
  }
  const editLink = el && el.querySelector('.popup-track-edit');
  if(editLink){
    editLink.addEventListener('click', (evt)=>{
      evt.preventDefault();
      map.closePopup();
      openTrackEditor(editLink.dataset.trackId);
    });
  }
  const photoLink = el && el.querySelector('.popup-photo-link');
  if(photoLink){
    photoLink.addEventListener('click', (evt)=>{
      evt.preventDefault();
      goToTripPhotosFromMap(photoLink.dataset.tripId);
    });
  }
});

function renderHeat(){
  if(heatLayer){ map.removeLayer(heatLayer); heatLayer = null; }
  const pts = allPoints();
  if(!pts.length || typeof L.heatLayer !== 'function') return;
  heatLayer = L.heatLayer(pts, {
    radius: 16, blur: 20, maxZoom: 9, minOpacity: 0.35,
    gradient: {0.2:'#A3B18A', 0.45:'#588157', 0.7:'#3A5A40', 1:'#C4501C'}
  });
}

function updateLayers(){
  map.removeLayer(trackLayerGroup);
  if(heatLayer) map.removeLayer(heatLayer);
  if(currentView === 'tracks' || currentView === 'both') trackLayerGroup.addTo(map);
  // The heat layer draws on a canvas the map's size; while the map page
  // is hidden that size is 0 and drawing throws, so it waits until the
  // map is shown again (the tab switch calls this again).
  const mapShown = document.getElementById('map').offsetWidth > 0;
  if(mapShown && (currentView === 'heatmap' || currentView === 'both')){
    if(!heatLayer) renderHeat();
    if(heatLayer) heatLayer.addTo(map);
  }
  document.getElementById('emptyHint').style.display = (tracks.length || googlePoints.length) ? 'none' : 'block';
}

let fitMapOnNextShow = false;
function refreshEverything(){
  renderTracks();
  renderHeat();
  updateLayers();
  renderStats();
  document.getElementById('emptyHint').style.display = allPoints().length ? 'none' : 'block';
}

// 55 / 3,375 / 12.4k — short enough for a stat tile.
function compactNumber(n){
  n = Math.round(n);
  return n >= 10000 ? (n/1000).toFixed(1).replace(/\.0$/,'')+'k' : n.toLocaleString('en-US');
}

// Sets a stat tile's number; when it changes on screen it counts up (or
// down) from the old value over 300 ms. Off with reduced motion. While it
// runs the element carries data-counting.
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
function setStatNumber(el, value, format){
  const from = el._statValue;
  el._statValue = value;
  cancelAnimationFrame(el._statFrame);
  const visible = el.offsetParent !== null && !document.hidden;
  if(from == null || from === value || REDUCED_MOTION.matches || !visible){
    delete el.dataset.counting;
    el.textContent = format(value);
    return;
  }
  el.dataset.counting = '';
  const start = performance.now();
  const step = now => {
    const k = Math.min(1, (now - start) / 300);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = format(k < 1 ? from + (value - from) * eased : value);
    if(k < 1) el._statFrame = requestAnimationFrame(step);
    else delete el.dataset.counting;
  };
  el._statFrame = requestAnimationFrame(step);
}

// "Year in review" under the overview: pick any year with walks.
let yearReviewYear = null;
function renderYearReview(){
  const years = Array.from(new Set(walkedTracks().filter(t => t.date).map(t => String(t.date).slice(0, 4)))).sort().reverse();
  const box = document.getElementById('yearReview');
  box.hidden = !years.length;
  if(!years.length) return;
  if(!years.includes(yearReviewYear)) yearReviewYear = years[0];
  const sel = document.getElementById('yearReviewSelect');
  sel.innerHTML = years.map(y => '<option'+(y === yearReviewYear ? ' selected' : '')+'>'+y+'</option>').join('');
  const s = TrackCore.yearSummary(tracks, yearReviewYear);
  const n = (v, one, many) => v.toLocaleString('en-US') + ' ' + (v === 1 ? one : many);
  const lines = [
    n(s.count, 'walk', 'walks') + ' on ' + n(s.days, 'day', 'days') + ' · ' + (s.distanceKm < 100 ? s.distanceKm.toFixed(1) : compactNumber(s.distanceKm)) + ' km · ' + compactNumber(s.gainM) + ' m up',
    'Longest: ' + s.longest.name + ', ' + s.longest.distanceKm.toFixed(1) + ' km' +
      (s.highest ? ' · Highest: ' + s.highest.eleM.toLocaleString('en-US') + ' m on ' + s.highest.name : '') +
      ' · Busiest month: ' + MONTHS_LONG[s.busiestMonth],
  ];
  renderPersonalBests();
  const text = document.getElementById('yearReviewText');
  text.innerHTML = '';
  lines.forEach(l => { const span = document.createElement('span'); span.textContent = l; text.appendChild(span); });
}

// All-time bests under the year in review: what, how much, which walk.
function renderPersonalBests(){
  const b = TrackCore.personalBests(tracks);
  const list = document.getElementById('personalBests');
  list.innerHTML = '';
  if(!b) return;
  [['Longest walk', b.longestKm, v => v.toFixed(1) + ' km'], ['Biggest climb', b.biggestClimbM, v => v.toLocaleString('en-US') + ' m up'],
   ['Longest day out', b.longestSec, v => formatDuration(v)], ['Highest point', b.highestM, v => v.toLocaleString('en-US') + ' m']]
    .forEach(([label, rec, fmt])=>{
      if(!rec) return;
      const li = document.createElement('li');
      li.innerHTML = '<span class="pb-label"></span><span class="pb-value"></span><span class="pb-walk"></span>';
      li.children[0].textContent = label;
      li.children[1].textContent = fmt(rec.value);
      li.children[2].textContent = rec.name;
      li.children[2].title = rec.name + (rec.date ? ', ' + friendlyDate(rec.date, false) : '');
      list.appendChild(li);
    });
}

// Settings: how walking times are estimated.
function renderPaceSettings(){
  const pace = TrackCore.personalPace(tracks);
  const on = usePersonalPace();
  const box = document.getElementById('paceUseMine');
  box.checked = on; box.disabled = !pace;
  const rule = 'The standard rule is 4 km an hour plus 1 hour for every 600 m of climb.';
  let note;
  if(!pace) note = rule + ' Once you have 3 or more timed walks of 2 km or longer, estimates can fit your own pace.';
  else {
    const pct = Math.round(Math.abs(pace.factor - 1) * 100);
    const how = pct < 3 ? 'about the same as the rule' : pct + ' % ' + (pace.factor > 1 ? 'slower' : 'faster') + ' than the rule (breaks included)';
    note = rule + ' From ' + pace.walks + ' timed walks, you go ' + how + '.' + (on ? '' : ' Estimates use the standard rule.');
  }
  document.getElementById('paceNote').textContent = note;
}

function renderStats(){
  const whole = n => String(Math.round(n));
  setStatNumber(document.getElementById('statTrips'), trips.length, whole);
  const walked = walkedTracks();
  const dist = walked.reduce((s,t)=>s+t.distanceKm,0);
  setStatNumber(document.getElementById('statDistance'), dist, compactNumber);
  const climb = walked.reduce((s,t)=>s+(t.elevationGainM||0),0);
  setStatNumber(document.getElementById('statClimb'), climb, compactNumber);
  const countries = allVisitedCountries();
  const countriesEl = document.getElementById('statCountries');
  setStatNumber(countriesEl, countries.size, whole);
  countriesEl.title = countries.size ? Array.from(countries).sort().join(', ') : '';
  document.getElementById('settingsDataSummary').textContent =
    tracks.length+' track'+(tracks.length!==1?'s':'')+' and '+
    googlePoints.length.toLocaleString('en-US')+' location-history point'+(googlePoints.length!==1?'s':'')+' on this device.';
  document.getElementById('clearBtn').disabled = !(tracks.length || googlePoints.length);
  renderYearReview();
  renderPaceSettings();
  renderDeviceSummary();
  renderGettingStarted();
}

// What this device holds and the last error it hit — enough to tell,
// from a phone, whether data is missing or failing to display.
let lastAppError = null;
function noteAppError(err){
  lastAppError = { message: (err && (err.message || err.reason && err.reason.message)) || String(err), at: new Date() };
  const el = document.getElementById('settingsLastError');
  if(!el) return;
  el.hidden = false;
  el.textContent = 'Last error (' + lastAppError.at.toLocaleTimeString() + '): ' + lastAppError.message;
}
window.addEventListener('error', e => noteAppError(e.error || e.message));
window.addEventListener('unhandledrejection', e => noteAppError(e.reason));
function renderDeviceSummary(){
  const el = document.getElementById('settingsDeviceSummary');
  if(!el) return;
  const sync = !CLOUD_SYNC_ENABLED ? '' : !cloudUser ? ' Not signed in.' :
    ' Signed in, sync: ' + ({syncing:'syncing', synced:'up to date', error:'error', offline:'offline'}[cloudSyncStatus] || cloudSyncStatus) + '.';
  el.textContent = 'This device has ' + trips.length + ' trip' + (trips.length !== 1 ? 's' : '') + ', ' +
    tracks.length + ' track' + (tracks.length !== 1 ? 's' : '') + ' and ' +
    gearItems.length + ' gear item' + (gearItems.length !== 1 ? 's' : '') + '.' + sync;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---- Getting started: three first steps, ticked off as they're done ----
function renderGettingStarted(){
  const box = document.getElementById('gettingStarted');
  let dismissed = false;
  try{ dismissed = localStorage.getItem('hio-gs-dismissed') === '1'; }catch(e){}
  const steps = [
    ['gsImport', walkedTracks().length > 0],
    ['gsGear', gearItems.length > 0],
    ['gsSync', !CLOUD_SYNC_ENABLED || !!cloudUser],
  ];
  const allDone = steps.every(([, done]) => done);
  box.hidden = dismissed || allDone;
  if(box.hidden) return;
  steps.forEach(([id, done])=>{
    const li = document.getElementById(id);
    li.classList.toggle('is-done', done);
    li.querySelector('.gs-go').hidden = done;
  });
  document.getElementById('gsSync').hidden = !CLOUD_SYNC_ENABLED;
}
