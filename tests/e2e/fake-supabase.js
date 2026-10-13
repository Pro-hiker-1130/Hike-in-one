// In-memory stand-in for the slice of Supabase (PostgREST + Storage) the
// catalog uses, plugged in with Playwright's request routing. It mimics
// the server rules the UI depends on (duplicate key, one review per user,
// profile required for reviews) so the browser code runs unmodified
// against the real supabase-js client.
const C = require('../../catalog-core.js');

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

function createFakeSupabase({ userId = null, seed = {} } = {}){
  const db = {
    catalog_products: [], catalog_photos: [], reviews: [], profiles: [], revisions: [], user_data: [],
  };
  const log = [];   // every request: {method, path, body}
  let seq = 1;
  const now = () => new Date(Date.UTC(2026, 9, 13, 12, 0, seq++)).toISOString();
  const uuid = () => '00000000-0000-4000-8000-' + String(seq++).padStart(12, '0');

  function addProduct(p, by){
    const row = Object.assign({ model: null, category: 'Other', weight_g: null, description: null, specs: {}, product_url: null },
      p, { id: p.id || uuid(), created_by: by, updated_by: by, created_at: now(), updated_at: now() });
    row.normalized_key = C.productKey(row.brand, row.name, row.model);
    if(db.catalog_products.some(x => x.normalized_key === row.normalized_key)) return { error: dupError() };
    db.catalog_products.push(row);
    return { row };
  }
  const dupError = () => ({ code: '23505', message: 'duplicate key value violates unique constraint "catalog_products_key_uq"', details: null, hint: null });

  (seed.products || []).forEach(p => addProduct(p, p.created_by || 'seed-user'));
  (seed.profiles || []).forEach(p => db.profiles.push(Object.assign({ created_at: now(), updated_at: now() }, p)));
  (seed.reviews || []).forEach(r => db.reviews.push(Object.assign({ id: uuid(), text: null, created_at: now(), updated_at: now() }, r)));
  (seed.photos || []).forEach(ph => db.catalog_photos.push(Object.assign({ id: uuid(), created_at: now() }, ph)));

  const searchText = p => C.normalize([p.brand, p.name, p.model].filter(Boolean).join(' '));
  function stats(p){
    const rs = db.reviews.filter(r => r.product_id === p.id);
    const photo = db.catalog_photos.filter(ph => ph.product_id === p.id)[0];
    return {
      photo_path: photo ? photo.storage_path : null,
      review_count: rs.length,
      avg_rating: rs.length ? Math.round(rs.reduce((s, r) => s + r.rating, 0) / rs.length * 10) / 10 : null,
    };
  }
  function filterRows(rows, params){
    return rows.filter(r => {
      for(const [k, v] of params){
        if(['select', 'order', 'limit', 'on_conflict', 'columns'].includes(k)) continue;
        const m = /^eq\.(.*)$/.exec(v);
        if(m && String(r[k]) !== m[1]) return false;
      }
      return true;
    });
  }

  async function handle(route){
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    let body = null;
    try{ body = req.postData() ? JSON.parse(req.postData()) : null; }catch(e){ body = req.postData(); }
    log.push({ method, path: url.pathname, query: url.search, body });
    const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (status, data, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: Object.assign({ 'access-control-allow-origin': '*' }, headers), body: data === undefined ? '' : JSON.stringify(data) });
    const reply = rows => wantsObject ? (rows.length === 1 ? json(200, rows[0]) : json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })) : json(200, rows);
    const authed = !!userId;
    const deny = () => json(401, { code: '42501', message: 'new row violates row-level security policy' });

    if(method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });

    const p = url.pathname;
    // ---- Storage ----
    if(p.startsWith('/storage/v1/object/public/catalog-photos/')) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX });
    if(p.startsWith('/storage/v1/object/catalog-photos/') && method === 'POST'){
      if(!authed) return deny();
      const path = decodeURIComponent(p.slice('/storage/v1/object/catalog-photos/'.length));
      if(path.split('/')[0] !== userId) return deny();
      return json(200, { Key: 'catalog-photos/' + path, Id: uuid() });
    }
    if(p === '/storage/v1/object/catalog-photos' && method === 'DELETE') return json(200, []);

    // ---- Auth (only what a restored session may touch) ----
    if(p.startsWith('/auth/v1/user')) return userId ? json(200, { id: userId, email: 'me@example.com', aud: 'authenticated', role: 'authenticated' }) : json(401, {});
    if(p.startsWith('/auth/v1/')) return json(200, {});

    // ---- RPC ----
    if(p === '/rest/v1/rpc/search_catalog'){
      const q = C.normalize(body.q);
      if(q.length < 2) return json(200, []);
      const words = q.split(' ');
      const rows = db.catalog_products
        .filter(x => words.every(w => searchText(x).includes(w)))
        .slice(0, body.max_results || 12)
        .map(x => Object.assign({ id: x.id, name: x.name, brand: x.brand, model: x.model, category: x.category, weight_g: x.weight_g, score: 1 }, stats(x)));
      return json(200, rows);
    }
    if(p === '/rest/v1/rpc/find_similar_products'){
      const key = C.productKey(body.p_brand, body.p_name, body.p_model);
      const brand = C.normalize(body.p_brand);
      const nameWords = C.normalize(body.p_name).split(' ').filter(w => w.length > 2 && w !== brand);
      const rows = db.catalog_products.filter(x => x.normalized_key === key ||
          (C.normalize(x.brand) === brand && nameWords.some(w => searchText(x).includes(w))))
        .map(x => ({ id: x.id, name: x.name, brand: x.brand, model: x.model, category: x.category, weight_g: x.weight_g, exact: x.normalized_key === key, score: 0.6 }))
        .sort((a, b) => b.exact - a.exact);
      return json(200, rows);
    }

    // ---- Tables ----
    const m = /^\/rest\/v1\/([a-z_]+)$/.exec(p);
    if(!m) return json(404, { message: 'not mocked: ' + p });
    const table = m[1];
    const params = Array.from(url.searchParams.entries());

    if(table === 'user_data'){
      if(method === 'GET') return reply([]);
      return json(201, undefined);
    }
    if(table === 'catalog_products'){
      if(method === 'GET'){
        const rows = filterRows(db.catalog_products, params).map(x => {
          const out = Object.assign({}, x);
          delete out.normalized_key;
          if((url.searchParams.get('select') || '').includes('catalog_photos')) out.catalog_photos = db.catalog_photos.filter(ph => ph.product_id === x.id);
          return out;
        });
        return reply(rows);
      }
      if(!authed) return deny();
      if(method === 'POST'){
        const { row, error } = addProduct(body, userId);
        if(error) return json(409, error);
        return reply([row]);
      }
      if(method === 'PATCH'){
        const target = filterRows(db.catalog_products, params)[0];
        if(!target) return reply([]);
        const next = Object.assign({}, target, body, { id: target.id, created_by: target.created_by, created_at: target.created_at, updated_by: userId, updated_at: now() });
        next.normalized_key = C.productKey(next.brand, next.name, next.model);
        if(db.catalog_products.some(x => x !== target && x.normalized_key === next.normalized_key)) return json(409, dupError());
        db.revisions.push({ product_id: target.id, changed_by: userId, previous: Object.assign({}, target) });
        Object.assign(target, next);
        return reply([target]);
      }
      return json(403, { code: '42501', message: 'permission denied for table catalog_products' });
    }
    if(table === 'catalog_product_revisions'){
      const n = filterRows(db.revisions, params).length;
      return route.fulfill({ status: 200, headers: { 'content-range': (n ? '0-' + (n - 1) : '*') + '/' + n, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' }, contentType: 'application/json', body: method === 'HEAD' ? '' : '[]' });
    }
    if(table === 'catalog_photos'){
      if(method === 'GET') return reply(filterRows(db.catalog_photos, params));
      if(!authed) return deny();
      if(method === 'POST'){
        if(body.storage_path.split('/')[0] !== userId) return deny();
        if(db.catalog_photos.filter(ph => ph.product_id === body.product_id).length >= 12) return json(400, { code: 'P0001', message: 'This product already has the maximum of 12 photos' });
        const row = Object.assign({ id: uuid(), created_at: now() }, body);
        db.catalog_photos.push(row);
        return json(201, undefined);
      }
      if(method === 'DELETE'){
        const rows = filterRows(db.catalog_photos, params).filter(ph => ph.uploaded_by === userId);
        db.catalog_photos = db.catalog_photos.filter(ph => !rows.includes(ph));
        return json(204, undefined);
      }
    }
    if(table === 'profiles'){
      if(method === 'GET') return reply(filterRows(db.profiles, params).map(x => ({ display_name: x.display_name })));
      if(!authed || body.user_id !== userId) return deny();
      const name = String(body.display_name || '').trim();
      if(name.length < 2 || name.length > 40) return json(400, { code: '23514', message: 'violates check constraint "profiles_display_name_len"' });
      const existing = db.profiles.find(x => x.user_id === userId);
      if(existing) existing.display_name = name; else db.profiles.push({ user_id: userId, display_name: name, created_at: now(), updated_at: now() });
      return json(201, undefined);
    }
    if(table === 'reviews'){
      if(method === 'GET'){
        const rows = filterRows(db.reviews, params)
          .sort((a, b) => a.created_at < b.created_at ? 1 : -1)
          .map(r => Object.assign({}, r, { profiles: (db.profiles.find(x => x.user_id === r.user_id) || null) && { display_name: db.profiles.find(x => x.user_id === r.user_id).display_name } }));
        return reply(rows);
      }
      if(!authed) return deny();
      if(method === 'POST'){
        if(body.user_id !== userId) return deny();
        if(!db.profiles.some(x => x.user_id === userId)) return json(409, { code: '23503', message: 'violates foreign key constraint "reviews_user_id_fkey"' });
        if(!(body.rating >= 1 && body.rating <= 5)) return json(400, { code: '23514', message: 'violates check constraint "reviews_rating"' });
        const existing = db.reviews.find(r => r.product_id === body.product_id && r.user_id === userId);
        if(existing) Object.assign(existing, { rating: body.rating, text: body.text, updated_at: now() });
        else db.reviews.push({ id: uuid(), product_id: body.product_id, user_id: userId, rating: body.rating, text: body.text, created_at: now(), updated_at: now() });
        return json(201, undefined);
      }
      if(method === 'DELETE'){
        const rows = filterRows(db.reviews, params).filter(r => r.user_id === userId);
        db.reviews = db.reviews.filter(r => !rows.includes(r));
        return json(204, undefined);
      }
    }
    return json(404, { message: 'not mocked: ' + method + ' ' + p });
  }

  return { db, log, handle };
}

// A supabase-js session for localStorage, so the app boots signed in.
function fakeSession(userId){
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: userId, exp, role: 'authenticated', aud: 'authenticated' }) + '.sig',
    refresh_token: 'refresh', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: userId, email: 'me@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
  };
}

module.exports = { createFakeSupabase, fakeSession };
