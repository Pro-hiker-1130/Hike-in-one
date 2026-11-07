insert into public.catalog_products (brand, name, model, category, weight_g, specs, description, source_url, origin) values
('Rab', 'Syclon XP 40L', 'M-L', 'Backpack', 890, '{"volume_l":40}', 'Waterproof 40 L pack. Listed weight is the brand''s 890 g for size M-L; a review lists about 800 g.', 'https://rab.equipment/uk/syclon-xp-40l-waterproof-pack', 'seed'),
('Gossamer Gear', 'G4-20', 'Medium', 'Backpack', 675, '{"volume_l":42}', 'Frameless roll-top pack, 42 L. Listed weight is the pack alone in size medium; reviewers list 680-709 g.', 'https://garagegrowngear.com/en-cz/products/g4-20-ultralight-42-by-gossamer-gear', 'seed'),
('Mammut', 'Sertig III Mid GTX', 'Men''s EU 42', 'Footwear', 860, '{"waterproof":true}', 'Waterproof mid-cut hiking boot. Weight per pair in EU size 42 (about 430 g per boot).', 'https://www.bergzeit.us/p/mammut-mens-sertig-iii-mid-gtx-shoes/3015551/', 'seed'),
('Lowa', 'Renegade EVO GTX Mid', 'Men''s', 'Footwear', 1180, '{"waterproof":true}', 'Waterproof leather-and-fabric hiking boot. Weight per pair (2 lb 9.6 oz).', 'https://www.cotswoldoutdoor.com/p/lowa-mens-renegade-evo-gtx-mid-boots-B22ABA0195.html', 'seed')
on conflict (normalized_key) do nothing;
