// Hike-in-one — Adding tracks to a trip and the "Import activities" flow (scan, review, import, group into trips).
// Plain scripts loaded in order by index.html; they share one global scope.
'use strict';

// ---- File handling ----
// GPX tracks are added from the Trips tab (each trip owns a set of
// tracks); this core parses/stores them and is shared by that flow.
async function parseAndAddGpxFiles(fileList){
  const files = Array.from(fileList);
  let added = 0, reused = 0, failed = [], newIds = [];
  for(const file of files){
    if(/\.zip$/i.test(file.name)){ failed.push(file.name+' (use Import activities on the Trips page for .zip exports)'); continue; }
    try{
      const track = await parseActivityBytes(await file.arrayBuffer(), file.name);
      // Same activity added before (e.g. via a bulk import) — link the
      // existing track instead of plotting it twice.
      const existing = findDuplicateTrack(track, tracks);
      if(existing){ newIds.push(existing.id); reused++; continue; }
      tracks.push(track);
      newIds.push(track.id);
      added++;
    }catch(err){
      failed.push(file.name);
    }
  }
  if(added){
    await saveTracks();
    // Country lookup runs after the initial save so the UI isn't blocked
    // on fetching/parsing the world map; each new track is saved again
    // once its countries are known.
    detectCountriesInBackground(newIds);
  }
  return {added, reused, failed, newIds};
}

function detectCountriesInBackground(ids){
  Promise.all(ids.map(id=>{
    const t = tracks.find(x=>x.id===id);
    return t && !t.countries ? detectTrackCountries(t) : Promise.resolve();
  })).then(()=>{ saveTracks(); renderStats(); });
}

// Strava, Garmin and GPX "type" fields name sports differently
// ("Hike", "hiking", "TrailRun", "trail_running") — show them alike.
const SPORT_ALIASES = {hiking:'Hike', walking:'Walk', running:'Run', cycling:'Ride', biking:'Ride',
  'trail running':'Trail run', 'mountain biking':'Mountain bike ride'};
function sportLabel(sport){
  if(!sport || /^\d+$/.test(sport)) return '';
  const t = String(sport).replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').trim().toLowerCase();
  return SPORT_ALIASES[t] || t.charAt(0).toUpperCase() + t.slice(1);
}
const HIKE_SPORT = /hik|walk|trek|mountaineer|snowshoe|backpack/i;

// The same activity can arrive twice — re-importing an export, or a
// watch that syncs to both Garmin and Strava. Matching on start time +
// distance catches it whichever service the file came from.
function findDuplicateTrack(c, pool){
  return pool.find(t=>{
    if(c.sourceKey && t.sourceKey) return c.sourceKey === t.sourceKey;
    const known = c.distanceKm != null && t.distanceKm != null;
    const close = known && Math.abs(c.distanceKm - t.distanceKm) <= Math.max(0.3, 0.03 * Math.max(c.distanceKm, t.distanceKm));
    if(c.startTime != null && t.startTime != null) return Math.abs(c.startTime - t.startTime) <= 5*60000 && (close || !known);
    if(c.date && t.date) return c.date === t.date && close;
    return !c.date && !t.date && c.name === t.name && known && Math.abs(c.distanceKm - t.distanceKm) < 0.01;
  }) || null;
}

// ---- Import activities (Strava / Garmin archives, loose files) ----
// Two passes: scanning builds a review list (Strava's activities.csv
// already holds names, dates and distances, so those files needn't be
// opened yet; anything else is parsed for its summary), then importing
// parses only what was ticked. Tracks aren't kept between the passes,
// so a 2,000-activity archive doesn't sit in memory twice.
let importRun = null;      // {cancelled} for the scan or import in progress
let importItems = [];
let importSkipped = 0;     // files that aren't activities or have no GPS
let importFailed = [];

