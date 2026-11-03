// End-to-end: the map overview, trips timeline, gear list and Settings page.
//
//   node --test tests/e2e/
//
// Same setup as catalog.e2e.test.js: Playwright, plus HIKE_LIBS_DIR to serve
// the CDN libraries locally and PLAYWRIGHT_CHROMIUM for a specific browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

let playwright = null;
try{ playwright = require('playwright'); }catch(e){}

const { createFakeSupabase, fakeSession } = require('./fake-supabase.js');

const ROOT = path.resolve(__dirname, '../..');
const SUPABASE_HOST = 'agdtujbsojhujffvhqcb.supabase.co';
const SESSION_KEY = 'sb-agdtujbsojhujffvhqcb-auth-token';
const ME = 'aaaaaaaa-0000-4000-8000-000000000001';

function serveRepo(){
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png' };
  const server = http.createServer((req, res)=>{
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(ROOT, rel);
    if(!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){ res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', ()=> r(server)));
}

const LIBS = {
  'leaflet/1.9.4/leaflet.min.css': ['leaflet/dist/leaflet.css', 'text/css'],
  'leaflet/1.9.4/leaflet.min.js': ['leaflet/dist/leaflet.js', 'application/javascript'],
  'leaflet.heat/0.2.0/leaflet-heat.js': ['leaflet.heat/dist/leaflet-heat.js', 'application/javascript'],
  '@zxing/library@0.21.3/umd/index.min.js': ['@zxing/library/umd/index.min.js', 'application/javascript'],
  '@supabase/supabase-js@2.108.0/dist/umd/supabase.js': ['@supabase/supabase-js/dist/umd/supabase.js', 'application/javascript'],
};

const GEAR = [
  ['Copper Spur HV UL2', 'Big Agnes', 'Shelter', 1219, 'active'],
  ['Exos 58', 'Osprey', 'Backpack', 1212, 'active'],
  ['Revelation 20', 'Enlightened Equipment', 'Sleep system', 640, 'active'],
  ['NeoAir XLite NXT', 'Therm-a-Rest', 'Sleep system', 370, 'active'],
  ['Distance Carbon Z', 'Black Diamond', 'Other', 298, 'wishlist'],
].map(([name, brand, category, weightGrams, status], i) =>
  ({ id: 'g' + i, name, brand, category, weightGrams, quantity: 1, status, notes: '' }));

// A straight climb: `climb` metres over ~n * 111 m heading north.
function gpx(name, isoDate, lat, climb, n = 40){
  const pts = Array.from({ length: n }, (_, i) =>
    '<trkpt lat="' + (lat + i * 0.001).toFixed(5) + '" lon="7.60000"><ele>' + (1000 + climb * i / (n - 1)).toFixed(1) + '</ele>' +
    '<time>' + isoDate + 'T08:' + String(i % 60).padStart(2, '0') + ':00Z</time></trkpt>').join('');
  return Buffer.from('<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">' +
    '<trk><name>' + name + '</name><type>hiking</type><trkseg>' + pts + '</trkseg></trk></gpx>');
}

function isoInDays(days){
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

let server, baseUrl;
test.before(async ()=>{
  if(!playwright) return;
  server = await serveRepo();
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});
test.after(()=> server && server.close());

// fake: a fake-supabase.js instance; when given, the browser is signed in
// against it and the local data starts empty (a fresh phone).
async function launch(t, viewport = { width: 1280, height: 900 }, fake = null){
  const browser = await playwright.chromium.launch(Object.assign({ args: ['--no-sandbox'] },
    process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}));
  t.after(()=> browser.close());
  // viewport.touch: a touch phone (taps, not mouse clicks).
  const { touch, ...size } = viewport;
  const ctx = await browser.newContext({ viewport: size, serviceWorkers: 'block', hasTouch: !!touch, isMobile: !!touch });
  if(process.env.HIKE_LIBS_DIR){
    await ctx.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/, route=>{
      const key = Object.keys(LIBS).find(k => route.request().url().includes(k));
      if(!key) return route.abort();
      route.fulfill({ status: 200, contentType: LIBS[key][1], body: fs.readFileSync(path.join(process.env.HIKE_LIBS_DIR, LIBS[key][0])) });
    });
  }
  await ctx.route(/fonts\.|tile\.openstreetmap|arcgisonline|opentopomap|cartocdn|supabase\.co/, r => r.abort());
  // Registered last so it wins over the blanket supabase.co block above.
  if(fake) await ctx.route(new RegExp(SUPABASE_HOST.replace(/\./g, '\\.')), r => fake.handle(r));
  await ctx.addInitScript(({ gear, session, key })=>{
    if(localStorage.getItem('e2e-seeded')) return;
    localStorage.setItem('e2e-seeded', '1');
    if(session) localStorage.setItem(key, JSON.stringify(session));
    else localStorage.setItem('waypoints-gear-v1', JSON.stringify(gear));
  }, { gear: GEAR, session: fake ? fakeSession(ME) : null, key: SESSION_KEY });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if(m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()); });
  await page.goto(baseUrl + '/index.html');
  await page.waitForSelector('.nav-tab');
  return { page, errors };
}

async function importHikes(page){
  await page.click('.nav-tab[data-page="trips"]');
  await page.click('#importActivitiesBtn');
  await page.setInputFiles('#importInput', [
    { name: 'eiger.gpx', mimeType: 'application/gpx+xml', buffer: gpx('Eiger trail', '2025-07-10', 46.60, 600) },
    { name: 'hike.gpx', mimeType: 'application/gpx+xml', buffer: gpx('Hike', '2025-08-15', 46.70, 300) },
  ]);
  await page.waitForSelector('#importStepReview', { state: 'visible' });
  await page.click('#importConfirmBtn');
  await page.waitForSelector('#importStepDone', { state: 'visible' });
  await page.click('#importViewTripsBtn');
}

