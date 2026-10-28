// Hike-in-one — Loadouts (reusable gear lists) and trip cards / timeline helpers.
// Plain scripts loaded in order by index.html; they share one global scope.
'use strict';

// ---- Loadouts (reusable gear lists) ----
let currentLoadoutId = null;

function loadoutItemsList(loadout){
  if(!loadout.gearIds || !loadout.gearIds.length) return [];
  return loadout.gearIds.map(id=>gearItems.find(g=>g.id===id)).filter(Boolean);
}
function loadoutWeight(loadout){
  return loadoutItemsList(loadout).reduce((s,g)=>s+(g.weightGrams||0)*(g.quantity||1),0);
}
function loadoutTripsUsing(loadoutId){
  return trips.filter(tr=>tr.loadoutId===loadoutId);
}

function renderLoadoutCards(){
  const grid = document.getElementById('loadoutCardsGrid');
  grid.innerHTML = '';
  document.getElementById('loadoutsEmpty').style.display = loadouts.length ? 'none' : 'block';
  if(!loadouts.length) return;

  loadouts.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).forEach(lo=>{
    const items = loadoutItemsList(lo);
    const weight = loadoutWeight(lo);
    const usedTrips = loadoutTripsUsing(lo.id);
    const card = document.createElement('div');
    card.className = 'trip-card';
    card.innerHTML =
      '<div class="trip-card-name">'+escapeHtml(lo.name)+'</div>'+
      (lo.notes ? '<div class="trip-card-notes">'+escapeHtml(lo.notes)+'</div>' : '')+
      '<div class="trip-card-meta">'+items.length+' item'+(items.length!==1?'s':'')+(weight?' · '+formatWeight(weight):'')+'</div>'+
      '<div class="trip-card-meta">Used on '+usedTrips.length+' trip'+(usedTrips.length!==1?'s':'')+'</div>';
    card.addEventListener('click', ()=> showLoadoutDetail(lo.id));
    grid.appendChild(card);
  });
}

function showLoadoutDetail(id){
  currentGearCategory = null;
  currentLoadoutId = id;
  document.getElementById('garageView').style.display = 'none';
  document.getElementById('categoryView').style.display = 'none';
  document.getElementById('loadoutDetailView').style.display = 'flex';
  renderLoadoutDetail();
  pushRouteState();
}

function renderLoadoutDetail(){
  const lo = loadouts.find(x=>x.id===currentLoadoutId);
  if(!lo){ showGarage(); return; }
  const items = loadoutItemsList(lo);
  const weight = loadoutWeight(lo);
  const usedTrips = loadoutTripsUsing(lo.id);

  document.getElementById('loadoutDetailTitle').textContent = lo.name;
  document.getElementById('loadoutDetailSubtitle').textContent = lo.notes || '';
  document.getElementById('loadoutStatCount').textContent = items.length;
  document.getElementById('loadoutStatWeight').textContent = weight ? formatWeight(weight) : '0 g';
  document.getElementById('loadoutStatTrips').textContent = usedTrips.length;

  const itemListEl = document.getElementById('loadoutItemList');
  itemListEl.innerHTML = '';
  if(!items.length){
    itemListEl.innerHTML = '<div class="trip-gear-empty">No items yet — click Edit to add some.</div>';
  } else {
    items.forEach(g=>{
      const row = document.createElement('div');
      row.className = 'trip-track-row';
      row.innerHTML =
        '<span class="trip-track-row-name">'+escapeHtml(g.name)+'</span>'+
        '<span class="trip-track-row-meta">'+formatWeight(g.weightGrams)+'</span>';
      itemListEl.appendChild(row);
    });
  }

  const tripsListEl = document.getElementById('loadoutTripsList');
  tripsListEl.innerHTML = '';
  if(!usedTrips.length){
    tripsListEl.innerHTML = '<div class="trip-gear-empty">Not used on any trip yet.</div>';
  } else {
    usedTrips.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).forEach(tr=>{
      const row = document.createElement('div');
      row.className = 'trip-track-row';
      row.style.cursor = 'pointer';
      row.innerHTML =
        '<span class="trip-track-row-name">'+escapeHtml(tr.name)+'</span>'+
        '<span class="trip-track-row-meta">'+escapeHtml(tripPrimaryDate(tr)||'')+'</span>';
      row.addEventListener('click', ()=>{
        document.querySelector('.nav-tab[data-page="trips"]').click();
        showTripDetail(tr.id);
      });
      tripsListEl.appendChild(row);
    });
  }

  renderBreakdownChart('loadout', items);
}

