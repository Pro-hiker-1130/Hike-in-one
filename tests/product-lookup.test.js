// Unit tests for supabase/functions/product-lookup (the free link lookup).
// The function is TypeScript for Supabase's Deno runtime; Node runs it
// with --experimental-strip-types (see package.json "test").
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

let L;
test.before(async ()=>{ L = await import(path.join(__dirname, '../supabase/functions/product-lookup/index.ts')); });

const page = (head, body = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const ld = obj => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

test('JSON-LD Product: name, brand object, QuantitativeValue weight, category', ()=>{
  const html = page(ld({ '@context': 'https://schema.org', '@type': 'Product', name: 'Osprey Exos 58',
    brand: { '@type': 'Brand', name: 'Osprey' }, category: 'Backpacks',
    weight: { '@type': 'QuantitativeValue', value: 1.24, unitCode: 'KGM' } }) +
    '<link rel="canonical" href="/us/exos-58">');
  const r = L.extractProduct(html, 'https://www.osprey.com/us/exos-58?color=blue');
  assert.equal(r.name, 'Exos 58', 'brand stripped from the name');
  assert.equal(r.brand, 'Osprey');
  assert.equal(r.weight_g, 1240);
  assert.equal(r.category, 'Backpack');
  assert.equal(r.product_url, 'https://www.osprey.com/us/exos-58');
  assert.equal(r.source_url, 'https://www.osprey.com/us/exos-58?color=blue');
  assert.deepEqual(r.found, ['name', 'brand', 'weight', 'category']);
});

test('@graph with additionalProperty weight in ounces', ()=>{
  const html = page(ld({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', name: 'Gear Shop' },
    { '@type': 'Product', name: 'Duplex Tent', brand: 'Zpacks',
      additionalProperty: [{ '@type': 'PropertyValue', name: 'Color', value: 'Olive' }, { '@type': 'PropertyValue', name: 'Trail Weight', value: '19.4 oz' }] },
  ] }));
  const r = L.extractProduct(html, 'https://shop.example.com/duplex');
  assert.equal(r.name, 'Duplex Tent');
  assert.equal(r.brand, 'Zpacks');
  assert.equal(r.weight_g, 550);
  assert.equal(r.category, 'Shelter');
});

test('Shopify-style ProductGroup: weight from the first variant', ()=>{
  const html = page(ld({ '@type': 'ProductGroup', name: 'NeoAir XLite NXT Sleeping Pad', brand: { name: 'Therm-a-Rest' },
    hasVariant: [{ '@type': 'Product', name: 'Regular', weight: { value: 354, unitText: 'g' } }] }));
  const r = L.extractProduct(html, 'https://example.com/xlite');
  assert.equal(r.weight_g, 354);
  assert.equal(r.category, 'Sleep system');
});

test('No structured data: OpenGraph title + "Minimum trail weight 2 lbs. 11 oz" text', ()=>{
  const html = page('<meta property="og:title" content="Big Agnes Copper Spur HV UL2 Tent | Outdoor Shop">' +
    '<meta property="product:brand" content="Big Agnes">',
    '<div>Specs</div><table><tr><td>Minimum trail weight</td><td>2 lbs. 11 oz</td></tr></table><script>var weight = 5 g;</script>');
  const r = L.extractProduct(html, 'https://shop.example.com/copper-spur');
  assert.equal(r.name, 'Copper Spur HV UL2 Tent');
  assert.equal(r.brand, 'Big Agnes');
  assert.equal(r.weight_g, 1219);
  assert.match(r.weight_text, /trail weight 2 lbs\. 11 oz/i);
  assert.equal(r.category, 'Shelter');
});

test('Thousands separators and European decimals in weights', ()=>{
  assert.equal(L.weightToGrams('1,240 g'), 1240);
  assert.equal(L.weightToGrams('1.240 g'), 1240);
  assert.equal(L.weightToGrams('1,24 kg'), 1240);
  assert.equal(L.weightToGrams('595 g / 21 oz'), 595);
  assert.equal(L.weightToGrams('21 oz'), 595);
  assert.equal(L.weightToGrams('1 lb 5 oz'), 595);
  assert.equal(L.weightToGrams({ value: '1240', unitCode: 'GRM' }), 1240);
  assert.equal(L.weightToGrams('heavy'), null);
  assert.equal(L.weightToGrams('0 g'), null);
  assert.equal(L.weightFromText('Gewicht: 1.240 g (Größe M)').grams, 1240);
});

