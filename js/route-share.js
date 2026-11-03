// Hike-in-one — Share a trip's route with partners: the owner's link panel on the trip page, and the page partners see when they open the link.
// Plain scripts loaded in order by index.html; they share one global scope.
'use strict';

// The owner (signed in) uploads a copy of the trip's route shape and
// elevation profile — nothing else — to shared_routes. The link carries a
// long random token; partners open it without an account, see the route,
// and can leave suggestions (optionally pinned to a spot on the map),
// through two database functions that only take that token
// (supabase/migrations/004_shared_routes.sql).

// Read before start-up rewrites the address bar.
const SHARED_ROUTE_TOKEN = (/^#shared=([a-f0-9]{24,64})$/.exec(location.hash) || [])[1] || null;
const SHARE_MAX_POINTS = 400, SHARE_MAX_PROFILE = 200;

// tripId -> {id, token, updatedAt, suggestions[]} when shared, null when not.
const tripShares = {};

function sharedRouteLink(token){ return location.origin + location.pathname + '#shared=' + token; }

function shareRoutePayload(trip){
  const pick = (arr, max) => TrackCore.sampleIndices(arr.length, max).map(i => arr[i]);
  return tripTracks(trip).filter(t => t.points && t.points.length > 1).map(t => ({
    name: t.name, planned: !!t.planned, distanceKm: Math.round((t.distanceKm || 0) * 10) / 10,
    points: pick(t.points, SHARE_MAX_POINTS).map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]),
    profile: t.profile && t.profile.length > 1 ? pick(t.profile, SHARE_MAX_PROFILE) : null,
  }));
}

async function loadTripShare(trip){
  if(!CLOUD_SYNC_ENABLED || !cloudUser) return;
  const { data, error } = await sb.from('shared_routes').select('id,token,updated_at').eq('trip_id', trip.id).limit(1);
  if(error) return;
  if(!data.length){ tripShares[trip.id] = null; }
  else {
    const row = data[0];
    const s = await sb.from('route_suggestions').select('id,author,body,lat,lon,done,created_at').eq('route_id', row.id).order('created_at');
    tripShares[trip.id] = { id: row.id, token: row.token, updatedAt: row.updated_at, suggestions: s.error ? [] : s.data };
  }
  if(currentTripId === trip.id) renderTripShare(trip);
}

function renderTripShare(trip){
  const canShare = shareRoutePayload(trip).length > 0;
  const share = tripShares[trip.id];
  document.getElementById('tripShareRouteBtn').hidden = !canShare || !!share;
  const panel = document.getElementById('tripSharePanel');
  panel.hidden = !share;
  if(!share) return;
  document.getElementById('tripShareLink').value = sharedRouteLink(share.token);
  document.getElementById('tripShareNote').textContent = 'Anyone with this link can see the route and suggest changes. Last updated ' +
    friendlyDate(String(share.updatedAt).slice(0, 10)) + '.';
  const list = document.getElementById('tripShareSuggestions');
  list.innerHTML = '';
  if(!share.suggestions.length){
    list.innerHTML = '<div class="trip-gear-empty">No suggestions yet.</div>';
    return;
  }
  share.suggestions.forEach(s=>{
    const row = document.createElement('label');
    row.className = 'share-suggestion' + (s.done ? ' is-done' : '');
    row.innerHTML = '<input type="checkbox"><span class="share-suggestion-text"><strong></strong> <span></span>' +
      (s.lat != null ? ' <span class="share-suggestion-spot">· at a spot on the map</span>' : '') + '</span>';
    row.querySelector('input').checked = !!s.done;
    row.querySelector('input').setAttribute('aria-label', 'Done: ' + s.body);
    row.querySelector('strong').textContent = s.author + ':';
    row.querySelector('strong + span').textContent = s.body;
    row.querySelector('input').addEventListener('change', async e=>{
      s.done = e.target.checked;
      row.classList.toggle('is-done', s.done);
      await sb.from('route_suggestions').update({ done: s.done }).eq('id', s.id);
    });
    list.appendChild(row);
  });
}

async function publishTripShare(){
  const trip = trips.find(t => t.id === currentTripId);
  if(!trip) return;
  if(!CLOUD_SYNC_ENABLED || !cloudUser){
    showGlobalToast('Sign in to share a route with partners.', false, CLOUD_SYNC_ENABLED ? { label: 'Sign in', fn: openCloudSignInModal } : null);
    return;
  }
  const { data, error } = await sb.from('shared_routes')
    .upsert({ owner_id: cloudUser.id, trip_id: trip.id, name: trip.name.slice(0, 120), route: shareRoutePayload(trip) }, { onConflict: 'owner_id,trip_id' })
    .select('id,token,updated_at');
  if(error || !data || !data.length){ showGlobalToast('Sharing didn\'t work — check your connection and try again.', true); return; }
  const was = tripShares[trip.id];
  tripShares[trip.id] = { id: data[0].id, token: data[0].token, updatedAt: data[0].updated_at, suggestions: was ? was.suggestions : [] };
  renderTripShare(trip);
  let copied = false;
  try{ await navigator.clipboard.writeText(sharedRouteLink(data[0].token)); copied = true; }catch(e){}
  showGlobalToast(was ? 'Shared route updated.' : 'Route shared' + (copied ? ' — link copied.' : '. Copy the link below.'));
}

async function stopTripShare(){
  const trip = trips.find(t => t.id === currentTripId);
  const share = trip && tripShares[trip.id];
  if(!share) return;
  if(!confirm('Stop sharing this route? The link stops working and its suggestions are deleted.')) return;
  const { error } = await sb.from('shared_routes').delete().eq('id', share.id);
  if(error){ showGlobalToast('Couldn\'t stop sharing — try again.', true); return; }
  tripShares[trip.id] = null;
  renderTripShare(trip);
}

