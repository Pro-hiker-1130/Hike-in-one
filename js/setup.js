// Hike-in-one — Configuration (Supabase, Strava) and the Leaflet map with its basemaps.
// Plain scripts loaded in order by index.html; they share one global scope.
'use strict';

// ---- Cloud sync (Supabase) ----
// Fill these in after creating a free project at supabase.com — see the
// setup steps in supabase/schema.sql. Both values are meant to be public:
// the anon key only grants what the row-level-security policies in that
// file allow (each signed-in user can read/write their own row, nothing
// else), so publishing it here is the normal, supported way to use it.
const SUPABASE_URL = 'https://agdtujbsojhujffvhqcb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vKRegkN0rY9BfWlK-1kZxA_4ws0GoIK';
const CLOUD_SYNC_ENABLED = !!(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase);
const sb = CLOUD_SYNC_ENABLED ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const STORAGE_LAST_MODIFIED = 'waypoints-last-modified-v1';

// ---- Strava import ----
// Fill in after registering a free app at strava.com/settings/api. The
// client ID is public (it's meant to appear in the authorize URL); the
// client SECRET never goes here — it's only ever set as a secret on the
// strava-callback / strava-api Supabase Edge Functions (see
// supabase/functions/), deployable from the Supabase dashboard's Edge
// Functions editor — no CLI required.
const STRAVA_CLIENT_ID = '';
const STRAVA_ENABLED = !!(STRAVA_CLIENT_ID && CLOUD_SYNC_ENABLED);
const STRAVA_TOKENS_KEY = 'waypoints-strava-tokens-v1';

let cloudUser = null;              // {id, email} once signed in, else null
let cloudSyncStatus = 'offline';   // 'offline' | 'syncing' | 'synced' | 'error'
let cloudPushTimer = null;
let suppressNextPush = false;      // set while applying a pulled snapshot, so it doesn't bounce straight back to the cloud
// Sync must not run until this device's own data has been read from
// storage: until then the in-memory lists are empty, and uploading them
// would replace the cloud copy (and so every other device) with nothing.
// Resolves true once loaded, false if reading local data failed.
let resolveLocalDataLoaded;
const localDataLoaded = new Promise(r => resolveLocalDataLoaded = r);

const COLORS = ['#C4501C','#3A5A40','#6A4C93','#1F6FA8','#A3366B','#8A6A00','#2F8F83','#5B5F97'];
const STORAGE_TRACKS = 'waypoints-tracks-v1';
const STORAGE_GOOGLE = 'waypoints-google-points-v1';
const MAX_STORED_POINTS_PER_TRACK = 1500;
const MAX_PROFILE_POINTS = 300;
const MAX_GOOGLE_POINTS = 20000;

let tracks = [];        // {id, name, date, distanceKm, points:[[lat,lon],...], colorIdx}
let googlePoints = [];  // [[lat,lon],...]
let currentView = 'tracks';

// ---- Map setup ----
const map = L.map('map', {worldCopyJump:true}).setView([20,10], 2);