function renderLoadoutItemPicker(checkedIds){
  const picker = document.getElementById('loadoutItemPicker');
  picker.innerHTML = '';
  const owned = gearItems.filter(g=>OWNED_STATUSES.includes(g.status));
  if(!owned.length){
    picker.innerHTML = '<div class="trip-gear-empty">No gear in your inventory yet — add some in the Gear Room first.</div>';
    return;
  }
  owned.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(g=>{
    const row = document.createElement('label');
    row.className = 'trip-gear-row';
    row.innerHTML =
      '<input type="checkbox" data-id="'+g.id+'"'+(checkedIds.has(g.id)?' checked':'')+'>'+
      '<span class="trip-gear-row-name">'+escapeHtml(g.name)+'<span class="trip-gear-row-cat">'+escapeHtml(g.category||'')+'</span></span>'+
      '<span class="trip-gear-row-weight">'+formatWeight(g.weightGrams)+'</span>';
    picker.appendChild(row);
  });
}

function openLoadoutModal(id){
  const lo = id ? loadouts.find(x=>x.id===id) : null;
  document.getElementById('loadoutModalTitle').textContent = lo ? 'Edit loadout' : 'New loadout';
  document.getElementById('loadoutId').value = lo ? lo.id : '';
  document.getElementById('loadoutName').value = lo ? lo.name : '';
  document.getElementById('loadoutNotes').value = lo ? (lo.notes || '') : '';
  renderLoadoutItemPicker(new Set(lo ? (lo.gearIds || []) : []));

  const delBtn = document.getElementById('loadoutDeleteBtn');
  delBtn.style.display = lo ? 'inline-block' : 'none';
  delBtn.textContent = 'Delete';
  delBtn.dataset.armed = '';

  document.getElementById('loadoutModalOverlay').style.display = 'flex';
  document.getElementById('loadoutName').focus();
  onModalOpened('loadoutModalOverlay');
}

function closeLoadoutModal(){
  document.getElementById('loadoutModalOverlay').style.display = 'none';
  onModalClosed('loadoutModalOverlay');
}

async function handleLoadoutFormSubmit(e){
  e.preventDefault();
  const name = document.getElementById('loadoutName').value.trim();
  if(!name) return;
  const id = document.getElementById('loadoutId').value;
  const gearIds = Array.from(document.querySelectorAll('#loadoutItemPicker input[type="checkbox"]:checked')).map(cb=>cb.dataset.id);
  const notes = document.getElementById('loadoutNotes').value.trim();

  if(id){
    const lo = loadouts.find(x=>x.id===id);
    if(lo){ lo.name = name; lo.notes = notes; lo.gearIds = gearIds; }
  } else {
    loadouts.push({id: 'loadout_'+Math.random().toString(36).slice(2,10), name, notes, gearIds, createdAt: Date.now()});
  }
  await saveLoadouts();
  closeLoadoutModal();
  if(id && currentLoadoutId === id) renderLoadoutDetail();
  renderLoadoutCards();
  refreshTripLoadoutSelect();
}

async function handleLoadoutDelete(){
  const btn = document.getElementById('loadoutDeleteBtn');
  if(btn.dataset.armed !== '1'){
    btn.dataset.armed = '1';
    btn.textContent = 'Click again to confirm';
    setTimeout(()=>{ btn.dataset.armed=''; btn.textContent='Delete'; }, 3000);
    return;
  }
  const id = document.getElementById('loadoutId').value;
  loadouts = loadouts.filter(x=>x.id!==id);
  trips.forEach(tr=>{ if(tr.loadoutId===id) tr.loadoutId = null; });
  await saveLoadouts();
  await saveTrips();
  closeLoadoutModal();
  showGarage();
}

