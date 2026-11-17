// GR routes (Grande Randonnée / Grote Routepaden): the pure logic behind
// showing them on the planner map and working out how much of each you
// have walked. No DOM and no network here, so it runs unchanged in the
// browser (window.GrCore) and under `node --test`.
//
// The routes come from Waymarked Trails (hiking.waymarkedtrails.org), which
// serves OpenStreetMap's hiking relations: a listing of routes in a box and,
// per route, its ways in Web Mercator metres.
(function(root, factory){
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else root.GrCore = factory();
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  const R = 6378137;           // Web Mercator sphere radius (m)

  // "GR 5", "GR5", "GR 20", "GR 561", "GR 10F", "GR 57 P1" — capital GR
  // only: local loops numbered "Gr1", "Gr2" are not GR routes. Not "GRP 563"
  // (GR de Pays), "GRT" or "E2".
  function isGrRef(ref){
    return /^GR ?-? ?\d+[A-Z]?(\s|$)/.test(String(ref || '').trim());
  }

  // Side branches of a GR: variants, link paths, seasonal detours. Drawn on
  // the map, but not counted as a GR route of their own.
  const SIDE_BRANCH = /\b(variant|variante|varianten|varianti|liaison|liaisons|verbinding|aansluiting|deviation|déviation|omleiding|alternative|alternatief|link|connection|raccordement|enlace|derivación|ramal)\b/i;
  function isGrSideBranch(r){
    const ref = String(r && r.ref || '').trim();
    return / [LV]\d+$/.test(ref) || SIDE_BRANCH.test(String(r && r.name || ''));
  }

  // A route listing entry ({ref, name, group}) that is a GR route to show on
  // the map: international, national or regional, not a local loop.
  function isGrListing(r){
    return !!r && isGrRef(r.ref) && ['INT', 'NAT', 'REG'].includes(r.group);
  }
  // ...and one that counts for "how much of each GR have you walked":
  // the main route, not a side branch.
  function isGrMainRoute(r){
    return isGrListing(r) && !isGrSideBranch(r);
  }

  function mercToLatLon(p){
    return [
      +(Math.atan(Math.exp(p[1] / R)) * 360 / Math.PI - 90).toFixed(6),
      +(p[0] / R * 180 / Math.PI).toFixed(6),
    ];
  }
  function latLonToMerc(lat, lon){
    return [lon * Math.PI / 180 * R, Math.log(Math.tan((90 + lat) * Math.PI / 360)) * R];
  }

  // Short distances in metres (equirectangular; fine at hiking scale).
  function metres(a, b){
    const k = Math.PI / 180;
    const x = (b[1] - a[1]) * k * Math.cos((a[0] + b[0]) / 2 * k);
    const y = (b[0] - a[0]) * k;
    return Math.sqrt(x*x + y*y) * 6371000;
  }

  // Drop points closer than minM to the last kept one (keeps the ends).
  function thin(line, minM){
    if(line.length <= 2) return line.slice();
    const out = [line[0]];
    for(let i = 1; i < line.length - 1; i++) if(metres(out[out.length-1], line[i]) >= minM) out.push(line[i]);
    out.push(line[line.length-1]);
    return out;
  }

  function lineKm(line){
    let m = 0;
    for(let i = 1; i < line.length; i++) m += metres(line[i-1], line[i]);
    return m / 1000;
  }

  // Lines that continue one another joined into long lines (hundreds of
  // short pieces draw slowly), then thinned to ~minM metres.
  function joinLines(lines, minM){
    const joined = [];
    lines.forEach(l=>{
      const last = joined[joined.length-1];
      if(last){
        const end = last[last.length-1];
        if(metres(end, l[0]) < 2){ last.push(...l.slice(1)); return; }
        if(metres(end, l[l.length-1]) < 2){ last.push(...l.slice(0, -1).reverse()); return; }
      }
      joined.push(l.slice());
    });
    return joined.map(l => thin(l, minM || 25));
  }

  // "GR 12" from a name like "GR 12 Vlaanderen, Bruxelles - …", for
  // sections mapped without a ref of their own.
  function refFromName(name){
    const m = /^(GR ?-? ?\d+[A-Z]?)(?=[\s,:–-]|$)/.exec(String(name || '').trim());
    return m ? m[1] : '';
  }

  // A Waymarked Trails details answer as its GR sections: one for a plain
  // route, one per section for an "umbrella" relation (all of GR 12, say,
  // whose sections the area listing doesn't always show on their own).
  // Each is {id, ref, name, group, lengthKm, lines, bbox, listed, main}:
  // lines in [lat, lon]; bbox [south, west, north, east]; listed = a GR
  // route to show on the map; main = one that counts for "walked" (not a
  // variant, link path or detour).
  function detailsToRoutes(d, minM){
    if(!d || !d.route) return [];
    const subs = (d.subroutes && typeof d.subroutes === 'object') ? d.subroutes : {};
    const info = id => id === d.id ? d : (subs[String(id)] || {});
    const owners = new Map();     // relation id -> {lines, length}
    const visit = (node, owner, parentRef) => {
      if(!node) return;
      if(node.id != null && node.id !== owner){
        owner = node.id;
        const i = info(owner);
        parentRef = (i.ref && String(i.ref).trim()) || refFromName(i.name) || parentRef;
        if(!owners.has(owner)) owners.set(owner, { lines: [], length: node.length, ref: parentRef });
      }
      (node.ways || []).forEach(w => {
        const c = w && w.geometry && w.geometry.type === 'LineString' && w.geometry.coordinates;
        if(c && c.length > 1) owners.get(owner).lines.push(c.map(mercToLatLon));
      });
      (node.main || []).forEach(m => visit(m, owner, parentRef));
    };
    const rootRef = (d.ref && String(d.ref).trim()) || refFromName(d.name);
    owners.set(d.id, { lines: [], length: d.route.length, ref: rootRef });
    visit(d.route, d.id, rootRef);
    const out = [];
    owners.forEach((o, id) => {
      if(!o.lines.length) return;
      const i = info(id);
      const lines = joinLines(o.lines, minM);
      const mapped = lines.reduce((sum, l) => sum + lineKm(l), 0);
      let s = 90, w = 180, n = -90, e = -180;
      lines.forEach(l => l.forEach(([la, lo]) => { if(la < s) s = la; if(la > n) n = la; if(lo < w) w = lo; if(lo > e) e = lo; }));
      const r = {
        id, ref: o.ref || '', name: i.name || o.ref || 'GR', group: i.group || d.group || '',
        lengthKm: o.length > 0 ? o.length / 1000 : mapped, lines, bbox: [s, w, n, e],
      };
      r.listed = isGrListing(r);
      r.main = isGrMainRoute(r);
      out.push(r);
    });
    return out;
  }

  // The single-route form, for a plain (non-umbrella) relation.
  function detailsToRoute(d, minM){
    const subs = d && d.subroutes;
    if(subs && typeof subs === 'object' && Object.keys(subs).length) return null;
    const all = detailsToRoutes(d, minM);
    return all.length === 1 ? all[0] : (all.find(r => r.id === (d && d.id)) || null);
  }

  // ---- How much of a route has been walked ----
  // The route is sampled every stepM metres; a sample counts as walked when
  // one of the tracks passes within tolM metres of it.
  const CELL = 0.002;   // degrees: ~150–220 m, comfortably more than tolM

  function segmentIndex(trackLines){
    const grid = new Map();
    const add = (key, seg) => { let l = grid.get(key); if(!l){ l = []; grid.set(key, l); } l.push(seg); };
    trackLines.forEach(pts => {
      for(let i = 1; i < pts.length; i++){
        const a = pts[i-1], b = pts[i];
        // A step of more than 2 km between two recorded points is a gap in
        // the recording (GPS off, a car), not walking.
        if(metres(a, b) > 2000) continue;
        const x0 = Math.floor(Math.min(a[1], b[1]) / CELL), x1 = Math.floor(Math.max(a[1], b[1]) / CELL);
        const y0 = Math.floor(Math.min(a[0], b[0]) / CELL), y1 = Math.floor(Math.max(a[0], b[0]) / CELL);
        for(let x = x0; x <= x1; x++) for(let y = y0; y <= y1; y++) add(x + ':' + y, [a, b]);
      }
    });
    return grid;
  }

  function pointSegMetres(p, a, b){
    const k = Math.PI / 180, c = Math.cos(p[0] * k);
    const ax = (a[1] - p[1]) * c, ay = a[0] - p[0];
    const bx = (b[1] - p[1]) * c, by = b[0] - p[0];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx*dx + dy*dy;
    let t = len2 ? -(ax*dx + ay*dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const x = ax + t*dx, y = ay + t*dy;
    return Math.sqrt(x*x + y*y) * k * 6371000;
  }

  function near(grid, p, tolM){
    const cx = Math.floor(p[1] / CELL), cy = Math.floor(p[0] / CELL);
    for(let x = cx - 1; x <= cx + 1; x++) for(let y = cy - 1; y <= cy + 1; y++){
      const segs = grid.get(x + ':' + y);
      if(segs) for(const s of segs) if(pointSegMetres(p, s[0], s[1]) <= tolM) return true;
    }
    return false;
  }

  // {walkedKm, mappedKm, pct} for one route and a set of tracks (each a
  // list of [lat, lon]). pct is of the route's length.
  function coverage(route, trackLines, opts){
    opts = opts || {};
    const stepM = opts.stepM || 50, tolM = opts.tolM || 60;
    const grid = opts.grid || segmentIndex(trackLines);
    let walkedM = 0, mappedM = 0;
    route.lines.forEach(line => {
      for(let i = 1; i < line.length; i++){
        const a = line[i-1], b = line[i];
        const d = metres(a, b);
        const n = Math.max(1, Math.ceil(d / stepM));
        for(let j = 0; j < n; j++){
          const f = (j + 0.5) / n;
          const p = [a[0] + (b[0]-a[0])*f, a[1] + (b[1]-a[1])*f];
          mappedM += d / n;
          if(near(grid, p, tolM)) walkedM += d / n;
        }
      }
    });
    const mappedKm = mappedM / 1000, walkedKm = walkedM / 1000;
    const total = route.lengthKm > 0 ? Math.max(route.lengthKm, mappedKm) : mappedKm;
    return { walkedKm, mappedKm, pct: total > 0 ? Math.min(100, walkedKm / total * 100) : 0 };
  }

  // ---- Which map tiles to look up ----
  // Web Mercator tiles (zoom z) that the points fall in, each with its box
  // in metres as Waymarked Trails' listing wants it.
  function tilesFor(pointLists, z){
    const n = Math.pow(2, z), seen = new Map();
    pointLists.forEach(pts => pts.forEach(p => {
      const x = Math.floor((p[1] + 180) / 360 * n);
      const lat = p[0] * Math.PI / 180;
      const y = Math.floor((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * n);
      const key = z + '/' + x + '/' + y;
      if(!seen.has(key)){
        const size = 2 * Math.PI * R / n, minX = -Math.PI * R + x * size, maxY = Math.PI * R - y * size;
        seen.set(key, { key, bbox: [minX, maxY - size, minX + size, maxY].map(v => Math.round(v)) });
      }
    }));
    return [...seen.values()];
  }

  // A tile by its "z/x/y" key, with its box in metres.
  function tileFromKey(key){
    const [z, x, y] = key.split('/').map(Number);
    const n = Math.pow(2, z), size = 2 * Math.PI * R / n;
    const minX = -Math.PI * R + x * size, maxY = Math.PI * R - y * size;
    return { key, bbox: [minX, maxY - size, minX + size, maxY].map(v => Math.round(v)) };
  }
  // Its four quarters, one zoom level down.
  function tileChildren(key){
    const [z, x, y] = key.split('/').map(Number);
    return [[0,0],[1,0],[0,1],[1,1]].map(([dx, dy]) => tileFromKey((z+1) + '/' + (2*x+dx) + '/' + (2*y+dy)));
  }

  // The tiles (zoom z) covering a lat/lon box, as tilesFor gives them.
  function tilesInBounds(south, west, north, east, z){
    const pts = [];
    const steps = 6;
    for(let i = 0; i <= steps; i++) for(let j = 0; j <= steps; j++)
      pts.push([south + (north - south) * i / steps, west + (east - west) * j / steps]);
    return tilesFor([pts], z);
  }

  function boundsToMercBox(south, west, north, east){
    const a = latLonToMerc(south, west), b = latLonToMerc(north, east);
    return [a[0], a[1], b[0], b[1]].map(v => Math.round(v));
  }

  return {
    isGrRef, isGrSideBranch, isGrListing, isGrMainRoute, tileFromKey, tileChildren, mercToLatLon, latLonToMerc, metres, thin, lineKm,
    detailsToRoute, detailsToRoutes, refFromName, segmentIndex, coverage, tilesFor, tilesInBounds, boundsToMercBox,
  };
});
