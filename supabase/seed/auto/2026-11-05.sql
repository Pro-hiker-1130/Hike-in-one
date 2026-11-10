insert into public.catalog_products (brand, name, model, category, weight_g, specs, description, source_url, origin) values
('Lifesystems', 'Heatshield Blanket', 'Single', 'Safety', 84, '{}', 'Reusable emergency blanket, 210 x 150 cm. Listed weight is 84 g; two retailers list 87 g.', 'https://lifeventure.com/products/heatshield-thermal-blanket', 'seed'),
('Silva', 'Expedition 4', null, 'Navigation', 36, '{}', 'Baseplate map compass. Listed weight is 36 g for the standard model; the military and southern-hemisphere versions weigh more.', 'https://www.cotswoldoutdoor.com/p/silva-expedition-4-compass-E9224115.html', 'seed'),
('Suunto', 'M-3 G', null, 'Navigation', 48, '{}', 'Global-needle baseplate compass. Listed weight is the brand''s 48 g.', 'https://suunto.com/en-be/Products/Compasses/Suunto-M-3-Global/Suunto-M-3-G-Compass', 'seed'),
('Garmin', 'Forerunner 970', 'Watch only', 'Navigation', 56, '{}', 'GPS multisport watch with maps. Listed weight is 56 g for the watch without its band.', 'https://gadgetsandwearables.com/technical-specs/garmin-forerunner-970', 'seed'),
('Coros', 'Pace 4', 'Nylon band', 'Navigation', 32, '{}', 'Lightweight GPS sport watch. Listed weight is the brand''s 32 g with the nylon band; with the silicone band it is 40 g.', 'https://au.coros.com/stories/press-release/c/coros-unveils-pace-4', 'seed')
on conflict (normalized_key) do nothing;
