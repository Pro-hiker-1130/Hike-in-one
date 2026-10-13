// End-to-end: the gear catalog in the real app, against fake-supabase.js.
//
//   node --test tests/e2e/
//
// Needs Playwright (npm i -D playwright, or a global install on NODE_PATH).
// The CDN libraries load from the network; set HIKE_LIBS_DIR to a
// node_modules folder holding leaflet, leaflet.heat, @zxing/library and
// @supabase/supabase-js to serve them locally instead (offline CI).
// PLAYWRIGHT_CHROMIUM can point at a specific Chromium binary.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createFakeSupabase, fakeSession } = require('./fake-supabase.js');

let playwright = null;
try{ playwright = require('playwright'); }catch(e){}

const ROOT = path.resolve(__dirname, '../..');
const SUPABASE_HOST = 'agdtujbsojhujffvhqcb.supabase.co';
const SESSION_KEY = 'sb-agdtujbsojhujffvhqcb-auth-token';
const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
const BEA = 'bbbbbbbb-0000-4000-8000-000000000002';
const EXOS_ID = 'cccccccc-0000-4000-8000-000000000001';
const SPUR_ID = 'cccccccc-0000-4000-8000-000000000002';

function serveRepo(){
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png' };
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

function seedCatalog(){
  return {
    products: [
      { id: EXOS_ID, name: 'Exos 58', brand: 'Osprey', category: 'Backpack', weight_g: 1240,
        product_url: 'https://www.osprey.com/exos-58', specs: { volume_l: 58 }, description: 'Ultralight top-loader.' },
      { id: SPUR_ID, name: 'Copper Spur HV UL2', brand: 'Big Agnes', category: 'Shelter', weight_g: 1420, specs: { capacity_persons: 2 } },
    ],
    profiles: [{ user_id: BEA, display_name: 'Bea' }],
    reviews: [{ product_id: EXOS_ID, user_id: BEA, rating: 4, text: 'Comfy, small hipbelt pockets.' }],
    photos: [{ product_id: EXOS_ID, storage_path: BEA + '/exos.jpg', uploaded_by: BEA }],
  };
}

async function launch(t, { signedIn, blockCatalogCore = false, fake }){
  const browser = await playwright.chromium.launch(Object.assign({ args: ['--no-sandbox'] },
    process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}));
  t.after(()=> browser.close());
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  if(process.env.HIKE_LIBS_DIR){
    await ctx.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/, route=>{
      const key = Object.keys(LIBS).find(k => route.request().url().includes(k));
      if(!key) return route.abort();
      route.fulfill({ status: 200, contentType: LIBS[key][1], body: fs.readFileSync(path.join(process.env.HIKE_LIBS_DIR, LIBS[key][0])) });
    });
  }
  await ctx.route(/fonts\.|tile\.openstreetmap|arcgisonline|opentopomap|microlink|upcitemdb/, r => r.abort());
  await ctx.route(new RegExp(SUPABASE_HOST.replace(/\./g, '\\.')), r => fake.handle(r));
  if(blockCatalogCore) await ctx.route(/catalog-core\.js$/, r => r.abort());
  await ctx.addInitScript(({ session, key, gear })=>{
    if(localStorage.getItem('e2e-seeded')) return;
    localStorage.setItem('e2e-seeded', '1');
    if(session) localStorage.setItem(key, JSON.stringify(session));
    localStorage.setItem('waypoints-gear-v1', JSON.stringify(gear));
  }, {
    session: signedIn ? fakeSession(ME) : null, key: SESSION_KEY,
    gear: [{ id: 'g_old', name: 'Old tent', brand: 'Big Agnes', category: 'Shelter', weightGrams: 1500, quantity: 1, status: 'active', notes: 'patched pole' }],
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if(m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()); });
  await page.goto(baseUrl + '/index.html');
  await page.waitForSelector('.nav-tab');
  return { page, errors };
}

async function openAddGear(page){
  await page.click('.nav-tab[data-page="gear"]');
  await page.click('#addGearBtnGarage');
  await page.waitForSelector('#gearModalOverlay', { state: 'visible' });
}
const val = (page, id) => page.inputValue('#' + id);
async function savedGear(page){
  return page.evaluate(()=> new Promise(res=>{
    // The app's IndexedDB: database "waypoints-db", store "kv" of {key, value}.
    const rq = indexedDB.open('waypoints-db');
    rq.onsuccess = ()=>{
      const g = rq.result.transaction('kv').objectStore('kv').get('waypoints-gear-v1');
      g.onsuccess = ()=> res(JSON.parse(g.result.value));
    };
  }));
}

