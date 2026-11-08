// ---- Track editor: rename, date, activity, trim, split, join, delete and
// Download GPX. The geometry work is in track-core.js (TrackCore). ----

let teTrackId = null;
let teMap = null;
let teLayers = null;
let tePreview = null;      // the track as it would be saved (trim applied)

function teTrack(){ return tracks.find(t => t.id === teTrackId) || null; }

function openTrackEditor(id){
  const t = tracks.find(x => x.id === id);
  if(!t) return;
  // A route drawn in the planner is edited there, point by point.
  if(t.planned){ openRoutePlanner(findTrackTrip(id) ? findTrackTrip(id).id : null, id); return; }
  teTrackId = id;
  document.getElementById('teName').value = t.name || '';
  document.getElementById('teDate').value = t.date || '';
  document.getElementById('teSport').value = sportLabel(t.sport);
  document.getElementById('teError').textContent = '';
  const n = t.points.length;
  const start = document.getElementById('teTrimStart'), end = document.getElementById('teTrimEnd');
  start.max = end.max = String(n - 1);
  start.value = '0'; end.value = String(n - 1);
  document.getElementById('teSplitAt').value = String(Math.floor((n - 1) / 2));
  fillJoinSelect(t);
  setTrackEditorTab('trim');
  document.getElementById('trackEditModalOverlay').style.display = 'flex';
  onModalOpened('trackEditModalOverlay');
  teEnsureMap();
  // The map's box only has a size once the dialog is shown.
  teDrawPreview(false);
  requestAnimationFrame(()=>{ teMap.invalidateSize(); teDrawPreview(true); });
}

function closeTrackEditor(){
  document.getElementById('trackEditModalOverlay').style.display = 'none';
  teTrackId = null;
  onModalClosed('trackEditModalOverlay');
}

