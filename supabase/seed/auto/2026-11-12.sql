insert into public.catalog_products (brand, name, model, category, weight_g, specs, description, source_url, origin) values
('Petzl', 'IKO Core', null, 'Electronics', 79, '{"battery_mah":1250}', 'Light rechargeable headlamp, 500 lumens. Listed weight is the brand''s 79 g; a reviewer weighed it at 80-83 g.', 'https://petzl.com/NL/en/Sport/Headlamps/IKO-CORE', 'seed'),
('Anker', 'Nano Power Bank', '10000 mAh, 30W, built-in cable', 'Electronics', 215, '{"battery_mah":10000}', 'Pocket power bank with a built-in USB-C cable. Listed weight is 215 g; one retailer lists 213 g.', 'https://www.anker.com/uk/products/a1259-built-in-cable-power-bank-10000mah', 'seed'),
('Garmin', 'Instinct Crossover', 'Solar Standard Edition', 'Navigation', 65, '{}', 'Hybrid analog GPS watch. Listed weight is 65 g; the AMOLED version is about 67 g.', 'https://www.fleetfeetsports.com/products/garmin-instinct-crossover-solar', 'seed'),
('Optimus', 'Vega', null, 'Cooking', 178, '{}', 'Remote-canister stove with a low centre of gravity. Listed weight is the brand''s 178 g for the stove.', 'https://www.boundarywaterscatalog.com/optimus/optimus-vega-camp-stove-13129', 'seed')
on conflict (normalized_key) do nothing;
