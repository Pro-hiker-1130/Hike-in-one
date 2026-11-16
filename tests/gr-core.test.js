// Unit tests for GR routes: recognising them, reading Waymarked Trails'
// answers, and how much of a route has been walked.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../gr-core.js');
const part = require('./fixtures/wmt-gr561-part.json');       // a real answer, trimmed
const umbrella = require('./fixtures/wmt-gr5-umbrella.json'); // "all of GR 5"

test('isGrRef: GR routes, not local loops, GR de Pays or E-paths', () => {
  for(const r of ['GR 5', 'GR5', 'GR 20', 'GR 561', 'GR 10F', 'GR-10', 'GR 57 P1', 'GR 126 L6']) assert.ok(G.isGrRef(r), r);
  for(const r of ['Gr1', 'gr 131A', 'GRP 563', 'GRT SMA', 'GRT-LRE-P2', 'E2', 'LAW 1-3', '', null]) assert.ok(!G.isGrRef(r), String(r));
});

test('which listed routes count: real ones from Waymarked Trails around Maastricht, Brussels and the Ardennes', () => {
  const counts = r => G.isGrMainRoute(r);
  // Main GR routes and their sections.
  for(const r of [
    { group: 'NAT', ref: 'GR 561', name: 'GR 561 Kempen - Maaspad' },
    { group: 'NAT', ref: 'GR 5', name: 'GR 5 België, Vlaanderen' },
    { group: 'INT', ref: 'GR 5' },
    { group: 'NAT', ref: 'GR 57 P1', name: "GR 57 Sentier de l'Ourthe Parcours principal" },
    { group: 'INT', ref: 'GR 12', name: 'GR 12 Vlaanderen, Bruxelles - Braine-le-Château' },
  ]) assert.ok(counts(r), JSON.stringify(r));
  // Local loops, GR de Pays, and side branches: variants, link paths, detours.
  for(const r of [
    { group: 'LOC', ref: 'Gr1', name: 'Eijsden-Margraten Gr1 Historische Bronkroute' },
    { group: 'LOC', ref: 'GR 5', name: 'GR 5 - Variante Kastelberg' },
    { group: 'REG', ref: 'GRP 563', name: 'GRP 563 Tour du Pays de Herve' },
    { group: 'NAT', ref: 'GR 5', name: 'GR 5 Variant Maastricht (Hoge Fronten)' },
    { group: 'NAT', ref: 'GR 126 L6', name: 'GR 126 Liaison vers GR 128 Brussegem' },
    { group: 'NAT', ref: 'GR 57 V1', name: 'GR 57 Variante Hérou' },
    { group: 'NAT', ref: 'GR 5', name: 'GR 5 Belgie, Vlaanderen Noord (deviation breeding season)' },
    { group: 'NAT', ref: 'GR 12', name: 'GR 12 Connection GR 512' },
  ]) assert.ok(!counts(r), JSON.stringify(r));
  // Side branches are still shown on the map; local loops are not.
  assert.ok(G.isGrListing({ group: 'NAT', ref: 'GR 5', name: 'GR 5 Variant Maastricht (Hoge Fronten)' }));
  assert.ok(!G.isGrListing({ group: 'LOC', ref: 'Gr1' }));
});

test('refFromName reads the GR number of a section mapped without a ref', () => {
  assert.equal(G.refFromName('GR 12 Vlaanderen, Bergen op Zoom - Bruxelles'), 'GR 12');
  assert.equal(G.refFromName('GR 57 Sentier'), 'GR 57');
  assert.equal(G.refFromName('Floris V-pad - 01'), '');
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

test('detailsToRoutes splits an umbrella relation into its GR sections', () => {
  // Shaped like Waymarked Trails' answer for "GR 12 … all variants":
  // route > section relations > linear parts > ways (Web Mercator).
  const way = (lat0) => ({ geometry: { type: 'LineString', coordinates: [G.latLonToMerc(lat0, 4.35), G.latLonToMerc(lat0 + 0.01, 4.35)] } });
  const d = { type: 'relation', id: 1, ref: 'GR 12', group: 'NAT', name: 'GR 12 all variants',
    route: { route_type: 'route', length: 5000, main: [
      { route_type: 'route', id: 2, length: 2200, main: [{ route_type: 'linear', length: 2200, ways: [way(50.80), way(50.81)] }] },
      { route_type: 'route', id: 3, length: 1100, main: [{ route_type: 'linear', length: 1100, ways: [way(50.90)] }] },
      { route_type: 'route', id: 4, length: 900, main: [{ route_type: 'linear', length: 900, ways: [way(51.00)] }] },
      { route_type: 'route', id: 5, length: 1100, main: [{ route_type: 'linear', length: 1100, ways: [way(51.10)] }] },
    ] },
    subroutes: {
      2: { ref: 'GR 12', name: 'GR 12 Vlaanderen, Bruxelles - Braine-le-Château', group: 'INT' },
      3: { ref: null, name: 'GR 12 Vlaanderen, Bergen op Zoom - Bruxelles', group: 'INT' },
      4: { ref: null, name: 'GR 12 Variant West', group: 'NAT' },
      5: { ref: 'LAW 1-3', name: 'Floris V-pad - 01', group: 'NAT' },
    } };
  const secs = G.detailsToRoutes(d);
  assert.deepEqual(secs.map(x => x.id), [2, 3, 4, 5]);
  const byId = Object.fromEntries(secs.map(x => [x.id, x]));
  assert.equal(byId[2].lines.length, 1, 'its two ways joined');
  assert.ok(Math.abs(byId[2].lengthKm - 2.2) < 1e-9);
  assert.equal(byId[3].ref, 'GR 12', 'GR number read from the name');
  assert.deepEqual(secs.filter(x => x.main).map(x => x.id), [2, 3], 'the variant and the Dutch LAW section do not count');
  assert.ok(byId[4].listed && !byId[5].listed, 'the variant is drawn, the LAW section is not');
  assert.ok(byId[2].bbox[0] < 50.81 && byId[2].bbox[2] > 50.81);
  assert.equal(G.detailsToRoute(d), null, 'not a single route');
  assert.equal(G.detailsToRoute(umbrella), null);
  assert.deepEqual(G.detailsToRoutes(null), []);
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