function refreshTripLoadoutSelect(){
  const sel = document.getElementById('tripLoadoutSelect');
  if(!sel) return;
  sel.innerHTML = '<option value="">Apply a loadout…</option>' +
    loadouts.slice().sort((a,b)=>a.name.localeCompare(b.name))
      .map(lo=>'<option value="'+lo.id+'">'+escapeHtml(lo.name)+'</option>').join('');
}

// Relative-day phrasing for a planned trip's date; a plain date once
// it's far enough out (or already completed) that "in N days" stops
// being the useful way to read it.
function relativeDayLabel(dateStr){
  const target = new Date(dateStr + 'T00:00:00');
  if(isNaN(target)) return dateStr;
  const today = new Date(); today.setHours(0,0,0,0);
  const days = Math.round((target - today) / 86400000);
  if(days === 0) return 'Today';
  if(days === 1) return 'Tomorrow';
  if(days === -1) return 'Yesterday';
  if(days > 1 && days <= 60) return 'In ' + days + ' days';
  if(days > 60){
    const months = Math.round(days / 30.44);
    return months < 18 ? 'In ' + months + ' months' : 'In ' + Math.round(days / 365.25) + ' years';
  }
  if(days < -1 && days >= -60) return days*-1 + ' days ago';
  return friendlyDate(dateStr);
}

// "Fri 15 Aug 2025" rather than "2025-08-15". Dates are calendar days
// (YYYY-MM-DD), so format them in UTC to avoid an off-by-one shift.
// Spelled out by hand: browsers disagree on short month names
// ("Sep" vs "Sept"), and the app should read the same everywhere.
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DATE_DAY_MONTH = { format: d => d.getUTCDate() + ' ' + MONTHS_SHORT[d.getUTCMonth()] };
function isoDay(iso){ const d = new Date(String(iso).slice(0,10) + 'T00:00:00Z'); return isNaN(d) ? null : d; }
function friendlyDate(iso, withWeekday = true){
  const d = iso && isoDay(iso);
  if(!d) return iso || '';
  return (withWeekday ? WEEKDAYS[d.getUTCDay()] + ' ' : '') + DATE_DAY_MONTH.format(d) + ' ' + d.getUTCFullYear();
}
// A multi-day trip: "10–11 Jul 2025", "30 Aug – 2 Sep 2025".
function friendlyRange(isoDates){
  const days = Array.from(new Set(isoDates.filter(Boolean).map(x => String(x).slice(0,10)))).sort();
  if(!days.length) return '';
  if(days.length === 1) return friendlyDate(days[0]);
  const a = isoDay(days[0]), b = isoDay(days[days.length-1]);
  if(!a || !b) return friendlyDate(days[0]);
  const year = b.getUTCFullYear();
  if(a.getUTCFullYear() !== year) return friendlyDate(days[0]) + ' – ' + friendlyDate(days[days.length-1]);
  if(a.getUTCMonth() === b.getUTCMonth()) return a.getUTCDate() + '–' + DATE_DAY_MONTH.format(b) + ' ' + year;
  return DATE_DAY_MONTH.format(a) + ' – ' + DATE_DAY_MONTH.format(b) + ' ' + year;
}
function tripDateLabel(trip){
  const trackDates = tripTracks(trip).map(t => t.date).filter(Boolean);
  return trackDates.length ? friendlyRange(trackDates) : friendlyDate(tripDisplayDate(trip));
}

