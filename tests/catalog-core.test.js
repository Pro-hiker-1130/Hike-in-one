// Unit tests for the catalog linking / pre-fill logic.
// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../catalog-core.js');

const exos = {
  id: 'p-exos', name: 'Exos 58', brand: 'Osprey', model: null, category: 'Backpack',
  weight_g: 1240, product_url: 'https://www.osprey.com/exos-58', specs: { volume_l: 58 },
};
const quilt = {
  id: 'p-quilt', name: 'Revelation 20', brand: 'Enlightened Equipment', model: 'Regular/Regular',
  category: 'Sleep system', weight_g: 595, specs: { temp_comfort_c: -7, temp_limit_c: -12 },
};
const shell = { id: 'p-shell', name: 'Torrentshell 3L', brand: 'Patagonia', category: 'Clothing', weight_g: 394, specs: { waterproof: true } };
const PHOTO = 'https://x.supabase.co/storage/v1/object/public/catalog-photos/u/exos.jpg';

const emptyForm = { name: '', brand: '', model: '', category: 'Other', weightGrams: null, imageUrl: '', productUrl: '',
  waterproof: '', tempRating: '', price: 180, purchaseDate: '2024-05-01', condition: 'Good', notes: 'mine', quantity: 1 };

test('normalize / productKey mirror the SQL duplicate rules', () => {
  assert.equal(C.normalize('  EXOS-58!! '), 'exos 58');
  assert.equal(C.normalize('Fjällräven Abisko'), 'fjällräven abisko');
  assert.equal(C.productKey('Osprey', 'Osprey Exos 58', ''), C.productKey('osprey ', 'Exos 58', null));
  assert.notEqual(C.productKey('Osprey', 'Exos 58', '2023'), C.productKey('Osprey', 'Exos 58', ''));
  // Brand only stripped when it's a whole leading word.
  assert.equal(C.productKey('Exped', 'Expedition pack', ''), 'exped|expedition pack|');
});

test('parseWeightInput understands common units', () => {
  assert.equal(C.parseWeightInput('1240'), 1240);
  assert.equal(C.parseWeightInput('1.24 kg'), 1240);
  assert.equal(C.parseWeightInput('1,24kg'), 1240);
  assert.equal(C.parseWeightInput('850 g'), 850);
  assert.equal(C.parseWeightInput('42 oz'), 1191);
  assert.equal(C.parseWeightInput('2 lb 3 oz'), 992);
  assert.equal(C.parseWeightInput(''), null);
  assert.equal(C.parseWeightInput('about 2 kg-ish'), null);
});

test('validateProduct matches the database constraints', () => {
  const ok = C.validateProduct({ name: ' Exos 58 ', brand: 'Osprey', category: 'Backpack', weight_g: '1240', specs: { volume_l: '58' } });
  assert.ok(ok.ok);
  assert.deepEqual(ok.value.specs, { volume_l: 58 });
  assert.equal(ok.value.name, 'Exos 58');
  assert.equal(ok.value.model, null);

  const bad = C.validateProduct({ name: 'x', brand: '', category: 'Kayak', weight_g: 0, product_url: 'javascript:alert(1)' });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['brand', 'category', 'name', 'product_url', 'weight_g']);
  assert.equal(C.validateProduct({ name: 'Tent', brand: 'B', weight_g: 60000 }).errors.weight_g, 'Weight must be between 1 g and 50 kg');
  assert.ok(C.validateProduct({ name: 'Mat', brand: 'B', category: 'Sleep system', specs: { r_value: 'warm' } }).errors.spec_r_value);
  // Specs for another category are dropped, not stored.
  assert.deepEqual(C.validateProduct({ name: 'Tent', brand: 'B', category: 'Shelter', specs: { volume_l: 40 } }).value.specs, {});
});

test('pre-fill: a new item takes the catalog fields and keeps personal ones', () => {
  const filled = C.prefillFields(emptyForm, exos, PHOTO, false);
  assert.equal(filled.name, 'Exos 58');
  assert.equal(filled.brand, 'Osprey');
  assert.equal(filled.category, 'Backpack');
  assert.equal(filled.weightGrams, 1240);
  assert.equal(filled.imageUrl, PHOTO);
  assert.equal(filled.productUrl, 'https://www.osprey.com/exos-58');
  // Personal details untouched.
  assert.equal(filled.price, 180);
  assert.equal(filled.purchaseDate, '2024-05-01');
  assert.equal(filled.condition, 'Good');
  assert.equal(filled.notes, 'mine');
});

test('pre-fill: switching products replaces the previous pick on a new item', () => {
  const first = C.prefillFields(emptyForm, quilt, '', false);
  assert.equal(first.tempRating, '-7°C');
  const second = C.prefillFields(first, exos, '', false);
  assert.equal(second.name, 'Exos 58');
  assert.equal(second.tempRating, '', 'quilt temp rating must not linger on a backpack');
  assert.equal(second.model, '');
});

