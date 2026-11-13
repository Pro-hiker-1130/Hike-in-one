insert into public.catalog_products (brand, name, model, category, weight_g, specs, description, source_url, origin) values
('Katadyn', 'Hiker Pro', null, 'Water', 310, '{"filter_type":"pump filter"}', 'Hand pump water filter. Listed weight is 310 g for the standard kit; one retailer lists 264 g without the bag and extras.', 'https://www.outdoorgb.com/p/katadyn_hiker_pro_water_filter_accessory', 'seed'),
('Osprey', 'Ultralight Raincover', 'Medium', 'Other', 112, '{}', 'Pack rain cover for 30-50 L packs. Listed weight is 112 g; one retailer lists 101 g.', 'https://www.altitude-sports.com/products/osprey-ultralight-raincover-medium-llll-osp-234101', 'seed'),
('Buff', 'Original EcoStretch', null, 'Clothing', 40, '{"waterproof":false}', 'Tubular multifunction neckwear. Listed weight is about 40 g; one retailer lists 35 g.', 'https://www.gooutdoors.co.uk/products/buff-original-ecostretch-buff-night-blue-754262', 'seed')
on conflict (normalized_key) do nothing;
