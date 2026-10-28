// Hike-in-one — Reading activity files: GPX, TCX, FIT, gzip and zip archives (Strava / Garmin exports), plus offline country detection.
// Plain scripts loaded in order by index.html; they share one global scope.
'use strict';

// ---- Activity file readers ----
// Every format is read into the same shape — {name, sport, date, raw}
// where raw is [{ll:[lat,lon], ele, t}] — and trackFromRaw() turns that
// into a stored track, so distance/elevation/duration work identically
// whether the file came from Strava, Garmin or anywhere else.
function parseXml(text, label){
  // Some exported files (notably Strava's .tcx) have whitespace or a BOM
  // before the XML declaration, which strict XML parsing rejects.
  const xml = new DOMParser().parseFromString(text.replace(/^[\s﻿]+/, ''), 'application/xml');
  if(xml.querySelector('parsererror')) throw new Error('Could not read this '+label+' file');
  return xml;
}
function numText(el){ const v = el ? parseFloat(el.textContent) : NaN; return isFinite(v) ? v : null; }
function timeText(el){ const v = el ? Date.parse(el.textContent.trim()) : NaN; return isFinite(v) ? v : null; }

function readGPX(text){
  const xml = parseXml(text, 'GPX');
  let ptEls = Array.from(xml.querySelectorAll('trkpt'));
  if(!ptEls.length) ptEls = Array.from(xml.querySelectorAll('rtept'));
  if(!ptEls.length) ptEls = Array.from(xml.querySelectorAll('wpt'));
  const raw = ptEls.map(p=>{
    const lat=parseFloat(p.getAttribute('lat')), lon=parseFloat(p.getAttribute('lon'));
    if(!(isFinite(lat)&&isFinite(lon))) return null;
    return { ll:[lat,lon], ele: numText(p.querySelector('ele')), t: timeText(p.querySelector('time')) };
  }).filter(Boolean);
  const nameEl = xml.querySelector('trk > name') || xml.querySelector('metadata > name');
  const typeEl = xml.querySelector('trk > type');
  const metaTime = xml.querySelector('metadata > time');
  return {
    name: nameEl ? nameEl.textContent.trim() : null,
    sport: typeEl ? typeEl.textContent.trim() : null,
    date: metaTime ? metaTime.textContent.trim().slice(0,10) : null,
    raw
  };
}

function readTCX(text){
  const xml = parseXml(text, 'TCX');
  const act = xml.querySelector('Activity');
  const raw = Array.from(xml.querySelectorAll('Trackpoint')).map(tp=>{
    const lat = numText(tp.querySelector('LatitudeDegrees')), lon = numText(tp.querySelector('LongitudeDegrees'));
    if(lat == null || lon == null) return null;
    return { ll:[lat,lon], ele: numText(tp.querySelector('AltitudeMeters')), t: timeText(tp.querySelector('Time')) };
  }).filter(Boolean);
  return { name: null, sport: act ? act.getAttribute('Sport') : null, date: null, raw };
}

// FIT is Garmin's binary format (what watches record, and most of a
// Strava export). This reads just what a track needs: record messages
// (position, altitude, timestamp) plus the session's sport.
const FIT_EPOCH_MS = 631065600000; // FIT time 0 = 1989-12-31T00:00:00Z
const FIT_SPORTS = {1:'Run',2:'Ride',5:'Swim',10:'Training',11:'Walk',12:'Nordic ski',13:'Alpine ski',
  14:'Snowboard',16:'Mountaineering',17:'Hike',19:'Paddle',21:'E-bike',31:'Climb',35:'Snowshoe',41:'Kayak'};