const text = async (page, sel) => {
  // Stat tiles count up for a moment when they change; read the final value.
  if(sel.startsWith('#stat')) await page.waitForSelector(sel + ':not([data-counting])');
  return page.$eval(sel, el => el.textContent.trim());
};

test('map overview shows km, metres up, trips and countries, and opens the import', { skip: !playwright }, async t=>{
  const { page, errors } = await launch(t);
  await importHikes(page);
  await page.click('.nav-tab[data-page="map"]');
  assert.equal(await text(page, '#statTrips'), '2');
  assert.ok(Number(await text(page, '#statDistance')) >= 8, 'two ~4.3 km tracks');
  assert.equal(await text(page, '#statClimb'), '900');
  // A change while the map is showing counts up, then lands on the new value.
  const counting = await page.evaluate(()=>{
    trips.push({ id: 'trip_x', name: 'X', trackIds: [], gearIds: [], status: 'planned', createdAt: 2 });
    renderStats();
    return document.getElementById('statTrips').hasAttribute('data-counting');
  });
  assert.ok(counting, 'counts up while visible');
  assert.equal(await text(page, '#statTrips'), '3');
  await page.evaluate(()=>{ trips.pop(); renderStats(); });
  await page.click('#mapImportBtn');
  await page.waitForSelector('#importModalOverlay', { state: 'visible' });
  assert.ok(await page.isVisible('#pageTrips'), 'import opens over the Trips page');
  assert.deepEqual(errors, []);
});

test('trips: countdown card for the next trip, completed trips grouped by month with profiles', { skip: !playwright }, async t=>{
  const { page, errors } = await launch(t);
  await importHikes(page);
  await page.click('#addTripBtn');
  await page.fill('#tripName', 'Tour du Mont Blanc');
  await page.fill('#tripDate', isoInDays(30));
  await page.click('#tripForm button[type="submit"]');

  await page.waitForSelector('#nextTripCard:not([hidden])');
  assert.equal(await text(page, '#nextTripNum'), '30');
  assert.equal(await text(page, '#nextTripUnit'), 'days to go');
  assert.equal(await text(page, '#nextTripName'), 'Tour du Mont Blanc');
  assert.match(await text(page, '#nextTripMeta'), /nothing packed yet/);
  assert.ok(!(await page.isVisible('#tripPlannedGrid')), 'the only planned trip is in the countdown card, not repeated');

  const months = await page.$$eval('.timeline-month-title', els => els.map(e => e.textContent));
  assert.deepEqual(months, ['August 2025', 'July 2025']);
  assert.equal(await page.locator('.trip-card-timeline svg.trip-card-profile').count(), 2);
  assert.match(await text(page, '.timeline-month:first-child .trip-card-up'), /↑ 300 m/);

  await page.click('#nextTripCard');
  await page.waitForSelector('#tripDetailView', { state: 'visible' });
  assert.equal(await text(page, '#tripDetailTitle'), 'Tour du Mont Blanc');
  assert.ok(!(await page.isVisible('#tripDaylight')), 'no route yet, so no sunrise line');
  // Give the planned trip a route start: sunrise and sunset show for that day.
  await page.evaluate(()=>{
    const trip = trips.find(tr => tr.name === 'Tour du Mont Blanc');
    tracks.push({ id: 't_plan', name: 'Plan', planned: true, distanceKm: 2, points: [[45.92, 6.87], [45.93, 6.88]] });
    trip.trackIds = (trip.trackIds || []).concat('t_plan');
    renderTripDetail();
  });
  assert.match(await text(page, '#tripDaylight'), /^Sunrise \d.+ · sunset \d.+ · \d+ h \d+ min of daylight on /);
  // An elevation profile sweeps in the first time only, not on every re-render.
  const sweeps = await page.evaluate(()=>{
    const walked = trips.find(tr => tripTracks(tr).some(t => t.profile && t.profile.length > 1));
    showTripDetail(walked.id);
    const first = document.querySelectorAll('#tripTrackList svg.ele-draw-in').length;
    renderTripDetail();
    return [first, document.querySelectorAll('#tripTrackList svg.ele-draw-in').length];
  });
  assert.deepEqual(sweeps, [1, 0]);
  assert.deepEqual(errors, []);
});

test('trips: packing mode ticks gear off with big rows and keeps the ticks', { skip: !playwright }, async t=>{
  const { page, errors } = await launch(t);
  await page.click('.nav-tab[data-page="trips"]');
  await page.evaluate(async ()=>{
    trips.push({ id: 'trip_pack', name: 'Hut weekend', trackIds: [], gearIds: ['g0', 'g1', 'g2'], status: 'planned', date: '2030-07-01', createdAt: 1 });
    await saveTrips();
    showTripDetail('trip_pack');
  });
  assert.ok(await page.isHidden('#tripPackProgress'), 'nothing packed, not packing: no progress bar');
  // Shelter 1219 g + pack 1212 g are base; the quilt is set to worn here.
  await page.evaluate(()=>{ gearItems.find(g => g.id === 'g2').packRole = 'worn'; renderTripDetail(); });
  assert.equal(await text(page, '#tripPackSplit'), 'Base 2.4 kgWorn 640 gConsumable —');
  await page.click('#tripPackBtn');
  assert.equal(await page.getAttribute('#tripPackBtn', 'aria-pressed'), 'true');
  assert.equal(await page.locator('#tripGearSummaryList .pack-row').count(), 3);
  const h = await page.$eval('#tripGearSummaryList .pack-row', el => el.getBoundingClientRect().height);
  assert.ok(h >= 48, 'rows are big enough to tap: ' + h);
  assert.equal(await text(page, '#tripPackProgressText'), '0 of 3 packed');
  await page.click('#tripGearSummaryList .pack-row >> text=Exos 58');
  assert.equal(await text(page, '#tripPackProgressText'), '1 of 3 packed');
  assert.equal(await page.getAttribute('#tripGearSummaryList .pack-row:has-text("Exos 58")', 'aria-pressed'), 'true');
  assert.deepEqual(await page.evaluate(()=> trips.find(tr => tr.id === 'trip_pack').packedIds), ['g1']);
  // Done packing: back to the plain list, the tick and progress stay.
  await page.click('#tripPackBtn');
  assert.equal(await page.locator('#tripGearSummaryList .pack-row').count(), 0);
  assert.equal(await page.locator('#tripGearSummaryList .is-packed').count(), 1);
  assert.equal(await text(page, '#tripPackProgressText'), '1 of 3 packed');
  assert.deepEqual(errors, []);
});

