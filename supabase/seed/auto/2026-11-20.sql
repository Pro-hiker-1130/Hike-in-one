insert into public.catalog_products (brand, name, model, category, weight_g, specs, description, source_url, origin) values
('Suunto', '5 Peak', null, 'Navigation', 39, '{}', 'Light GPS sport watch. Listed weight is the brand figure for the watch itself.', 'https://suunto.com/News/lighter-sleeker-longer-lasting--introducing-the-new-suunto-5-peak-gps-sport-watch', 'seed'),
('Suunto', 'M-9 NH Wrist Compass', 'With velcro strap', 'Navigation', 16, '{}', 'Compact wrist compass for the northern hemisphere. Listed weight is the brand figure of 16 g.', 'https://us.suunto.com/products/suunto-m-9-black-black-nh-with-velcro-strap', 'seed'),
('Silva', 'Starter 1-2-3', null, 'Navigation', 28, '{}', 'Simple baseplate compass for beginners. Most retailers list about 28 g, a few list 26 g.', 'https://spryactive.ca/products/starter-1-2-3-compass', 'seed'),
('Platypus', 'Platy Bottle', '2.0 L', 'Water', 37, '{"capacity_ml": 2000}', 'Collapsible 2 L water bottle. Brand lists 0.04 kg (1.3 oz); retailers give 34 to 40 g.', 'https://cascadedesigns.com/products/platy-r-2-0l-bottle', 'seed'),
('Platypus', 'SoftBottle', '1.0 L', 'Water', 34, '{"capacity_ml": 1000}', 'Collapsible 1 L water bottle with closure cap. Two retailers list 34 g; one lists 29 g.', 'https://www.packhacker.com/travel-gear/platypus/softbottle-1-0l-with-closure-cap', 'seed')
on conflict (normalized_key) do nothing;
