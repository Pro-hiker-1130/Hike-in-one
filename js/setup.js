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

// CARTO's free anonymous raster tiles now require an API key, so "dark" and
// "light" both use plain OpenStreetMap tiles; "dark" fakes its look with a
// CSS filter on the tile pane instead of a separate tile server.
const BASEMAPS = {
  osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors', subdomains:'abc', maxZoom:19
  }),
  terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap', subdomains:'abc', maxZoom:17
  }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri', maxZoom:19
  })
};
let currentTileKey = null;

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
Object.values(BASEMAPS).forEach(watchTileErrors);

function setBasemap(key, persist = true){
  if(!['dark','light','terrain','satellite'].includes(key)) return;
  const wantsTile = (key === 'dark' || key === 'light') ? 'osm' : key;
  if(currentTileKey !== wantsTile){
    if(currentTileKey) map.removeLayer(BASEMAPS[currentTileKey]);
    BASEMAPS[wantsTile].addTo(map);
    currentTileKey = wantsTile;
  }
  map.getContainer().classList.toggle('dark-tiles', key === 'dark');
  if(persist) storeSet('waypoints-basemap', key);
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