function showImportStep(step){
  ['Pick','Progress','Review','Done'].forEach(n=>{
    document.getElementById('importStep'+n).style.display = n.toLowerCase() === step ? 'flex' : 'none';
  });
}
function setImportProgress(done, total, label, sub){
  document.getElementById('importProgressLabel').textContent = label;
  document.getElementById('importProgressFill').style.width = total ? Math.min(100, done/total*100)+'%' : '0';
  document.getElementById('importProgressSub').textContent = sub || '';
}
// Long loops yield now and then so the progress bar actually repaints.
const breathe = ()=> new Promise(r=>setTimeout(r, 0));

function openImportModal(){
  importItems = [];
  showImportStep('pick');
  document.getElementById('importModalOverlay').style.display = 'flex';
  onModalOpened('importModalOverlay');
}
function closeImportModal(){
  if(importRun) importRun.cancelled = true;
  document.getElementById('importModalOverlay').style.display = 'none';
  onModalClosed('importModalOverlay');
}

const MONTHS = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
// Strava writes "Jan 5, 2023, 7:12:34 AM" (UTC) in activities.csv.
function parseStravaDate(str){
  const m = (str||'').match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?/i);
  if(m && MONTHS[m[1].toLowerCase()] != null){
    let h = +m[4];
    const ap = m[7] && m[7].toUpperCase();
    if(ap === 'PM' && h < 12) h += 12;
    if(ap === 'AM' && h === 12) h = 0;
    return Date.UTC(+m[3], MONTHS[m[1].toLowerCase()], +m[2], h, +m[5], +(m[6]||0));
  }
  const t = Date.parse(str);
  return isFinite(t) ? t : null;
}

