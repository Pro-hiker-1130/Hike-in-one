// Hike-in-one — Local storage (IndexedDB) for tracks, gear, trips and loadouts, and the optional cloud sync with Supabase.
// Plain scripts loaded in order by index.html; they share one global scope.
'use strict';

// ---- Persistence ----
// window.storage only exists inside the claude.ai preview. When this file is
// opened directly in a browser (standalone, e.g. GitHub Pages), we fall back
// to IndexedDB — it handles larger data (a growing gear inventory, lots of
// tracks) better than localStorage. Any data saved previously under the old
// localStorage fallback is migrated in automatically the first time it's read.
const HAS_NATIVE_STORAGE = (typeof window.storage !== 'undefined' && window.storage !== null);
const IDB_NAME = 'waypoints-db';
const IDB_VERSION = 1;
let idbPromise = null;

function idbOpen(){
  if(idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject)=>{
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = ()=>{
      const db = req.result;
      if(!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', {keyPath:'key'});
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
  return idbPromise;
}
async function idbSet(key, value){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put({key, value});
    tx.oncomplete = ()=> resolve();
    tx.onerror = ()=> reject(tx.error);
  });
}
async function idbGet(key){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get(key);
    req.onsuccess = ()=> resolve(req.result ? req.result.value : null);
    req.onerror = ()=> reject(req.error);
  });
}
async function idbDelete(key){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').delete(key);
    tx.oncomplete = ()=> resolve();
    tx.onerror = ()=> reject(tx.error);
  });
}

async function storeSet(key, value){
  try{
    if(HAS_NATIVE_STORAGE){ await window.storage.set(key, value, false); return; }
    await idbSet(key, value);
  }catch(e){
    console.error('storage set failed for', key, e);
    try{ localStorage.setItem(key, value); }catch(e2){}
  }
}
async function storeGet(key){
  try{
    if(HAS_NATIVE_STORAGE){
      const r = await window.storage.get(key, false);
      return (r && r.value) ? r.value : null;
    }
    let v = await idbGet(key);
    if(v === null || v === undefined){
      // one-time migration: pick up anything saved by the earlier localStorage fallback
      let legacy = null;
      try{ legacy = localStorage.getItem(key); }catch(e){}
      if(legacy !== null){ await idbSet(key, legacy); v = legacy; }
    }
    return v;
  }catch(e){
    try{ return localStorage.getItem(key); }catch(e2){ return null; }
  }
}
async function storeRemove(key){
  try{
    if(HAS_NATIVE_STORAGE && typeof window.storage.remove === 'function'){ await window.storage.remove(key, false); return; }
    await idbDelete(key);
  }catch(e){
    console.error('storage remove failed for', key, e);
  }
  try{ localStorage.removeItem(key); }catch(e2){}
}

async function saveTracks(){ await storeSet(STORAGE_TRACKS, JSON.stringify(tracks)); markLocalModified(); scheduleCloudPush(); }
async function saveGoogle(){ await storeSet(STORAGE_GOOGLE, JSON.stringify(googlePoints)); markLocalModified(); scheduleCloudPush(); }
async function loadAll(){
  const t = await storeGet(STORAGE_TRACKS);
  tracks = t ? JSON.parse(t) : [];
  const g = await storeGet(STORAGE_GOOGLE);
  googlePoints = g ? JSON.parse(g) : [];
}

// ---- Gear Room persistence ----
const STORAGE_GEAR = 'waypoints-gear-v1';
let gearItems = [];

async function saveGear(){ await storeSet(STORAGE_GEAR, JSON.stringify(gearItems)); markLocalModified(); scheduleCloudPush(); }
async function loadGear(){
  const g = await storeGet(STORAGE_GEAR);
  gearItems = g ? JSON.parse(g) : [];
}

// ---- Trips persistence ----
const STORAGE_TRIPS = 'waypoints-trips-v1';
let trips = []; // {id, name, notes, trackIds:[], gearIds:[], loadoutId, createdAt}

async function saveTrips(){ await storeSet(STORAGE_TRIPS, JSON.stringify(trips)); markLocalModified(); scheduleCloudPush(); }
async function loadTrips(){
  const t = await storeGet(STORAGE_TRIPS);
  trips = t ? JSON.parse(t) : [];
}

// ---- Loadouts persistence ----
// A loadout is a reusable named gear list. Applying one to a trip copies
// its items into that trip's own gear list (trip.gearIds) as a snapshot,
// so editing the trip afterward never changes the loadout template, and
// refining the loadout later never rewrites trips that already used it.
const STORAGE_LOADOUTS = 'waypoints-loadouts-v1';
let loadouts = []; // {id, name, notes, gearIds:[], createdAt}

async function saveLoadouts(){ await storeSet(STORAGE_LOADOUTS, JSON.stringify(loadouts)); markLocalModified(); scheduleCloudPush(); }
async function loadLoadouts(){
  const l = await storeGet(STORAGE_LOADOUTS);
  loadouts = l ? JSON.parse(l) : [];
}