function setTrackEditorTab(name){
  document.querySelectorAll('#trackEditModalOverlay .te-tab').forEach(b=>{
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('#trackEditModalOverlay .te-panel').forEach(p=>{ p.hidden = p.dataset.panel !== name; });
  if(name === 'split') teClampSplit();
  teDrawPreview(false);
}
function teActiveTab(){
  const b = document.querySelector('#trackEditModalOverlay .te-tab.active');
  return b ? b.dataset.tab : 'trim';
}

function fillJoinSelect(t){
  const sel = document.getElementById('teJoinSelect');
  const others = tracks.filter(x => x.id !== t.id && !x.planned);
  // Closest in time first — the one to join is usually the next or the
  // previous recording.
  const when = x => x.startTime != null ? x.startTime : (x.date ? Date.parse(x.date) : NaN);
  const ref = when(t);
  others.sort((a,b)=>{
    const da = Math.abs(when(a) - ref), db = Math.abs(when(b) - ref);
    if(isNaN(da) && isNaN(db)) return (a.name||'').localeCompare(b.name||'');
    if(isNaN(da)) return 1;
    if(isNaN(db)) return -1;
    return da - db;
  });
  sel.innerHTML = others.length ? '' : '<option value="">No other tracks</option>';
  others.forEach(o=>{
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = o.name + ' · ' + (o.date ? friendlyDate(o.date, false) + ' · ' : '') + o.distanceKm.toFixed(1) + ' km';
    sel.appendChild(opt);
  });
  document.getElementById('teJoinBtn').disabled = !others.length;
}

function teTrimRange(){
  const t = teTrack();
  const n = t.points.length;
  let a = +document.getElementById('teTrimStart').value;
  let b = +document.getElementById('teTrimEnd').value;
  return [Math.max(0, Math.min(a, n-2)), Math.min(n-1, Math.max(b, a+1))];
}

// "2.4 km · 10:32" for a point of the original track.
function tePointLabel(t, cum, i){
  let s = cum[i].toFixed(1) + ' km';
  if(t.startTime != null && Array.isArray(t.pointTimes) && t.pointTimes[i] != null){
    const d = new Date(t.startTime + t.pointTimes[i]*1000);
    s += ' · ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  }
  return s;
}

function teClampSplit(){
  const [a, b] = teTrimRange();
  const el = document.getElementById('teSplitAt');
  el.min = String(a + 1); el.max = String(b - 1);
  const v = +el.value;
  if(v <= a || v >= b) el.value = String(Math.floor((a + b) / 2));
  document.getElementById('teSplitBtn').disabled = b - a < 2;
}

function teEnsureMap(){
  if(teMap) return;
  teMap = L.map('teMap', {zoomControl:true, scrollWheelZoom:false});
  addMapLayerSwitcher(teMap, 'light', 'topright');
  teLayers = L.layerGroup().addTo(teMap);
}

function teDrawPreview(fit){
  const t = teTrack();
  if(!t) return;
  const [a, b] = teTrimRange();
  const cum = TrackCore.cumulativeKm(t.points);
  document.getElementById('teTrimStartVal').textContent = tePointLabel(t, cum, a);
  document.getElementById('teTrimEndVal').textContent = tePointLabel(t, cum, b);
  const color = computeTrackColors()[t.id] || '#3A5A40';
  if(teLayers){
    teLayers.clearLayers();
    L.polyline(t.points, {color:'#8A938C', weight:3, opacity:0.6, dashArray:'4 5'}).addTo(teLayers);
    const kept = t.points.slice(a, b + 1);
    const line = L.polyline(kept, {color, weight:4, opacity:0.95}).addTo(teLayers);
    L.circleMarker(kept[0], {radius:6, color:'#fff', weight:2, fillColor:'#3A5A40', fillOpacity:1}).bindTooltip('Start').addTo(teLayers);
    L.circleMarker(kept[kept.length-1], {radius:6, color:'#fff', weight:2, fillColor:'#B3261E', fillOpacity:1}).bindTooltip('End').addTo(teLayers);
    if(teActiveTab() === 'split'){
      const s = +document.getElementById('teSplitAt').value;
      L.circleMarker(t.points[s], {radius:7, color:'#fff', weight:2, fillColor:'#C4501C', fillOpacity:1}).bindTooltip('Split here').addTo(teLayers);
    }
    if(fit) teMap.fitBounds(line.getBounds(), {padding:[16,16]});
  }
  if(teActiveTab() === 'split'){
    const s = +document.getElementById('teSplitAt').value;
    document.getElementById('teSplitVal').textContent = tePointLabel(t, cum, s);
  }
  tePreview = (a === 0 && b === t.points.length - 1) ? t : TrackCore.trim(t, a, b);
  const parts = [tePreview.distanceKm.toFixed(1) + ' km'];
  const climb = trackClimbSummary(tePreview);
  if(climb) parts.push(climb);
  const trimmed = tePreview !== t;
  document.getElementById('teSummary').textContent = (trimmed ? 'After trimming: ' : '') + parts.join(' · ') +
    (trimmed && tePreview.durationEstimated && !t.durationEstimated ? ' (time estimated from distance and climb)' : '');
}

// The track with everything typed and dragged in the dialog applied, or
// null (and a message shown) when something is missing.
function teEditedTrack(){
  const t = teTrack();
  const name = document.getElementById('teName').value.trim();
  if(!name){
    document.getElementById('teError').textContent = 'Give the track a name.';
    document.getElementById('teName').focus();
    return null;
  }
  const [a, b] = teTrimRange();
  const out = (a === 0 && b === t.points.length - 1) ? Object.assign({}, t) : TrackCore.trim(t, a, b);
  out.name = name;
  const date = document.getElementById('teDate').value;
  if(date !== (t.date || '')) out.date = date || null;
  const sport = document.getElementById('teSport').value.trim();
  if(sport !== sportLabel(t.sport)) out.sport = sport || null;
  return out;
}

// Snapshot, change, save, redraw — and offer Undo.
let lastTrackUndo = null;
async function commitTrackChange(message, mutate){
  const before = { tracks: JSON.parse(JSON.stringify(tracks)), trips: JSON.parse(JSON.stringify(trips)) };
  const changedIds = mutate() || [];
  closeTrackEditor();
  await Promise.all(changedIds.map(id => {
    const t = tracks.find(x => x.id === id);
    return t && !t.countries ? detectTrackCountries(t).catch(()=>{}) : null;
  }));
  await saveTracks();
  await saveTrips();
  refreshAfterTrackChange();
  lastTrackUndo = before;
  showGlobalToast(message, false, {label:'Undo', fn: async ()=>{
    if(lastTrackUndo !== before) return;   // a newer edit came after this one
    tracks = before.tracks;
    trips = before.trips;
    lastTrackUndo = null;
    await saveTracks();
    await saveTrips();
    refreshAfterTrackChange();
  }});
}

function refreshAfterTrackChange(){
  refreshEverything();
  renderTripCards();
  if(currentTripId && trips.some(tr => tr.id === currentTripId)) renderTripDetail();
}

function replaceTrack(edited){
  tracks = tracks.map(x => x.id === edited.id ? edited : x);
}

async function saveTrackEdit(){
  const t = teTrack();
  if(!t) return;
  const out = teEditedTrack();
  if(!out) return;
  const geometryChanged = out.points !== t.points;
  await commitTrackChange('Track saved.', ()=>{ replaceTrack(out); return geometryChanged ? [out.id] : []; });
}

async function splitTrack(){
  const t = teTrack();
  const edited = teEditedTrack();
  if(!edited) return;
  const [a] = teTrimRange();
  // The split point counts on the original; the edited track starts at a.
  const at = +document.getElementById('teSplitAt').value - a;
  let parts;
  try { parts = TrackCore.split(edited, at, 't_' + Math.random().toString(36).slice(2,10)); }
  catch(err){ document.getElementById('teError').textContent = err.message; return; }
  const [first, second] = parts;
  second.name = edited.name + ' (part 2)';
  await commitTrackChange('Split into two tracks.', ()=>{
    const i = tracks.findIndex(x => x.id === t.id);
    tracks.splice(i, 1, first, second);
    // The new part goes into the same trips, right after the original.
    trips.forEach(tr=>{
      const ids = tr.trackIds || [];
      const j = ids.indexOf(t.id);
      if(j >= 0) tr.trackIds = ids.slice(0, j+1).concat(second.id, ids.slice(j+1));
    });
    return [first.id, second.id];
  });
}

async function joinTrack(){
  const t = teTrack();
  const otherId = document.getElementById('teJoinSelect').value;
  const other = tracks.find(x => x.id === otherId);
  if(!t || !other) return;
  const edited = teEditedTrack();
  if(!edited) return;
  const merged = TrackCore.merge(edited, other);
  await commitTrackChange('Tracks joined.', ()=>{
    replaceTrack(merged);
    tracks = tracks.filter(x => x.id !== other.id);
    trips.forEach(tr=>{
      const ids = tr.trackIds || [];
      if(!ids.includes(other.id)) return;
      // A trip that had only the other track now has the joined one.
      tr.trackIds = ids.includes(merged.id) ? ids.filter(x => x !== other.id) : ids.map(x => x === other.id ? merged.id : x);
    });
    return [merged.id];
  });
}

async function deleteTrackFromEditor(){
  const t = teTrack();
  if(!t) return;
  await commitTrackChange('Track deleted.', ()=>{
    tracks = tracks.filter(x => x.id !== t.id);
    trips.forEach(tr=>{ tr.trackIds = (tr.trackIds||[]).filter(x => x !== t.id); });
    return [];
  });
}

function downloadTrackGpx(){
  const edited = teEditedTrack();
  if(edited) saveTrackGpx(edited);
}

document.getElementById('trackEditClose').addEventListener('click', closeTrackEditor);
document.getElementById('trackEditModalOverlay').addEventListener('click', e=>{
  if(e.target.id === 'trackEditModalOverlay') closeTrackEditor();
});
document.getElementById('trackEditForm').addEventListener('submit', e=>{ e.preventDefault(); saveTrackEdit(); });
document.querySelectorAll('#trackEditModalOverlay .te-tab').forEach(b=>{
  b.addEventListener('click', ()=>setTrackEditorTab(b.dataset.tab));
});
['teTrimStart','teTrimEnd'].forEach(id=>{
  document.getElementById(id).addEventListener('input', e=>{
    const s = document.getElementById('teTrimStart'), en = document.getElementById('teTrimEnd');
    // Keep at least one step between the handles.
    if(+s.value >= +en.value){
      if(e.target === s) s.value = String(+en.value - 1); else en.value = String(+s.value + 1);
    }
    teClampSplit();
    teDrawPreview(false);
  });
});
document.getElementById('teSplitAt').addEventListener('input', ()=>teDrawPreview(false));
document.getElementById('teSplitBtn').addEventListener('click', splitTrack);
document.getElementById('teJoinBtn').addEventListener('click', joinTrack);
document.getElementById('teDeleteBtn').addEventListener('click', deleteTrackFromEditor);
document.getElementById('teDownloadBtn').addEventListener('click', downloadTrackGpx);
