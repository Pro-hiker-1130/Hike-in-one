// Unit tests for track editing (trim, split, join, GPX export).
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../track-core.js');

const START = Date.parse('2025-07-01T08:00:00Z');

// A straight walk north: n points ~111 m apart, climbing 10 m per point
// for the first half and descending after, one point a minute.
function makeTrack(n, extra){
  const points = [], pointEle = [], pointTimes = [];
  for(let i=0;i<n;i++){
    points.push([46 + i*0.001, 7.5]);
    pointEle.push(i < n/2 ? 1000 + i*10 : 1000 + (n-i)*10);
    pointTimes.push(i*60);
  }
  return T.buildTrack(Object.assign({ id: 't_a', name: 'Ridge walk', sport: 'Hike', date: '2025-07-01', sourceKey: 'k1', countries: ['CH'] }, extra || {}),
    { points, ele: pointEle, t: pointTimes.map(s => START + s*1000) });
}

test('sampleIndices keeps the first and the last point', () => {
  assert.deepEqual(T.sampleIndices(5, 10), [0,1,2,3,4]);
  const idx = T.sampleIndices(10001, 1500);
  assert.equal(idx[0], 0);
  assert.equal(idx[idx.length-1], 10000);
  assert.ok(idx.length <= 1500);
});

test('buildTrack derives distance, climb, profile, duration and date', () => {
  const t = makeTrack(101);
  assert.ok(Math.abs(t.distanceKm - 11.1) < 0.1, t.distanceKm);
  assert.equal(t.elevationGainM, 500);
  assert.equal(t.elevationLossM, 490);
  assert.equal(t.maxEleM, 1500);
  assert.equal(t.durationSec, 100*60);
  assert.equal(t.startTime, START);
  assert.equal(t.date, '2025-07-01');
  assert.equal(t.pointEle.length, 101);
  assert.equal(t.pointTimes[100], 6000);
  assert.ok(t.profile.length > 1);
  assert.equal(t.countries, undefined, 'countries are recomputed by the app');
});

test('trim keeps the chosen range and recomputes everything', () => {
  const t = makeTrack(101);
  const out = T.trim(t, 10, 50);
  assert.equal(out.id, 't_a');
  assert.equal(out.points.length, 41);
  assert.deepEqual(out.points[0], t.points[10]);
  assert.ok(Math.abs(out.distanceKm - 4.45) < 0.05, out.distanceKm);
  assert.equal(out.elevationGainM, 400);
  assert.equal(out.durationSec, 40*60);
  assert.equal(out.startTime, START + 10*60*1000);
  assert.equal(out.pointTimes[0], 0);
  assert.throws(() => T.trim(t, 5, 5));
});

test('trim of the whole range changes nothing', () => {
  const t = makeTrack(20);
  assert.deepEqual(T.trim(t, 0, 19), t);
});

test('split makes two tracks that meet at the split point', () => {
  const t = makeTrack(101);
  const [a, b] = T.split(t, 50, 't_b');
  assert.equal(a.id, 't_a');
  assert.equal(b.id, 't_b');
  assert.equal(b.sourceKey, null, 'only one part keeps the duplicate-import key');
  assert.equal(b.name, 'Ridge walk (part 2)');
  assert.deepEqual(a.points[a.points.length-1], b.points[0]);
  assert.ok(Math.abs(a.distanceKm + b.distanceKm - t.distanceKm) < 1e-9);
  assert.equal(a.durationSec + b.durationSec, t.durationSec);
  assert.equal(b.startTime, START + 50*60*1000);
  assert.throws(() => T.split(t, 0, 'x'));
  assert.throws(() => T.split(t, 100, 'x'));
});