// ---- Basemaps ----
// All free and keyless. makeBasemap(key) builds a fresh layer for any map
// (a Leaflet layer can only be on one map at a time).
//   light / dark  OpenStreetMap ("dark" is a CSS filter on the tiles)
//   terrain       OpenTopoMap
//   satellite     Esri World Imagery
//   relief        Maptoolkit's vector hiking map (shaded relief, contours), drawn by
//                 MapLibre inside Leaflet; loaded only when picked
// Plus an overlay of marked hiking routes from Waymarked Trails.
const BASEMAP_KEYS = ['light', 'terrain', 'relief', 'satellite', 'dark'];
const BASEMAP_LABELS = { light:'Light', terrain:'Terrain', relief:'Relief', satellite:'Satellite', dark:'Dark' };
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function tiles(url, opts){ const l = L.tileLayer(url, opts); watchTileErrors(l); return l; }
function osmTiles(){ return tiles('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: OSM_ATTR, maxZoom: 19 }); }
function topoTiles(){
  return tiles('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: OSM_ATTR + ', SRTM | Map style: &copy; OpenTopoMap', subdomains: 'abc', maxNativeZoom: 17, maxZoom: 19 });
}
function makeBasemap(key){
  switch(key){
    case 'terrain': return topoTiles();
    case 'satellite': return tiles('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri', maxZoom: 19 });
    case 'relief': return makeReliefLayer();
    default: return osmTiles();
  }
}

function makeTrailsOverlay(){
  return tiles('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', {
    attribution: 'Hiking routes &copy; <a href="https://hiking.waymarkedtrails.org">Waymarked Trails</a>',
    maxNativeZoom: 17, maxZoom: 19, opacity: 0.85, zIndex: 5 });
}

// MapLibre (~900 KB) is only downloaded the first time someone picks
// "Relief". Until it has loaded, OpenTopoMap stands in.
const MAPLIBRE_JS = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.24.0/maplibre-gl.min.js';
const MAPLIBRE_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.24.0/maplibre-gl.min.css';
const MAPLIBRE_LEAFLET_JS = 'https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js';
const RELIEF_STYLE = 'https://styles.maptoolkit.org/summer.json';
let maplibreLoading = null;
function loadScriptOnce(src){
  return new Promise((resolve, reject)=>{
    const el = document.createElement('script');
    el.src = src; el.onload = resolve; el.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(el);
  });
}
function loadMapLibre(){
  if(!maplibreLoading){
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = MAPLIBRE_CSS;
    document.head.appendChild(css);
    maplibreLoading = loadScriptOnce(MAPLIBRE_JS).then(()=> loadScriptOnce(MAPLIBRE_LEAFLET_JS));
    maplibreLoading.catch(()=>{ maplibreLoading = null; });
  }
  return maplibreLoading;
}
function makeReliefLayer(){
  const group = L.layerGroup();
  const standIn = topoTiles();
  group.addLayer(standIn);
  loadMapLibre().then(()=>{
    group.removeLayer(standIn);
    group.addLayer(L.maplibreGL({
      style: RELIEF_STYLE,
      attribution: '&copy; <a href="https://www.maptoolkit.com">Maptoolkit</a> ' + OSM_ATTR,
    }));
  }).catch(()=>{
    if(typeof showGlobalToast === 'function') showGlobalToast('The relief map needs an internet connection. Showing Terrain instead.', true);
  });
  return group;
}

let currentBasemapKey = null, currentBasemapLayer = null;
let trailsOverlay = null;

let tileWarningShown = false;
function watchTileErrors(layer){
  layer.on('tileerror', ()=>{
    if(tileWarningShown) return;
    tileWarningShown = true;
    document.getElementById('tileWarning').style.display = 'block';
  });
  layer.on('tileload', ()=>{
    // real tiles are loading fine, hide any stale warning
    if(tileWarningShown){
      tileWarningShown = false;
      document.getElementById('tileWarning').style.display = 'none';
    }
  });
}

function setBasemap(key, persist = true){
  if(!BASEMAP_KEYS.includes(key)) return;
  // light and dark share the same tiles.
  const tileKey = key === 'dark' ? 'light' : key;
  const currentTileKey = currentBasemapKey === 'dark' ? 'light' : currentBasemapKey;
  if(tileKey !== currentTileKey){
    if(currentBasemapLayer) map.removeLayer(currentBasemapLayer);
    currentBasemapLayer = makeBasemap(tileKey).addTo(map);
  }
  currentBasemapKey = key;
  map.getContainer().classList.toggle('dark-tiles', key === 'dark');
  if(persist) storeSet('waypoints-basemap', key);
}

function setTrailsOverlay(on, persist = true){
  if(on && !trailsOverlay) trailsOverlay = makeTrailsOverlay().addTo(map);
  if(!on && trailsOverlay){ map.removeLayer(trailsOverlay); trailsOverlay = null; }
  if(persist) storeSet('waypoints-trails-overlay', on ? '1' : '');
}

// ---- The map picker: one round "layers" button on a map. Tapping it opens
// a panel with every basemap and the hiking-routes overlay. ----
// state: {current(), choose(key), overlayOn(), setOverlay(on)}
const LAYERS_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3 2.5 8 12 13l9.5-5L12 3Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="m2.5 12 9.5 5 9.5-5M2.5 16l9.5 5 9.5-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>';
function addBasemapPicker(m, state, position){
  const Picker = L.Control.extend({
    options: { position: position || 'topright' },
    onAdd(){
      const el = L.DomUtil.create('div', 'bm-picker');
      el.innerHTML =
        '<button type="button" class="bm-picker-btn" aria-label="Map layers" aria-expanded="false" title="Map layers">' + LAYERS_ICON + '</button>' +
        '<div class="bm-picker-panel" role="group" aria-label="Map layers" hidden>' +
          '<p class="bm-picker-title">Map</p>' +
          '<div class="bm-picker-grid">' +
            BASEMAP_KEYS.map(k => '<button type="button" class="bm-opt" data-basemap="' + k + '" aria-pressed="false">' +
              '<span class="bm-swatch bm-swatch-' + k + '"></span><span class="bm-opt-name">' + BASEMAP_LABELS[k] + '</span></button>').join('') +
          '</div>' +
          '<label class="bm-picker-overlay"><input type="checkbox" data-overlay="trails"> Marked hiking routes</label>' +
          (state.extras || []).map(x => '<label class="bm-picker-overlay bm-picker-extra"><input type="checkbox" data-overlay="' + x.key + '"> ' + x.label + '</label>').join('') +
        '</div>';
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
      const btn = el.querySelector('.bm-picker-btn'), panel = el.querySelector('.bm-picker-panel');
      const overlay = el.querySelector('input[data-overlay="trails"]');
      const extras = [...el.querySelectorAll('.bm-picker-extra input')];
      const open = on => { panel.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false'); el.classList.toggle('is-open', on); };
      const refresh = () => {
        el.querySelectorAll('.bm-opt').forEach(o => {
          const on = o.dataset.basemap === state.current();
          o.classList.toggle('active', on);
          o.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        overlay.checked = !!state.overlayOn();
        extras.forEach(i => { i.checked = !!state.extraOn(i.dataset.overlay); });
      };
      btn.addEventListener('click', ()=>{ refresh(); open(panel.hidden); });
      el.querySelectorAll('.bm-opt').forEach(o => o.addEventListener('click', ()=>{
        state.choose(o.dataset.basemap);
        refresh();
        open(false);
      }));
      overlay.addEventListener('change', ()=> state.setOverlay(overlay.checked));
      extras.forEach(i => i.addEventListener('change', ()=> state.setExtra(i.dataset.overlay, i.checked)));
      // Tapping anywhere else, or Escape, closes the panel (and only the
      // panel: Escape doesn't also close a dialog the map sits in).
      document.addEventListener('pointerdown', e=>{ if(!panel.hidden && !el.contains(e.target)) open(false); });
      document.addEventListener('keydown', e=>{
        if(e.key === 'Escape' && !panel.hidden){ e.preventDefault(); e.stopPropagation(); open(false); btn.focus(); }
      }, true);
      this.refresh = refresh;
      return el;
    },
  });
  const picker = new Picker().addTo(m);
  return picker;
}

// Basemap and overlay state for a map other than the main one (route
// planner, track editor), which doesn't remember its choice.
// extras: more overlay switches, [{key, label, on(), set(on)}].
function addMapLayerSwitcher(m, startKey, position, extras){
  let key = null, layer = null, trails = null;
  const state = {
    extras: extras || [],
    extraOn: k => { const x = (extras || []).find(e => e.key === k); return x ? x.on() : false; },
    setExtra: (k, on) => { const x = (extras || []).find(e => e.key === k); if(x) x.set(on); },
    current: () => key,
    choose(k){
      const tileKey = k === 'dark' ? 'light' : k;
      const curTileKey = key === 'dark' ? 'light' : key;
      if(tileKey !== curTileKey){
        if(layer) m.removeLayer(layer);
        layer = makeBasemap(tileKey).addTo(m);
      }
      key = k;
      m.getContainer().classList.toggle('dark-tiles', k === 'dark');
    },
    overlayOn: () => !!trails,
    setOverlay(on){
      if(on && !trails) trails = makeTrailsOverlay().addTo(m);
      if(!on && trails){ m.removeLayer(trails); trails = null; }
    },
  };
  state.choose(BASEMAP_KEYS.includes(startKey) ? startKey : 'terrain');
  return addBasemapPicker(m, state, position);
}

// Startup default only — not a user choice, so don't persist it. (It also
// runs before the storage layer below is initialized.)
setBasemap('light', false);

let trackLayerGroup = L.layerGroup();
let heatLayer = null;

function haversine(a,b){
  const R=6371;
  const dLat=(b[0]-a[0])*Math.PI/180, dLon=(b[1]-a[1])*Math.PI/180;
  const lat1=a[0]*Math.PI/180, lat2=b[0]*Math.PI/180;
  const h=Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}

function downsample(points, max){
  if(points.length<=max) return points;
  const stride = Math.ceil(points.length/max);
  const out=[];
  for(let i=0;i<points.length;i+=stride) out.push(points[i]);
  return out;
}

// ---- Saving a file ----
// A plain download link does nothing in an app installed to an iPhone's
// home screen, so on phones and tablets the file goes through the share
// sheet ("Save to Files", or straight to another app) when the browser can
// share it. Computers, and phones that can't share the file type, get an
// ordinary download. Resolves to 'shared', 'downloaded' or 'cancelled'.
async function saveFile(file, title){
  const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if(touch && navigator.canShare && navigator.share){
    let canShare = false;
    try{ canShare = navigator.canShare({ files: [file] }); }catch(e){}
    if(canShare){
      try{ await navigator.share({ files: [file], title: title || file.name }); return 'shared'; }
      catch(e){ if(e && e.name === 'AbortError') return 'cancelled'; }
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}

// A track as a .gpx file, saved or shared, with a hint for GPS watches.
async function saveTrackGpx(track){
  const file = new File([TrackCore.toGpx(track)], TrackCore.gpxFileName(track), { type: 'application/gpx+xml' });
  const how = await saveFile(file, track.name);
  if(how !== 'cancelled' && typeof showGlobalToast === 'function'){
    showGlobalToast('GPX saved. For a Garmin: in Garmin Connect, open Courses, choose Import, then send the course to your device.');
  }
  return how;
}

// ---- "Show my location" button ----
// Asks for the position only when tapped. A blue dot with a light circle
// for the fix's accuracy; the map follows until it is dragged, and a tap
// brings it back (a tap while following turns it off). The GPS is paused
// while the map is off screen or the app is in the background. The
// position stays on the device.
const LOCATE_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
function addLocateControl(m, position){
  let watchId = null, wanted = false, following = false, first = true;
  let dot = null, ring = null, btn = null;
  let onScreen = true;
  const setState = st => {
    if(btn){ btn.dataset.state = st; btn.setAttribute('aria-pressed', st === 'off' ? 'false' : 'true'); }
    // Lets the page hide things that would cover the dot (the empty-map card).
    const host = m.getContainer().parentElement;
    if(host) host.classList.toggle('is-locating', st !== 'off');
  };
  const clearMarker = () => { if(dot){ m.removeLayer(dot); dot = null; } if(ring){ m.removeLayer(ring); ring = null; } };
  const pause = () => { if(watchId != null){ navigator.geolocation.clearWatch(watchId); watchId = null; } };
  const onFix = pos => {
    const ll = [pos.coords.latitude, pos.coords.longitude];
    const acc = Math.max(0, pos.coords.accuracy || 0);
    if(!dot){
      ring = L.circle(ll, { radius: acc, interactive: false, color: '#2F80ED', weight: 1, opacity: 0.4, fillColor: '#2F80ED', fillOpacity: 0.12 }).addTo(m);
      dot = L.marker(ll, { interactive: false, keyboard: false, zIndexOffset: 1000,
        icon: L.divIcon({ className: 'locate-dot', iconSize: [18, 18] }) }).addTo(m);
    } else { dot.setLatLng(ll); ring.setLatLng(ll).setRadius(acc); }
    if(first){ first = false; m.setView(ll, Math.max(m.getZoom(), 15)); }
    else if(following) m.panTo(ll, { animate: true });
    setState(following ? 'following' : 'on');
  };
  // Only a blocked permission turns it off. A lost fix (a forest, a
  // tunnel, a slow first fix) is temporary: the watch keeps going.
  let toldStillLooking = false;
  const onError = err => {
    if(err && err.code === 1){
      pause();
      wanted = false; following = false;
      clearMarker();
      setState('off');
      if(typeof showGlobalToast === 'function') showGlobalToast('Location is blocked. Allow location for this app in your phone or browser settings, then tap again.', true);
      return;
    }
    if(!dot && !toldStillLooking && typeof showGlobalToast === 'function'){
      toldStillLooking = true;
      showGlobalToast('Still looking for your location… This is quicker outdoors.');
    }
  };
  const resume = () => {
    if(!wanted || watchId != null || !onScreen || document.visibilityState === 'hidden') return;
    watchId = navigator.geolocation.watchPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  };
  const start = () => {
    if(!('geolocation' in navigator)){
      if(typeof showGlobalToast === 'function') showGlobalToast('This browser cannot show your location.', true);
      return;
    }
    toldStillLooking = false;
    wanted = true; following = true; first = !dot;
    if(dot) m.setView(dot.getLatLng(), Math.max(m.getZoom(), 15));
    setState(dot ? 'following' : 'searching');
    resume();
  };
  const stop = () => { wanted = false; following = false; pause(); clearMarker(); setState('off'); };

  const Locate = L.Control.extend({
    options: { position: position || 'topright' },
    onAdd(){
      const el = L.DomUtil.create('div', 'locate-control');
      el.innerHTML = '<button type="button" class="locate-btn" data-state="off" aria-pressed="false" aria-label="Show my location" title="Show my location">' + LOCATE_ICON + '</button>';
      L.DomEvent.disableClickPropagation(el);
      btn = el.firstChild;
      btn.addEventListener('click', ()=>{
        if(!wanted) start();
        else if(!following) start();     // back to my position
        else stop();
      });
      return el;
    },
  });
  const control = new Locate().addTo(m);
  // Dragging the map stops following (the dot stays).
  m.on('dragstart', ()=>{ if(following){ following = false; setState(dot ? 'on' : 'searching'); } });
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState === 'hidden') pause(); else resume(); });
  if('IntersectionObserver' in window){
    new IntersectionObserver(entries=>{
      onScreen = entries.some(e => e.isIntersecting);
      if(onScreen) resume(); else pause();
    }).observe(m.getContainer());
  }
  control.stop = stop;
  control.isOn = () => wanted;
  return control;
}