test('pre-fill: category specs map onto the gear item fields', () => {
  assert.equal(C.productToGearFields(quilt).tempRating, '-7°C');
  assert.equal(C.productToGearFields({ ...quilt, specs: { temp_limit_c: -12 } }).tempRating, '-12°C');
  assert.equal(C.productToGearFields(shell).waterproof, 'yes');
  assert.equal(C.productToGearFields({ ...shell, specs: { waterproof: false } }).waterproof, 'no');
  assert.equal(C.productToGearFields({ ...exos, category: 'Weird' }).category, 'Other');
});

test('pre-fill: linking an existing item keeps what the user already entered', () => {
  const mine = { ...emptyForm, name: 'My Exos', weightGrams: 1212, category: 'Other' };
  const filled = C.prefillFields(mine, exos, PHOTO, true);
  assert.equal(filled.name, 'My Exos');
  assert.equal(filled.weightGrams, 1212, 'measured weight preserved');
  assert.equal(filled.brand, 'Osprey', 'empty fields are filled');
  assert.equal(filled.category, 'Backpack', 'default "Other" counts as empty');
});

test('linkItem stores the id and a snapshot; overrides are diffs from it', () => {
  let item = C.linkItem(C.prefillFields(emptyForm, exos, PHOTO, false), exos, PHOTO);
  assert.equal(item.catalogProductId, 'p-exos');
  assert.equal(item.catalogSnapshot.weightGrams, 1240);
  assert.ok(C.isLinked(item));
  assert.deepEqual(C.overriddenFields(item), []);
  assert.equal(C.weightComparison(item), null);

  item = { ...item, weightGrams: 1212, name: 'Exos 58 (cut-down hipbelt)' };
  assert.deepEqual(C.overriddenFields(item).sort(), ['name', 'weightGrams']);
  assert.deepEqual(C.weightComparison(item), { mine: 1212, catalog: 1240, diff: -28 });
  // Whitespace / number-vs-string noise isn't an override.
  assert.deepEqual(C.overriddenFields({ ...item, weightGrams: 1240, name: ' Exos 58 ' }), []);
});

test('the personal override never changes the catalog product', () => {
  const product = JSON.parse(JSON.stringify(exos));
  const item = C.linkItem(C.prefillFields(emptyForm, product, '', false), product, '');
  item.weightGrams = 1100;
  C.overriddenFields(item);
  C.refreshFromCatalog(item, product, '');
  assert.deepEqual(product, exos);
});

test('refreshFromCatalog applies catalog corrections but keeps overrides', () => {
  const item = { ...C.linkItem(C.prefillFields(emptyForm, exos, '', false), exos, ''), weightGrams: 1212 };
  const corrected = { ...exos, weight_g: 1230, model: '2023', product_url: 'https://www.osprey.com/new' };
  const { item: out, updated, kept } = C.refreshFromCatalog(item, corrected, PHOTO);
  assert.equal(out.weightGrams, 1212, 'user override kept');
  assert.deepEqual(kept, ['weightGrams']);
  assert.deepEqual(updated.sort(), ['imageUrl', 'model', 'productUrl']);
  assert.equal(out.model, '2023');
  assert.equal(out.catalogSnapshot.weightGrams, 1230, 'snapshot moves to the latest catalog values');
  // Still an override against the new snapshot.
  assert.deepEqual(C.overriddenFields(out), ['weightGrams']);
  // Personal fields survive.
  assert.equal(out.price, 180);
  assert.equal(out.notes, 'mine');
});

test('refresh with no catalog change is a no-op', () => {
  const item = C.linkItem(C.prefillFields(emptyForm, exos, PHOTO, false), exos, PHOTO);
  const r = C.refreshFromCatalog(item, exos, PHOTO);
  assert.deepEqual(r.updated, []);
  assert.deepEqual(r.kept, []);
  assert.deepEqual(r.item, item);
});

test('unlinked (pre-existing) items keep working untouched', () => {
  const legacy = { id: 'g1', name: 'Old tent', brand: 'Hilleberg', weightGrams: 2000 };
  assert.equal(C.isLinked(legacy), false);
  assert.deepEqual(C.overriddenFields(legacy), []);
  assert.equal(C.weightComparison(legacy), null);
  assert.deepEqual(C.refreshFromCatalog(legacy, exos, '').item, legacy);
  const linked = C.linkItem(legacy, exos, '');
  assert.deepEqual(C.unlinkItem(linked), legacy);
});

test('suggestQueryForItem builds a catalog search for an unlinked item', () => {
  assert.equal(C.suggestQueryForItem({ name: 'Exos 58', brand: 'Osprey' }), 'Osprey Exos 58');
  assert.equal(C.suggestQueryForItem({ name: 'Osprey Exos 58', brand: 'Osprey' }), 'Osprey Exos 58');
  assert.equal(C.suggestQueryForItem({ name: 'Spork' }), 'Spork');
});

test('photoPublicUrl builds a Supabase public-bucket URL', () => {
  assert.equal(C.photoPublicUrl('https://abc.supabase.co/', 'u1/my photo.jpg'),
    'https://abc.supabase.co/storage/v1/object/public/catalog-photos/u1/my%20photo.jpg');
  assert.equal(C.photoPublicUrl('https://abc.supabase.co', ''), '');
});
