// Hike-in-one — Trip data helpers: which tracks and gear a trip has, dates, status, gear usage and wear; the trip gear picker.
// Plain scripts loaded in order by index.html; they share one global scope.
'use strict';

// ---- Gear picker modal (links gear to a trip) ----
let gearPickerTripId = null;

function updateTripGearWeightSummary(){
  const checked = Array.from(document.querySelectorAll('#tripGearList input[type="checkbox"]:checked'));
  const weight = checked.reduce((s,cb)=>{
    const g = gearItems.find(x=>x.id===cb.dataset.id);
    return s + (g && g.weightGrams ? g.weightGrams * (g.quantity || 1) : 0);
  },0);
  document.getElementById('tripGearWeightSummary').textContent = checked.length
    ? checked.length+' item'+(checked.length>1?'s':'')+' · '+formatWeight(weight)
    : 'No gear selected';
}

// A checklist of your gear for packing a trip or building a loadout:
// grouped by category (Gear Room order), with a search box and a
// "Select all" per category. onChange runs after any tick changes.
function renderGearChecklist(container, checkedIds, onChange){
  container.innerHTML = '';
  const owned = gearItems.filter(g=>OWNED_STATUSES.includes(g.status));
  if(!owned.length){
    container.innerHTML = '<div class="trip-gear-empty">No gear in your inventory yet — add some in the Gear Room first.</div>';
    return;
  }
  const changed = ()=>{ refreshGroups(); if(onChange) onChange(); };
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'gear-check-search';
  search.placeholder = 'Search your gear…';
  search.setAttribute('aria-label', 'Search your gear');
  container.appendChild(search);

  const groups = GEAR_CATEGORIES.map(cat => ({
    cat,
    items: owned.filter(g => (GEAR_CATEGORIES.includes(g.category) ? g.category : 'Other') === cat)
      .sort((a,b)=> a.name.localeCompare(b.name)),
  })).filter(gr => gr.items.length);

  groups.forEach(gr=>{
    const head = document.createElement('div');
    head.className = 'gear-check-head';
    head.innerHTML = '<span class="gear-check-cat"></span><span class="gear-check-count"></span>' +
      '<button type="button" class="link-btn gear-check-all"></button>';
    head.querySelector('.gear-check-cat').textContent = gr.cat;
    container.appendChild(head);
    gr.head = head;
    gr.rows = gr.items.map(g=>{
      const row = document.createElement('label');
      row.className = 'trip-gear-row';
      row.dataset.search = (g.name + ' ' + (g.brand || '') + ' ' + (g.model || '')).toLowerCase();
      row.innerHTML =
        '<input type="checkbox" data-id="'+g.id+'"'+(checkedIds.has(g.id)?' checked':'')+'>'+
        '<span class="trip-gear-row-name">'+escapeHtml(g.name)+(g.brand ? '<span class="trip-gear-row-cat">'+escapeHtml(g.brand)+'</span>' : '')+'</span>'+
        '<span class="trip-gear-row-weight">'+formatWeight(g.weightGrams)+'</span>';
      row.querySelector('input').addEventListener('change', changed);
      container.appendChild(row);
      return row;
    });
    head.querySelector('.gear-check-all').addEventListener('click', ()=>{
      const visible = gr.rows.filter(r => !r.hidden).map(r => r.querySelector('input'));
      const all = visible.every(cb => cb.checked);
      visible.forEach(cb => cb.checked = !all);
      changed();
    });
  });

  function refreshGroups(){
    groups.forEach(gr=>{
      const boxes = gr.rows.map(r => r.querySelector('input'));
      const visible = gr.rows.filter(r => !r.hidden);
      gr.head.hidden = !visible.length;
      gr.head.querySelector('.gear-check-count').textContent = boxes.filter(cb => cb.checked).length + ' of ' + boxes.length;
      const allOn = visible.length && visible.every(r => r.querySelector('input').checked);
      gr.head.querySelector('.gear-check-all').textContent = allOn ? 'Clear' : 'Select all';
    });
  }
  search.addEventListener('input', ()=>{
    const q = search.value.trim().toLowerCase();
    groups.forEach(gr => gr.rows.forEach(r => r.hidden = !!q && !r.dataset.search.includes(q)));
    refreshGroups();
  });
  refreshGroups();
}

function openGearPickerModal(tripId){
  const trip = trips.find(x=>x.id===tripId);
  if(!trip) return;
  gearPickerTripId = tripId;
  document.getElementById('tripGearModalTitle').textContent = 'Gear for "'+trip.name+'"';

  renderGearChecklist(document.getElementById('tripGearList'), new Set(trip.gearIds || []), updateTripGearWeightSummary);
  updateTripGearWeightSummary();
  document.getElementById('tripGearModalOverlay').style.display = 'flex';
  onModalOpened('tripGearModalOverlay');
}

