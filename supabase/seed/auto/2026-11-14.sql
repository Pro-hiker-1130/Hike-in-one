insert into public.catalog_products (brand, name, model, category, weight_g, specs, description, source_url, origin) values
('Leatherman', 'Micra', null, 'Safety', 51, '{}', 'Keyring multitool with scissors, knife and tweezers. Listed weight is 1.8 oz (51 g).', 'https://www.packhacker.com/travel-gear/leatherman/micra-multi-tool/', 'seed'),
('Victorinox', 'Hiker', null, 'Safety', 77, '{}', 'Medium Swiss Army knife (model 1.4613). Listed weight is the brand''s 77 g; one Swiss retailer lists 74 g.', 'https://www.victorinox.com/en-DK/Products/Swiss-Army-Knives/Medium-Pocket-Knives/Hiker/p/1.4613', 'seed'),
('RXBAR', 'Protein Bar', 'Chocolate Sea Salt', 'Food', 52, '{}', 'Date and egg-white protein bar. Listed weight is the labeled 1.8 oz (52 g) per bar.', 'https://www.vitacost.com/products/rxbar-protein-bar-chocolate-sea-salt-12-bars-1-8-oz-52-g-each-74967', 'seed'),
('PROBAR', 'Meal Bar', '3 oz', 'Food', 85, '{}', 'Whole-food meal bar. Listed weight is the labeled 3 oz (85 g) per bar, the same across flavors.', 'https://www.sportsbasement.com/products/meal-bar-2', 'seed'),
('GoMacro', 'MacroBar', 'Single bar', 'Food', 65, '{}', 'Organic plant-based protein bar. Listed weight is the labeled 2.3 oz (65 g) per bar, the same across flavors.', 'https://www.sportsbasement.com/products/macrobar-1', 'seed')
on conflict (normalized_key) do nothing;