test('gear: Download CSV saves the whole list, grouped by category, safe for spreadsheets', { skip: !playwright }, async t=>{
  const { page, errors } = await launch(t);
  await page.click('.nav-tab[data-page="gear"]');
  await page.evaluate(()=>{ gearItems[0].name = '=Tent, "two door"'; gearItems[0].tags = ['3-season', 'freestanding']; });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#gearCsvBtn')]);
  assert.match(download.suggestedFilename(), /^hike-in-one-gear-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = fs.readFileSync(await download.path(), 'utf8').replace(/^﻿/, '');
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], 'Name,Category,Brand,Model,Weight (g),Quantity,Status,Price,Currency,Purchase date,Condition,Tags,Carried as');
  assert.equal(lines.length, 1 + GEAR.length, 'wishlist included too');
  assert.match(lines[1], /^Exos 58,Backpack,Osprey,/, 'categories in Gear Room order');
  assert.ok(lines.includes(`"'=Tent, ""two door""",Shelter,Big Agnes,,1219,1,active,,,,,"3-season, freestanding",base`), csv);
  assert.deepEqual(errors, []);
});

test('gear: categories as weight bars that open to their items; Shelves still there', { skip: !playwright }, async t=>{
  const { page, errors } = await launch(t);
  await page.click('.nav-tab[data-page="gear"]');
  const cats = await page.$$eval('.pack-cat-name', els => els.map(e => e.firstChild.nextSibling.textContent.trim()));
  assert.deepEqual(cats, ['Shelter', 'Backpack', 'Sleep system'], 'heaviest first, wishlist left out');
  assert.equal(await text(page, '.pack-cat:nth-child(3) .pack-cat-weight'), '1.0 kg');

  await page.click('.pack-cat:nth-child(3) .pack-cat-head');
  assert.equal(await page.getAttribute('.pack-cat:nth-child(3) .pack-cat-head', 'aria-expanded'), 'true');
  assert.deepEqual(await page.$$eval('.pack-item-name', els => els.map(e => e.textContent)), ['Revelation 20', 'NeoAir XLite NXT']);
  await page.click('.pack-item >> nth=0');
  await page.waitForSelector('#gearModalOverlay', { state: 'visible' });
  assert.equal(await page.inputValue('#gearName'), 'Revelation 20');
  await page.click('#gearModalClose');

  await page.click('#gearViewToggle [data-gearview="shelves"]');
  assert.ok(await page.isVisible('#gearScene'));
  assert.ok(!(await page.isVisible('#gearPackList')));
  // The gear toggle shares the map toggles' look but not their behaviour.
  await page.click('.nav-tab[data-page="map"]');
  assert.deepEqual(await page.$$eval('.sidebar .view-toggle:not(#basemapToggle) button.active', b => b.map(x => x.textContent)), ['Tracks']);
  await page.reload();
  await page.waitForSelector('.nav-tab');
  await page.click('.nav-tab[data-page="gear"]');
  assert.ok(await page.isVisible('#gearScene'), 'the chosen view is remembered');
  assert.deepEqual(errors, []);
});