test('merge joins in time order and adds the durations', () => {
  const t = makeTrack(101);
  const [a, b] = T.split(t, 50, 't_b');
  // Given in the wrong order: still comes out in time order, with the
  // first argument's id and name.
  const m = T.merge(b, a);
  assert.equal(m.id, 't_b');
  assert.equal(m.name, 'Ridge walk (part 2)');
  assert.deepEqual(m.points[0], t.points[0]);
  assert.equal(m.startTime, START);
  assert.equal(m.durationSec, t.durationSec);
  assert.equal(m.elevationGainM, 500);
  assert.equal(m.points.length, 102); // the shared split point twice
});

test('merge across days keeps the earlier date and skips the night', () => {
  const day1 = makeTrack(30);
  const day2 = T.buildTrack({ id: 't_2', name: 'Day 2', date: '2025-07-02' },
    { points: [[47,7.5],[47.01,7.5]], ele: null, t: [START+86400000, START+86400000+3600000] });
  const m = T.merge(day1, day2);
  assert.equal(m.date, '2025-07-01');
  assert.equal(m.durationSec, day1.durationSec + 3600);
  // Elevation only known for the first day: stats still come from it.
  assert.equal(m.maxEleM, day1.maxEleM);
  assert.equal(m.pointEle[m.pointEle.length-1], null);
});

test('older tracks: elevation read from the profile, duration unknown after edits', () => {
  // Imported before per-point data existed: no pointEle / pointTimes.
  const points = [], profile = [];
  for(let i=0;i<11;i++){ points.push([46 + i*0.01, 7.5]); profile.push([+(i*1.112).toFixed(3), 1000 + i*50]); }
  const old = { id: 't_old', name: 'Old', date: '2020-05-05', startTime: Date.parse('2020-05-05T09:00:00Z'),
    points, profile, distanceKm: 11.12, elevationGainM: 500, elevationLossM: 0, durationSec: 7200 };
  const s = T.trackSeries(old);
  assert.equal(s.t, null);
  assert.ok(Math.abs(s.ele[5] - 1250) < 2, s.ele[5]);
  const out = T.trim(old, 0, 5);
  assert.ok(Math.abs(out.elevationGainM - 250) <= 2, out.elevationGainM);
  assert.equal(out.durationSec, null);
  assert.equal(out.date, '2020-05-05');
  assert.equal(out.startTime, null);
});

test('tracks without any elevation stay without', () => {
  const t = T.buildTrack({ id: 'x', name: 'Flat' }, { points: [[1,1],[1,1.01],[1,1.02]], ele: null, t: null });
  assert.equal(t.elevationGainM, null);
  assert.equal(t.profile, null);
  assert.equal(t.pointEle, null);
  const [a] = T.split(t, 1, 'y');
  assert.equal(a.points.length, 2);
});

test('toGpx writes points with elevation and time, escaped names', () => {
  const t = makeTrack(3, { name: 'Tom & Jerry <loop>' });
  const gpx = T.toGpx(t);
  assert.match(gpx, /^<\?xml version="1.0"/);
  assert.match(gpx, /<name>Tom &amp; Jerry &lt;loop&gt;<\/name>/);
  assert.match(gpx, /<type>Hike<\/type>/);
  assert.equal((gpx.match(/<trkpt /g) || []).length, 3);
  assert.match(gpx, /<trkpt lat="46" lon="7.5"><ele>1000<\/ele><time>2025-07-01T08:00:00.000Z<\/time><\/trkpt>/);
  assert.equal(T.gpxFileName({ name: 'a/b: c?' }), 'a b c .gpx'.replace('c .', 'c.'));
});

test('route planning: straight lines get evenly spaced points for elevation', () => {
  const pts = T.densifyLine([46, 7.5], [46.01, 7.5], 0.05, 100);
  assert.equal(pts.length, 24);           // 1.11 km in ~50 m steps
  assert.deepEqual(pts[0], [46, 7.5]);
  assert.deepEqual(pts[pts.length-1], [46.01, 7.5]);
  assert.equal(T.densifyLine([46, 7.5], [47, 7.5], 0.05, 100).length, 100, 'capped');
  assert.equal(T.densifyLine([46, 7.5], [46, 7.5]).length, 2);
});

