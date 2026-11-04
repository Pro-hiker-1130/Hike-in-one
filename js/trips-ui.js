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
  renderTripTimeline(filterByDifficulty(completed));
}

// Completed trips can be narrowed to those with a hike of one difficulty;
// the chips show once
// there are a few trips to sort through.
let tripDifficultyFilter = 'all';
function filterByDifficulty(completed){
  const box = document.getElementById('tripDifficultyFilter');
  document.getElementById('tripCompletedEmpty').textContent = 'No completed trips yet.';
  box.hidden = completed.length < 3;
  if(box.hidden) tripDifficultyFilter = 'all';
  box.querySelectorAll('button').forEach(b=>{
    const on = b.dataset.level === tripDifficultyFilter;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
  });
  if(tripDifficultyFilter === 'all') return completed;
  // A trip shows when any of its hikes has the chosen difficulty.
  const list = completed.filter(trip => tripCountedTracks(trip).some(t => { const d = trackDifficulty(t); return d && d.level === tripDifficultyFilter; }));
  if(!list.length){
    const empty = document.getElementById('tripCompletedEmpty');
    empty.textContent = 'No trips with ' + (tripDifficultyFilter === 'easy' ? 'an' : 'a') + ' ' + DIFFICULTY_LABELS[tripDifficultyFilter].toLowerCase() + ' hike yet.';
  }
  return list;
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
  const shown = trips.find(t => t.id === id);
  if(shown) loadTripShare(shown);
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
  renderTripWeather(trip, tks);
  renderTripShare(trip);

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
          (t.planned ? '<span class="planned-route-badge">Planned route</span>' : '')+trackDifficultyBadgeHtml(t)+'</span>'+
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

// ---- A trip as a picture to send to friends ----
// Drawn on a canvas, nothing leaves the device: the route's shape (no map
// tiles), the elevation profile, the key numbers and the gear list. Shared
// through the phone's share sheet when it takes images, else downloaded.
const SHARE_W = 1080, SHARE_H = 1350;
function cssVar(name, fallback){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function drawTripShareImage(trip){
  const c = document.createElement('canvas');
  c.width = SHARE_W; c.height = SHARE_H;
  const g = c.getContext('2d');
  const col = { bg: cssVar('--ink', '#EFEEE8'), panel: cssVar('--panel', '#FFFFFF'), ink: cssVar('--parchment', '#344E41'),
    muted: cssVar('--muted', '#4E5D52'), fern: cssVar('--fern', '#588157'), sage: cssVar('--sage', '#A3B18A'), line: '#D6D9CF' };
  const display = "700 {s}px 'Barlow Condensed', 'Barlow', sans-serif", body = "{w} {s}px 'Barlow', sans-serif";
  const font = (tpl, s, w) => tpl.replace('{s}', s).replace('{w}', w || 400);
  const fit = (text, max) => { let t = text; while(t.length > 1 && g.measureText(t).width > max) t = t.slice(0, -2) + '…'; return t; };
  g.fillStyle = col.bg; g.fillRect(0, 0, SHARE_W, SHARE_H);

  const P = 64;
  g.fillStyle = col.ink; g.font = font(display, 76); g.textBaseline = 'top';
  g.fillText(fit(trip.name.toUpperCase(), SHARE_W - 2*P), P, P);
  const date = tripDisplayDate(trip);
  g.fillStyle = col.muted; g.font = font(body, 30);
  g.fillText([tripStatus(trip) === 'planned' ? 'Planned' : 'Walked', date ? friendlyDate(date) : ''].filter(Boolean).join(' · '), P, P + 92);

  // Route shape in a white panel.
  const box = { x: P, y: 220, w: SHARE_W - 2*P, h: 520 };
  g.fillStyle = col.panel; g.beginPath(); g.roundRect(box.x, box.y, box.w, box.h, 24); g.fill();
  const tks = tripTracks(trip);
  const pts = tks.flatMap(t => t.points || []);
  if(pts.length > 1){
    const meanLat = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const k = Math.cos(meanLat * Math.PI / 180);
    const xs = pts.map(p => p[1] * k), ys = pts.map(p => -p[0]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 48, sc = Math.min((box.w - 2*pad) / ((maxX - minX) || 1e-9), (box.h - 2*pad) / ((maxY - minY) || 1e-9));
    const ox = box.x + (box.w - (maxX - minX) * sc) / 2, oy = box.y + (box.h - (maxY - minY) * sc) / 2;
    const at = p => [ox + (p[1] * k - minX) * sc, oy + (-p[0] - minY) * sc];
    const colors = computeTrackColors();
    g.lineWidth = 7; g.lineJoin = g.lineCap = 'round';
    tks.forEach(t=>{
      if(!t.points || t.points.length < 2) return;
      g.strokeStyle = colors[t.id] || col.fern;
      g.setLineDash(t.planned ? [18, 14] : []);
      g.beginPath(); t.points.forEach((p, i) => { const [x, y] = at(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    });
    g.setLineDash([]);
    const [sx, sy] = at(pts[0]);
    g.fillStyle = col.ink; g.beginPath(); g.arc(sx, sy, 11, 0, 2*Math.PI); g.fill();
  } else {
    g.fillStyle = col.muted; g.font = font(body, 30); g.textAlign = 'center';
    g.fillText('No route yet', box.x + box.w/2, box.y + box.h/2 - 15); g.textAlign = 'left';
  }

  // Key numbers.
  const counted = tripCountedTracks(trip);
  const climb = counted.reduce((s, t) => s + (t.elevationGainM || 0), 0);
  const split = tripWeightSplit(trip);
  const stats = [[tripDistanceKm(trip).toFixed(1), 'km'], [climb ? climb.toLocaleString('en-US') : '—', 'm up'],
    [formatWeight(split.base), 'base weight'], [String(tripGearItemsList(trip).length), 'gear items']];
  const sw = (SHARE_W - 2*P - 3*20) / 4;
  stats.forEach(([num, label], i)=>{
    const x = P + i * (sw + 20), y = 772;
    g.fillStyle = col.panel; g.beginPath(); g.roundRect(x, y, sw, 132, 18); g.fill();
    g.fillStyle = col.ink; g.font = font(display, 54); g.fillText(fit(num, sw - 40), x + 22, y + 18);
    g.fillStyle = col.muted; g.font = font(body, 24, 500); g.fillText(label.toUpperCase(), x + 22, y + 88);
  });

  // Elevation profile of the longest track.
  const prof = tks.filter(t => t.profile && t.profile.length > 1).sort((a, b) => b.distanceKm - a.distanceKm)[0];
  const pr = { x: P, y: 976, w: SHARE_W - 2*P, h: 130 };
  if(prof){
    const e = prof.profile, lo = Math.min(...e.map(p => p[1])), hi = Math.max(...e.map(p => p[1])) || 1;
    const x0 = e[0][0], span = (e[e.length-1][0] - x0) || 1, rng = (hi - lo) || 1;
    const xy = p => [pr.x + (p[0] - x0) / span * pr.w, pr.y + pr.h - (p[1] - lo) / rng * pr.h * 0.9];
    g.beginPath(); e.forEach((p, i) => { const [x, y] = xy(p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.lineTo(pr.x + pr.w, pr.y + pr.h); g.lineTo(pr.x, pr.y + pr.h); g.closePath();
    g.fillStyle = 'rgba(88,129,87,0.18)'; g.fill();
    g.beginPath(); e.forEach((p, i) => { const [x, y] = xy(p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = col.fern; g.lineWidth = 4; g.stroke();
    g.fillStyle = col.muted; g.font = font(body, 22);
    g.fillText(Math.round(hi).toLocaleString('en-US') + ' m', pr.x, pr.y - 30);
  }

  // Gear: the heaviest items, then how many more.
  const gear = tripGearItemsList(trip).slice().sort((a, b) => (b.weightGrams || 0) * (b.quantity || 1) - (a.weightGrams || 0) * (a.quantity || 1));
  const gy = 1146;
  if(gear.length){
    g.fillStyle = col.ink; g.font = font(body, 26, 600);
    const shown = gear.slice(0, 4).map(it => it.name + ' ' + formatWeight((it.weightGrams || 0) * (it.quantity || 1)));
    g.fillText(fit('Packing: ' + shown.join(' · ') + (gear.length > 4 ? ' · +' + (gear.length - 4) + ' more' : ''), SHARE_W - 2*P), P, gy);
  }
  g.fillStyle = col.sage; g.fillRect(P, SHARE_H - 120, SHARE_W - 2*P, 2);
  g.fillStyle = col.muted; g.font = font(display, 34);
  g.fillText('HIKE-IN-ONE', P, SHARE_H - 92);
  return c;
}

async function shareTripImage(id){
  const trip = trips.find(t => t.id === id);
  if(!trip) return;
  try{ await document.fonts.ready; }catch(e){}
  const canvas = drawTripShareImage(trip);
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  const name = (trip.name || 'trip').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 60) || 'trip';
  const file = new File([blob], name + '.png', { type: 'image/png' });
  if(navigator.canShare && navigator.canShare({ files: [file] })){
    try{ await navigator.share({ files: [file], title: trip.name }); return; }
    catch(e){ if(e && e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(a.href), 10000);
}

// ---- Weather at the start of a planned trip ----
// Open-Meteo's forecast (free, no account) for the route start on the
// trip's days, once the trip is within its 16-day range. Only the start
// point, rounded to about 1 km, and the dates are sent. Answers are kept
// for an hour so re-rendering the page doesn't ask again.
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const FORECAST_DAYS = 16;
const forecastCache = new Map();
const WEATHER_WORDS = [[0,'Clear'],[1,'Mostly clear'],[2,'Partly cloudy'],[3,'Cloudy'],[48,'Fog'],[57,'Drizzle'],
  [67,'Rain'],[77,'Snow'],[82,'Showers'],[86,'Snow showers'],[99,'Thunderstorms']];
function weatherWord(code){ const w = WEATHER_WORDS.find(([max]) => code <= max); return w ? w[1] : ''; }

function tripStartPoint(tks){
  const withPoints = tks.filter(t => t.points && t.points.length);
  const track = withPoints.find(t => t.planned) || withPoints[0];
  return track ? track.points[0] : null;
}

function isoAddDays(iso, n){ return new Date(isoDay(iso).getTime() + n*86400000).toISOString().slice(0,10); }

async function fetchForecast(lat, lon, from, to){
  const key = [lat, lon, from, to].join('|');
  const hit = forecastCache.get(key);
  if(hit && Date.now() - hit.at < 3600000) return hit.data;
  const url = FORECAST_URL + '?latitude=' + lat + '&longitude=' + lon + '&timezone=auto&start_date=' + from + '&end_date=' + to +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max';
  const res = await fetch(url);
  const data = await res.json();
  if(!res.ok || data.error || !data.daily) throw new Error(data.reason || 'Forecast unavailable');
  forecastCache.set(key, { at: Date.now(), data });
  return data;
}

function renderTripWeather(trip, tks){
  const el = document.getElementById('tripWeather');
  const date = tripDisplayDate(trip);
  const start = tripStartPoint(tks);
  const today = new Date(Date.now() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  if(tripStatus(trip) !== 'planned' || !date || !start || String(date).slice(0,10) < today){ el.hidden = true; return; }
  const from = String(date).slice(0,10);
  const lastForecastDay = isoAddDays(today, FORECAST_DAYS - 1);
  el.hidden = false;
  if(from > lastForecastDay){
    el.innerHTML = '<p class="trip-weather-note"></p>';
    el.firstChild.textContent = 'Weather: the forecast reaches 16 days ahead — check back from ' + friendlyDate(isoAddDays(from, -(FORECAST_DAYS - 1))) + '.';
    return;
  }
  const days = trip.dailyKm > 0 ? Math.max(1, TrackCore.splitDays(tripPlannedProfile(tks), trip.dailyKm).length) : 1;
  let to = isoAddDays(from, days - 1);
  if(to > lastForecastDay) to = lastForecastDay;
  const lat = Math.round(start[0]*100)/100, lon = Math.round(start[1]*100)/100;
  const key = trip.id + '|' + [lat, lon, from, to].join('|');
  if(el.dataset.key === key && el.dataset.state !== 'error') return;
  el.dataset.key = key; el.dataset.state = 'loading';
  el.innerHTML = '<p class="trip-weather-note">Loading the forecast…</p>';
  fetchForecast(lat, lon, from, to).then(data=>{
    if(el.dataset.key !== key) return;
    el.dataset.state = 'done';
    const d = data.daily;
    const r = v => v == null ? '–' : Math.round(v);
    el.innerHTML = '<p class="section-label trip-weather-title">Forecast at the start</p>';
    d.time.forEach((iso, i)=>{
      const row = document.createElement('div');
      row.className = 'trip-weather-day';
      row.innerHTML = '<span class="trip-weather-date"></span><span class="trip-weather-text"></span>';
      row.firstChild.textContent = friendlyDate(iso);
      row.lastChild.textContent = [weatherWord(d.weather_code[i]), r(d.temperature_2m_min[i]) + '–' + r(d.temperature_2m_max[i]) + ' °C',
        'rain ' + r(d.precipitation_probability_max[i]) + ' %' + (d.precipitation_sum[i] ? ' (' + d.precipitation_sum[i] + ' mm)' : ''),
        'wind up to ' + r(d.wind_speed_10m_max[i]) + ' km/h'].filter(Boolean).join(' · ');
      el.appendChild(row);
    });
    const credit = document.createElement('p');
    credit.className = 'trip-weather-credit';
    credit.innerHTML = 'Forecast by <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>';
    el.appendChild(credit);
  }).catch(()=>{
    if(el.dataset.key !== key) return;
    el.dataset.state = 'error';
    el.innerHTML = '<p class="trip-weather-note">The forecast couldn\'t load right now.</p>';
  });
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
      ' · ↑ ' + d.upM + ' m ↓ ' + d.downM + ' m · about ' + formatDuration(walkingSec(d.distanceKm, d.upM));
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
  renderTripFoodPlan(trip, tripGearItemsList(trip));
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

  renderTripFoodPlan(trip, gearList);

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

// "Food for 2 days: about 1.4–1.8 kg. Packed: 1.5 kg, about right."
// Planned trips with gear or a daily distance; days from the day split.
function renderTripFoodPlan(trip, gearList){
  const el = document.getElementById('tripFoodPlan');
  const tks = tripTracks(trip);
  const days = trip.dailyKm > 0 ? TrackCore.splitDays(tripPlannedProfile(tks), trip.dailyKm).length || 1 : 1;
  el.hidden = tripStatus(trip) !== 'planned' || !(gearList.length || trip.dailyKm > 0);
  if(el.hidden) return;
  const f = tripFoodPlan(trip, days);
  const kg = g => (g / 1000).toFixed(1).replace(/\.0$/, '');
  el.textContent = 'Food for ' + days + ' day' + (days !== 1 ? 's' : '') + ': about ' + kg(f.low) + '–' + kg(f.high) + ' kg. ' + {
    none: 'No food in the gear list yet.',
    short: 'Packed so far: ' + formatWeight(f.packedG) + ', ' + formatWeight(f.low - f.packedG) + ' short.',
    right: 'Packed: ' + formatWeight(f.packedG) + ', about right.',
    plenty: 'Packed: ' + formatWeight(f.packedG) + ', more than you\'ll likely eat.',
  }[f.verdict];
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
  const start = tripStartPoint(tks);
  const sun = (tripStatus(trip) === 'planned' && date && start)
    ? TrackCore.sunTimes(String(date).slice(0,10), start[0], start[1]) : null;
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
