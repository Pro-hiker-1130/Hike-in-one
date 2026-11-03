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
