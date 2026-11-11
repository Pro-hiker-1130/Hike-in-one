// Unit tests for GR routes: recognising them, reading Waymarked Trails'
// answers, and how much of a route has been walked.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../gr-core.js');
const part = require('./fixtures/wmt-gr561-part.json');       // a real answer, trimmed
const umbrella = require('./fixtures/wmt-gr5-umbrella.json'); // "all of GR 5"

test('isGrRef: GR routes, not GR de Pays or E-paths', () => {
  for(const r of ['GR 5', 'GR5', 'GR 20', 'GR 561', 'gr 131A', 'GR-10']) assert.ok(G.isGrRef(r), r);
  for(const r of ['GRP 563', 'GRT', 'E2', 'BVW', '', null, 'LF 5']) assert.ok(!G.isGrRef(r), String(r));
});

test('Web Mercator to lat/lon and back', () => {
  const [lat, lon] = G.mercToLatLon(G.latLonToMerc(50.85, 4.35));
  assert.ok(Math.abs(lat - 50.85) < 1e-6 && Math.abs(lon - 4.35) < 1e-6);
});

test('detailsToRoute reads a real answer into simplified lat/lon lines', () => {
  const r = G.detailsToRoute(part);
  assert.equal(r.id, 144503);
  assert.equal(r.ref, 'GR 561');
  assert.equal(r.name, 'GR 561 Kempen - Maaspad');
  assert.ok(Math.abs(r.lengthKm - 223.058) < 0.01, 'the official length');
  assert.ok(r.lines.length < 15, 'consecutive ways joined into long lines: ' + r.lines.length);
  const ways = part.route.main[0].ways.length;
  assert.equal(ways, 60);
  const [lat, lon] = r.lines[0][0];
  assert.ok(lat > 50 && lat < 52 && lon > 4 && lon < 6, 'in Belgium: ' + lat + ',' + lon);
  // Thinned to ~25 m (only where two ways meet can points sit closer).
  let gaps = 0, close = 0;
  r.lines.forEach(l => { for(let i = 1; i < l.length - 1; i++){ gaps++; if(G.metres(l[i-1], l[i]) < 25) close++; } });
  assert.ok(close / gaps < 0.15, close + ' of ' + gaps + ' gaps under 25 m');
});

test('detailsToRoute skips an umbrella relation (its sections come on their own)', () => {
  assert.equal(G.detailsToRoute(umbrella), null);
  assert.equal(G.detailsToRoute(null), null);
});

test('coverage: walked part within 60 m, the rest not, gaps in a recording ignored', () => {
  // A 10 km route straight north.
  const line = [];
  for(let i = 0; i <= 100; i++) line.push([46 + i * 0.0009, 7.5]);
  const route = { lengthKm: G.lineKm(line), lines: [line] };
  // Walked the first ~4 km, 30 m beside the route.
  const walked = [];
  for(let i = 0; i <= 40; i++) walked.push([46 + i * 0.0009, 7.5 + 0.0004]);
  const c = G.coverage(route, [walked]);
  assert.ok(Math.abs(c.pct - 40) < 2, c.pct);
  assert.ok(Math.abs(c.walkedKm - 4) < 0.2, c.walkedKm);
  // 200 m away doesn't count.
  const far = walked.map(([la, lo]) => [la, lo + 0.003]);
  assert.equal(G.coverage(route, [far]).walkedKm, 0);
  // A recording that jumps 10 km in one step (GPS off in a car) isn't walking.
  assert.equal(G.coverage(route, [[[46, 7.5], [46.09, 7.5]]]).walkedKm, 0);
});

test('tilesFor gives each tile once, with its box in metres', () => {
  const tiles = G.tilesFor([[[50.85, 4.35], [50.851, 4.351]], [[50.85, 4.35]]], 10);
  assert.equal(tiles.length, 1);
  const [x0, y0, x1, y1] = tiles[0].bbox;
  const [mx, my] = G.latLonToMerc(50.85, 4.35);
  assert.ok(x0 <= mx && mx <= x1 && y0 <= my && my <= y1);
  assert.ok(Math.abs((x1 - x0) - 39136) < 2, 'a zoom-10 tile is ~39 km');
});