test('settings: Google location history import and removing map data', { skip: !playwright }, async t=>{
  const { page, errors } = await launch(t, { width: 390, height: 844 });
  await page.click('.nav-tab[data-page="settings"]');
  assert.ok(await page.isVisible('#pageSettings'));
  assert.ok(await page.isDisabled('#clearBtn'), 'nothing to remove yet');

  const records = { locations: Array.from({ length: 20 }, (_, i) =>
    ({ latitudeE7: 463000000 + i * 10000, longitudeE7: 76000000 + i * 10000, timestampMs: String(1690000000000 + i * 60000) })) };
  await page.setInputFiles('#googleInput', { name: 'Records.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(records)) });
  await page.waitForFunction(()=> /Added 20 location points/.test(document.getElementById('uploadStatus').textContent));
  assert.match(await text(page, '#settingsDataSummary'), /0 tracks and 20 location-history points/);

  await page.click('.nav-tab[data-page="map"]');
  assert.deepEqual(await page.$$eval('.sidebar .view-toggle:not(#basemapToggle) button.active', b => b.map(x => x.textContent)), ['Both'],
    'the heatmap is switched on so the new points show');

  await page.click('.nav-tab[data-page="settings"]');
  await page.click('#clearBtn');
  assert.equal(await text(page, '#clearBtn'), 'Click again to confirm');
  await page.click('#clearBtn');
  await page.waitForFunction(()=> / and 0 location-history points/.test(document.getElementById('settingsDataSummary').textContent));
  assert.ok(await page.isDisabled('#clearBtn'));

  await page.click('.nav-tab[data-page="trips"]');
  await page.click('.nav-tab[data-page="settings"]');
  await page.goBack();
  await page.waitForSelector('#pageTrips.active');
  assert.deepEqual(errors, []);
});

test('trips arriving from the cloud show up on a Trips page that is already open', { skip: !playwright }, async t=>{
  const track = { id: 't_cloud', name: 'Eiger trail', date: '2025-07-10', distanceKm: 11.1, elevationGainM: 605,
    points: [[46.60, 7.60], [46.61, 7.61], [46.62, 7.62]], profile: [[0, 1000], [5, 1300], [11.1, 1605]] };
  const fake = createFakeSupabase({ userId: ME, userDataDelayMs: 1500, seed: { userData: {
    gear: [], loadouts: [], google_points: [], tracks: [track],
    trips: [{ id: 'trip_cloud', name: 'Eiger trail', trackIds: ['t_cloud'], gearIds: [], status: 'completed', createdAt: 1 }],
  } } });
  const { page, errors } = await launch(t, { width: 390, height: 844 }, fake);
  // Open Trips straight away, before the (slow) cloud pull has landed.
  await page.click('.nav-tab[data-page="trips"]');
  assert.ok(await page.isVisible('#tripsEmpty'), 'nothing local yet');
  await page.waitForFunction(()=> document.getElementById('statTrips').textContent === '1', null, { timeout: 8000 });
  await page.waitForSelector('#tripCompletedGrid .trip-card', { timeout: 2000 });
  assert.equal(await text(page, '#tripCompletedGrid .trip-card-name'), 'Eiger trail');
  assert.ok(!(await page.isVisible('#tripsEmpty')));
  assert.ok(await page.isVisible('#pageTrips'), 'still on the Trips page');
  assert.deepEqual(errors, []);
});

// ---- Cloud sync must never lose data ----
function bigTracks(n, pointsEach){
  return Array.from({ length: n }, (_, k) => ({
    id: 'local_t' + k, name: 'Local hike ' + k, date: '2025-06-' + String(1 + k % 28).padStart(2, '0'), distanceKm: 10,
    points: Array.from({ length: pointsEach }, (_, i) => [46 + k * 0.01 + i * 1e-5, 7 + i * 1e-5]),
  }));
}
async function launchWithLocalData(t, fake, local){
  // Seeds this "device" through the app's legacy localStorage keys, which
  // it migrates into IndexedDB on first read.
  const browser = await playwright.chromium.launch(Object.assign({ args: ['--no-sandbox'] },
    process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}));
  t.after(()=> browser.close());
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  if(process.env.HIKE_LIBS_DIR){
    await ctx.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/, route=>{
      const key = Object.keys(LIBS).find(k => route.request().url().includes(k));
      if(!key) return route.abort();
      route.fulfill({ status: 200, contentType: LIBS[key][1], body: fs.readFileSync(path.join(process.env.HIKE_LIBS_DIR, LIBS[key][0])) });
    });
  }
  await ctx.route(/fonts\.|tile\.openstreetmap|arcgisonline|opentopomap|cartocdn|supabase\.co/, r => r.abort());
  await ctx.route(new RegExp(SUPABASE_HOST.replace(/\./g, '\\.')), r => fake.handle(r));
  await ctx.addInitScript(({ local, session, key })=>{
    if(localStorage.getItem('e2e-seeded')) return;
    localStorage.setItem('e2e-seeded', '1');
    localStorage.setItem(key, JSON.stringify(session));
    Object.entries(local).forEach(([k, v]) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)));
  }, { local, session: fakeSession(ME), key: SESSION_KEY });
  const page = await ctx.newPage();
  await page.goto(baseUrl + '/index.html');
  await page.waitForSelector('.nav-tab');
  return page;
}
const uploads = fake => fake.log.filter(l => l.method === 'POST' && l.path === '/rest/v1/user_data').map(l => Array.isArray(l.body) ? l.body[0] : l.body);

test('sync: a device with newer local changes uploads its data, never an empty set', { skip: !playwright }, async t=>{
  const fake = createFakeSupabase({ userId: ME, seed: { userData: {
    gear: [{ id: 'cg', name: 'Cloud tent', category: 'Shelter', status: 'active', weightGrams: 1000, quantity: 1 }],
    trips: [], loadouts: [], google_points: [], tracks: [],
  } } });
  const page = await launchWithLocalData(t, fake, {
    'waypoints-tracks-v1': bigTracks(40, 4000),
    'waypoints-trips-v1': [{ id: 'lt', name: 'Local trip', trackIds: ['local_t0'], gearIds: [], status: 'completed' }],
    'waypoints-gear-v1': [{ id: 'lg', name: 'Local stove', category: 'Cooking', status: 'active', weightGrams: 80, quantity: 1 }],
    'waypoints-last-modified-v1': String(Date.UTC(2030, 0, 1)),   // local edits newer than the cloud copy
  });
  await page.waitForFunction(()=> /Synced/.test(document.getElementById('navAccount').textContent), null, { timeout: 15000 });
  await page.waitForTimeout(2500);  // any follow-up push
  const ups = uploads(fake);
  assert.ok(ups.length >= 1, 'local changes were uploaded');
  ups.forEach(u => {
    assert.equal(u.trips.length, 1, 'every upload carries the local trip');
    assert.equal(u.tracks.length, 40, 'every upload carries the local tracks');
  });
  assert.equal(fake.db.user_data[0].gear[0].name, 'Local stove');
});

test('sync: an empty cloud copy never wipes a device that still has data, and gets refilled from it', { skip: !playwright }, async t=>{
  const fake = createFakeSupabase({ userId: ME, seed: { userData: {
    gear: [], trips: [], loadouts: [], google_points: [], tracks: [],   // newer, but empty
  } } });
  const page = await launchWithLocalData(t, fake, {
    'waypoints-tracks-v1': bigTracks(2, 50),
    'waypoints-trips-v1': [{ id: 'lt', name: 'Local trip', trackIds: ['local_t0'], gearIds: [], status: 'completed' }],
    'waypoints-gear-v1': [{ id: 'lg', name: 'Local stove', category: 'Cooking', status: 'active', weightGrams: 80, quantity: 1 }],
    'waypoints-last-modified-v1': '1',   // local copy older than the cloud's
  });
  await page.waitForFunction(()=> /Synced/.test(document.getElementById('navAccount').textContent), null, { timeout: 15000 });
  await page.waitForTimeout(500);
  assert.equal(await text(page, '#statTrips'), '1', 'local trip kept');
  assert.equal(fake.db.user_data[0].trips.length, 1, 'cloud refilled from this device');
  assert.equal(fake.db.user_data[0].gear.length, 1);
});

