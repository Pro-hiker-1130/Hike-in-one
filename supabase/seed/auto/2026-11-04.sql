insert into public.catalog_products (brand, name, model, category, weight_g, specs, description, source_url, origin) values
('Humangear', 'BidetToob', null, 'Hygiene', 88, '{}', 'Portable squeeze bidet holding about 6 oz of water. Listed weight is the brand''s 88 g; REI lists 3.8 oz.', 'https://www.humangear.com/shop/p/bidettoob', 'seed'),
('PackTowl', 'Personal Towel', 'Hand', 'Hygiene', 80, '{}', 'Quick-drying towel, 42 x 92 cm. Listed weight is the brand''s 80 g; retailers list 82-84 g.', 'https://www.sigmasports.com/item/PackTowl/Personal-Hand-Towel/TFEO', 'seed'),
('Sea to Summit', 'Wilderness Wipes', 'Compact 12-pack', 'Hygiene', 93, '{}', 'Biodegradable wipes in a resealable pouch. Listed weight is 93 g for the 12-wipe pack; one retailer weighed it at 102 g.', 'https://www.packhacker.com/travel-gear/sea-to-summit/wilderness-wipes/', 'seed'),
('Humangear', 'GoToob+', 'Medium 74 ml', 'Hygiene', 50, '{}', 'Silicone squeeze travel bottle. Listed weight is 50 g dry, without liquid.', 'https://www.cotswoldoutdoor.com/p/humangear-gotoob-medium-74ml-E7434100.html', 'seed'),
('Black Diamond', 'Spot 325', null, 'Electronics', 86, '{}', 'Headlamp, 325 lumens. Listed weight is 86 g with three AAA batteries.', 'https://www.evo.com/headlamps/black-diamond-spot-325-headlamp', 'seed')
on conflict (normalized_key) do nothing;