// ---- Cloud sync: push/pull the whole local dataset as one row per user ----
// Matches the app's own persistence model (each of gear/trips/loadouts/tracks
// is already saved as a single JSON blob), so sync is "upsert the blob",
// not a per-record CRUD/merge system. Good enough for one person's data
// across their own devices; not built for real-time multi-user editing.
function markLocalModified(){
  const ts = Date.now();
  storeSet(STORAGE_LAST_MODIFIED, String(ts));
  return ts;
}

async function localSnapshot(){
  return {
    gear: gearItems, trips, loadouts, tracks, google_points: googlePoints,
    basemap: (await storeGet('waypoints-basemap')) || null,
  };
}

// Synced columns should be JSON arrays; accept a JSON string too and drop
// empty entries, so one odd value can't break every page that lists them.
function syncedList(v){
  if(typeof v === 'string'){ try{ v = JSON.parse(v); }catch(e){ v = null; } }
  return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : [];
}
async function applyCloudSnapshot(row){
  gearItems = syncedList(row.gear);
  trips = syncedList(row.trips);
  loadouts = syncedList(row.loadouts);
  tracks = syncedList(row.tracks);
  googlePoints = Array.isArray(row.google_points) ? row.google_points : syncedList(row.google_points);
  suppressNextPush = true;
  await Promise.all([
    saveGear(), saveTrips(), saveLoadouts(), saveTracks(), saveGoogle(),
    row.basemap ? storeSet('waypoints-basemap', row.basemap) : Promise.resolve(),
  ]);
}

function renderSettingsAccount(){
  try{ renderDeviceSummary(); }catch(e){ /* data not loaded yet */ }
  const card = document.getElementById('settingsAccountCard');
  card.hidden = !CLOUD_SYNC_ENABLED;
  if(!CLOUD_SYNC_ENABLED) return;
  const el = document.getElementById('settingsAccount');
  if(!cloudUser){
    el.innerHTML = '<p class="settings-note">Sign in to keep your hikes, gear and trips in sync across your devices, and to add to the shared gear catalog.</p>'+
      '<button class="primary-btn" type="button" id="settingsSignInBtn">Sign in</button>';
    document.getElementById('settingsSignInBtn').addEventListener('click', openCloudSignInModal);
    return;
  }
  const statusLabel = {syncing:'Syncing…', synced:'Everything is synced', error:'Sync error — changes are kept on this device', offline:'Offline — changes sync when you reconnect'}[cloudSyncStatus] || '';
  el.innerHTML = '<p class="settings-account-email"></p><p class="settings-note"></p>'+
    '<button class="ghost-btn" type="button" id="settingsSignOutBtn">Sign out</button>';
  el.querySelector('.settings-account-email').textContent = 'Signed in as '+(cloudUser.email || '');
  el.querySelector('.settings-note').textContent = statusLabel;
  document.getElementById('settingsSignOutBtn').addEventListener('click', ()=> sb.auth.signOut());
}

function renderNavAccount(){
  renderSettingsAccount();
  const el = document.getElementById('navAccount');
  if(!el) return;
  if(!CLOUD_SYNC_ENABLED){
    el.innerHTML = '';
    return;
  }
  if(!cloudUser){
    el.innerHTML = '<button class="ghost-btn" id="cloudSignInBtn">Sign in</button>';
    document.getElementById('cloudSignInBtn').addEventListener('click', openCloudSignInModal);
    return;
  }
  const statusLabel = {syncing:'Syncing…', synced:'Synced', error:'Sync error', offline:'Offline'}[cloudSyncStatus] || '';
  el.innerHTML =
    '<span class="nav-account-status" data-status="'+cloudSyncStatus+'"></span>'+
    '<span class="nav-account-email"></span>'+
    '<button class="ghost-btn" id="cloudSignOutBtn">Sign out</button>';
  el.querySelector('.nav-account-status').textContent = statusLabel;
  el.querySelector('.nav-account-email').textContent = cloudUser.email || '';
  document.getElementById('cloudSignOutBtn').addEventListener('click', ()=> sb.auth.signOut());
}

function openCloudSignInModal(){
  const status = document.getElementById('cloudSignInStatus');
  status.textContent = '';
  status.className = 'upload-status';
  document.getElementById('cloudSignInEmail').value = '';
  document.getElementById('cloudSignInSubmitBtn').disabled = false;
  document.getElementById('cloudSignInSubmitBtn').textContent = 'Send magic link';
  document.getElementById('cloudSignInModalOverlay').style.display = 'flex';
  document.getElementById('cloudSignInEmail').focus();
  onModalOpened('cloudSignInModalOverlay');
}
function closeCloudSignInModal(){
  document.getElementById('cloudSignInModalOverlay').style.display = 'none';
  onModalClosed('cloudSignInModalOverlay');
}

