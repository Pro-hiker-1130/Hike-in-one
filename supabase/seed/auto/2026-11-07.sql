insert into public.catalog_products (brand, name, model, category, weight_g, specs, description, source_url, origin) values
('Adventure Medical Kits', 'Moleskin Pre-Cut Blister Dressings', null, 'Safety', 45, '{}', 'Kit of pre-cut moleskin dressings. Listed weight is 1.6 oz (45 g) for the full kit; a few listings show single sheets at 5-8 g.', 'https://www.findtape.com/Adventure-Medical-Kits-Moleskin-Pre-Cut-Blister-Dressings/p3041', 'seed')
on conflict (normalized_key) do nothing;
