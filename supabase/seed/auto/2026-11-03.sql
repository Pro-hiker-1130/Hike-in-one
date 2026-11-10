insert into public.catalog_products (brand, name, model, category, weight_g, specs, description, source_url, origin) values
('Expedition Foods', 'Vegetable Stir Fry', '450 kcal single serving', 'Food', 109, '{}', 'Freeze-dried meal. Listed weight is the dry food only (the brand''s table); with the pouch it is about 124 g.', 'https://expeditionfoods.com/products/vegetable-stir-fry', 'seed'),
('Expedition Foods', 'Three Cheese Scrambled Eggs', '450 kcal single serving', 'Food', 87, '{}', 'Freeze-dried breakfast. Listed weight is the dry food only (the brand''s table); with the pouch it is about 102 g.', 'https://expeditionfoods.com/products/three-cheese-scrambled-eggs', 'seed'),
('Firepot', 'Beef Stew with Pearl Barley', 'Regular serving', 'Food', 110, '{}', 'Dehydrated trekking meal. Listed weight is the net food weight; with the pouch it is about 135 g.', 'https://www.castlebergoutdoors.co.uk/firepot-beef-stew-with-pearl-barley', 'seed')
on conflict (normalized_key) do nothing;
