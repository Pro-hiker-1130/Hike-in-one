// Hike-in-one — The Trips page: next-trip card, month timeline, trip detail, photos, lightbox, trip form and color picker.
// Plain scripts loaded in order by index.html; they share one global scope.
'use strict';

// ---- When the trips list can't be drawn: say so instead of a blank page ----
let tripsProblems = [];
function noteTripsProblem(err, trip){
  console.error('trips list:', err, trip);
  tripsProblems.push((trip && trip.name ? '"'+trip.name+'": ' : '') + (err && err.message || String(err)));
  noteAppError(err);
}
function plainTripCard(trip){
  const card = document.createElement('div');
  card.className = 'trip-card';
  card.innerHTML = '<div class="trip-card-name"></div><div class="trip-card-meta">Some details of this trip couldn\'t be shown.</div>';
  card.querySelector('.trip-card-name').textContent = (trip && trip.name) || 'Untitled trip';
  if(trip && trip.id) card.addEventListener('click', ()=> showTripDetail(trip.id));
  return card;
}
function showTripsProblems(){
  const box = document.getElementById('tripsProblem');
  box.hidden = !tripsProblems.length;
  if(!tripsProblems.length) return;
  box.textContent = 'Something went wrong showing your trips. Please send this to the developer: ' + tripsProblems.slice(0, 3).join(' · ');
}

function renderTripCards(){
  tripsProblems = [];
  try{ renderTripCardsUnguarded(); }
  catch(err){ noteTripsProblem(err, null); }
  showTripsProblems();
}

function renderTripCardsUnguarded(){
  document.getElementById('tripsEmpty').style.display = trips.length ? 'none' : 'block';
  document.querySelectorAll('#tripsListView .section-subhead, #tripsListView .gear-grid, #tripCompletedGrid').forEach(el=>{
    el.style.display = trips.length ? '' : 'none';
  });
  document.getElementById('tripPlannedEmpty').style.display = 'none';
  document.getElementById('tripCompletedEmpty').style.display = 'none';
  if(!trips.length){ document.getElementById('nextTripCard').hidden = true; return; }

  const planned = trips.filter(t => tripStatus(t) === 'planned');
  const completed = trips.filter(t => tripStatus(t) === 'completed');

  // Soonest first; undated planned trips (nothing to sort by yet) sink
  // to the end, most-recently-created of those shown first.
  planned.sort((a,b)=>{
    const da = tripDisplayDate(a), db = tripDisplayDate(b);
    if(da && db) return da < db ? -1 : da > db ? 1 : 0;
    if(da) return -1;
    if(db) return 1;
    return (b.createdAt||0)-(a.createdAt||0);
  });
  // Most recent first; undated completed trips fall back to creation order.
  completed.sort((a,b)=>{
    const da = tripDisplayDate(a), db = tripDisplayDate(b);
    if(da && db) return da > db ? -1 : da < db ? 1 : 0;
    if(da) return -1;
    if(db) return 1;
    return (b.createdAt||0)-(a.createdAt||0);
  });

  // The next trip gets the countdown card; the planned grid holds the rest
  // and disappears when there is no rest.
  const next = renderNextTrip(planned);
  const otherPlanned = planned.filter(t => t !== next);
  const showPlanned = otherPlanned.length || !next;
  document.getElementById('tripPlannedHead').style.display = showPlanned ? '' : 'none';
  document.getElementById('tripPlannedGrid').style.display = showPlanned ? '' : 'none';
  document.getElementById('tripPlannedLabel').textContent = next ? 'Also planned' : 'Planned trips';
  renderTripSection(otherPlanned, 'tripPlannedGrid', 'tripPlannedEmpty', 'planned');
  if(!showPlanned) document.getElementById('tripPlannedEmpty').style.display = 'none';
  renderTripTimeline(completed);
}

function showTripsList(){
  currentTripId = null;
  document.getElementById('tripsListView').style.display = 'flex';
  document.getElementById('tripDetailView').style.display = 'none';
  renderTripCards();
  pushRouteState();
}

function showTripDetail(id){
  if(id !== currentTripId) packingTripId = null;
  currentTripId = id;
  document.getElementById('tripsListView').style.display = 'none';
  document.getElementById('tripDetailView').style.display = 'flex';
  renderTripDetail();
  pushRouteState();
}

