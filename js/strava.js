// Hike-in-one — Importing single activities from a connected Strava account (via the strava-api Edge Function).
// Plain scripts loaded in order by index.html; they share one global scope.
'use strict';

// ---- Strava import ----
// Strava has no "download as GPX" endpoint — activities are reconstructed
// from the /streams endpoint — and the OAuth token exchange/refresh both
// need the app's Strava client SECRET, which can never ship to the
// browser; Strava's API also doesn't send CORS headers a browser will
// accept. So every Strava call goes through the strava-api Supabase Edge
// Function, which holds the secret and re-fetches on our behalf. That
// function is stateless: this app keeps its own Strava tokens in
// localStorage (per device, like reconnecting Strava in a new browser)
// and sends them along with each call, getting back whatever the
// function refreshed so it can save the new ones.

function showGlobalToast(msg, isError){
  const el = document.getElementById('globalToast');
  el.textContent = msg;
  el.classList.toggle('is-error', !!isError);
  el.hidden = false;
  clearTimeout(showGlobalToast._t);
  showGlobalToast._t = setTimeout(()=>{ el.hidden = true; }, 5000);
}

function getStravaTokens(){
  try{ return JSON.parse(localStorage.getItem(STRAVA_TOKENS_KEY) || 'null'); }catch(e){ return null; }
}
function setStravaTokens(tokens){
  try{ localStorage.setItem(STRAVA_TOKENS_KEY, JSON.stringify(tokens)); }catch(e){}
}
function clearStravaTokens(){
  try{ localStorage.removeItem(STRAVA_TOKENS_KEY); }catch(e){}
}

function stravaConnectUrl(){
  const redirectUri = SUPABASE_URL + '/functions/v1/strava-callback';
  const state = encodeURIComponent(window.location.href);
  return 'https://www.strava.com/oauth/authorize'+
    '?client_id='+encodeURIComponent(STRAVA_CLIENT_ID)+
    '&response_type=code&redirect_uri='+encodeURIComponent(redirectUri)+
    '&approval_prompt=auto&scope=activity:read_all&state='+state;
}

// Strava's redirect lands the browser back on this same page with tokens
// (or an error) in the URL *fragment* — read once on load, then scrub it
// from the address bar so a refresh or shared link never replays it.
function consumeStravaRedirect(){
  if(!location.hash) return;
  const params = new URLSearchParams(location.hash.slice(1));
  if(params.has('strava_access_token')){
    setStravaTokens({
      accessToken: params.get('strava_access_token'),
      refreshToken: params.get('strava_refresh_token'),
      expiresAt: Number(params.get('strava_expires_at')),
    });
    history.replaceState(null, '', location.pathname + location.search);
    showGlobalToast('Strava connected — open a trip and click "Import from Strava".');
  } else if(params.has('strava_error')){
    history.replaceState(null, '', location.pathname + location.search);
    showGlobalToast('Could not connect Strava: ' + params.get('strava_error'), true);
  }
}

async function callStravaApi(payload){
  const tokens = getStravaTokens();
  if(!tokens) throw new Error('not-connected');
  const { data, error } = await sb.functions.invoke('strava-api', { body: Object.assign({}, payload, tokens) });
  if(error) throw error;
  if(data && data.error) throw new Error(data.error);
  if(data && data.tokens) setStravaTokens(data.tokens);
  return data;
}

function openStravaModal(){
  document.getElementById('stravaModalOverlay').style.display = 'flex';
  onModalOpened('stravaModalOverlay');
  const status = document.getElementById('stravaModalStatus');
  status.textContent = ''; status.className = 'upload-status';
  const connectPrompt = document.getElementById('stravaConnectPrompt');
  const list = document.getElementById('stravaActivityList');
  if(!getStravaTokens()){
    connectPrompt.style.display = 'block';
    list.style.display = 'none';
    return;
  }
  connectPrompt.style.display = 'none';
  list.style.display = 'block';
  loadStravaActivities();
}
function closeStravaModal(){
  document.getElementById('stravaModalOverlay').style.display = 'none';
  onModalClosed('stravaModalOverlay');
}

async function loadStravaActivities(){
  const list = document.getElementById('stravaActivityList');
  const status = document.getElementById('stravaModalStatus');
  list.innerHTML = '<div class="trip-gear-empty">Loading your recent activities…</div>';
  try{
    const data = await callStravaApi({ action: 'activities' });
    renderStravaActivityList(data.activities || []);
  }catch(e){
    clearStravaTokens();
    document.getElementById('stravaConnectPrompt').style.display = 'block';
    list.style.display = 'none';
    status.className = 'upload-error';
    status.textContent = 'Couldn\'t load your Strava activities — try connecting again.';
  }
}

function renderStravaActivityList(activities){
  const list = document.getElementById('stravaActivityList');
  list.innerHTML = '';
  if(!activities.length){
    list.innerHTML = '<div class="trip-gear-empty">No recent activities found.</div>';
    return;
  }
  activities.forEach(a=>{
    const row = document.createElement('div');
    row.className = 'strava-activity-row';
    const km = a.distanceMeters ? (a.distanceMeters/1000).toFixed(1)+' km' : '';
    const date = a.startDate ? a.startDate.slice(0,10) : '';
    row.innerHTML =
      '<div class="strava-activity-info">'+
        '<div class="strava-activity-name"></div>'+
        '<div class="strava-activity-meta"></div>'+
      '</div>'+
      '<button class="ghost-btn" type="button">Import</button>';
    row.querySelector('.strava-activity-name').textContent = a.name;
    row.querySelector('.strava-activity-meta').textContent = [date, km].filter(Boolean).join(' · ');
    row.querySelector('button').addEventListener('click', ()=> importStravaActivity(a, row));
    list.appendChild(row);
  });
}

async function importStravaActivity(activity, row){
  const status = document.getElementById('stravaModalStatus');
  const btn = row.querySelector('button');
  btn.disabled = true; btn.textContent = 'Importing…';
  status.className = 'upload-status'; status.textContent = '';
  try{
    const data = await callStravaApi({
      action: 'gpx', activityId: activity.id,
      activityName: activity.name, startDate: activity.startDate,
    });
    const file = new File([data.gpx], 'strava-'+activity.id+'.gpx', { type: 'application/gpx+xml' });
    await handleTripGpxFiles([file]);
    status.textContent = 'Imported "'+activity.name+'".';
    btn.textContent = 'Imported';
  }catch(e){
    status.className = 'upload-error';
    status.textContent = 'Could not import that activity: ' + (e.message || e);
    btn.disabled = false; btn.textContent = 'Import';
  }
}
