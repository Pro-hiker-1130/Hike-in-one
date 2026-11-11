insert into public.catalog_products (brand, name, model, category, weight_g, specs, description, source_url, origin) values
('MSR', 'MiniWorks EX', null, 'Water', 456, '{}', 'Pump water filter. Listed weight is 456 g; some retailers round to 460 g.', 'https://www.bergfreunde.eu/msr-miniworks-ex-water-filter/', 'seed'),
('Wayfayrer', 'Chicken Tikka & Rice', null, 'Food', 300, '{}', 'Ready-to-eat boil-in-the-bag meal, eaten hot or cold (not freeze-dried). Listed weight is the 300 g net pouch.', 'https://www.cotswoldoutdoor.com/p/wayfayrer-chicken-tikka-rice-E6214048.html', 'seed')
on conflict (normalized_key) do nothing;
