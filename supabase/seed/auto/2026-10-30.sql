insert into public.catalog_products (brand, name, model, category, weight_g, specs, description, source_url, origin) values
('Matador', 'NanoDry Trek Towel', 'Large', 'Hygiene', 160, '{}', 'Quick-drying travel towel, 132 x 60 cm. Listed weight is 5.6 oz (160 g); some retailers round to 5 oz.', 'https://www.toytag.com/en-gb/products/nanodry-towel', 'seed'),
('Sawyer', 'Picaridin Insect Repellent Lotion', '4 oz', 'Hygiene', 136, '{}', 'Insect repellent lotion in a 118 ml bottle. Listed weight is the full bottle (4.8 oz); REI lists 5 oz.', 'https://www.garagegrowngear.com/products/insect-repellant-3oz-spray-by-sawyer', 'seed'),
('Ocean Signal', 'RescueME PLB1', null, 'Safety', 116, '{}', 'Compact personal locator beacon with GPS. Listed weight is the brand''s 116 g.', 'https://mtnweekly.com/reviews/electronics/personal-locator-beacon-ocean-signal-rescue-me-plb1', 'seed'),
('ACR', 'ResQLink 400', 'No display', 'Safety', 148, '{}', 'Floating personal locator beacon with GPS. Listed weight is the brand''s 148 g; a few sellers list 144 g.', 'https://rebellionmarine.com/products/acr-resqlink-plb400', 'seed')
on conflict (normalized_key) do nothing;