function renderTripDetail(){
  const trip = trips.find(t=>t.id===currentTripId);
  if(!trip){ showTripsList(); return; }
  const tks = tripTracks(trip);
  const dist = tripDistanceKm(trip);
  const gearList = tripGearItemsList(trip);
  const weight = tripGearWeight(trip);

  document.getElementById('tripDetailTitle').textContent = trip.name;
  document.getElementById('tripDetailSubtitle').textContent = trip.notes || '';
  const status = tripStatus(trip);
  const badge = document.getElementById('tripDetailStatusBadge');
  badge.className = 'gear-badge status-' + status;
  badge.textContent = status === 'planned' ? 'Planned' : 'Completed';
  document.getElementById('tripStatTracks').textContent = tks.length;
  document.getElementById('tripStatDistance').textContent = dist.toFixed(1);
  const climbTracks = tripCountedTracks(trip).filter(t => t.elevationGainM != null);
  document.getElementById('tripStatClimb').textContent = climbTracks.length
    ? climbTracks.reduce((s,t)=>s+t.elevationGainM, 0).toLocaleString('en-US') : '—';
  document.getElementById('tripStatGearCount').textContent = gearList.length;
  document.getElementById('tripStatWeight').textContent = weight ? formatWeight(weight) : '0 g';

  renderTripDaylight(trip, tks);
  renderTripDays(trip, tks);

  refreshTripLoadoutSelect();
  document.getElementById('tripLoadoutSelect').value = trip.loadoutId || '';

  const trackColors = computeTrackColors();
  const trackList = document.getElementById('tripTrackList');
  trackList.innerHTML = '';
  if(!tks.length){
    trackList.innerHTML = '<div class="trip-gear-empty">No tracks yet. Plan a route, or click Edit to add GPX files.</div>';
  } else {
    tks.forEach(t=>{
      const block = document.createElement('div');
      block.className = 'trip-track-block';
      const row = document.createElement('div');
      row.className = 'trip-track-row';
      row.innerHTML =
        '<span class="trip-track-row-name"><span class="track-color-dot" style="background:'+trackColors[t.id]+'"></span>'+escapeHtml(t.name)+
          (t.planned ? '<span class="planned-route-badge">Planned route</span>' : '')+'</span>'+
        '<span class="trip-track-row-meta">'+(t.date?escapeHtml(friendlyDate(t.date))+' · ':'')+(sportLabel(t.sport)?escapeHtml(sportLabel(t.sport))+' · ':'')+t.distanceKm.toFixed(1)+' km</span>'+
        '<button type="button" class="link-btn track-edit-btn" aria-label="Edit track '+escapeHtml(t.name)+'">Edit</button>';
      row.querySelector('.track-edit-btn').addEventListener('click', ()=>openTrackEditor(t.id));
      block.appendChild(row);
      const climb = trackClimbSummary(t);
      if(climb){
        const c = document.createElement('div');
        c.className = 'track-climb';
        c.textContent = climb;
        block.appendChild(c);
      } else if(t.elevationGainM === undefined){
        // Added before elevation was kept — the original file's data is
        // gone, so say how to get it rather than silently show nothing.
        const c = document.createElement('div');
        c.className = 'track-climb-hint';
        c.textContent = 'Added before elevation tracking — re-add this GPX to see its profile.';
        block.appendChild(c);
      }
      const terrain = trackTerrainSummary(t);
      if(terrain){
        const c = document.createElement('div');
        c.className = 'track-terrain';
        c.textContent = terrain;
        block.appendChild(c);
      }
      if(t.profile && t.profile.length > 1){
        const prof = buildElevationProfile(t);
        prof.style.setProperty('--ele-color', trackColors[t.id]);
        block.appendChild(prof);
      }
      trackList.appendChild(block);
    });
  }

  renderTripGear(trip);

  renderTripPhotoGrid(trip);
}

// ---- Multi-day plan ----
// A planned route split into days of about trip.dailyKm each, with each
// day's distance, climb and a walking-time estimate. Planned tracks with a
// profile are taken end to end, in the trip's order.
function tripPlannedProfile(tks){
  const out = [];
  tks.filter(t => t.planned && t.profile && t.profile.length > 1).forEach(t=>{
    const offset = out.length ? out[out.length-1][0] : 0;
    t.profile.forEach(([km, ele]) => out.push([offset + km - t.profile[0][0], ele]));
  });
  return out;
}