async function copyTripShareLink(){
  const input = document.getElementById('tripShareLink');
  try{ await navigator.clipboard.writeText(input.value); showGlobalToast('Link copied.'); }
  catch(e){ input.select(); }
}

// ---- The page partners see ----
let srMap = null, srLines = null, srPins = null, srPick = null, srToken = null;

function closeSharedRoute(){
  document.getElementById('sharedRouteOverlay').style.display = 'none';
  onModalClosed('sharedRouteOverlay');
}

function srSetPoint(ll){
  srPick = ll;
  if(srMap){
    srPins.eachLayer(l => { if(l.options.picked) srPins.removeLayer(l); });
    if(srPick) L.circleMarker(ll, { radius: 9, color: '#B3261E', weight: 3, fillOpacity: 0.3, picked: true }).addTo(srPins);
  }
  document.getElementById('srPoint').textContent = srPick
    ? 'Spot picked on the map. Tap elsewhere to move it.' : 'Tap the map to point at a spot (optional).';
  document.getElementById('srClearPoint').hidden = !srPick;
}

async function openSharedRoute(token){
  srToken = token;
  document.getElementById('sharedRouteOverlay').style.display = 'flex';
  onModalOpened('sharedRouteOverlay');
  try{ document.getElementById('srAuthor').value = localStorage.getItem('hike-shared-author') || ''; }catch(e){}
  if(!srMap){
    srMap = L.map('srMap', { zoomControl: true });
    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap', subdomains: 'abc', maxZoom: 17,
    }).addTo(srMap);
    srLines = L.layerGroup().addTo(srMap);
    srPins = L.layerGroup().addTo(srMap);
    srMap.on('click', e => srSetPoint([+e.latlng.lat.toFixed(5), +e.latlng.lng.toFixed(5)]));
  }
  srSetPoint(null);
  await loadSharedRoute(true);
}

async function loadSharedRoute(fit){
  const err = document.getElementById('srError');
  err.textContent = '';
  if(!CLOUD_SYNC_ENABLED){ err.textContent = 'Shared routes need the online service, which isn\'t set up here.'; return; }
  const { data, error } = await sb.rpc('get_shared_route', { p_token: srToken });
  if(error || !data){
    document.getElementById('srTitle').textContent = 'Shared route';
    err.textContent = error ? 'The route couldn\'t load — check your connection.' : 'This shared route no longer exists.';
    document.getElementById('srForm').hidden = true;
    return;
  }
  document.getElementById('srForm').hidden = false;
  document.getElementById('srTitle').textContent = data.name;
  const route = Array.isArray(data.route) ? data.route : [];
  const km = route.reduce((s, t) => s + (t.distanceKm || 0), 0);
  document.getElementById('srStats').textContent = route.length + ' track' + (route.length !== 1 ? 's' : '') + ' · ' + km.toFixed(1) + ' km';
  requestAnimationFrame(()=> srMap.invalidateSize());
  srLines.clearLayers();
  srPins.eachLayer(l => { if(!l.options.picked) srPins.removeLayer(l); });
  const all = [];
  route.forEach(t=>{
    if(!Array.isArray(t.points) || t.points.length < 2) return;
    L.polyline(t.points, { color: '#C4501C', weight: 4, opacity: 0.9, dashArray: t.planned ? '8 8' : null }).addTo(srLines);
    all.push(...t.points);
  });
  const list = document.getElementById('srSuggestions');
  list.innerHTML = '';
  (data.suggestions || []).forEach((s, i)=>{
    const row = document.createElement('div');
    row.className = 'share-suggestion' + (s.done ? ' is-done' : '');
    row.innerHTML = '<span class="share-suggestion-text"><strong></strong> <span></span></span>';
    row.querySelector('strong').textContent = s.author + ':';
    row.querySelector('strong + span').textContent = s.body + (s.done ? ' (done)' : '');
    list.appendChild(row);
    if(s.lat != null) L.circleMarker([s.lat, s.lon], { radius: 7, color: '#3A5A40', weight: 2, fillOpacity: 0.6 })
      .bindTooltip(s.author + ': ' + s.body).addTo(srPins);
  });
  if(fit && all.length){
    const b = L.latLngBounds(all);
    // A view right away so the line draws now; fit again once the dialog
    // has its final size.
    if(b.isValid()) srMap.fitBounds(b, { padding: [30, 30], animate: false });
    setTimeout(()=>{ srMap.invalidateSize(); if(b.isValid()) srMap.fitBounds(b, { padding: [30, 30] }); }, 60);
  }
}

async function sendRouteSuggestion(e){
  e.preventDefault();
  const author = document.getElementById('srAuthor').value.trim();
  const body = document.getElementById('srBody').value.trim();
  const err = document.getElementById('srError');
  if(!author || !body){ err.textContent = 'Add your name and a suggestion.'; return; }
  const btn = document.getElementById('srSendBtn');
  btn.disabled = true;
  const { error } = await sb.rpc('add_route_suggestion', {
    p_token: srToken, p_author: author, p_body: body, p_lat: srPick ? srPick[0] : null, p_lon: srPick ? srPick[1] : null,
  });
  btn.disabled = false;
  if(error){ err.textContent = error.message || 'Sending didn\'t work — try again.'; return; }
  try{ localStorage.setItem('hike-shared-author', author); }catch(e2){}
  document.getElementById('srBody').value = '';
  srSetPoint(null);
  showGlobalToast('Suggestion sent. Thanks!');
  await loadSharedRoute(false);
}