function readFIT(buffer){
  const dv = new DataView(buffer);
  if(buffer.byteLength < 14) throw new Error('Not a FIT file');
  const headerSize = dv.getUint8(0);
  const dataEnd = Math.min(buffer.byteLength, headerSize + dv.getUint32(4, true));
  if(dv.getUint32(8, true) !== 0x5449462E) throw new Error('Not a FIT file'); // ".FIT"
  const SEMI = 180 / 2147483648;
  const defs = {};
  const raw = [];
  let pos = headerSize, lastTs = 0, sport = null, fileType = null;

  const read = (p, size, base, little)=>{
    switch(base & 0x1F){
      case 0: case 2: case 10: case 13: return size===1 ? dv.getUint8(p) : null;
      case 1: return size===1 ? dv.getInt8(p) : null;
      case 3: return size===2 ? dv.getInt16(p, little) : null;
      case 4: case 11: return size===2 ? dv.getUint16(p, little) : null;
      case 5: return size===4 ? dv.getInt32(p, little) : null;
      case 6: case 12: return size===4 ? dv.getUint32(p, little) : null;
      default: return null;
    }
  };

  while(pos < dataEnd){
    const hdr = dv.getUint8(pos++);
    let local, ts = null;
    if(hdr & 0x80){                         // compressed-timestamp data message
      local = (hdr >> 5) & 0x03;
      const off = hdr & 0x1F;
      ts = lastTs - (lastTs % 32) + off + (off < lastTs % 32 ? 32 : 0);
      lastTs = ts;
    } else if(hdr & 0x40){                  // definition message
      local = hdr & 0x0F;
      const little = dv.getUint8(pos + 1) === 0;
      const global = dv.getUint16(pos + 2, little);
      const n = dv.getUint8(pos + 4);
      pos += 5;
      const fields = [];
      for(let i=0;i<n;i++){ fields.push([dv.getUint8(pos), dv.getUint8(pos+1), dv.getUint8(pos+2)]); pos += 3; }
      let devSize = 0;
      if(hdr & 0x20){ const nd = dv.getUint8(pos++); for(let i=0;i<nd;i++){ devSize += dv.getUint8(pos+1); pos += 3; } }
      defs[local] = { global, little, fields, devSize };
      continue;
    } else {
      local = hdr & 0x0F;
    }
    const d = defs[local];
    if(!d) throw new Error('Damaged FIT file');
    const v = {};
    let p = pos;
    for(const [num, size, base] of d.fields){
      if(p + size > dataEnd) break;
      if(num === 253 || d.global === 20 || d.global === 18 || d.global === 0) v[num] = read(p, size, base, d.little);
      p += size;
    }
    pos = p + d.devSize;
    if(v[253] != null && v[253] !== 0xFFFFFFFF){ lastTs = v[253]; ts = v[253]; }

    if(d.global === 0 && v[0] != null && fileType == null){
      fileType = v[0];
      if(fileType !== 4) throw new Error('Not an activity (FIT file type '+fileType+')');
    } else if(d.global === 18 && sport == null && v[5] != null && v[5] !== 0xFF){
      sport = FIT_SPORTS[v[5]] || 'Activity';
    } else if(d.global === 20){
      const lat = v[0], lon = v[1];
      if(lat == null || lon == null || lat === 0x7FFFFFFF || lon === 0x7FFFFFFF) continue;
      let ele = null;
      if(v[78] != null && v[78] !== 0xFFFFFFFF) ele = v[78] / 5 - 500;
      else if(v[2] != null && v[2] !== 0xFFFF) ele = v[2] / 5 - 500;
      raw.push({ ll:[lat * SEMI, lon * SEMI], ele, t: ts != null ? FIT_EPOCH_MS + ts * 1000 : null });
    }
  }
  return { name: null, sport, date: null, raw };
}