test('sync: a newer cloud copy with no trips keeps this device\'s trips and uploads them', { skip: !playwright }, async t=>{
  const fake = createFakeSupabase({ userId: ME, seed: { userData: {
    gear: [], trips: [], loadouts: [], google_points: [], tracks: bigTracks(1, 20),
  } } });
  const page = await launchWithLocalData(t, fake, {
    'waypoints-tracks-v1': bigTracks(1, 20),
    'waypoints-trips-v1': [{ id: 'lt', name: 'Local trip', trackIds: ['local_t0'], gearIds: [], status: 'completed' }],
    'waypoints-last-modified-v1': '1',
  });
  await page.waitForFunction(()=> /Synced/.test(document.getElementById('navAccount').textContent), null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.click('.nav-tab[data-page="trips"]');
  assert.equal(await text(page, '#tripCompletedGrid .trip-card-name'), 'Local trip');
  assert.equal(fake.db.user_data[0].trips.length, 1, 'trips uploaded again');
  assert.equal(fake.db.user_data[0].tracks.length, 1);
});

test('trip colors: pick a swatch or any color, used on the map and the trip card; Auto goes back', { skip: !playwright }, async t=>{
  const { page, errors } = await launch(t);
  await importHikes(page);
  const editEiger = async ()=>{
    await page.click('.nav-tab[data-page="trips"]');
    await page.click('.trip-card:has-text("Eiger")');
    await page.click('#tripEditBtn');
    await page.waitForSelector('#tripModalOverlay', { state: 'visible' });
  };
  const save = async ()=>{
    await page.click('#tripForm button[type="submit"]');
    await page.waitForSelector('#tripModalOverlay', { state: 'hidden' });
  };
  const cardStroke = ()=> page.$eval('.trip-card-timeline:has-text("Eiger") .trip-card-profile path:last-child', p => p.getAttribute('stroke'));
  const mapLines = color => page.$$eval('#map path.leaflet-interactive', (ps, c) => ps.filter(p => (p.getAttribute('stroke') || '').toLowerCase() === c).length, color);

  await editEiger();
  assert.equal(await page.getAttribute('#tripColorPicker .is-auto', 'aria-checked'), 'true', 'new and untouched trips are automatic');
  await page.click('#tripColorPicker [aria-label="Color 4"]');
  await save();
  await page.click('#backToTripsBtn');
  assert.equal(await cardStroke(), '#1F6FA8');
  await page.click('.nav-tab[data-page="map"]');
  await page.waitForTimeout(200);
  assert.ok(await mapLines('#1f6fa8') >= 1, 'the trip\'s track is drawn in its color');

  await editEiger();
  await page.locator('#tripColorPicker input[type="color"]').fill('#ff8800');
  await save();
  await page.click('#backToTripsBtn');
  assert.equal(await cardStroke(), '#ff8800');

  await editEiger();
  await page.click('#tripColorPicker .is-auto');
  await save();
  await page.click('#backToTripsBtn');
  assert.notEqual(await cardStroke(), '#ff8800');
  assert.deepEqual(errors, []);
});

test('phone map: drag the panel down for a bigger map, tap to cycle sizes, remembered after reload', { skip: !playwright }, async t=>{
  const { page, errors } = await launch(t, { width: 390, height: 844 });
  const mapH = ()=> page.$eval('#map', el => Math.round(el.getBoundingClientRect().height));
  const sheetH = ()=> page.$eval('#mapSheet', el => Math.round(el.getBoundingClientRect().height));
  const before = await mapH();
  const box = await page.locator('#mapSheetHandle').boundingBox();
  // Drag the handle almost to the bottom: the sheet settles on its smallest size.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 500, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);   // the click a drag produces is ignored for a moment
  assert.equal(await sheetH(), 28, 'only the handle is left');
  assert.ok(await mapH() > before + 250, 'the map took the space');
  // Leaflet was told about its new size.
  assert.ok(await page.evaluate(()=> Math.abs(document.querySelector('#map .leaflet-pane').closest('#map').clientHeight - document.getElementById('map').clientHeight) < 2));

  await page.click('#mapSheetHandle');
  assert.equal(await sheetH(), 150, 'a tap opens it to the overview stats');
  await page.click('#mapSheetHandle');
  assert.ok(await sheetH() > 300, 'next tap: half');

  await page.click('#mapSheetHandle');
  const tall = await sheetH();
  await page.reload();
  await page.waitForSelector('.nav-tab');
  assert.equal(await sheetH(), tall, 'size remembered');
  assert.deepEqual(errors, []);
});

test('phone map: tapping the panel handle only resizes it, it never presses what slides under the finger', { skip: !playwright }, async t=>{
  const { page, errors } = await launch(t, { width: 390, height: 844, touch: true });
  const view = ()=> page.textContent('.sidebar .view-toggle:not(#basemapToggle) button.active');
  for(let i = 0; i < 4; i++){
    await page.tap('#mapSheetHandle');
    await page.waitForTimeout(150);
    assert.equal(await view(), 'Tracks', 'tap ' + (i + 1) + ' left the map view alone');
  }
  assert.deepEqual(errors, []);
});

test('Escape closes the dialog on top, one at a time', { skip: !playwright }, async t=>{
  const { page, errors } = await launch(t);
  await page.click('.nav-tab[data-page="trips"]');
  await page.click('#addTripBtn');
  await page.waitForSelector('#tripModalOverlay', { state: 'visible' });
  await page.keyboard.press('Escape');
  await page.waitForSelector('#tripModalOverlay', { state: 'hidden' });
  await page.click('.nav-tab[data-page="gear"]');
  await page.click('#addGearBtnGarage');
  await page.waitForSelector('#catalogBrowseModalOverlay', { state: 'visible' });
  await page.keyboard.press('Escape');
  await page.waitForSelector('#catalogBrowseModalOverlay', { state: 'hidden' });
  await page.click('#addLoadoutBtn');
  await page.waitForSelector('#loadoutModalOverlay', { state: 'visible' });
  await page.keyboard.press('Escape');
  await page.waitForSelector('#loadoutModalOverlay', { state: 'hidden' });
  await page.click('#viewAllGearBtn');
  await page.click('#gearGrid .gear-card [data-action="edit"]');
  await page.waitForSelector('#gearModalOverlay', { state: 'visible' });
  await page.keyboard.press('Escape');
  await page.waitForSelector('#gearModalOverlay', { state: 'hidden' });
  assert.ok(await page.isVisible('#pageGear'), 'still on the Gear Room');
  assert.deepEqual(errors, []);
});

test('gear form: optional fields fold under "More details", which shows what is filled in', { skip: !playwright }, async t=>{
  const { page, errors } = await launch(t, { width: 390, height: 844 });
  await page.click('.nav-tab[data-page="gear"]');
  await page.click('#addGearBtnGarage');
  await page.click('#cbManualBtn');
  await page.waitForSelector('#gearModalOverlay', { state: 'visible' });
  assert.ok(!(await page.$eval('#gearMoreDetails', d => d.open)), 'closed for a new item');
  assert.ok(!(await page.isVisible('#gearPrice')));
  assert.ok(await page.isVisible('#gearWeight'), 'the essentials stay visible');
  await page.fill('#gearName', 'Spork');
  await page.click('#gearMoreDetails summary');
  await page.fill('#gearPrice', '12');
  await page.selectOption('#gearCondition', 'New');
  assert.equal(await page.textContent('#gearMoreDetailsHint'), '€12 · New');
  await page.click('#gearForm button[type="submit"]');
  await page.waitForSelector('#gearModalOverlay', { state: 'hidden' });

  // Editing an item that has details: open, with the summary.
  await page.click('#viewAllGearBtn');
  await page.click('#gearGrid .gear-card:has-text("Spork") [data-action="edit"]');
  await page.waitForSelector('#gearModalOverlay', { state: 'visible' });
  assert.ok(await page.$eval('#gearMoreDetails', d => d.open), 'open when the item has details');
  assert.equal(await page.inputValue('#gearPrice'), '12');
  assert.equal(await page.textContent('#gearMoreDetailsHint'), '€12 · New');
  assert.deepEqual(errors, []);
});

test('packing a trip: gear grouped by category, searchable, "Select all" per category', { skip: !playwright }, async t=>{
  const { page, errors } = await launch(t);
  await importHikes(page);
  await page.click('.trip-card:has-text("Eiger")');
  await page.click('#tripGearEditBtn');
  await page.waitForSelector('#tripGearModalOverlay', { state: 'visible' });
  const heads = await page.$$eval('#tripGearList .gear-check-cat', els => els.map(e => e.textContent));
  assert.deepEqual(heads, ['Backpack', 'Shelter', 'Sleep system'], 'Gear Room order; wishlist items left out');
  // Select all in Sleep system.
  await page.click('#tripGearList .gear-check-head:has-text("Sleep system") .gear-check-all');
  assert.equal(await page.textContent('#tripGearList .gear-check-head:has-text("Sleep system") .gear-check-count'), '2 of 2');
  assert.equal(await page.textContent('#tripGearList .gear-check-head:has-text("Sleep system") .gear-check-all'), 'Clear');
  assert.match(await page.textContent('#tripGearWeightSummary'), /2 items · 1\.0 kg/);
  // Search narrows the list; headings without matches hide.
  await page.fill('#tripGearList .gear-check-search', 'exos');
  assert.equal(await page.locator('#tripGearList .trip-gear-row:visible').count(), 1);
  assert.equal(await page.locator('#tripGearList .gear-check-head:visible').count(), 1);
  await page.check('#tripGearList .trip-gear-row:visible input');
  await page.fill('#tripGearList .gear-check-search', '');
  assert.equal(await page.locator('#tripGearList .trip-gear-row:visible').count(), 4);
  await page.click('#tripGearSaveBtn');
  await page.waitForSelector('#tripGearModalOverlay', { state: 'hidden' });
  assert.equal(await page.textContent('#tripStatGearCount'), '3');
  assert.deepEqual(errors, []);
});

test('backup: download everything, restore it on an empty device; a wrong file is refused', { skip: !playwright }, async t=>{
  const first = await launch(t);
  await importHikes(first.page);
  await first.page.click('.nav-tab[data-page="settings"]');
  const [download] = await Promise.all([first.page.waitForEvent('download'), first.page.click('#backupDownloadBtn')]);
  assert.match(download.suggestedFilename(), /^hike-in-one-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.kind, 'hike-in-one-backup');
  assert.equal(saved.trips.length, 2);
  assert.equal(saved.gear.length, 5);
  assert.match(await first.page.textContent('#backupStatus'), /Backup saved: 2 trips, 2 tracks, 5 gear items, 0 loadouts/);
  assert.deepEqual(first.errors, []);

  // A fresh device: no trips. A wrong file first, then the backup.
  const second = await launch(t);
  const page = second.page;
  await page.click('.nav-tab[data-page="settings"]');
  await page.setInputFiles('#backupRestoreInput', { name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  assert.match(await page.textContent('#backupStatus'), /isn't a Hike-in-one backup/);
  assert.ok(!(await page.isVisible('#backupConfirm')));
  await page.setInputFiles('#backupRestoreInput', file);
  await page.waitForSelector('#backupConfirm', { state: 'visible' });
  assert.match(await page.textContent('#backupConfirmText'), /has 2 trips, 2 tracks, 5 gear items, 0 loadouts\. Restoring replaces everything on this device\./);
  await page.click('#backupConfirmBtn');
  await page.waitForFunction(()=> /Restored/.test(document.getElementById('backupStatus').textContent));
  await page.click('.nav-tab[data-page="trips"]');
  assert.equal(await page.locator('#tripCompletedGrid .trip-card').count(), 2);
  await page.click('.nav-tab[data-page="map"]');
  assert.equal(await text(page, '#statTrips'), '2');
  assert.deepEqual(second.errors, []);
});

test('getting started: three steps on a new device, ticked off as they are done, can be hidden', { skip: !playwright }, async t=>{
  const { page, errors } = await launch(t);
  // This launch seeds gear, so "Add gear" is already done; imports are not.
  assert.ok(await page.isVisible('#gettingStarted'));
  assert.ok(await page.$eval('#gsGear', li => li.classList.contains('is-done')));
  assert.ok(!(await page.$eval('#gsImport', li => li.classList.contains('is-done'))));
  await importHikes(page);
  await page.click('.nav-tab[data-page="map"]');
  assert.ok(await page.$eval('#gsImport', li => li.classList.contains('is-done')), 'import ticked off');
  if(await page.isVisible('#gettingStarted')){
    await page.click('#gsDismiss');
    assert.ok(!(await page.isVisible('#gettingStarted')));
    await page.reload();
    await page.waitForSelector('.nav-tab');
    assert.ok(!(await page.isVisible('#gettingStarted')), 'stays hidden');
  }
  assert.deepEqual(errors, []);
});

test('track editor: trim with undo, split, join, rename, download GPX and delete', { skip: !playwright }, async t=>{
  const { page, errors } = await launch(t);
  await importHikes(page);
  await page.click('.trip-card-timeline:has-text("Eiger trail")');
  await page.waitForSelector('#tripDetailView', { state: 'visible' });
  const rows = () => page.$$eval('#tripTrackList .trip-track-row', els => els.map(e => e.textContent));
  const setRange = (sel, v) => page.$eval(sel, (el, v)=>{ el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  const before = (await rows())[0];
  assert.match(before, /4\.3 km/);

  // Trim: cut the first 20 of 40 points.
  await page.click('.track-edit-btn');
  await page.waitForSelector('#trackEditModalOverlay', { state: 'visible' });
  assert.equal(await page.inputValue('#teName'), 'Eiger trail');
  await setRange('#teTrimStart', 20);
  assert.match(await text(page, '#teSummary'), /After trimming: 2\.1 km · ↑ 2\d\d m/);
  assert.match(await text(page, '#teTrimStartVal'), /2\.2 km · \d\d:\d\d/);
  await page.click('#teSaveBtn');
  await page.waitForSelector('#trackEditModalOverlay', { state: 'hidden' });
  assert.match((await rows())[0], /2\.1 km/);
  assert.match(await text(page, '#tripStatClimb'), /^2\d\d$/);
  // Undo puts it back.
  await page.click('#globalToast .toast-action');
  await page.waitForFunction(()=> /4\.3 km/.test(document.querySelector('#tripTrackList .trip-track-row').textContent));

  // Split in the middle: the second part joins the same trip.
  await page.click('.track-edit-btn');
  await page.click('.te-tab[data-tab="split"]');
  await setRange('#teSplitAt', 25);
  await page.click('#teSplitBtn');
  await page.waitForFunction(()=> document.querySelectorAll('#tripTrackList .trip-track-row').length === 2);
  const parts = await rows();
  assert.match(parts[0], /Eiger trail.*2\.8 km/);
  assert.match(parts[1], /Eiger trail \(part 2\).*1\.6 km/);

  // Join them back together (the other part is offered first, being closest in time).
  await page.click('.track-edit-btn >> nth=1');
  await page.click('.te-tab[data-tab="join"]');
  assert.match(await page.$eval('#teJoinSelect option:checked', o => o.textContent), /^Eiger trail ·/);
  await page.click('#teJoinBtn');
  await page.waitForFunction(()=> document.querySelectorAll('#tripTrackList .trip-track-row').length === 1);
  assert.match((await rows())[0], /Eiger trail \(part 2\).*4\.3 km/);
  assert.match(await text(page, '#tripStatClimb'), /^600$/);

  // Rename, change the activity, and download it as GPX.
  await page.click('.track-edit-btn');
  await page.fill('#teName', 'Eiger & back');
  await page.fill('#teSport', 'Trail run');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#teDownloadBtn')]);
  assert.equal(download.suggestedFilename(), 'Eiger & back.gpx');
  const file = fs.readFileSync(await download.path(), 'utf8');
  assert.match(file, /<name>Eiger &amp; back<\/name>/);
  assert.match(file, /<type>Trail run<\/type>/);
  assert.equal((file.match(/<trkpt /g) || []).length, 41, 'both parts, sharing the split point');
  assert.match(file, /<ele>1600<\/ele><time>2025-07-10T08:39:00.000Z<\/time>/);
  await page.click('#teSaveBtn');
  await page.waitForFunction(()=> /Eiger & back.*Trail run/.test(document.querySelector('#tripTrackList .trip-track-row').textContent));

  // The map popup opens the same editor.
  await page.click('.nav-tab[data-page="map"]');
  await page.evaluate(()=> trackLayerGroup.getLayers()[0].openPopup());
  await page.click('.popup-track-edit');
  await page.waitForSelector('#trackEditModalOverlay', { state: 'visible' });

  // Delete, then Undo brings it back.
  const count = () => page.evaluate(()=> tracks.length);
  assert.equal(await count(), 2);
  await page.click('#teDeleteBtn');
  await page.waitForFunction(()=> tracks.length === 1);
  await page.click('#globalToast .toast-action');
  await page.waitForFunction(()=> tracks.length === 2);
  assert.deepEqual(errors, []);
});

test('route planner: draw a route on trails and straight lines, save it to a planned trip, download GPX', { skip: !playwright }, async t=>{
  const { page, errors } = await launch(t);
  // Fake BRouter: a three-point line between the two points, climbing
  // 100 m; "no route" while failRouting is set. Fake Open-Meteo: 1500 m.
  let failRouting = false, routerCalls = 0, elevationCalls = 0;
  await page.context().route(/brouter\.de/, r=>{
    routerCalls++;
    if(failRouting) return r.fulfill({ status: 400, body: 'target island detected' });
    const [[lon1, lat1], [lon2, lat2]] = new URL(r.request().url()).searchParams.get('lonlats').split('|').map(s => s.split(',').map(Number));
    const coords = [[lon1, lat1, 1400], [(lon1 + lon2) / 2 + 0.001, (lat1 + lat2) / 2, 1450], [lon2, lat2, 1500]];
    r.fulfill({ status: 200, contentType: 'application/geo+json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] }) });
  });
  await page.context().route(/api\.open-meteo\.com/, r=>{
    elevationCalls++;
    const n = new URL(r.request().url()).searchParams.get('latitude').split(',').length;
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ elevation: Array(n).fill(1500) }) });
  });

  await page.click('.nav-tab[data-page="trips"]');
  await page.click('#addTripBtn');
  await page.fill('#tripName', 'Haute Route');
  await page.fill('#tripDate', isoInDays(20));
  await page.click('#tripForm button[type="submit"]');
  await page.click('#nextTripCard');
  await page.waitForSelector('#tripDetailView', { state: 'visible' });
  await page.click('#tripPlanRouteBtn');
  await page.waitForSelector('#routePlannerOverlay', { state: 'visible' });
  assert.equal(await page.inputValue('#rpName'), 'Haute Route');
  assert.ok(await page.isDisabled('#rpSaveBtn'), 'nothing to save yet');
  await page.evaluate(()=> rpMap.setView([46.0, 7.5], 13, { animate: false }));

  const tap = (x, y) => page.click('#rpMap', { position: { x, y } });
  await tap(150, 300);
  await tap(350, 200);   // follows trails
  await page.waitForFunction(()=> /km ·/.test(document.getElementById('rpStats').textContent));
  assert.equal(routerCalls, 1);
  await page.click('#rpModeToggle [data-mode="line"]');
  await tap(550, 250);   // a straight line, elevation from Open-Meteo
  await page.waitForFunction(()=> /km · ↑ 100 m · ↓ 0 m · about \d+ (h|min)/.test(document.getElementById('rpStats').textContent));
  assert.equal(elevationCalls, 1);
  assert.equal(await page.locator('#rpProfile .ele-profile').count(), 1);

  // No trail between two points: a straight line instead, and a note.
  failRouting = true;
  await page.click('#rpModeToggle [data-mode="trail"]');
  await tap(600, 400);
  await page.waitForFunction(()=> /No trail found for one part/.test(document.getElementById('rpError').textContent));
  await page.click('#rpUndoBtn');
  await page.waitForFunction(()=> document.getElementById('rpError').textContent === '');
  assert.equal(await page.locator('#rpMap .rp-wp').count(), 3);

  // Download it, then save it to the trip.
  await page.fill('#rpName', 'Haute Route day 1');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#rpDownloadBtn')]);
  assert.equal(download.suggestedFilename(), 'Haute Route day 1.gpx');
  const file = fs.readFileSync(await download.path(), 'utf8');
  assert.match(file, /<name>Haute Route day 1<\/name>/);
  assert.match(file, /<trkpt lat="[\d.]+" lon="[\d.]+"><ele>1400<\/ele><\/trkpt>/);
  await page.click('#rpSaveBtn');
  await page.waitForSelector('#routePlannerOverlay', { state: 'hidden' });
  await page.waitForSelector('#tripTrackList .trip-track-row');
  assert.match(await text(page, '#tripTrackList .trip-track-row'), /Haute Route day 1Planned route/);
  assert.match(await text(page, '#tripTrackList .track-climb'), /↑ 100 m · ↓ 0 m · about .* walking/);
  assert.equal(await text(page, '#tripDetailStatusBadge'), 'Planned', 'a planned route does not complete the trip');
  assert.notEqual(await text(page, '#tripStatDistance'), '0.0', 'the trip shows the planned distance');
  await page.click('.nav-tab[data-page="map"]');
  assert.equal(await text(page, '#statDistance'), '0', 'not counted as walked');

  // Reopen it from the trip: same points, can be changed or deleted.
  await page.click('.nav-tab[data-page="trips"]');
  assert.match(await text(page, '#nextTripMeta'), /km/, 'the countdown card shows the planned distance');
  await page.click('#nextTripCard');
  await page.click('.track-edit-btn');
  await page.waitForSelector('#routePlannerOverlay', { state: 'visible' });
  assert.equal(await text(page, '#rpTitle'), 'Edit planned route');
  assert.equal(await page.locator('#rpMap .rp-wp').count(), 3);
  await page.waitForFunction(()=> !document.getElementById('rpSaveBtn').disabled);
  await page.click('#rpDeleteBtn');
  await page.waitForFunction(()=> tracks.length === 0);
  assert.match(await text(page, '#tripTrackList'), /No tracks yet/);
  assert.deepEqual(errors, []);
});