// Strava's archive has an activities.csv describing every activity,
// pointing at its file (e.g. "activities/1234567.fit.gz"). Returns
// review items for those, and the zip entries they cover.
async function stravaItemsFromCsv(blob, csvEntry, entryByBase){
  const rows = parseCSV(new TextDecoder().decode(await zipRead(blob, csvEntry)));
  const head = (rows.shift() || []).map(h=>h.trim().toLowerCase());
  const col = name => head.indexOf(name);
  const distCols = head.map((h,i)=> h === 'distance' ? i : -1).filter(i=>i >= 0);
  let fileCol = col('filename');
  // Exports in another language translate the headers; the file column
  // is still easy to spot by its contents.
  if(fileCol < 0) fileCol = (rows[0]||[]).findIndex(v=>/^activities\//i.test(v));
  if(fileCol < 0) return null;
  const idCol = col('activity id') >= 0 ? col('activity id') : 0;
  const dateCol = col('activity date') >= 0 ? col('activity date') : 1;
  const nameCol = col('activity name') >= 0 ? col('activity name') : 2;
  const typeCol = col('activity type') >= 0 ? col('activity type') : 3;
  const gainCol = col('elevation gain');
  const items = [], covered = new Set();
  let noFile = 0;
  for(const r of rows){
    if(r.length < 2) continue;
    const file = (r[fileCol]||'').trim();
    const entry = file && entryByBase.get(file.split('/').pop());
    if(!entry){ noFile++; continue; }   // manual entry with no GPS file
    covered.add(entry);
    const startTime = parseStravaDate(r[dateCol]);
    // Newer exports have two Distance columns: the athlete's unit, then
    // metres. Older ones have one, in km.
    const rawDist = distCols.length ? parseFloat((r[distCols[distCols.length-1]]||'').replace(/,/g,'')) : NaN;
    const distanceKm = !isFinite(rawDist) ? null : distCols.length > 1 ? rawDist/1000 : rawDist;
    const gain = gainCol >= 0 ? parseFloat(r[gainCol]) : NaN;
    const id = (r[idCol]||'').trim();
    items.push({
      name: (r[nameCol]||'').trim() || fallbackTrackName(entry.name, r[typeCol], null),
      sport: (r[typeCol]||'').trim() || null,
      startTime,
      date: startTime != null ? new Date(startTime).toISOString().slice(0,10) : null,
      distanceKm,
      gainM: isFinite(gain) ? Math.round(gain) : null,
      sourceKey: id ? 'strava:'+id : null,
      fileName: entry.name,
      load: ()=> zipRead(blob, entry),
    });
  }
  return {items, covered, noFile};
}

async function scanZip(blob, label, jobs, run){
  setImportProgress(0, 0, 'Opening '+label+'…');
  const entries = (await zipEntries(blob)).filter(e=>{
    const base = e.name.split('/').pop();
    // routes/ are planned routes, not recorded activities.
    return !/(^|\/)(__MACOSX|routes)\//i.test(e.name) && !base.startsWith('.');
  });
  const csvEntry = entries.find(e=>/(^|\/)activities\.csv$/i.test(e.name));
  let covered = new Set();
  if(csvEntry){
    const entryByBase = new Map(entries.filter(e=>isActivityFileName(e.name)).map(e=>[e.name.split('/').pop(), e]));
    const res = await stravaItemsFromCsv(blob, csvEntry, entryByBase);
    if(res){ importItems.push(...res.items); covered = res.covered; importSkipped += res.noFile; }
  }
  for(const e of entries){
    if(run.cancelled) return;
    if(covered.has(e)) continue;
    if(/\.zip$/i.test(e.name)){
      // Garmin's export nests its activity files in further zips.
      const inner = new Blob([await zipRead(blob, e)]);
      await scanZip(inner, e.name.split('/').pop(), jobs, run);
    } else if(isActivityFileName(e.name)){
      jobs.push({ fileName: e.name, load: ()=> zipRead(blob, e) });
    }
  }
}

async function scanImportFiles(fileList){
  const files = Array.from(fileList);
  if(!files.length) return;
  const run = importRun = {cancelled:false, phase:'scan'};
  importItems = []; importSkipped = 0; importFailed = [];
  showImportStep('progress');
  try{
    const jobs = [];
    for(const f of files){
      if(run.cancelled) break;
      if(/\.zip$/i.test(f.name)){
        try{ await scanZip(f, f.name, jobs, run); }
        catch(err){ importFailed.push(f.name+' ('+err.message+')'); }
      } else if(isActivityFileName(f.name)){
        jobs.push({ fileName: f.name, load: ()=> f.arrayBuffer() });
      } else importSkipped++;
    }
    for(let i = 0; i < jobs.length && !run.cancelled; i++){
      const job = jobs[i];
      setImportProgress(i, jobs.length, 'Reading activities… '+(i+1)+' of '+jobs.length, job.fileName.split('/').pop());
      try{
        const t = await parseActivityBytes(await job.load(), job.fileName);
        importItems.push({
          name: t.name, sport: t.sport, startTime: t.startTime, date: t.date,
          distanceKm: t.distanceKm, gainM: t.elevationGainM, sourceKey: null,
          fileName: job.fileName, load: job.load,
        });
      }catch(err){
        // Watches also store settings, sleep, etc. as .fit — skip quietly.
        if(/No GPS|Not an activity/.test(err.message)) importSkipped++;
        else importFailed.push(job.fileName.split('/').pop());
      }
      if(i % 8 === 7) await breathe();
    }
  }catch(err){
    importFailed.push(err.message);
  }
  if(run.cancelled){ if(importRun === run) importRun = null; return; }
  importRun = null;

  // Mark anything already in the app (or earlier in this same batch).
  importItems.sort((a,b)=> (b.startTime ?? (b.date ? Date.parse(b.date) : -Infinity)) - (a.startTime ?? (a.date ? Date.parse(a.date) : -Infinity)));
  // Strava's copy (with its real name) wins over the same hike's
  // anonymous Garmin file, whichever happened to be listed first.
  const accepted = [];
  importItems.slice().sort((a,b)=> (b.sourceKey ? 1 : 0) - (a.sourceKey ? 1 : 0)).forEach(it=>{
    if(findDuplicateTrack(it, tracks)) it.dup = 'Already imported';
    else if(findDuplicateTrack(it, accepted)) it.dup = 'Duplicate';
    else { it.dup = null; accepted.push(it); }
  });
  const preset = importItems.some(it=>!it.dup && it.sport && HIKE_SPORT.test(it.sport)) ? 'hikes' : 'all';
  applyImportPreset(preset, false);
  renderImportReview();
  showImportStep('review');
}

function applyImportPreset(preset, rerender = true){
  importItems.forEach(it=>{
    it.selected = !it.dup && (preset === 'all' || (preset === 'hikes' && (!it.sport || HIKE_SPORT.test(it.sport))));
  });
  if(rerender) renderImportReview();
}

function renderImportReview(){
  const fresh = importItems.filter(it=>!it.dup);
  const dupCount = importItems.length - fresh.length;
  const parts = [];
  if(importItems.length) parts.push('<strong>'+importItems.length+' activit'+(importItems.length!==1?'ies':'y')+'</strong> found');
  else parts.push('<strong>No activities with GPS found</strong> in these files');
  if(dupCount) parts.push(dupCount+' already imported');
  if(importSkipped) parts.push(importSkipped+' skipped (no GPS, or not an activity)');
  let html = parts.join(' · ');
  if(importFailed.length) html += '<br>Couldn\'t read: '+escapeHtml(importFailed.slice(0,5).join(', '))+(importFailed.length>5?' and '+(importFailed.length-5)+' more':'');
  document.getElementById('importSummary').innerHTML = html;

  const list = document.getElementById('importList');
  list.innerHTML = '';
  list.style.display = importItems.length ? '' : 'none';
  document.querySelector('#importStepReview .import-select-bar').style.display = fresh.length ? '' : 'none';
  document.querySelector('#importStepReview .import-group-opt').style.display = fresh.length ? '' : 'none';
  const frag = document.createDocumentFragment();
  importItems.forEach(it=>{
    const row = document.createElement('label');
    row.className = 'import-row' + (it.dup ? ' is-dup' : '');
    const meta = [friendlyDate(it.date), sportLabel(it.sport), it.distanceKm != null ? it.distanceKm.toFixed(1)+' km' : '', it.gainM ? '↑ '+it.gainM+' m' : '']
      .filter(Boolean).join(' · ');
    row.innerHTML =
      '<input type="checkbox"'+(it.selected?' checked':'')+(it.dup?' disabled':'')+'>'+
      '<div class="import-row-info"><div class="import-row-name"></div><div class="import-row-meta"></div></div>'+
      (it.dup ? '<span class="import-row-tag"></span>' : '');
    row.querySelector('.import-row-name').textContent = it.name;
    row.querySelector('.import-row-meta').textContent = meta;
    if(it.dup) row.querySelector('.import-row-tag').textContent = it.dup;
    row.querySelector('input').addEventListener('change', e=>{ it.selected = e.target.checked; updateImportConfirm(); });
    frag.appendChild(row);
  });
  list.appendChild(frag);
  updateImportConfirm();
}

// Sorted oldest first; with byDays, an activity joins the previous
// trip when it's on the same or the next calendar day.
function groupForTrips(list, byDays){
  const when = t => t.startTime ?? (t.date ? Date.parse(t.date) : Infinity);
  const sorted = list.slice().sort((a,b)=> when(a) - when(b));
  const groups = [];
  let cur = null;
  for(const t of sorted){
    if(byDays && cur && t.date && cur.lastDate && (Date.parse(t.date) - Date.parse(cur.lastDate)) <= 86400000){
      cur.items.push(t); cur.lastDate = t.date;
    } else {
      cur = { items:[t], lastDate: t.date };
      groups.push(cur);
    }
  }
  return groups.map(g=>g.items);
}
function tripNameForGroup(items){
  const first = items[0];
  if(items.length === 1) return first.name;
  const last = items[items.length-1];
  const days = first.date && last.date ? Math.round((Date.parse(last.date) - Date.parse(first.date)) / 86400000) + 1 : 1;
  return first.name + (days > 1 ? ' · '+days+' days' : ' · '+items.length+' activities');
}

function updateImportConfirm(){
  const chosen = importItems.filter(it=>it.selected && !it.dup);
  const btn = document.getElementById('importConfirmBtn');
  btn.disabled = !chosen.length;
  if(!chosen.length){ btn.textContent = 'Import'; return; }
  const tripCount = groupForTrips(chosen, document.getElementById('importGroupDays').checked).length;
  btn.textContent = 'Import '+chosen.length+' activit'+(chosen.length!==1?'ies':'y')+
    (tripCount !== chosen.length ? ' as '+tripCount+' trip'+(tripCount!==1?'s':'') : '');
}

async function runImport(){
  const chosen = importItems.filter(it=>it.selected && !it.dup);
  if(!chosen.length) return;
  const run = importRun = {cancelled:false, phase:'import'};
  showImportStep('progress');
  const newTracks = [];
  let failed = 0, dups = 0;
  for(let i = 0; i < chosen.length && !run.cancelled; i++){
    const it = chosen[i];
    setImportProgress(i, chosen.length, 'Importing… '+(i+1)+' of '+chosen.length, it.name);
    try{
      const t = await parseActivityBytes(await it.load(), it.fileName, { name: it.name, sport: it.sport, sourceKey: it.sourceKey });
      // Strava's CSV dates/distances were only a preview — re-check
      // against the real track before keeping it.
      if(findDuplicateTrack(t, tracks) || findDuplicateTrack(t, newTracks)){ dups++; continue; }
      newTracks.push(t);
    }catch(err){ failed++; }
    if(i % 8 === 7) await breathe();
  }
  if(run.cancelled){ if(importRun === run) importRun = null; return; }
  importRun = null;

  const groups = groupForTrips(newTracks, document.getElementById('importGroupDays').checked);
  const now = Date.now();
  const newTrips = groups.map((g,i)=>({
    id: 'trip_'+Math.random().toString(36).slice(2,10),
    name: tripNameForGroup(g),
    notes: '',
    trackIds: g.map(t=>t.id),
    gearIds: [], photoIds: [],
    date: g[0].date || null,
    status: 'completed',
    createdAt: now + i,
  }));
  if(newTracks.length){
    tracks.push(...newTracks);
    trips.push(...newTrips);
    await saveTracks();
    await saveTrips();
    refreshEverything();
    renderTripCards();
    fitMapOnNextShow = true;
    detectCountriesInBackground(newTracks.map(t=>t.id));
  }

  document.getElementById('importDoneTitle').textContent = newTracks.length
    ? 'Imported '+newTracks.length+' activit'+(newTracks.length!==1?'ies':'y')
    : 'Nothing new to import';
  const sub = [];
  if(newTrips.length) sub.push(newTrips.length+' new trip'+(newTrips.length!==1?'s':'')+' — open one to add gear and photos.');
  if(dups) sub.push(dups+' turned out to be already imported.');
  if(failed) sub.push(failed+' couldn\'t be read.');
  document.getElementById('importDoneSub').textContent = sub.join(' ');
  showImportStep('done');
}

async function handleGoogleFile(file){
  if(!file) return;
  setStatus('Reading '+file.name+'…');
  try{
    const text = await file.text();
    const obj = JSON.parse(text);
    let pts = parseGoogleJSON(obj);
    if(!pts.length){
      setStatus('No recognizable location points in that file. Formats change often — tell Claude what the file looks like and it can update the parser.', true);
      return;
    }
    pts = downsample(pts, MAX_GOOGLE_POINTS);
    googlePoints = pts;
    await saveGoogle();
    refreshEverything();
    // Imported from Settings now, so make sure the points are visible
    // (they only draw on the heatmap) and framed when the map opens.
    if(currentView === 'tracks') document.querySelector('.view-toggle button[data-view="both"]').click();
    fitMapOnNextShow = true;
    setStatus('Added '+pts.length.toLocaleString()+' location points — they show on the map\'s heatmap.');
  }catch(err){
    setStatus('Could not read that JSON file: '+err.message, true);
  }
}