let server, baseUrl;
test.before(async ()=>{ server = await serveRepo(); baseUrl = 'http://127.0.0.1:' + server.address().port; });
test.after(()=> server && server.close());

test('catalog: search, pre-fill, link, overrides, refresh, contribute, review, photos', { skip: !playwright && 'playwright not installed' }, async t=>{
  const fake = createFakeSupabase({ userId: ME, seed: seedCatalog() });
  const { page, errors } = await launch(t, { signedIn: true, fake });
  await page.waitForSelector('#cloudSignOutBtn');

  await t.test('search shows catalog products with rating and photo', async ()=>{
    await openAddGear(page);
    assert.ok(await page.isVisible('#catalogSearchInput'), 'catalog search shown in the add-gear form');
    assert.equal(await page.evaluate(()=> document.activeElement.id), 'catalogSearchInput', 'search focused for new items');
    await page.fill('#catalogSearchInput', 'exos osp');
    await page.waitForSelector('.catalog-result-row');
    const rows = await page.$$eval('.catalog-result-row .catalog-result', els => els.map(e => e.innerText.replace(/\n+/g, ' | ')));
    assert.deepEqual(rows, ['Osprey Exos 58 | Backpack · 1,240 g · ★ 4.0 (1)']);
    assert.match(await page.innerText('#catalogResults'), /Can't find it\? Add "exos osp" to the catalog/);
  });

  await t.test('product page shows info, photos and reviews; "Use this product" pre-fills', async ()=>{
    await page.click('.catalog-result-row .link-btn');
    await page.waitForSelector('#cdBody', { state: 'visible' });
    assert.equal(await page.textContent('#cdTitle'), 'Osprey Exos 58');
    assert.match(await page.innerText('#cdFacts'), /Listed weight\s+1,240 g[\s\S]*Volume\s+58 L/);
    assert.equal(await page.locator('#cdPhotos .photo-thumb').count(), 1);
    assert.match(await page.innerText('#cdReviews'), /Bea[\s\S]*Comfy, small hipbelt pockets\./);
    assert.match(await page.innerText('#cdRatingSummary'), /4\.0 · 1 review/);
    await page.click('#cdUseBtn');
    await page.waitForSelector('#catalogDetailModalOverlay', { state: 'hidden' });
    // The pre-fill runs once the closed modal's history entry is popped,
    // a moment after the overlay hides.
    await page.waitForFunction(()=> document.getElementById('gearName').value !== '');
    assert.equal(await val(page, 'gearName'), 'Exos 58');
    assert.equal(await val(page, 'gearBrand'), 'Osprey');
    assert.equal(await val(page, 'gearCategory'), 'Backpack');
    assert.equal(await val(page, 'gearWeight'), '1240');
    assert.equal(await val(page, 'gearProductUrl'), 'https://www.osprey.com/exos-58');
    assert.match(await val(page, 'gearImageUrl'), /\/storage\/v1\/object\/public\/catalog-photos\/bbbbbbbb-.*\/exos\.jpg$/);
    assert.ok(await page.isVisible('#catalogLink'));
    assert.equal(await page.innerText('#catalogLinkTitle'), 'Osprey Exos 58');
    assert.ok(!(await page.isVisible('#catalogLinkRefresh')), 'no "update" for a link made just now');
  });

  await t.test('personal details + measured weight stay on the item, catalog untouched', async ()=>{
    await page.fill('#gearWeight', '1212');
    await page.fill('#gearPurchaseDate', '2024-05-01');
    await page.selectOption('#gearCondition', 'Good');
    await page.fill('#gearNotes', 'Cut the brain off');
    assert.match(await page.innerText('#catalogOverrides'), /weight 1,212 g \(catalog 1,240 g\)/);
    const writesBefore = fake.log.filter(r => r.path === '/rest/v1/catalog_products' && r.method !== 'GET').length;
    await page.click('#gearForm button[type="submit"]');
    await page.waitForSelector('#gearModalOverlay', { state: 'hidden' });
    const writesAfter = fake.log.filter(r => r.path === '/rest/v1/catalog_products' && r.method !== 'GET').length;
    assert.equal(writesAfter, writesBefore, 'saving gear never writes to the catalog');
    assert.equal(fake.db.catalog_products.find(p => p.id === EXOS_ID).weight_g, 1240);
    const item = (await savedGear(page)).find(g => g.name === 'Exos 58');
    assert.equal(item.catalogProductId, EXOS_ID);
    assert.equal(item.weightGrams, 1212);
    assert.equal(item.catalogSnapshot.weightGrams, 1240);
    assert.equal(item.purchaseDate, '2024-05-01');
    assert.equal(item.condition, 'Good');
    assert.equal(item.notes, 'Cut the brain off');
  });

  await t.test('catalog correction: "Update from catalog" keeps the override', async ()=>{
    const exos = fake.db.catalog_products.find(p => p.id === EXOS_ID);
    Object.assign(exos, { weight_g: 1230, model: '2023' });   // someone else fixed it
    exos.normalized_key = require('../../catalog-core.js').productKey(exos.brand, exos.name, exos.model);
    fake.db.revisions.push({ product_id: EXOS_ID, previous: {} });
    await page.click('#viewAllGearBtn');
    const card = page.locator('.gear-card', { hasText: 'Exos 58' });
    await card.locator('[data-action="edit"]').click();
    await page.waitForSelector('#gearModalOverlay', { state: 'visible' });
    assert.ok(await page.isVisible('#catalogLinkRefresh'));
    await page.click('#catalogLinkRefresh');
    await page.waitForFunction(()=> /Save to apply/.test(document.getElementById('catalogStatus').textContent));
    assert.match(await page.innerText('#catalogStatus'), /Updated model from the catalog\. Kept your own weight\./);
    assert.equal(await val(page, 'gearWeight'), '1212');
    assert.equal(await val(page, 'gearModel'), '2023');
    await page.click('#gearForm button[type="submit"]');
    await page.waitForSelector('#gearModalOverlay', { state: 'hidden' });
    const item = (await savedGear(page)).find(g => g.name === 'Exos 58');
    assert.equal(item.catalogSnapshot.weightGrams, 1230);
    assert.equal(item.weightGrams, 1212);
    assert.equal(item.model, '2023');
  });

  await t.test('gear card opens the product page', async ()=>{
    await page.locator('.gear-card', { hasText: 'Exos 58' }).locator('[data-action="catalog"]').click();
    await page.waitForSelector('#cdBody', { state: 'visible' });
    assert.equal(await page.textContent('#cdTitle'), 'Osprey Exos 58 2023');
    assert.ok(!(await page.isVisible('#cdUseBtn')));
    await page.click('#catalogDetailModalClose');
    await page.waitForSelector('#catalogDetailModalOverlay', { state: 'hidden' });
  });

  await t.test('existing unlinked item: suggested search, linking keeps the user\'s values', async ()=>{
    await page.locator('.gear-card', { hasText: 'Old tent' }).locator('[data-action="edit"]').click();
    await page.waitForSelector('#gearModalOverlay', { state: 'visible' });
    assert.equal(await page.innerText('#catalogSearchLabel'), 'Link this item to the gear catalog');
    assert.equal(await val(page, 'catalogSearchInput'), 'Big Agnes Old tent');
    await page.fill('#catalogSearchInput', 'copper spur');
    await page.waitForSelector('.catalog-result-row');
    await page.click('.catalog-result-row .catalog-result');
    await page.waitForSelector('#catalogLink', { state: 'visible' });
    assert.equal(await val(page, 'gearName'), 'Old tent', 'own name kept');
    assert.equal(await val(page, 'gearWeight'), '1500', 'own weight kept');
    assert.match(await page.innerText('#catalogOverrides'), /name, weight 1,500 g \(catalog 1,420 g\)/);
    await page.click('#gearForm button[type="submit"]');
    await page.waitForSelector('#gearModalOverlay', { state: 'hidden' });
    const item = (await savedGear(page)).find(g => g.id === 'g_old');
    assert.equal(item.catalogProductId, SPUR_ID);
    assert.equal(item.notes, 'patched pole');
  });

  await t.test('unlink removes the link but keeps the details', async ()=>{
    await page.locator('.gear-card', { hasText: 'Old tent' }).locator('[data-action="edit"]').click();
    await page.click('#catalogLinkUnlink');
    assert.ok(await page.isVisible('#catalogSearchInput'));
    await page.click('#gearForm button[type="submit"]');
    await page.waitForSelector('#gearModalOverlay', { state: 'hidden' });
    const item = (await savedGear(page)).find(g => g.id === 'g_old');
    assert.equal(item.catalogProductId, undefined);
    assert.equal(item.name, 'Old tent');
    assert.equal(item.brand, 'Big Agnes');
  });

  await t.test('missing product: add to catalog (validation, units, specs) and link', async ()=>{
    await openAddGear(page);
    await page.fill('#catalogSearchInput', 'zpacks duplex');
    await page.waitForSelector('.catalog-result-msg:has-text("No matches")');
    await page.click('.catalog-result:has-text("Add \\"zpacks duplex\\"")');
    await page.waitForSelector('#catalogProductModalOverlay', { state: 'visible' });
    assert.equal(await val(page, 'cpName'), 'zpacks duplex');
    await page.click('#cpSubmitBtn');
    assert.equal(await page.innerText('[data-for="brand"]'), 'Brand is required');
    await page.fill('#cpBrand', 'Zpacks');
    await page.fill('#cpName', 'Duplex');
    await page.selectOption('#cpCategory', 'Shelter');
    assert.ok(await page.isVisible('#cpSpec_capacity_persons'), 'category-specific fields appear');
    await page.fill('#cpSpec_capacity_persons', '2');
    await page.fill('#cpWeight', 'two pounds');
    await page.click('#cpSubmitBtn');
    assert.match(await page.innerText('[data-for="weight_g"]'), /Couldn't read that weight/);
    await page.fill('#cpWeight', '1.1 lb');
    await page.fill('#cpUrl', 'javascript:alert(1)');
    await page.click('#cpSubmitBtn');
    assert.match(await page.innerText('[data-for="product_url"]'), /http/);
    await page.fill('#cpUrl', 'https://zpacks.com/duplex');
    await page.click('#cpSubmitBtn');
    await page.waitForSelector('#catalogProductModalOverlay', { state: 'hidden' });
    const created = fake.db.catalog_products.find(p => p.brand === 'Zpacks');
    assert.equal(created.weight_g, 499);
    assert.deepEqual(created.specs, { capacity_persons: 2 });
    assert.equal(created.created_by, ME);
    await page.waitForSelector('#catalogLink', { state: 'visible' });
    assert.equal(await val(page, 'gearName'), 'Duplex');
    assert.equal(await val(page, 'gearWeight'), '499');
    assert.equal(await val(page, 'gearCategory'), 'Shelter');
    await page.click('#gearForm button[type="submit"]');
    await page.waitForSelector('#gearModalOverlay', { state: 'hidden' });
    assert.equal((await savedGear(page)).find(g => g.name === 'Duplex').catalogProductId, created.id);
  });

  await t.test('duplicates: exact match blocked and offered instead; near-match asks first', async ()=>{
    await openAddGear(page);
    await page.fill('#catalogSearchInput', 'exos 58 lite');
    await page.waitForSelector('.catalog-result-msg:has-text("No matches")');
    await page.click('.catalog-result:has-text("Add")');
    await page.fill('#cpBrand', 'osprey');
    await page.fill('#cpName', 'Osprey EXOS-58');
    await page.fill('#cpModel', '2023');
    await page.click('#cpSubmitBtn');
    await page.waitForSelector('#cpSimilar', { state: 'visible' });
    assert.match(await page.innerText('#cpSimilar'), /already in the catalog/);
    assert.equal(await page.locator('#cpSimilar .link-btn').count(), 0, 'no "add anyway" for an exact duplicate');
    // A different model is a near-match: allowed after confirming.
    await page.fill('#cpModel', 'Lite');
    await page.click('#cpSubmitBtn');
    await page.waitForSelector('#cpSimilar .link-btn');
    assert.match(await page.innerText('#cpSimilar'), /Is it one of these\?/);
    // …but pick the existing one instead.
    await page.click('#cpSimilar .catalog-similar-row button');
    await page.waitForSelector('#catalogProductModalOverlay', { state: 'hidden' });
    await page.waitForSelector('#catalogLink', { state: 'visible' });
    assert.equal(await page.innerText('#catalogLinkTitle'), 'Osprey Exos 58 2023');
    assert.equal(fake.db.catalog_products.filter(p => p.brand.toLowerCase() === 'osprey').length, 1, 'no duplicate created');
    await page.click('#gearCancelBtn');
    await page.waitForSelector('#gearModalOverlay', { state: 'hidden' });
  });

  await t.test('reviews: display name asked once, rating required, edit own review', async ()=>{
    await page.click('#viewAllGearBtn');
    await page.locator('.gear-card', { hasText: 'Duplex' }).locator('[data-action="catalog"]').click();
    await page.waitForSelector('#cdBody', { state: 'visible' });
    assert.match(await page.innerText('#cdReviews'), /Be the first/);
    await page.click('#cdWriteReviewBtn');
    await page.waitForSelector('#cdNameField', { state: 'visible' });
    await page.fill('#cdDisplayName', 'Darien');
    await page.fill('#cdReviewText', 'Roomy for two.\nCondensation on cold nights.');
    await page.click('#cdReviewSubmitBtn');
    assert.equal(await page.innerText('#cdReviewError'), 'Pick a star rating.');
    await page.click('#cdStars label:nth-child(4)');
    await page.click('#cdReviewSubmitBtn');
    await page.waitForSelector('#cdReviewForm', { state: 'hidden' });
    assert.match(await page.innerText('#cdReviews'), /Darien[\s\S]*Roomy for two\.\nCondensation on cold nights\./);
    assert.match(await page.innerText('#cdRatingSummary'), /4\.0 · 1 review/);
    assert.equal(await page.innerText('#cdWriteReviewBtn'), 'Edit your review');
    await page.click('#cdWriteReviewBtn');
    await page.waitForTimeout(200);  // profile lookup
    assert.ok(!(await page.isVisible('#cdNameField')), 'display name not asked again');
    assert.equal(await page.inputValue('#cdReviewText'), 'Roomy for two.\nCondensation on cold nights.');
    await page.click('#cdStars label:nth-child(5)');
    await page.click('#cdReviewSubmitBtn');
    await page.waitForSelector('#cdReviewForm', { state: 'hidden' });
    assert.match(await page.innerText('#cdRatingSummary'), /5\.0 · 1 review/);
    assert.equal(fake.db.reviews.filter(r => r.user_id === ME).length, 1, 'still one review per user');
  });

  await t.test('photos: upload into own folder, remove own photo', async ()=>{
    await page.setInputFiles('#cdPhotoInput', { name: 'tent.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8Dwn4GBgYGJgYEBAA4LAQEf0VGTAAAAAElFTkSuQmCC', 'base64') });
    await page.waitForSelector('#cdPhotos .photo-thumb');
    assert.match(await page.innerText('#cdPhotoStatus'), /Added 1 photo/);
    const upload = fake.log.find(r => r.method === 'POST' && r.path.startsWith('/storage/v1/object/catalog-photos/'));
    assert.ok(upload.path.includes('/' + ME + '/'), 'uploaded into the user\'s own folder');
    assert.equal(fake.db.catalog_photos.filter(ph => ph.uploaded_by === ME).length, 1);
    await page.click('#cdPhotos .photo-thumb');
    await page.waitForSelector('#photoLightboxOverlay', { state: 'visible' });
    assert.match(await page.getAttribute('#photoLightboxImg', 'src'), /catalog-photos/);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#photoLightboxOverlay', { state: 'hidden' });
    await page.hover('#cdPhotos .photo-thumb');
    await page.click('#cdPhotos .photo-thumb-remove');
    await page.waitForFunction(()=> !document.querySelector('#cdPhotos .photo-thumb'));
    assert.equal(fake.db.catalog_photos.filter(ph => ph.uploaded_by === ME).length, 0);
  });

  await t.test('editing a product is logged and visible to all', async ()=>{
    await page.click('#cdEditBtn');
    await page.waitForSelector('#catalogProductModalOverlay', { state: 'visible' });
    assert.equal(await page.innerText('#cpSubmitBtn'), 'Save changes');
    assert.equal(await val(page, 'cpWeight'), '499 g');
    await page.fill('#cpWeight', '510 g');
    await page.click('#cpSubmitBtn');
    await page.waitForSelector('#catalogProductModalOverlay', { state: 'hidden' });
    await page.waitForFunction(()=> /510 g/.test(document.getElementById('cdFacts').textContent));
    assert.match(await page.innerText('#cdMeta'), /edited 1 time/);
    assert.equal(fake.db.revisions.length, 2, 'the earlier Exos fix + this edit');
  });

  assert.deepEqual(errors, []);
});

test('catalog when signed out: browse and read, contributing asks to sign in', { skip: !playwright && 'playwright not installed' }, async t=>{
  const fake = createFakeSupabase({ userId: null, seed: seedCatalog() });
  const { page, errors } = await launch(t, { signedIn: false, fake });
  await openAddGear(page);
  await page.fill('#catalogSearchInput', 'exos');
  await page.waitForSelector('.catalog-result-row');
  assert.match(await page.innerText('#catalogResults'), /Sign in to add it to the catalog/);
  await page.click('.catalog-result-row .link-btn');
  await page.waitForSelector('#cdBody', { state: 'visible' });
  assert.equal(await page.innerText('#cdWriteReviewBtn'), 'Sign in to review');
  assert.equal(await page.innerText('#cdEditBtn'), 'Sign in to edit');
  await page.click('#cdWriteReviewBtn');
  await page.waitForSelector('#cloudSignInModalOverlay', { state: 'visible' });
  assert.deepEqual(errors, []);
});

test('without the catalog (script blocked / offline): gear room still works', { skip: !playwright && 'playwright not installed' }, async t=>{
  const fake = createFakeSupabase({ userId: null, seed: seedCatalog() });
  const { page, errors } = await launch(t, { signedIn: false, blockCatalogCore: true, fake });
  await openAddGear(page);
  assert.ok(!(await page.isVisible('#catalogField')), 'catalog search hidden');
  await page.fill('#gearName', 'Spork');
  await page.click('#gearForm button[type="submit"]');
  await page.waitForSelector('#gearModalOverlay', { state: 'hidden' });
  assert.ok((await savedGear(page)).some(g => g.name === 'Spork'));
  assert.deepEqual(errors, []);
});

test('catalog: "Look it up" from a link and bulk "Add products from links"', { skip: !playwright && 'playwright not installed' }, async t=>{
  const fake = createFakeSupabase({ userId: ME, seed: seedCatalog(), lookups: {
    'https://brand.example.com/xlite': { name: 'NeoAir XLite NXT', brand: 'Therm-a-Rest', model: 'Regular', category: 'Sleep system',
      weight_g: 354, weight_text: 'Weight 354 g', found: ['name', 'brand', 'model', 'weight', 'category'], source_url: 'https://brand.example.com/xlite' },
    'https://shop.example.com/blocked': { error: 'That website doesn\'t allow automatic lookups — fill the details in by hand.' },
    'https://brand.example.com/squeeze': { name: 'Squeeze Water Filter System', brand: 'Sawyer', category: 'Water', weight_g: 85,
      weight_text: 'Weight: 3 oz', found: ['name', 'brand', 'weight', 'category'] },
    'https://shop.example.com/exos': { name: 'Exos 58', brand: 'Osprey', category: 'Backpack', weight_g: 1240, found: ['name', 'brand', 'weight', 'category'] },
    'https://brand.example.com/poles': { name: 'Distance Carbon Z', brand: '', category: 'Other', weight_g: null, found: ['name'] },
  } });
  const { page, errors } = await launch(t, { signedIn: true, fake });
  await page.waitForSelector('#cloudSignOutBtn');

  await t.test('product form: Look it up fills the fields and records the source', async ()=>{
    await openAddGear(page);
    await page.fill('#catalogSearchInput', 'xlite');
    await page.waitForSelector('.catalog-result-msg:has-text("No matches")');
    await page.click('.catalog-result:has-text("Add")');
    await page.waitForSelector('#catalogProductModalOverlay', { state: 'visible' });
    assert.ok(await page.isVisible('#cpLookupField'));
    await page.fill('#cpLookupUrl', 'https://shop.example.com/blocked');
    await page.click('#cpLookupBtn');
    await page.waitForFunction(()=> /doesn't allow automatic lookups/.test(document.getElementById('cpLookupStatus').textContent));
    await page.fill('#cpLookupUrl', 'https://brand.example.com/xlite');
    await page.press('#cpLookupUrl', 'Enter');
    await page.waitForFunction(()=> /Filled in from brand\.example\.com/.test(document.getElementById('cpLookupStatus').textContent));
    assert.equal(await val(page, 'cpBrand'), 'Therm-a-Rest');
    assert.equal(await val(page, 'cpName'), 'NeoAir XLite NXT');
    assert.equal(await val(page, 'cpModel'), 'Regular');
    assert.equal(await val(page, 'cpCategory'), 'Sleep system');
    assert.equal(await val(page, 'cpWeight'), '354 g');
    assert.ok(await page.isVisible('#cpSpec_r_value'), 'category spec fields follow the looked-up category');
    await page.click('#cpSubmitBtn');
    await page.waitForSelector('#catalogProductModalOverlay', { state: 'hidden' });
    const created = fake.db.catalog_products.find(p => p.brand === 'Therm-a-Rest');
    assert.equal(created.origin, 'link');
    assert.equal(created.source_url, 'https://brand.example.com/xlite');
    await page.waitForSelector('#catalogLink', { state: 'visible' });
    assert.equal(await val(page, 'gearWeight'), '354');
    await page.click('#catalogLinkView');
    await page.waitForSelector('#cdBody', { state: 'visible' });
    assert.match(await page.innerText('#cdFacts'), /Specs from\s+brand\.example\.com/);
    await page.click('#catalogDetailModalClose');
    await page.click('#gearCancelBtn');
    await page.waitForSelector('#gearModalOverlay', { state: 'hidden' });
  });

  await t.test('bulk: look up several links, review, fix, add', async ()=>{
    await page.click('.nav-tab[data-page="gear"]');
    await page.click('#catalogBulkBtn');
    await page.waitForSelector('#catalogBulkModalOverlay', { state: 'visible' });
    await page.click('#bulkLookupBtn');
    assert.match(await page.innerText('#bulkPasteError'), /at least one link/);
    await page.fill('#bulkUrls', ['https://brand.example.com/squeeze', 'https://shop.example.com/exos', 'not a link',
      'https://shop.example.com/blocked', 'https://brand.example.com/poles', 'https://brand.example.com/squeeze'].join('\n'));
    await page.click('#bulkLookupBtn');
    await page.waitForSelector('#bulkStepReview', { state: 'visible' });
    assert.match(await page.innerText('#bulkSummary'), /2 products ready to review · 1 already in the catalog · 1 couldn't be read/);
    const notes = await page.$$eval('.bulk-row-note', ns => ns.map(n => n.textContent));
    assert.equal(notes.length, 4, 'duplicates and non-links removed from the list');
    assert.match(notes[0], /brand\.example\.com · weight from "Weight: 3 oz"/);
    assert.match(notes[1], /Already in the catalog as "Osprey Exos 58"/);
    assert.match(notes[2], /doesn't allow automatic lookups/);
    assert.match(notes[3], /no weight found/);
    assert.equal(await page.innerText('#bulkAddBtn'), 'Add 2 to catalog');
    // The poles row has no brand: adding it must ask for one, without losing the other row.
    await page.click('#bulkAddBtn');
    await page.waitForFunction(()=> /need fixing/.test(document.getElementById('bulkReviewError').textContent));
    assert.match(await page.innerText('#bulkReviewError'), /Added 1\. 1 need fixing/);
    assert.ok(fake.db.catalog_products.some(p => p.brand === 'Sawyer' && p.origin === 'link'));
    const poles = page.locator('.bulk-row').nth(3);
    assert.match(await poles.locator('.bulk-row-note').innerText(), /Brand is required/);
    await poles.locator('[data-f="brand"]').fill('Black Diamond');
    await poles.locator('[data-f="weight_g"]').fill('290');
    await page.click('#bulkAddBtn');
    await page.waitForSelector('#bulkStepDone', { state: 'visible' });
    assert.equal(await page.textContent('#bulkDoneTitle'), 'Added 1 product to the catalog');
    const bd = fake.db.catalog_products.find(p => p.brand === 'Black Diamond');
    assert.equal(bd.weight_g, 290);
    assert.equal(bd.source_url, 'https://brand.example.com/poles');
    assert.equal(fake.db.catalog_products.filter(p => p.brand === 'Sawyer').length, 1, 'not added twice');
    await page.click('#bulkDoneBtn');
    await page.waitForSelector('#catalogBulkModalOverlay', { state: 'hidden' });
  });

  assert.deepEqual(errors, []);
});

test('catalog: bulk add asks signed-out users to sign in', { skip: !playwright && 'playwright not installed' }, async t=>{
  const fake = createFakeSupabase({ userId: null, seed: seedCatalog() });
  const { page } = await launch(t, { signedIn: false, fake });
  await page.click('.nav-tab[data-page="gear"]');
  await page.click('#catalogBulkBtn');
  await page.waitForSelector('#cloudSignInModalOverlay', { state: 'visible' });
  assert.ok(!(await page.isVisible('#catalogBulkModalOverlay')));
});