async function inflateBytes(input, format){
  if(typeof DecompressionStream === 'undefined') throw new Error('This browser can\'t unpack compressed files — try a current Chrome, Safari or Firefox');
  const blob = input instanceof Blob ? input : new Blob([input]);
  const stream = blob.stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const ACTIVITY_EXT = /\.(gpx|tcx|fit)(\.gz)?$/i;
function isActivityFileName(name){ return ACTIVITY_EXT.test(name); }

// Named after the file, unless that's just an ID (e.g. Strava's
// "1234567890.fit.gz" or Garmin's "12345_ACTIVITY.fit") — then "Hike · date".
function fallbackTrackName(filename, sport, date){
  const base = filename.split('/').pop().replace(/\.(gpx|tcx|fit)(\.gz)?$/i, '');
  const idLike = /^[\d_-]*(activity)?$/i.test(base) || /_\d{6,}(_activity)?$/i.test(base) || base.includes('@');
  if(base && !idLike) return base;
  return (sport || 'Activity') + (date ? ' · ' + friendlyDate(date, false) : '');
}

async function parseActivityBytes(bytes, filename, meta = {}){
  if(!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  let name = filename;
  if(/\.gz$/i.test(name)){ bytes = await inflateBytes(bytes, 'gzip'); name = name.slice(0, -3); }
  let r;
  if(/\.fit$/i.test(name)) r = readFIT(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  else {
    const text = new TextDecoder().decode(bytes);
    r = /\.tcx$/i.test(name) ? readTCX(text) : readGPX(text);
  }
  if(!r.raw.length) throw new Error('No GPS points');
  return trackFromRaw(r.raw, {
    name: meta.name || r.name,
    sport: meta.sport || r.sport,
    date: r.date,
    sourceKey: meta.sourceKey || null,
    filename
  });
}

// Kept for the Strava live-import path, which hands over GPX text.

function trackFromRaw(raw, meta){
  const points = raw.map(r=>r.ll);
  const firstTime = raw.find(r=>r.t != null);
  const startTime = firstTime ? firstTime.t : null;
  const date = startTime != null ? new Date(startTime).toISOString().slice(0,10) : (meta.date || null);

  // Cumulative distance per point, so the elevation profile's x-axis is
  // distance along the trail rather than point index.
  const cumKm = [0];
  for(let i=1;i<points.length;i++) cumKm.push(cumKm[i-1] + haversine(points[i-1], points[i]));
  const distanceKm = cumKm[cumKm.length-1];

  // Elevation stats come from the full-resolution points (downsampling
  // first would shave off real climbs); only the chart is downsampled.
  const eleStats = elevationStats(raw.map(r=>r.ele));
  let profile = null;
  if(eleStats){
    const full = raw.map((r,i)=> r.ele == null ? null : [+cumKm[i].toFixed(3), Math.round(r.ele)]).filter(Boolean);
    profile = downsample(full, MAX_PROFILE_POINTS);
    // downsample()'s stride can skip the final point; keep it so the
    // profile reaches the track's full distance.
    if(profile[profile.length-1] !== full[full.length-1]) profile.push(full[full.length-1]);
  }
  const times = raw.map(r=>r.t).filter(t=>t != null);
  const durationSec = times.length >= 2 ? Math.round((times[times.length-1] - times[0]) / 1000) : null;

  return {
    id: 't_' + Math.random().toString(36).slice(2,10),
    name: (meta.name && meta.name.trim()) || fallbackTrackName(meta.filename || '', meta.sport, date),
    date, distanceKm,
    startTime, sport: meta.sport || null, sourceKey: meta.sourceKey || null,
    points: downsample(points, MAX_STORED_POINTS_PER_TRACK),
    // null (not undefined) means "this file has no elevation", which
    // the UI tells apart from tracks imported before elevation existed.
    elevationGainM: eleStats ? eleStats.gain : null,
    elevationLossM: eleStats ? eleStats.loss : null,
    minEleM: eleStats ? eleStats.min : null,
    maxEleM: eleStats ? eleStats.max : null,
    profile,
    durationSec: durationSec > 0 ? durationSec : null,
  };
}

// ---- Zip archives (Strava / Garmin bulk exports) ----
// Read straight from the File with slice(), one entry at a time, via
// the browser's own deflate — so a multi-gigabyte export full of photos
// never has to fit in memory, and no library is needed. Handles ZIP64,
// which large Strava exports use.
async function zipEntries(blob){
  const tailLen = Math.min(blob.size, 65557 + 20);
  const tail = new DataView(await blob.slice(blob.size - tailLen).arrayBuffer());
  let eocd = -1;
  for(let i = tail.byteLength - 22; i >= 0; i--){ if(tail.getUint32(i, true) === 0x06054b50){ eocd = i; break; } }
  if(eocd < 0) throw new Error('Not a zip file');
  let count = tail.getUint16(eocd + 10, true);
  let cdSize = tail.getUint32(eocd + 12, true);
  let cdOffset = tail.getUint32(eocd + 16, true);
  if(count === 0xFFFF || cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF){
    const loc = eocd - 20;
    if(loc < 0 || tail.getUint32(loc, true) !== 0x07064b50) throw new Error('Unsupported zip file');
    const z64 = Number(tail.getBigUint64(loc + 8, true));
    const z = new DataView(await blob.slice(z64, z64 + 56).arrayBuffer());
    if(z.getUint32(0, true) !== 0x06064b50) throw new Error('Unsupported zip file');
    count = Number(z.getBigUint64(32, true));
    cdSize = Number(z.getBigUint64(40, true));
    cdOffset = Number(z.getBigUint64(48, true));
  }
  const cd = new DataView(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const dec = new TextDecoder();
  const entries = [];
  let p = 0;
  for(let i = 0; i < count && p + 46 <= cd.byteLength; i++){
    if(cd.getUint32(p, true) !== 0x02014b50) break;
    const method = cd.getUint16(p + 10, true);
    let csize = cd.getUint32(p + 20, true), usize = cd.getUint32(p + 24, true);
    const nlen = cd.getUint16(p + 28, true), xlen = cd.getUint16(p + 30, true), clen = cd.getUint16(p + 32, true);
    let lho = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, p + 46, nlen));
    let xp = p + 46 + nlen;
    const xend = xp + xlen;
    while(xp + 4 <= xend){
      const id = cd.getUint16(xp, true), sz = cd.getUint16(xp + 2, true);
      if(id === 0x0001){
        let q = xp + 4;
        if(usize === 0xFFFFFFFF){ usize = Number(cd.getBigUint64(q, true)); q += 8; }
        if(csize === 0xFFFFFFFF){ csize = Number(cd.getBigUint64(q, true)); q += 8; }
        if(lho === 0xFFFFFFFF){ lho = Number(cd.getBigUint64(q, true)); }
      }
      xp += 4 + sz;
    }
    if(!name.endsWith('/')) entries.push({ name, method, csize, usize, lho });
    p += 46 + nlen + xlen + clen;
  }
  return entries;
}
async function zipRead(blob, entry){
  const lh = new DataView(await blob.slice(entry.lho, entry.lho + 30).arrayBuffer());
  if(lh.getUint32(0, true) !== 0x04034b50) throw new Error('Damaged zip entry');
  const start = entry.lho + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
  const data = blob.slice(start, start + entry.csize);
  if(entry.method === 0) return new Uint8Array(await data.arrayBuffer());
  if(entry.method === 8) return inflateBytes(data, 'deflate-raw');
  throw new Error('Unsupported zip compression');
}

// RFC 4180-style: quoted fields can hold commas, doubled quotes and
// newlines — Strava activity descriptions routinely do.
function parseCSV(text){
  const rows = []; let row = [], field = '', q = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(q){
      if(c === '"'){ if(text[i+1] === '"'){ field += '"'; i++; } else q = false; }
      else field += c;
    } else if(c === '"') q = true;
    else if(c === ','){ row.push(field); field = ''; }
    else if(c === '\n' || c === '\r'){
      if(c === '\r' && text[i+1] === '\n') i++;
      row.push(field); field = ''; rows.push(row); row = [];
    } else field += c;
  }
  if(field !== '' || row.length){ row.push(field); rows.push(row); }
  return rows;
}

// GPS elevation is noisy — summing every tiny up/down tick wildly
// overstates the climb. Hysteresis only counts a rise or drop once it's
// moved ELE_THRESHOLD_M past the last turning point, the same idea most
// watches and apps use.
const ELE_THRESHOLD_M = 4;
function elevationStats(eles){
  const vals = eles.filter(e => e != null);
  if(vals.length < 2) return null;
  let anchor = vals[0], gain = 0, loss = 0, min = vals[0], max = vals[0];
  for(const v of vals){
    if(v < min) min = v;
    if(v > max) max = v;
    if(v - anchor >= ELE_THRESHOLD_M){ gain += v - anchor; anchor = v; }
    else if(anchor - v >= ELE_THRESHOLD_M){ loss += anchor - v; anchor = v; }
  }
  return { gain: Math.round(gain), loss: Math.round(loss), min: Math.round(min), max: Math.round(max) };
}

function formatDuration(sec){
  if(!sec) return '';
  const d = Math.floor(sec/86400), h = Math.floor(sec%86400/3600), m = Math.round(sec%3600/60);
  if(d) return d+' d '+h+' h';
  if(h) return h+' h '+String(m).padStart(2,'0')+' min';
  return m+' min';
}

// Elevation profile: elevation (y) against distance along the trail (x).
// The SVG stretches to the container (preserveAspectRatio="none") with a
// non-scaling stroke; the hover cursor and dot are HTML so the dot stays
// round however wide the chart is.
function buildElevationProfile(t){
  const pts = t.profile;
  const totalKm = pts[pts.length-1][0] || t.distanceKm || 1;
  let lo = t.minEleM, hi = t.maxEleM;
  // A near-flat walk shouldn't have 3 m of GPS noise blown up to fill
  // the whole chart height.
  if(hi - lo < 40){ const mid = (hi + lo) / 2; lo = mid - 20; hi = mid + 20; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const W = 1000, H = 100;
  const xOf = km => km / totalKm * W;
  const yOf = e => H - (e - lo) / (hi - lo) * H;
  const line = pts.map((p,i)=> (i?'L':'M') + xOf(p[0]).toFixed(1) + ',' + yOf(p[1]).toFixed(1)).join('');
  const area = line + 'L' + xOf(pts[pts.length-1][0]).toFixed(1) + ',' + H + 'L' + xOf(pts[0][0]).toFixed(1) + ',' + H + 'Z';

  const el = document.createElement('div');
  el.className = 'ele-profile';
  el.tabIndex = 0;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Elevation profile: '+t.minEleM+' to '+t.maxEleM+' m over '+totalKm.toFixed(1)+' km, '+t.elevationGainM+' m climbed. Use left and right arrow keys to read points.');
  el.innerHTML =
    '<div class="ele-axis ele-axis-max">'+t.maxEleM+' m</div>'+
    '<div class="ele-axis ele-axis-min">'+t.minEleM+' m</div>'+
    '<div class="ele-plot">'+
      '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true">'+
        '<path class="ele-area" d="'+area+'"/>'+
        '<path class="ele-line" d="'+line+'" vector-effect="non-scaling-stroke"/>'+
      '</svg>'+
      '<div class="ele-cursor" hidden></div><div class="ele-dot" hidden></div>'+
    '</div>'+
    '<div class="ele-axis-x"><span>0 km</span><span>'+totalKm.toFixed(1)+' km</span></div>';

  const plot = el.querySelector('.ele-plot');
  const cursor = el.querySelector('.ele-cursor');
  const dot = el.querySelector('.ele-dot');
  let idx = -1;

  function showAt(i, clientX, clientY){
    idx = Math.max(0, Math.min(pts.length-1, i));
    const [km, ele] = pts[idx];
    const xPct = km / totalKm * 100, yPct = yOf(ele) / H * 100;
    cursor.style.left = xPct + '%';
    dot.style.left = xPct + '%';
    dot.style.top = yPct + '%';
    cursor.hidden = dot.hidden = false;
    if(clientX == null){
      const r = dot.getBoundingClientRect();
      clientX = r.left + r.width/2; clientY = r.top;
    }
    showChartTooltip(clientX, clientY, ele+' m', 'at '+km.toFixed(1)+' km', null);
  }
  function hide(){ cursor.hidden = dot.hidden = true; hideChartTooltip(); }
  function nearestIndex(km){
    let best = 0;
    for(let i=1;i<pts.length;i++) if(Math.abs(pts[i][0]-km) < Math.abs(pts[best][0]-km)) best = i;
    return best;
  }

  plot.addEventListener('pointermove', e=>{
    const r = plot.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    showAt(nearestIndex(frac * totalKm), e.clientX, e.clientY);
  });
  plot.addEventListener('pointerleave', hide);
  el.addEventListener('focus', ()=>{
    let hiIdx = 0;
    pts.forEach((p,i)=>{ if(p[1] > pts[hiIdx][1]) hiIdx = i; });
    showAt(idx >= 0 ? idx : hiIdx);
  });
  el.addEventListener('blur', hide);
  el.addEventListener('keydown', e=>{
    const step = Math.max(1, Math.round(pts.length / 50));
    if(e.key === 'ArrowRight'){ e.preventDefault(); showAt(idx + step); }
    else if(e.key === 'ArrowLeft'){ e.preventDefault(); showAt(idx - step); }
    else if(e.key === 'Home'){ e.preventDefault(); showAt(0); }
    else if(e.key === 'End'){ e.preventDefault(); showAt(pts.length-1); }
  });
  return el;
}

// "↑ 820 m · ↓ 790 m · 4 h 05 min" — whatever a track actually has.
function trackClimbSummary(t){
  const parts = [];
  if(t.elevationGainM != null) parts.push('↑ '+t.elevationGainM+' m', '↓ '+t.elevationLossM+' m');
  if(t.durationSec) parts.push(formatDuration(t.durationSec));
  return parts.join(' · ');
}

// ---- Country detection (offline point-in-polygon against a bundled,
// simplified world map) so "visited countries" works with no network calls
// and no API keys. ----
let countriesGeoPromise = null;
function loadCountriesGeo(){
  if(!countriesGeoPromise){
    countriesGeoPromise = fetch('countries-50m.geo.json').then(r=>r.json()).catch(()=>({features:[]}));
  }
  return countriesGeoPromise;
}
function pointInRing(pt, ring){
  let inside = false;
  const x = pt[0], y = pt[1];
  for(let i=0, j=ring.length-1; i<ring.length; j=i++){
    const xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
    const intersect = ((yi>y) !== (yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi);
    if(intersect) inside = !inside;
  }
  return inside;
}
function pointInPolygon(pt, polygon){
  if(!pointInRing(pt, polygon[0])) return false;
  for(let k=1;k<polygon.length;k++) if(pointInRing(pt, polygon[k])) return false;
  return true;
}
function countryForLatLon(lat, lon, geo){
  const pt = [lon, lat];
  for(const f of geo.features){
    const g = f.geometry;
    const hit = g.type === 'Polygon' ? pointInPolygon(pt, g.coordinates)
      : g.type === 'MultiPolygon' ? g.coordinates.some(poly=>pointInPolygon(pt, poly))
      : false;
    if(hit) return f.properties.name;
  }
  return null;
}
async function detectTrackCountries(track){
  const geo = await loadCountriesGeo();
  const pts = track.points;
  if(!geo.features || !geo.features.length || !pts.length){ track.countries = track.countries || []; return; }
  const maxSamples = 30;
  const stride = Math.max(1, Math.floor(pts.length / maxSamples));
  const found = new Set();
  for(let i=0;i<pts.length;i+=stride){
    const c = countryForLatLon(pts[i][0], pts[i][1], geo);
    if(c) found.add(c);
  }
  const last = pts[pts.length-1];
  const c = countryForLatLon(last[0], last[1], geo);
  if(c) found.add(c);
  track.countries = Array.from(found);
}
function allVisitedCountries(){
  const set = new Set();
  tracks.forEach(t=> (t.countries||[]).forEach(c=> set.add(c)));
  return set;
}

function parseGoogleJSON(obj){
  const pts = [];
  if(Array.isArray(obj.locations)){
    obj.locations.forEach(l=>{
      const lat = l.latitudeE7!==undefined ? l.latitudeE7/1e7 : l.lat;
      const lon = l.longitudeE7!==undefined ? l.longitudeE7/1e7 : l.lng;
      if(isFinite(lat)&&isFinite(lon)) pts.push([lat,lon]);
    });
  } else if(Array.isArray(obj.timelineObjects)){
    obj.timelineObjects.forEach(o=>{
      const v = o.placeVisit && o.placeVisit.location;
      if(v && v.latitudeE7!==undefined) pts.push([v.latitudeE7/1e7, v.longitudeE7/1e7]);
      const seg = o.activitySegment;
      if(seg){
        if(seg.startLocation && seg.startLocation.latitudeE7!==undefined)
          pts.push([seg.startLocation.latitudeE7/1e7, seg.startLocation.longitudeE7/1e7]);
        if(seg.endLocation && seg.endLocation.latitudeE7!==undefined)
          pts.push([seg.endLocation.latitudeE7/1e7, seg.endLocation.longitudeE7/1e7]);
        const wps = seg.waypointPath && seg.waypointPath.waypoints;
        if(Array.isArray(wps)) wps.forEach(w=>{
          if(w.latE7!==undefined) pts.push([w.latE7/1e7, w.lngE7/1e7]);
        });
      }
    });
  } else if(Array.isArray(obj.semanticSegments)){
    obj.semanticSegments.forEach(seg=>{
      const ll = seg.visit && seg.visit.topCandidate && seg.visit.topCandidate.placeLocation && seg.visit.topCandidate.placeLocation.latLng;
      if(typeof ll === 'string'){
        const [lat,lon] = ll.split(',').map(s=>parseFloat(s.trim()));
        if(isFinite(lat)&&isFinite(lon)) pts.push([lat,lon]);
      }
      if(Array.isArray(seg.timelinePath)){
        seg.timelinePath.forEach(tp=>{
          if(typeof tp.point === 'string'){
            const [lat,lon] = tp.point.split(',').map(s=>parseFloat(s.trim()));
            if(isFinite(lat)&&isFinite(lon)) pts.push([lat,lon]);
          }
        });
      }
    });
  }
  return pts;
}