test('route planning: segments join without doubling the shared point', () => {
  const j = T.joinSegments([
    { points: [[46,7],[46.01,7]], ele: [1000, 1100] },
    { points: [[46.01,7],[46.02,7]], ele: null },
    { points: [[46.02,7],[46.03,7]], ele: [1200, 1300] },
  ]);
  assert.equal(j.points.length, 4);
  assert.deepEqual(j.ele, [1000, 1100, 1200, 1300]);
  const t = T.buildTrack({ id: 'r', name: 'Plan', planned: true }, j);
  assert.equal(t.elevationGainM, 300);
  assert.equal(t.planned, true);
  assert.equal(T.joinSegments([{ points: [[1,1],[1,2]], ele: null }]).ele, null);
});

test('route planning: BRouter answers and the walking-time rule', () => {
  const geo = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString',
    coordinates: [[7.6, 46.6, 1500], [7.61, 46.61, 1580.5]] } }] };
  assert.deepEqual(T.parseBrouter(geo), { points: [[46.6, 7.6], [46.61, 7.61]], ele: [1500, 1580.5] });
  assert.equal(T.parseBrouter({ features: [] }), null);
  assert.equal(T.estimateHikingSec(12, 600), 4*3600);   // 3 h walking + 1 h climbing
  assert.equal(T.estimateHikingSec(0, 0), 0);
});

test('sunTimes matches published times within a few minutes', () => {
  // London, midsummer 2025: sunrise 03:43 UTC, sunset 20:21 UTC.
  const s = T.sunTimes('2025-06-21', 51.5074, -0.1278);
  const near = (ms, iso) => Math.abs(ms - Date.parse(iso)) < 4 * 60000;
  assert.ok(near(s.sunrise, '2025-06-21T03:43:00Z'), new Date(s.sunrise).toISOString());
  assert.ok(near(s.sunset, '2025-06-21T20:21:00Z'), new Date(s.sunset).toISOString());
  // Sydney, east of Greenwich and southern winter: sunrise 07:00 local (20:59 UTC the day before).
  const sy = T.sunTimes('2025-06-21', -33.8688, 151.2093);
  assert.ok(near(sy.sunrise, '2025-06-20T21:00:00Z'), new Date(sy.sunrise).toISOString());
});

test('sunTimes reports midnight sun, polar night and bad input', () => {
  assert.deepEqual(T.sunTimes('2025-06-21', 69.65, 18.96), { polar: 'day' });
  assert.deepEqual(T.sunTimes('2025-12-21', 69.65, 18.96), { polar: 'night' });
  assert.equal(T.sunTimes('', 46, 7), null);
  assert.equal(T.sunTimes('2025-06-21', NaN, 7), null);
});

test('terrainSummary finds the steepest climb and descent, the top and time above a line', () => {
  // 0–2 km: gentle 5 % to 1100 m; 2–3 km: steep 30 % to 1400 m; 3–5 km: down 10 % to 1200 m.
  const profile = [[0, 1000], [2, 1100], [3, 1400], [5, 1200]];
  const s = T.terrainSummary(profile, 0.5);
  assert.equal(s.steepestUpPct, 30);
  assert.ok(s.steepestUpAtKm >= 2 && s.steepestUpAtKm <= 2.5, String(s.steepestUpAtKm));
  assert.equal(s.steepestDownPct, 10);
  assert.equal(s.highestM, 1400);
  assert.equal(s.highestAtKm, 3);
  // The line is 1000 m (highest 500 below 1300), but the start is at 1000 m: no line.
  assert.equal(s.aboveM, null);
  const alpine = T.terrainSummary([[0, 1800], [2, 2300], [4, 2300], [6, 1800]], 0.5);
  assert.equal(alpine.aboveM, 2000);
  assert.ok(Math.abs(alpine.aboveKm - 4.4) < 0.15, String(alpine.aboveKm)); // crosses 2000 m at km 0.8 and 5.2
  assert.equal(T.terrainSummary([[0, 100]]), null);
  assert.equal(T.terrainSummary([[0, 100], [0.1, 120]]), null, 'too short to judge');
});