function renderTripSection(list, gridId, emptyId, status){
  const grid = document.getElementById(gridId);
  grid.innerHTML = '';
  document.getElementById(emptyId).style.display = list.length ? 'none' : 'block';
  const trackColors = computeTrackColors();
  list.forEach(trip=>{
    const tks = tripTracks(trip);
    const dist = tripDistanceKm(trip);
    const gearList = tripGearItemsList(trip);
    const weight = tripGearWeight(trip);
    const dotColor = tripColor(trip, trackColors);
    const displayDate = tripDisplayDate(trip);
    const climb = tks.reduce((sum,t)=>sum+(t.elevationGainM||0), 0);
    const card = document.createElement('div');
    card.className = 'trip-card';
    // Only lines that say something: no "0 tracks · 0.0 km" on a trip
    // that hasn't happened, no "0 gear items" on an old hike.
    const dateLabel = status === 'planned' ? friendlyDate(displayDate) : tripDateLabel(trip);
    const trackLine = tks.length
      ? dist.toFixed(1)+' km'+(climb?' · ↑ '+climb.toLocaleString('en-US')+' m':'')+(tks.length>1?' · '+tks.length+' tracks':'')
      : '';
    const gearLine = gearList.length
      ? gearList.length+' item'+(gearList.length!==1?'s':'')+' packed'+(weight?' · '+formatWeight(weight):'')
      : (status === 'planned' ? 'Nothing packed yet' : '');
    card.innerHTML =
      (status === 'planned' && displayDate ? '<span class="trip-card-countdown">'+escapeHtml(relativeDayLabel(displayDate))+'</span>' : '')+
      '<div class="trip-card-name">'+(dotColor?'<span class="track-color-dot" style="background:'+dotColor+'"></span>':'')+escapeHtml(trip.name)+'</div>'+
      (dateLabel ? '<div class="trip-card-when">'+escapeHtml(dateLabel)+'</div>' : '')+
      (trip.notes ? '<div class="trip-card-notes">'+escapeHtml(trip.notes)+'</div>' : '')+
      (trackLine ? '<div class="trip-card-meta">'+escapeHtml(trackLine)+'</div>' : '')+
      (gearLine ? '<div class="trip-card-meta">'+escapeHtml(gearLine)+'</div>' : '');
    card.addEventListener('click', ()=> showTripDetail(trip.id));
    grid.appendChild(card);
  });
}

// A trip's tracks laid end to end (in date order) as one profile, so a
// two-day hike reads as one line: [[km, ele], ...] or null.
function tripProfile(trip){
  const tks = tripTracks(trip).filter(t => Array.isArray(t.profile) && t.profile.length > 1)
    .sort((a,b) => String(a.date||'').localeCompare(String(b.date||'')));
  const pts = [];
  let offset = 0;
  tks.forEach(t=>{
    // Skip anything that isn't a [km, ele] pair rather than let one odd
    // track take the whole list down.
    const own = t.profile.filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]) && p[1] !== null);
    if(own.length < 2) return;
    own.forEach(([km, ele]) => pts.push([offset + km, ele]));
    offset += own[own.length-1][0];
  });
  return pts.length > 1 ? pts : null;
}

function miniProfileSvg(pts, color){
  const W = 300, H = 44, PAD = 4;
  const step = Math.max(1, Math.ceil(pts.length / 150));
  const sample = pts.filter((p,i) => i % step === 0 || i === pts.length-1);
  const maxKm = sample[sample.length-1][0] || 1;
  let lo = Infinity, hi = -Infinity;
  sample.forEach(p=>{ if(p[1] < lo) lo = p[1]; if(p[1] > hi) hi = p[1]; });
  // Keep flat walks looking flat: at least 150 m of vertical range.
  const range = Math.max(hi - lo, 150);
  const xy = sample.map(([km, ele]) =>
    (km / maxKm * W).toFixed(1)+','+(H - PAD - (ele - lo) / range * (H - 2*PAD)).toFixed(1));
  const line = 'M' + xy.join(' L');
  return '<svg class="trip-card-profile" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true">'+
    '<path d="'+line+' L'+W+','+H+' L0,'+H+' Z" fill="'+color+'" fill-opacity="0.16"/>'+
    '<path d="'+line+'" fill="none" stroke="'+color+'" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>'+
    '</svg>';
}