function closeGearPickerModal(){
  document.getElementById('tripGearModalOverlay').style.display = 'none';
  gearPickerTripId = null;
  onModalClosed('tripGearModalOverlay');
}

async function saveGearPicker(){
  const trip = trips.find(x=>x.id===gearPickerTripId);
  if(trip){
    trip.gearIds = Array.from(document.querySelectorAll('#tripGearList input[type="checkbox"]:checked')).map(cb=>cb.dataset.id);
    await saveTrips();
    if(currentTripId === trip.id) renderTripDetail();
    renderTripCards();
    renderTracks();
    updateLayers();
  }
  closeGearPickerModal();
}

// ---- Trips ----
let currentTripId = null;

function tripTracks(trip){
  if(!trip.trackIds || !trip.trackIds.length) return [];
  return trip.trackIds.map(id=>tracks.find(t=>t.id===id)).filter(Boolean);
}
function tripDistanceKm(trip){
  return tripTracks(trip).reduce((s,t)=>s+t.distanceKm,0);
}
function tripGearItemsList(trip){
  if(!trip.gearIds || !trip.gearIds.length) return [];
  return trip.gearIds.map(id=>gearItems.find(g=>g.id===id)).filter(Boolean);
}
function tripGearWeight(trip){
  return tripGearItemsList(trip).reduce((s,g)=>s+(g.weightGrams||0)*(g.quantity||1),0);
}

// ---- Gear usage (derived from trips, never stored separately so it
// can't drift out of sync with what a trip actually carried) ----
function tripPrimaryDate(trip){
  const dates = tripTracks(trip).map(t=>t.date).filter(Boolean).sort();
  return dates.length ? dates[dates.length-1] : null;
}
// A trip's own `date` field (when set) is the trip's intent — the day
// it's planned for, or a manually-noted completion day — so it wins
// over dates only ever inferred from GPX tracks.
function tripDisplayDate(trip){
  return trip.date || tripPrimaryDate(trip);
}
// Explicit status wins; trips saved before this feature existed (or
// that never got a status set) fall back to a simple, low-surprise
// rule: recorded tracks are evidence a trip happened.
function tripStatus(trip){
  if(trip.status === 'planned' || trip.status === 'completed') return trip.status;
  return tripTracks(trip).length ? 'completed' : 'planned';
}
function gearUsageTrips(gearId){
  return trips.filter(tr => (tr.gearIds||[]).includes(gearId));
}
// Distance only counts completed trips — a planned trip's route hasn't
// been walked yet, so it shouldn't wear anything out.
function gearDistanceKm(gearId){
  return gearUsageTrips(gearId)
    .filter(tr => tripStatus(tr) === 'completed')
    .reduce((s,tr) => s + tripDistanceKm(tr), 0);
}
function gearUsageSummary(gearId){
  const all = gearUsageTrips(gearId);
  if(!all.length) return '';
  const done = all.filter(tr => tripStatus(tr) === 'completed');
  const planned = all.length - done.length;
  const parts = [];
  if(done.length){
    parts.push('Used on '+done.length+' trip'+(done.length>1?'s':''));
    const km = gearDistanceKm(gearId);
    if(km >= 0.1) parts.push(km.toFixed(km < 100 ? 1 : 0)+' km');
    const dates = done.map(tripDisplayDate).filter(Boolean).sort();
    if(dates.length) parts.push('last '+dates[dates.length-1]);
  }
  if(planned) parts.push('packed for '+planned+' planned trip'+(planned>1?'s':''));
  return parts.join(' · ');
}
// null when the item has no lifespan set; otherwise distance vs lifespan
// plus a severity level for the card's wear meter.
function gearWear(g){
  if(!g.lifespanKm) return null;
  const km = gearDistanceKm(g.id);
  const ratio = km / g.lifespanKm;
  return { km, ratio, level: ratio >= 1 ? 'worn' : ratio >= 0.9 ? 'soon' : 'ok' };
}
function gearWearHtml(g){
  const w = gearWear(g);
  if(!w) return '';
  const pct = Math.min(100, Math.round(w.ratio * 100));
  const label = w.level === 'worn' ? 'Worn out — time to replace'
    : w.level === 'soon' ? 'Replace soon'
    : Math.round(w.ratio*100)+'% of lifespan';
  return '<div class="wear">'+
    '<div class="wear-meter" role="meter" aria-valuemin="0" aria-valuemax="'+g.lifespanKm+'" aria-valuenow="'+Math.round(w.km)+'" aria-label="Distance used of lifespan">'+
      '<span class="wear-fill wear-'+w.level+'" style="width:'+pct+'%"></span>'+
    '</div>'+
    '<div class="wear-text"><span class="wear-label wear-'+w.level+'">'+(w.level==='ok'?'':'⚠ ')+label+'</span>'+
    '<span>'+Math.round(w.km)+' / '+g.lifespanKm+' km</span></div>'+
  '</div>';
}
