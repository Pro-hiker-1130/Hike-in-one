insert into public.catalog_products (brand, name, model, category, weight_g, specs, description, source_url, origin) values
('Real Turmat', 'Beef Stew', null, 'Food', 128, '{}', 'Freeze-dried trekking meal. Listed weight is the dry food only (net); with the pouch it is about 145 g. It makes about 500 g once prepared.', 'https://lynxgear.lv/en/online-store/food/real-turmat-beef-stew,-128-g,-573-kcal.htm', 'seed'),
('Lyofood', 'Bigos', null, 'Food', 53, '{}', 'Freeze-dried Polish hunter''s stew. Listed weight is the dry food in the standard big serving; add about 447 ml of hot water.', 'https://lyofood.com/products/bigos', 'seed'),
('Trek''n Eat', 'Chicken Tikka Masala', null, 'Food', 150, '{}', 'Freeze-dried chicken curry meal. Listed weight is the dry food only (net); with the pouch it is about 176 g.', 'https://www.snowleader.com/en/poulet-tikka-masala-TREK00012.html', 'seed')
on conflict (normalized_key) do nothing;