async function sendMagicLink(email){
  if(!sb) return;
  const status = document.getElementById('cloudSignInStatus');
  const btn = document.getElementById('cloudSignInSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  status.className = 'upload-status';
  status.textContent = '';
  try{
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
    if(error) throw error;
    status.className = 'upload-status';
    status.textContent = 'Check your inbox for a sign-in link.';
    btn.textContent = 'Link sent';
  }catch(e){
    console.error('magic link send failed', e);
    status.className = 'upload-error';
    status.textContent = 'Couldn\'t send that link — check the email address and try again.';
    btn.disabled = false;
    btn.textContent = 'Send magic link';
  }
}

function snapshotHasData(x){
  return !!x && (['gear','trips','tracks','loadouts'].some(k => syncedList(x[k]).length) ||
    (Array.isArray(x.google_points) && x.google_points.length > 0));
}
function localHasData(){
  return !!(gearItems.length || trips.length || tracks.length || loadouts.length || googlePoints.length);
}

// Sign-in and app start both fire auth events, often back to back; one
// reconcile at a time.
let reconcileInFlight = null;
function reconcileOnSignIn(){
  if(!reconcileInFlight) reconcileInFlight = reconcileNow().finally(()=> reconcileInFlight = null);
  return reconcileInFlight;
}

async function reconcileNow(){
  cloudSyncStatus = 'syncing';
  renderNavAccount();
  try{
    if(!(await localDataLoaded)) throw new Error('local data could not be read, so sync is paused');
    const { data, error } = await sb.from('user_data').select('*').eq('user_id', cloudUser.id).maybeSingle();
    if(error) throw error;
    const localTs = Number(await storeGet(STORAGE_LAST_MODIFIED)) || 0;
    const cloudTs = data ? new Date(data.updated_at).getTime() : 0;
    // Newest copy wins, except that an empty cloud copy never replaces a
    // device that still has data: that device refills the cloud instead.
    const useCloud = data && snapshotHasData(data) ? (cloudTs >= localTs || !localHasData()) : false;
    if(useCloud){
      // A section that is empty in the cloud but filled here (trips, say)
      // is kept from this device and uploaded again, not wiped.
      const kept = [];
      const merged = Object.assign({}, data);
      [['gear', gearItems], ['trips', trips], ['loadouts', loadouts], ['tracks', tracks], ['google_points', googlePoints]].forEach(([k, mine])=>{
        const theirs = k === 'google_points' ? (Array.isArray(data[k]) ? data[k] : []) : syncedList(data[k]);
        if(!theirs.length && mine.length){ merged[k] = mine; kept.push(k); }
      });
      await applyCloudSnapshot(merged);
      if(kept.length) await pushToCloud();
      try{ refreshEverything(); }catch(err){ noteAppError(err); console.error(err); }
      try{ showGarage(); }catch(err){ noteAppError(err); console.error(err); }
      // The Trips page only redraws when it is opened, so one already on
      // screen (common on a phone, where this pull can take a few
      // seconds) would keep showing the pre-sync list.
      if(currentTripId !== null) renderTripDetail(); else renderTripCards();
    } else if(localHasData()){
      await pushToCloud();
    }
    cloudSyncStatus = 'synced';
  }catch(e){
    console.error('cloud reconcile failed', e);
    cloudSyncStatus = 'error';
  }
  renderNavAccount();
}

async function pushToCloud(){
  if(!sb || !cloudUser) return;
  if(!(await localDataLoaded)) return;
  cloudSyncStatus = 'syncing';
  renderNavAccount();
  try{
    const snap = await localSnapshot();
    // Never upload a completely empty dataset: it can only wipe the copy
    // other devices rely on. (Emptying everything by hand is the one case
    // this holds back; the cloud copy then comes back on the next sync.)
    if(!snapshotHasData(snap)){
      cloudSyncStatus = 'synced';
      renderNavAccount();
      return;
    }
    const { error } = await sb.from('user_data').upsert({
      user_id: cloudUser.id,
      gear: snap.gear, trips: snap.trips, loadouts: snap.loadouts,
      tracks: snap.tracks, google_points: snap.google_points, basemap: snap.basemap,
      updated_at: new Date().toISOString(),
    });
    if(error) throw error;
    cloudSyncStatus = 'synced';
  }catch(e){
    console.error('cloud push failed', e);
    cloudSyncStatus = 'error';
  }
  renderNavAccount();
}

function scheduleCloudPush(){
  if(!CLOUD_SYNC_ENABLED || !cloudUser) return;
  if(suppressNextPush){ suppressNextPush = false; return; }
  clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(()=> pushToCloud(), 1500);
}

if(CLOUD_SYNC_ENABLED){
  sb.auth.onAuthStateChange((event, session)=>{
    const user = session && session.user ? { id: session.user.id, email: session.user.email } : null;
    const wasSignedIn = !!cloudUser;
    cloudUser = user;
    if(user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')){
      reconcileOnSignIn();
    } else if(!user && wasSignedIn){
      cloudSyncStatus = 'offline';
      renderNavAccount();
    } else {
      renderNavAccount();
    }
  });
  // Render the signed-out state immediately rather than waiting on the
  // listener above — some client versions don't fire it until a session
  // is actually restored, which would otherwise leave the sign-in button
  // missing on a fresh, logged-out visit.
  renderNavAccount();
}