function renderTripDays(trip, tks){
  const profile = tripPlannedProfile(tks);
  const section = document.getElementById('tripDaysSection');
  section.hidden = profile.length < 2;
  if(section.hidden) return;
  const input = document.getElementById('tripDailyKm');
  if(document.activeElement !== input) input.value = trip.dailyKm || '';
  const list = document.getElementById('tripDaysList');
  list.innerHTML = '';
  if(!(trip.dailyKm > 0)){
    list.innerHTML = '<div class="trip-gear-empty">Set a daily distance to split the route into days.</div>';
    return;
  }
  const date0 = tripDisplayDate(trip);
  const day0 = date0 && isoDay(String(date0).slice(0,10));
  TrackCore.splitDays(profile, trip.dailyKm).forEach((d, i)=>{
    const row = document.createElement('div');
    row.className = 'trip-track-row trip-day-row';
    const when = day0 ? ' · ' + friendlyDate(new Date(day0.getTime() + i*86400000).toISOString().slice(0,10)) : '';
    row.innerHTML = '<span class="trip-track-row-name"></span><span class="trip-track-row-meta"></span>';
    row.firstChild.textContent = 'Day ' + (i+1) + when;
    row.lastChild.textContent = 'km ' + d.fromKm.toFixed(1) + '–' + d.toKm.toFixed(1) +
      ' · ↑ ' + d.upM + ' m ↓ ' + d.downM + ' m · about ' + formatDuration(TrackCore.estimateHikingSec(d.distanceKm, d.upM));
    list.appendChild(row);
  });
}

function setTripDailyKm(){
  const trip = trips.find(t => t.id === currentTripId);
  if(!trip) return;
  const v = Number(document.getElementById('tripDailyKm').value);
  if(v > 0) trip.dailyKm = Math.min(200, v); else delete trip.dailyKm;
  saveTrips();
  renderTripDays(trip, tripTracks(trip));
}

// ---- Trip gear, with a packing mode ----
// Packing mode turns the gear list into big tap rows: tap an item once it
// is in the bag. Ticks are kept on the trip (trip.packedIds), so packing
// can be spread over an evening, or across devices.
let packingTripId = null;

function tripPackedIds(trip){
  const linked = new Set(trip.gearIds || []);
  return new Set((trip.packedIds || []).filter(id => linked.has(id)));
}

function renderTripGear(trip){
  const gearList = tripGearItemsList(trip);
  const packing = packingTripId === trip.id && gearList.length > 0;
  const packed = tripPackedIds(trip);
  const btn = document.getElementById('tripPackBtn');
  btn.hidden = !gearList.length;
  btn.textContent = packing ? 'Done packing' : 'Pack';
  btn.setAttribute('aria-pressed', String(packing));

  const split = tripWeightSplit(trip);
  const splitEl = document.getElementById('tripPackSplit');
  splitEl.hidden = !(split.base + split.worn + split.consumable);
  splitEl.innerHTML = PACK_ROLES.map(r =>
    '<span class="pack-split-part pack-split-'+r+'"><span class="pack-split-label">'+
      {base:'Base', worn:'Worn', consumable:'Consumable'}[r]+'</span> '+formatWeight(split[r])+'</span>').join('');

  const done = gearList.filter(g => packed.has(g.id)).length;
  const progress = document.getElementById('tripPackProgress');
  progress.hidden = !(packing || done);
  document.getElementById('tripPackProgressText').textContent = done === gearList.length && done
    ? 'All ' + done + ' items packed' : done + ' of ' + gearList.length + ' packed';
  document.getElementById('tripPackProgressFill').style.width = (gearList.length ? done / gearList.length * 100 : 0) + '%';

  const gearListEl = document.getElementById('tripGearSummaryList');
  gearListEl.classList.toggle('is-packing', packing);
  gearListEl.innerHTML = '';
  if(!gearList.length){
    gearListEl.innerHTML = '<div class="trip-gear-empty">No gear linked yet — click Edit gear to add some.</div>';
    return;
  }
  gearList.forEach(g=>{
    const isPacked = packed.has(g.id);
    const row = document.createElement(packing ? 'button' : 'div');
    row.className = 'trip-track-row' + (packing ? ' pack-row' : '') + (isPacked ? ' is-packed' : '');
    if(packing){
      row.type = 'button';
      row.setAttribute('aria-pressed', String(isPacked));
      row.addEventListener('click', ()=> togglePacked(trip, g.id));
    }
    row.innerHTML =
      '<span class="trip-track-row-name">'+(packing || isPacked ? '<span class="pack-check" aria-hidden="true"></span>' : '')+escapeHtml(g.name)+'</span>'+
      '<span class="trip-track-row-meta">'+formatWeight(g.weightGrams)+'</span>';
    gearListEl.appendChild(row);
  });
}