test('splitDays cuts a route into days and folds a short last stretch into the day before', () => {
  const profile = [[0, 1000], [10, 1500], [20, 1200], [32, 1200]];
  const days = T.splitDays(profile, 15);
  assert.deepEqual(days.map(d => [d.fromKm, d.toKm]), [[0, 15], [15, 32]], '2 km left over joins day 2');
  assert.equal(days[0].upM, 500);
  assert.equal(days[0].downM, 150);
  assert.equal(days[1].upM, 0);
  assert.equal(days[1].downM, 150);
  assert.deepEqual(T.splitDays(profile, 10).map(d => d.toKm), [10, 20, 32], 'last 2 km of 10 is under a quarter day');
  assert.deepEqual(T.splitDays(profile, 50).map(d => d.toKm), [32], 'one day');
  assert.deepEqual(T.splitDays(profile, 0), []);
});

test('yearSummary counts one year of walks, its longest, highest and busiest month', () => {
  const list = [
    { name: 'Ridge', date: '2025-07-10', distanceKm: 12, elevationGainM: 900, maxEleM: 2900 },
    { name: 'Lake', date: '2025-07-10', distanceKm: 5, elevationGainM: 100, maxEleM: 1800 },
    { name: 'Long valley', date: '2025-09-02', distanceKm: 15, elevationGainM: 300 },
    { name: 'Plan', date: '2025-10-01', distanceKm: 40, elevationGainM: 3000, maxEleM: 4000, planned: true },
    { name: 'Old', date: '2024-05-05', distanceKm: 8 },
  ];
  const s = T.yearSummary(list, 2025);
  assert.deepEqual(s, {
    year: 2025, count: 3, days: 2, distanceKm: 32, gainM: 1300,
    longest: { name: 'Long valley', distanceKm: 15 },
    highest: { name: 'Ridge', eleM: 2900 },
    busiestMonth: 6,   // July: 17 km
  });
  assert.equal(T.yearSummary(list, 2023), null);
  assert.equal(T.yearSummary(list, 2024).highest, null, 'no elevation that year');
});

test('personalPace compares recorded walks with the standard rule', () => {
  const walk = (km, gain, factor, extra) => Object.assign({ distanceKm: km, elevationGainM: gain,
    durationSec: T.estimateHikingSec(km, gain) * factor }, extra);
  assert.equal(T.personalPace([walk(10, 500, 1.2), walk(8, 300, 1.2)]), null, 'needs 3 walks');
  const p = T.personalPace([walk(10, 500, 1.2), walk(8, 300, 1.3), walk(12, 800, 1.1), walk(1, 0, 3),
    walk(20, 0, 0.1, { planned: true }), { distanceKm: 9, elevationGainM: 100 }]);
  assert.deepEqual(p, { factor: 1.2, walks: 3 }, 'median; short, planned and untimed walks left out');
  assert.equal(T.personalPace([walk(5, 0, 4), walk(6, 0, 5), walk(7, 0, 6)]).factor, 2, 'capped');
});

test('difficulty rates a walk by effort km (distance plus 1 km per 100 m up)', () => {
  assert.deepEqual(T.difficulty(6, 200), { effortKm: 8, level: 'easy' });
  assert.deepEqual(T.difficulty(8, 200), { effortKm: 10, level: 'moderate' });
  assert.deepEqual(T.difficulty(12, 900), { effortKm: 21, level: 'hard' });
  assert.deepEqual(T.difficulty(18, 1500), { effortKm: 33, level: 'strenuous' });
  assert.equal(T.difficulty(0, 500), null);
  assert.deepEqual(T.DIFFICULTY_LEVELS, ['easy', 'moderate', 'hard', 'strenuous']);
});