test('Broken JSON-LD is ignored, page title tails are trimmed, HTML entities decoded', ()=>{
  const html = page('<script type="application/ld+json">{ not json </script><title>Patagonia Torrentshell 3L Rain Jacket &amp; Hood - Free Shipping</title>' +
    '<meta property="og:brand" content="Patagonia">', '<p>Weight: 394 g (14 oz)</p>');
  const r = L.extractProduct(html, 'https://example.com/ts');
  assert.equal(r.name, 'Torrentshell 3L Rain Jacket & Hood');
  assert.equal(r.weight_g, 394);
  assert.equal(r.category, 'Clothing');
});

test('Model kept only when it is a human-readable version, not a SKU', ()=>{
  const a = L.extractProduct(page(ld({ '@type': 'Product', name: 'Lone Peak', brand: 'Altra', model: '8' })), 'https://x.com/a');
  assert.equal(a.model, '8');
  const b = L.extractProduct(page(ld({ '@type': 'Product', name: 'Lone Peak', brand: 'Altra', model: 'AL0A82C9' })), 'https://x.com/b');
  assert.equal(b.model, '');
});

test('guessCategory', ()=>{
  const cases = {
    'Hoka Speedgoat 6 trail running shoe': 'Footwear', 'Sawyer Squeeze water filter': 'Water',
    'MSR PocketRocket 2 stove': 'Cooking', 'Petzl Actik Core headlamp': 'Electronics',
    'Garmin inReach Mini 2 satellite communicator': 'Navigation', 'Western Mountaineering UltraLite sleeping bag': 'Sleep system',
    'Gossamer Gear Mariposa 60 backpack': 'Backpack', 'Arc\'teryx Beta LT jacket': 'Clothing',
    'Adventure Medical Kits first aid kit': 'Safety', 'Mystery thing': 'Other',
  };
  for (const [text, cat] of Object.entries(cases)) assert.equal(L.guessCategory(text), cat, text);
});

test('checkTargetUrl blocks non-public targets', ()=>{
  const bad = ['http://localhost/x', 'http://127.0.0.1/', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://172.20.0.1/',
    'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'http://metadata.google.internal/', 'ftp://example.com/file',
    'https://user:pass@example.com/', 'https://example.com:8443/', 'https://intranet/', 'not a url', 'http://printer.local/'];
  for (const u of bad) assert.throws(()=> L.checkTargetUrl(u), L.LookupError, u);
  assert.equal(L.checkTargetUrl(' https://www.osprey.com/us/exos-58 ').hostname, 'www.osprey.com');
});

test('lookup(): follows redirects with re-checks, explains blocked/non-HTML pages', async ()=>{
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async url => url === 'https://short.example.com/x'
      ? new Response('', { status: 301, headers: { location: 'http://192.168.0.10/admin' } })
      : new Response('nope', { status: 500 });
    await assert.rejects(L.lookup('https://short.example.com/x'), /isn't a public website/);

    globalThis.fetch = async ()=> new Response('denied', { status: 403, headers: { 'content-type': 'text/html' } });
    await assert.rejects(L.lookup('https://shop.example.com/p'), /doesn't allow automatic lookups/);

    globalThis.fetch = async ()=> new Response('%PDF', { status: 200, headers: { 'content-type': 'application/pdf' } });
    await assert.rejects(L.lookup('https://shop.example.com/p.pdf'), /isn't a web page/);

    globalThis.fetch = async url => url === 'https://brand.example.com/old'
      ? new Response('', { status: 302, headers: { location: '/new' } })
      : new Response(page(ld({ '@type': 'Product', name: 'Squeeze Water Filter System', brand: 'Sawyer', weight: '3 oz' })), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    const r = await L.lookup('https://brand.example.com/old');
    assert.equal(r.source_url, 'https://brand.example.com/new');
    assert.equal(r.weight_g, 85);
    assert.equal(r.category, 'Water');

    globalThis.fetch = async ()=> new Response(page('<title></title>'), { status: 200, headers: { 'content-type': 'text/html' } });
    await assert.rejects(L.lookup('https://shop.example.com/empty'), /Couldn't find product details/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