function togglePacked(trip, gearId){
  const packed = tripPackedIds(trip);
  if(packed.has(gearId)) packed.delete(gearId); else packed.add(gearId);
  trip.packedIds = Array.from(packed);
  saveTrips();
  renderTripGear(trip);
  const again = document.querySelector('#tripGearSummaryList .pack-row:nth-child(' +
    (tripGearItemsList(trip).findIndex(g => g.id === gearId) + 1) + ')');
  if(again) again.focus();
}

function toggleTripPacking(){
  const trip = trips.find(t => t.id === currentTripId);
  if(!trip) return;
  packingTripId = packingTripId === trip.id ? null : trip.id;
  renderTripGear(trip);
}

// Sunrise and sunset at the route's start on the trip's day, so an early
// start can be planned. Planned trips only; times use this device's clock.
function renderTripDaylight(trip, tks){
  const el = document.getElementById('tripDaylight');
  const date = tripDisplayDate(trip);
  const withPoints = tks.filter(t => t.points && t.points.length);
  const track = withPoints.find(t => t.planned) || withPoints[0];
  const sun = (tripStatus(trip) === 'planned' && date && track)
    ? TrackCore.sunTimes(String(date).slice(0,10), track.points[0][0], track.points[0][1]) : null;
  el.hidden = !sun;
  if(!sun) return;
  const when = 'on ' + friendlyDate(date) + ' at the start';
  if(sun.polar){
    el.textContent = (sun.polar === 'day' ? 'Daylight all day ' : 'No sunrise ') + when + '.';
    return;
  }
  const hm = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const mins = Math.round((sun.sunset - sun.sunrise) / 60000);
  el.textContent = 'Sunrise ' + hm(sun.sunrise) + ' · sunset ' + hm(sun.sunset) +
    ' · ' + Math.floor(mins/60) + ' h ' + (mins%60) + ' min of daylight ' + when + ' (your time zone).';
}

// ---- Trip photos ----
// Stored one-per-key (waypoints-photo-<id>) rather than embedded in the
// trip object, so adding/removing a photo never re-serializes every
// other trip's data, and — since cloud sync only pushes the lightweight
// trip/gear/track blobs — photos stay local-only per device rather than
// bloating every sync push with image bytes.
const photoDataCache = {}; // photoId -> data URL, populated as photos are loaded/added

function photoStoreKey(id){ return 'waypoints-photo-' + id; }

async function loadTripPhoto(id){
  if(photoDataCache[id]) return photoDataCache[id];
  const raw = await storeGet(photoStoreKey(id));
  if(!raw) return null;
  try{
    const parsed = JSON.parse(raw);
    photoDataCache[id] = parsed.dataUrl;
    return parsed.dataUrl;
  }catch(e){ return null; }
}

