// Hike-in-one — Drawing tracks and the heatmap, track/trip colors, the map overview stats and Settings data summary.
// Plain scripts loaded in order by index.html; they share one global scope.
'use strict';

// ---- Rendering ----
function allPoints(){
  const pts = [];
  tracks.forEach(t=>pts.push(...t.points));
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

function renderTracks(){
  trackLayerGroup.clearLayers();
  const trackColors = computeTrackColors();
  tracks.forEach((t)=>{
    const color = trackColors[t.id];
    const line = L.polyline(t.points, {color, weight:2.5, opacity:0.85});
    const trip = findTrackTrip(t.id);
    const photoCount = trip ? (trip.photoIds||[]).length : 0;
    let popupHtml =
      '<strong>'+escapeHtml(t.name)+'</strong><br>'+
      (t.date ? escapeHtml(friendlyDate(t.date))+', ' : '') +
      (sportLabel(t.sport) ? escapeHtml(sportLabel(t.sport))+', ' : '') +
      t.distanceKm.toFixed(1)+' km';
    const climbLine = trackClimbSummary(t);
    if(climbLine) popupHtml += '<br>'+climbLine;
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
    // Hover tooltip stays plain text (Leaflet tooltips ignore pointer
    // events by default, so a real clickable link here would vanish
    // before it could be clicked) — it just hints that photos exist;
    // the actual link lives in the click popup above.
    const tooltipText = (trip ? trip.name : t.name) + (photoCount ? ' · \u{1F4F7} '+photoCount : '');
    line.bindTooltip(tooltipText, {sticky:true, direction:'top', opacity:0.92});
    line.on('mouseover', function(){ this.setStyle({weight:5, opacity:1}); this.bringToFront(); });
    line.on('mouseout', function(){ this.setStyle({weight:2.5, opacity:0.85}); });
    trackLayerGroup.addLayer(line);
  });
}

map.on('popupopen', (e)=>{
  const el = e.popup.getElement();
  const link = el && el.querySelector('.popup-trip-link');
  if(link){
    link.addEventListener('click', (evt)=>{
      evt.preventDefault();
      goToTripFromMap(link.dataset.tripId);
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

function renderStats(){
  document.getElementById('statTrips').textContent = trips.length;
  const dist = tracks.reduce((s,t)=>s+t.distanceKm,0);
  document.getElementById('statDistance').textContent = compactNumber(dist);
  const climb = tracks.reduce((s,t)=>s+(t.elevationGainM||0),0);
  document.getElementById('statClimb').textContent = compactNumber(climb);
  const countries = allVisitedCountries();
  const countriesEl = document.getElementById('statCountries');
  countriesEl.textContent = countries.size;
  countriesEl.title = countries.size ? Array.from(countries).sort().join(', ') : '';
  document.getElementById('settingsDataSummary').textContent =
    tracks.length+' track'+(tracks.length!==1?'s':'')+' and '+
    googlePoints.length.toLocaleString('en-US')+' location-history point'+(googlePoints.length!==1?'s':'')+' on this device.';
  document.getElementById('clearBtn').disabled = !(tracks.length || googlePoints.length);
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
    ['gsImport', tracks.length > 0],
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
