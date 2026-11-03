// Track editing: trim, split, join and GPX export. No DOM and no network
// here, so it runs unchanged in the browser (window.TrackCore) and under
// `node --test`.
//
// A stored track keeps its points downsampled (at most MAX_POINTS), plus,
// for tracks imported since editing exists, the elevation and time of each
// of those points:
//   pointEle   — metres, one per point (null where the file had none)
//   pointTimes — seconds after startTime, one per point (null where none)
// Older tracks only have the elevation profile ([km, ele] pairs); their
// elevation is read back from it. Their per-point times are gone, so after
// trimming or splitting one its duration is unknown.
(function(root, factory){
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else root.TrackCore = factory();
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  const MAX_POINTS = 1500;
  const MAX_PROFILE_POINTS = 300;
  const ELE_THRESHOLD_M = 4;

  function haversine(a, b){
    const R = 6371;
    const dLat = (b[0]-a[0])*Math.PI/180, dLon = (b[1]-a[1])*Math.PI/180;
    const lat1 = a[0]*Math.PI/180, lat2 = b[0]*Math.PI/180;
    const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.sqrt(h));
  }

  // Indices of an evenly strided subset of n items, at most max long, that
  // always keeps the first and the last item (so a track still ends where
  // it ended). Index-based so parallel arrays stay aligned.
  function sampleIndices(n, max){
    const out = [];
    if(n <= max){ for(let i=0;i<n;i++) out.push(i); return out; }
    const stride = Math.ceil((n-1)/(max-1));
    for(let i=0;i<n-1;i+=stride) out.push(i);
    out.push(n-1);
    return out;
  }

  // Climb and descent with a small threshold, so GPS noise on flat ground
  // doesn't add up to hundreds of metres.
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

  function cumulativeKm(points){
    const cum = [0];
    for(let i=1;i<points.length;i++) cum.push(cum[i-1] + haversine(points[i-1], points[i]));
    return cum;
  }

  // Elevation at distance km along a [km, ele] profile, linearly
  // interpolated; clamps outside the profile's range.
  function profileEleAt(profile, km){
    if(km <= profile[0][0]) return profile[0][1];
    const last = profile[profile.length-1];
    if(km >= last[0]) return last[1];
    let lo = 0, hi = profile.length-1;
    while(hi - lo > 1){ const mid = (lo+hi) >> 1; if(profile[mid][0] <= km) lo = mid; else hi = mid; }
    const a = profile[lo], b = profile[hi];
    const f = b[0] === a[0] ? 0 : (km - a[0]) / (b[0] - a[0]);
    return a[1] + f*(b[1]-a[1]);
  }

  // A track as parallel per-point arrays: points, ele (metres or null) and
  // t (epoch ms or null). ele/t are null as a whole when nothing is known.
  function trackSeries(track){
    const points = (track.points || []).map(p => [p[0], p[1]]);
    const n = points.length;
    let ele = null;
    if(Array.isArray(track.pointEle) && track.pointEle.length === n && track.pointEle.some(e => e != null)){
      ele = track.pointEle.slice();
    } else if(Array.isArray(track.profile) && track.profile.length > 1 && n > 1){
      // The profile's km run along the full-resolution track, which is a
      // little longer than the downsampled points; scale to match.
      const cum = cumulativeKm(points);
      const total = cum[n-1];
      const profKm = track.profile[track.profile.length-1][0];
      const scale = total > 0 ? profKm / total : 0;
      ele = cum.map(km => Math.round(profileEleAt(track.profile, km*scale)*10)/10);
    }
    let t = null;
    if(track.startTime != null && Array.isArray(track.pointTimes) && track.pointTimes.length === n
       && track.pointTimes.some(s => s != null)){
      t = track.pointTimes.map(s => s == null ? null : track.startTime + s*1000);
    }
    return { points, ele, t };
  }

  function sliceSeries(s, from, to){
    return {
      points: s.points.slice(from, to+1),
      ele: s.ele ? s.ele.slice(from, to+1) : null,
      t: s.t ? s.t.slice(from, to+1) : null,
    };
  }

  // A new track object from base's metadata and a series, with every
  // derived number recomputed. opts.durationSec overrides the duration.
  function buildTrack(base, series, opts){
    opts = opts || {};
    const idx = sampleIndices(series.points.length, MAX_POINTS);
    const points = idx.map(i => series.points[i]);
    const ele = series.ele ? idx.map(i => series.ele[i]) : null;
    const t = series.t ? idx.map(i => series.t[i]) : null;

    const cum = cumulativeKm(points);
    const distanceKm = cum[cum.length-1] || 0;
    const stats = ele ? elevationStats(ele) : null;
    let profile = null;
    if(stats){
      const full = [];
      ele.forEach((e, i) => { if(e != null) full.push([+cum[i].toFixed(3), Math.round(e)]); });
      profile = sampleIndices(full.length, MAX_PROFILE_POINTS).map(i => full[i]);
    }

    const known = t ? t.filter(x => x != null) : [];
    const startTime = known.length ? known[0] : null;
    let durationSec;
    if(opts.durationSec !== undefined) durationSec = opts.durationSec;
    else if(known.length >= 2) durationSec = Math.round((known[known.length-1] - known[0]) / 1000);
    else durationSec = null;

    const out = Object.assign({}, base, {
      points,
      distanceKm,
      startTime,
      date: startTime != null ? new Date(startTime).toISOString().slice(0,10) : (base.date || null),
      elevationGainM: stats ? stats.gain : null,
      elevationLossM: stats ? stats.loss : null,
      minEleM: stats ? stats.min : null,
      maxEleM: stats ? stats.max : null,
      profile,
      durationSec: durationSec > 0 ? durationSec : null,
      pointEle: ele ? ele.map(e => e == null ? null : Math.round(e*10)/10) : null,
      pointTimes: t && startTime != null ? t.map(x => x == null ? null : Math.round((x - startTime)/1000)) : null,
    });
    // Countries are worked out again by the caller (it needs the map data).
    delete out.countries;
    return out;
  }

  function clampIndex(i, n){ return Math.max(0, Math.min(n-1, Math.round(i))); }

  // Keep points startIdx..endIdx (inclusive).
  function trim(track, startIdx, endIdx){
    const s = trackSeries(track);
    const n = s.points.length;
    const a = clampIndex(startIdx, n), b = clampIndex(endIdx, n);
    if(b - a < 1) throw new Error('A track needs at least two points');
    if(a === 0 && b === n-1) return Object.assign({}, track);
    return buildTrack(track, sliceSeries(s, a, b));
  }

  // Two tracks that meet at point idx (both keep it). The first keeps the
  // original's id; the second gets newId.
  function split(track, idx, newId){
    const s = trackSeries(track);
    const n = s.points.length;
    const i = clampIndex(idx, n);
    if(i < 1 || i > n-2) throw new Error('Split somewhere between the start and the end');
    const first = buildTrack(track, sliceSeries(s, 0, i));
    const second = buildTrack(Object.assign({}, track, { id: newId, sourceKey: null }), sliceSeries(s, i, n-1));
    second.name = (track.name || 'Track') + ' (part 2)';
    return [first, second];
  }

  // Which of two tracks comes first: by start time, then by date, else
  // in the order given.
  function comesFirst(a, b){
    if(a.startTime != null && b.startTime != null) return a.startTime <= b.startTime;
    if(a.date && b.date && a.date !== b.date) return a.date < b.date;
    return true;
  }

  // One track out of two, in time order, keeping a's id, name and sport.
  // Duration is the two recordings' durations added up (not the gap in
  // between, which may be a night or a car ride).
  function merge(a, b){
    const [x, y] = comesFirst(a, b) ? [a, b] : [b, a];
    const sx = trackSeries(x), sy = trackSeries(y);
    const pad = (arr, len) => arr || new Array(len).fill(null);
    const series = {
      points: sx.points.concat(sy.points),
      ele: (sx.ele || sy.ele) ? pad(sx.ele, sx.points.length).concat(pad(sy.ele, sy.points.length)) : null,
      t: (sx.t || sy.t) ? pad(sx.t, sx.points.length).concat(pad(sy.t, sy.points.length)) : null,
    };
    const durationSec = (a.durationSec || b.durationSec) ? (a.durationSec || 0) + (b.durationSec || 0) : null;
    const base = Object.assign({}, a, { date: x.date || a.date || null });
    const out = buildTrack(base, series, { durationSec });
    // Point times of the earlier part when only the later one had them
    // would put startTime on the wrong part — the date still comes first.
    if(x.date && out.date && x.date < out.date) out.date = x.date;
    return out;
  }

  function xmlEscape(s){
    return String(s).replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
  }

  // GPX 1.1 with elevation and time wherever they are known.
  function toGpx(track){
    const s = trackSeries(track);
    const name = xmlEscape(track.name || 'Track');
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="Hike-in-one" xmlns="http://www.topografix.com/GPX/1/1">',
      '  <metadata><name>'+name+'</name>'+(s.t && s.t[0] != null ? '<time>'+new Date(s.t[0]).toISOString()+'</time>' : '')+'</metadata>',
      '  <trk>',
      '    <name>'+name+'</name>',
    ];
    if(track.sport) lines.push('    <type>'+xmlEscape(track.sport)+'</type>');
    lines.push('    <trkseg>');
    s.points.forEach((p, i) => {
      let inner = '';
      if(s.ele && s.ele[i] != null) inner += '<ele>'+(+s.ele[i].toFixed(1))+'</ele>';
      if(s.t && s.t[i] != null) inner += '<time>'+new Date(s.t[i]).toISOString()+'</time>';
      lines.push('      <trkpt lat="'+(+p[0].toFixed(6))+'" lon="'+(+p[1].toFixed(6))+'">'+inner+'</trkpt>');
    });
    lines.push('    </trkseg>', '  </trk>', '</gpx>', '');
    return lines.join('\n');
  }

  // A safe file name for a download.
  function gpxFileName(track){
    const base = String(track.name || 'track').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'track';
    return base + '.gpx';
  }


  // ---- Route planning ----

  // Points along a straight line from a to b (both included), about
  // stepKm apart and at most maxPts long, for looking up elevation.
  function densifyLine(a, b, stepKm, maxPts){
    const n = Math.max(1, Math.min((maxPts || 100) - 1, Math.ceil(haversine(a, b) / (stepKm || 0.05))));
    const out = [];
    for(let i=0;i<=n;i++){
      const f = i/n;
      out.push([+(a[0] + (b[0]-a[0])*f).toFixed(6), +(a[1] + (b[1]-a[1])*f).toFixed(6)]);
    }
    return out;
  }

  // The route's segments ({points, ele}) as one series. Each segment
  // starts where the previous one ended, so that shared point is kept
  // once. Elevation is null as a whole only when no segment has any.
  function joinSegments(segs){
    const points = [], ele = [];
    let anyEle = false;
    segs.forEach((s, k)=>{
      s.points.forEach((p, i)=>{
        if(k > 0 && i === 0 && points.length){
          const last = points[points.length-1];
          if(haversine(last, p) < 0.002){
            // Same point: keep it once, with whichever elevation is known.
            const e = s.ele ? s.ele[i] : null;
            if(ele[ele.length-1] == null && e != null){ ele[ele.length-1] = e; anyEle = true; }
            return;
          }
        }
        points.push([p[0], p[1]]);
        const e = s.ele ? s.ele[i] : null;
        if(e != null) anyEle = true;
        ele.push(e == null ? null : e);
      });
    });
    return { points, ele: anyEle ? ele : null, t: null };
  }

  // A BRouter GeoJSON answer as {points, ele}; null when it has no line.
  function parseBrouter(geo){
    const f = geo && geo.features && geo.features[0];
    const c = f && f.geometry && f.geometry.type === 'LineString' && f.geometry.coordinates;
    if(!c || c.length < 2) return null;
    const ele = c.map(x => x.length > 2 && isFinite(x[2]) ? +x[2] : null);
    return { points: c.map(x => [+x[1], +x[0]]), ele: ele.some(e => e != null) ? ele : null };
  }

  // Walking time by the common hiking rule: 4 km an hour on the flat plus
  // an hour for every 600 m of climb.
  function estimateHikingSec(distanceKm, gainM){
    return Math.round(((distanceKm || 0) / 4 + (gainM || 0) / 600) * 3600);
  }

  // Sunrise and sunset for a calendar day ('YYYY-MM-DD') at lat/lon, from
  // the standard sunrise equation (good to a minute or two; no network).
  // Returns { sunrise, sunset } as UTC milliseconds, or { polar: 'day' }
  // or { polar: 'night' } when the sun doesn't cross the horizon that day.
  function sunTimes(dateStr, lat, lon){
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
    if(!m || !isFinite(lat) || !isFinite(lon)) return null;
    const rad = Math.PI / 180;
    const jDay = Date.UTC(+m[1], +m[2]-1, +m[3]) / 86400000 + 2440587.5;
    const n = Math.ceil(jDay - 2451545 + 0.0008);
    const jStar = n - lon / 360;
    const M = ((357.5291 + 0.98560028 * jStar) % 360 + 360) % 360;
    const C = 1.9148*Math.sin(M*rad) + 0.02*Math.sin(2*M*rad) + 0.0003*Math.sin(3*M*rad);
    const lambda = (M + C + 180 + 102.9372) % 360;
    const jTransit = 2451545 + jStar + 0.0053*Math.sin(M*rad) - 0.0069*Math.sin(2*lambda*rad);
    const sinDec = Math.sin(lambda*rad) * Math.sin(23.4397*rad);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosW = (Math.sin(-0.833*rad) - Math.sin(lat*rad)*sinDec) / (Math.cos(lat*rad)*cosDec);
    if(cosW > 1) return { polar: 'night' };
    if(cosW < -1) return { polar: 'day' };
    const w = Math.acos(cosW) / rad;
    const toMs = j => Math.round((j - 2440587.5) * 86400000);
    return { sunrise: toMs(jTransit - w/360), sunset: toMs(jTransit + w/360) };
  }

  return {
    MAX_POINTS, MAX_PROFILE_POINTS, ELE_THRESHOLD_M,
    haversine, sampleIndices, elevationStats, cumulativeKm, profileEleAt,
    trackSeries, buildTrack, trim, split, merge, toGpx, gpxFileName,
    densifyLine, joinSegments, parseBrouter, estimateHikingSec, sunTimes,
  };
});