const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Completed trips grouped under month headings, newest first, each card
// with the trip's elevation profile drawn in its map color.
function renderTripTimeline(list){
  const wrap = document.getElementById('tripCompletedGrid');
  wrap.innerHTML = '';
  document.getElementById('tripCompletedEmpty').style.display = list.length ? 'none' : 'block';
  const trackColors = computeTrackColors();
  const groups = [];
  list.forEach(trip=>{
    const d = isoDay(tripDisplayDate(trip) || '');
    const key = d ? MONTHS_LONG[d.getUTCMonth()] + ' ' + d.getUTCFullYear() : 'No date';
    let g = groups.find(x => x.key === key);
    if(!g){ g = {key, trips:[]}; groups.push(g); }
    g.trips.push(trip);
  });
  groups.forEach(g=>{
    const section = document.createElement('section');
    section.className = 'timeline-month';
    const h = document.createElement('h3');
    h.className = 'timeline-month-title';
    h.textContent = g.key;
    const grid = document.createElement('div');
    grid.className = 'gear-grid timeline-grid';
    section.appendChild(h);
    section.appendChild(grid);
    g.trips.forEach(trip=>{ try{
      const tks = tripTracks(trip);
      const color = tripColor(trip, trackColors) || 'var(--fern)';
      const dist = tripDistanceKm(trip);
      const climb = tks.reduce((sum,t)=>sum+(t.elevationGainM||0), 0);
      const gearList = tripGearItemsList(trip);
      const profile = tripProfile(trip);
      const card = document.createElement('div');
      card.className = 'trip-card trip-card-timeline';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      const when = tripDateLabel(trip);
      card.innerHTML =
        (profile ? miniProfileSvg(profile, color) : '<div class="trip-card-profile trip-card-profile-none" style="--trip-color:'+color+'"></div>')+
        '<div class="trip-card-body">'+
          '<div class="trip-card-main">'+
            '<div class="trip-card-name"></div>'+
            '<div class="trip-card-when"></div>'+
            (gearList.length ? '<div class="trip-card-meta">'+gearList.length+' item'+(gearList.length!==1?'s':'')+' packed</div>' : '')+
          '</div>'+
          (tks.length ? '<div class="trip-card-figures"><span class="trip-card-km">'+dist.toFixed(1)+' km</span>'+
            (climb ? '<span class="trip-card-up">↑ '+climb.toLocaleString('en-US')+' m</span>' : '')+'</div>' : '')+
        '</div>';
      card.querySelector('.trip-card-name').textContent = trip.name;
      card.querySelector('.trip-card-when').textContent = when;
      card.addEventListener('click', ()=> showTripDetail(trip.id));
      card.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); showTripDetail(trip.id); } });
      grid.appendChild(card);
    }catch(err){
      // One trip whose data trips up the drawing still gets a plain card,
      // and the rest of the list carries on.
      noteTripsProblem(err, trip);
      grid.appendChild(plainTripCard(trip));
    } });
    wrap.appendChild(section);
  });
}

// The soonest dated planned trip that hasn't started yet, as a countdown.
function renderNextTrip(planned){
  const card = document.getElementById('nextTripCard');
  const today = new Date(); today.setHours(0,0,0,0);
  const upcoming = planned.find(t=>{
    const d = tripDisplayDate(t);
    return d && new Date(d + 'T00:00:00') >= today;
  });
  card.hidden = !upcoming;
  if(!upcoming) return null;
  const date = tripDisplayDate(upcoming);
  const days = Math.round((new Date(date + 'T00:00:00') - today) / 86400000);
  document.getElementById('nextTripNum').textContent = days === 0 ? 'Today' : days.toLocaleString('en-US');
  document.getElementById('nextTripUnit').textContent = days === 0 ? '' : days === 1 ? 'day to go' : 'days to go';
  document.getElementById('nextTripName').textContent = upcoming.name;
  const gearList = tripGearItemsList(upcoming);
  const weight = tripGearWeight(upcoming);
  document.getElementById('nextTripMeta').textContent = friendlyDate(date) + ' · ' + (gearList.length
    ? gearList.length + ' item' + (gearList.length !== 1 ? 's' : '') + ' packed' + (weight ? ', ' + formatWeight(weight) : '')
    : 'nothing packed yet');
  card.onclick = ()=> showTripDetail(upcoming.id);
  return upcoming;
}