function downscaleImage(file, maxDim, quality){
  return new Promise((resolve, reject)=>{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{
      let { width, height } = img;
      if(width > maxDim || height > maxDim){
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}

async function addPhotosToTrip(trip, fileList){
  const files = Array.from(fileList).filter(f=>f.type.startsWith('image/'));
  if(!files.length) return;
  const statusEl = document.getElementById('tripPhotoStatus');
  statusEl.className = 'upload-status';
  statusEl.textContent = 'Processing ' + files.length + ' photo' + (files.length>1?'s':'') + '…';
  let added = 0, failed = 0;
  for(const file of files){
    try{
      const dataUrl = await downscaleImage(file, 1600, 0.82);
      const id = 'photo_' + Math.random().toString(36).slice(2,10);
      photoDataCache[id] = dataUrl;
      await storeSet(photoStoreKey(id), JSON.stringify({ dataUrl, addedAt: Date.now() }));
      trip.photoIds = trip.photoIds || [];
      trip.photoIds.push(id);
      added++;
    }catch(e){ failed++; }
  }
  await saveTrips();
  statusEl.textContent = added
    ? ('Added ' + added + ' photo' + (added>1?'s':'') + (failed ? ', ' + failed + ' failed' : '') + '.')
    : 'Could not read those photos.';
  statusEl.className = (!added && failed) ? 'upload-error' : 'upload-status';
  renderTripPhotoGrid(trip);
  renderTracks(); // hover/click hints on the map reflect the new photo count
}

async function removeTripPhoto(trip, photoId){
  trip.photoIds = (trip.photoIds || []).filter(id => id !== photoId);
  delete photoDataCache[photoId];
  await storeRemove(photoStoreKey(photoId));
  await saveTrips();
  renderTripPhotoGrid(trip);
  renderTracks();
}

async function renderTripPhotoGrid(trip){
  const grid = document.getElementById('tripPhotoGrid');
  const ids = trip.photoIds || [];
  if(!ids.length){ grid.innerHTML = ''; return; }
  grid.innerHTML = '';
  const urls = await Promise.all(ids.map(loadTripPhoto));
  ids.forEach((id, i)=>{
    const url = urls[i];
    if(!url) return;
    const thumb = document.createElement('div');
    thumb.className = 'photo-thumb';
    thumb.innerHTML = '<img loading="lazy" alt="Trip photo"><button type="button" class="photo-thumb-remove" title="Remove photo" aria-label="Remove photo">&times;</button>';
    thumb.querySelector('img').src = url;
    thumb.addEventListener('click', ()=> openPhotoLightbox(trip, i));
    thumb.querySelector('.photo-thumb-remove').addEventListener('click', (e)=>{
      e.stopPropagation();
      removeTripPhoto(trip, id);
    });
    grid.appendChild(thumb);
  });
}

// ---- Photo lightbox ----
let lightboxTrip = null, lightboxIndex = 0;

async function openPhotoLightbox(trip, index){
  lightboxTrip = trip;
  lightboxIndex = index;
  await renderLightboxImage();
  document.getElementById('photoLightboxOverlay').hidden = false;
  onModalOpened('photoLightboxOverlay');
}
function closePhotoLightbox(){
  document.getElementById('photoLightboxOverlay').hidden = true;
  lightboxTrip = null;
  onModalClosed('photoLightboxOverlay');
}
async function renderLightboxImage(){
  if(!lightboxTrip) return;
  // Either a trip (local photo ids) or a plain list of URLs (catalog photos).
  const ids = lightboxTrip.photoUrls || lightboxTrip.photoIds || [];
  if(!ids.length){ closePhotoLightbox(); return; }
  lightboxIndex = (lightboxIndex + ids.length) % ids.length;
  const url = lightboxTrip.photoUrls ? ids[lightboxIndex] : await loadTripPhoto(ids[lightboxIndex]);
  document.getElementById('photoLightboxImg').src = url || '';
  const multi = ids.length > 1;
  document.getElementById('photoLightboxPrev').style.display = multi ? 'flex' : 'none';
  document.getElementById('photoLightboxNext').style.display = multi ? 'flex' : 'none';
}
function lightboxStep(dir){
  lightboxIndex += dir;
  renderLightboxImage();
}

function currentPickerChecked(){
  return new Set(Array.from(document.querySelectorAll('#tripTrackPicker input[type="checkbox"]:checked')).map(cb=>cb.dataset.id));
}

function renderTripTrackPicker(checkedIds){
  const picker = document.getElementById('tripTrackPicker');
  picker.innerHTML = '';
  if(!tracks.length){
    picker.innerHTML = '<div class="trip-gear-empty">No tracks yet — add GPX files above.</div>';
    return;
  }
  tracks.forEach(t=>{
    const row = document.createElement('div');
    row.className = 'trip-gear-row';
    row.innerHTML =
      '<label style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;cursor:pointer;">'+
        '<input type="checkbox" data-id="'+t.id+'"'+(checkedIds.has(t.id)?' checked':'')+'>'+
        '<span class="trip-gear-row-name">'+escapeHtml(t.name)+'<span class="trip-gear-row-cat">'+(t.date?escapeHtml(friendlyDate(t.date)):'')+'</span></span>'+
      '</label>'+
      '<span class="trip-gear-row-weight">'+t.distanceKm.toFixed(1)+' km</span>'+
      '<button type="button" class="track-remove" title="Delete track" aria-label="Delete track">&times;</button>';
    row.querySelector('.track-remove').addEventListener('click', async (e)=>{
      e.preventDefault(); e.stopPropagation();
      const id = t.id;
      const stillChecked = currentPickerChecked();
      stillChecked.delete(id);
      tracks = tracks.filter(x=>x.id!==id);
      trips.forEach(tr=>{ tr.trackIds = (tr.trackIds||[]).filter(x=>x!==id); });
      await saveTracks();
      await saveTrips();
      renderTripTrackPicker(stillChecked);
      renderStats();
    });
    picker.appendChild(row);
  });
  maybeAutoSetTripStatus();
}

function openTripModal(id){
  const trip = id ? trips.find(t=>t.id===id) : null;
  document.getElementById('tripModalTitle').textContent = trip ? 'Edit trip' : 'New trip';
  document.getElementById('tripId').value = trip ? trip.id : '';
  document.getElementById('tripName').value = trip ? trip.name : '';
  document.getElementById('tripNotes').value = trip ? (trip.notes || '') : '';
  document.getElementById('tripDate').value = trip ? (trip.date || '') : '';
  document.getElementById('tripUploadStatus').textContent = '';
  document.getElementById('tripUploadStatus').className = 'upload-status';

  tripStatusTouched = !!(trip && (trip.status === 'planned' || trip.status === 'completed'));
  setTripStatusToggle(trip ? tripStatus(trip) : 'planned');
  renderTripTrackPicker(new Set(trip ? (trip.trackIds || []) : []));
  tripFormColor = tripOwnColor(trip);
  renderTripColorPicker();

  const delBtn = document.getElementById('tripDeleteBtn');
  delBtn.style.display = trip ? 'inline-block' : 'none';
  delBtn.textContent = 'Delete';
  delBtn.dataset.armed = '';

  document.getElementById('tripModalOverlay').style.display = 'flex';
  document.getElementById('tripName').focus();
  onModalOpened('tripModalOverlay');
}

// ---- Trip color picker: Auto (the app picks), a swatch, or any color ----
let tripFormColor = null;   // null = automatic
function renderTripColorPicker(){
  const box = document.getElementById('tripColorPicker');
  box.innerHTML = '';
  const custom = tripFormColor && !COLORS.some(c => c.toLowerCase() === tripFormColor.toLowerCase());
  const add = (value, label, bg) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'trip-color-swatch' + (value === null ? ' is-auto' : '');
    b.setAttribute('role', 'radio');
    const on = value === null ? tripFormColor === null : !!tripFormColor && tripFormColor.toLowerCase() === value.toLowerCase();
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.setAttribute('aria-label', label);
    b.title = label;
    if(bg) b.style.background = bg;
    if(value === null) b.textContent = 'Auto';
    b.addEventListener('click', ()=>{ tripFormColor = value; renderTripColorPicker(); });
    box.appendChild(b);
  };
  add(null, 'Automatic color');
  COLORS.forEach((c, i) => add(c, 'Color ' + (i + 1), c));
  // Any other color: the native picker, showing the chosen one.
  const wrap = document.createElement('label');
  wrap.className = 'trip-color-swatch trip-color-custom';
  wrap.title = 'Pick any color';
  wrap.setAttribute('aria-checked', custom ? 'true' : 'false');
  if(custom) wrap.style.background = tripFormColor;
  wrap.innerHTML = '<input type="color" aria-label="Pick any color"><span aria-hidden="true">+</span>';
  const input = wrap.querySelector('input');
  input.value = tripFormColor || COLORS[0];
  input.addEventListener('input', ()=>{ tripFormColor = input.value; wrap.style.background = input.value; wrap.setAttribute('aria-checked', 'true');
    box.querySelectorAll('[role="radio"]').forEach(r => r.setAttribute('aria-checked', 'false')); });
  box.appendChild(wrap);
}

function closeTripModal(){
  document.getElementById('tripModalOverlay').style.display = 'none';
  onModalClosed('tripModalOverlay');
}

function setTripStatusToggle(status){
  document.querySelectorAll('#tripStatusToggle button').forEach(b=>{
    b.classList.toggle('active', b.dataset.status === status);
  });
}
function getTripStatusToggle(){
  const active = document.querySelector('#tripStatusToggle button.active');
  return active ? active.dataset.status : 'planned';
}
// True once a trip already has an explicit, deliberately-set status —
// in that case adding/removing tracks in this modal session should
// never silently override it. False for a brand new trip or one that's
// only ever had a status inferred from tracks, so the toggle keeps
// tracking "do I have GPX evidence yet?" live as the user works,
// without them having to click it by hand.
let tripStatusTouched = false;
function maybeAutoSetTripStatus(){
  if(tripStatusTouched) return;
  const hasChecked = Array.from(document.querySelectorAll('#tripTrackPicker input[type="checkbox"]:checked'))
    .some(cb => { const t = tracks.find(x => x.id === cb.dataset.id); return t && !t.planned; });
  setTripStatusToggle(hasChecked ? 'completed' : 'planned');
}

async function handleTripGpxFiles(fileList){
  const files = Array.from(fileList);
  if(!files.length) return;
  const statusEl = document.getElementById('tripUploadStatus');
  statusEl.className = 'upload-status';
  statusEl.textContent = 'Processing '+files.length+' file'+(files.length>1?'s':'')+'…';
  const {added, reused, failed, newIds} = await parseAndAddGpxFiles(files);
  if(added || reused){
    renderStats();
    const checked = currentPickerChecked();
    newIds.forEach(id=>checked.add(id));
    renderTripTrackPicker(checked);
  }
  const reusedNote = reused ? (added ? ' ' : '') + reused+' already imported — linked the existing track'+(reused>1?'s':'')+'.' : '';
  const addedNote = added ? 'Added '+added+' track'+(added>1?'s':'')+'.' : '';
  if((added || reused) && !failed.length){
    statusEl.textContent = addedNote + reusedNote;
  } else if(added || reused){
    statusEl.textContent = addedNote + reusedNote + ' Skipped: '+failed.join(', ');
    statusEl.className = 'upload-error';
  } else {
    statusEl.textContent = 'Could not read: '+failed.join(', ');
    statusEl.className = 'upload-error';
  }
}

async function handleTripFormSubmit(e){
  e.preventDefault();
  const name = document.getElementById('tripName').value.trim();
  if(!name) return;
  const id = document.getElementById('tripId').value;
  const trackIds = Array.from(document.querySelectorAll('#tripTrackPicker input[type="checkbox"]:checked')).map(cb=>cb.dataset.id);
  const notes = document.getElementById('tripNotes').value.trim();
  const date = document.getElementById('tripDate').value || null;
  const status = getTripStatusToggle();

  if(id){
    const trip = trips.find(t=>t.id===id);
    if(trip){
      trip.name = name; trip.notes = notes; trip.trackIds = trackIds; trip.date = date; trip.status = status;
      if(tripFormColor) trip.color = tripFormColor; else delete trip.color;
    }
  } else {
    const trip = {id: 'trip_'+Math.random().toString(36).slice(2,10), name, notes, trackIds, gearIds: [], photoIds: [], date, status, createdAt: Date.now()};
    if(tripFormColor) trip.color = tripFormColor;
    trips.push(trip);
  }
  await saveTrips();
  closeTripModal();
  if(id && currentTripId === id) renderTripDetail();
  renderTripCards();
  renderTracks();
  updateLayers();
  renderStats();
}

async function handleTripDelete(){
  const btn = document.getElementById('tripDeleteBtn');
  if(btn.dataset.armed !== '1'){
    btn.dataset.armed = '1';
    btn.textContent = 'Click again to confirm';
    setTimeout(()=>{ btn.dataset.armed=''; btn.textContent='Delete'; }, 3000);
    return;
  }
  const id = document.getElementById('tripId').value;
  const trip = trips.find(t=>t.id===id);
  trips = trips.filter(t=>t.id!==id);
  await saveTrips();
  if(trip && trip.photoIds && trip.photoIds.length){
    await Promise.all(trip.photoIds.map(pid=>{
      delete photoDataCache[pid];
      return storeRemove(photoStoreKey(pid));
    }));
  }
  closeTripModal();
  showTripsList();
  renderTracks();
  updateLayers();
  renderStats();
}

function setStatus(msg, isError){
  const el = document.getElementById('uploadStatus');
  el.textContent = msg;
  el.className = isError ? 'upload-error' : 'upload-status';
}
