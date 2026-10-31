insert into public.catalog_products (brand, name, model, category, weight_g, specs, description, source_url, origin) values
('Sea to Summit', 'Trek & Travel Pocket Body Wash', '50 leaves', 'Hygiene', 14, '{}', 'Soap leaves in a pocket case. Listed weight is the brand''s 14 g including the case; retailers round to 15 g.', 'https://support.seatosummit.com/hc/en-us/articles/19361665314324-How-much-do-the-Trek-Travel-Pocket-Wash-products-Pocket-Wilderness-Wash-weigh', 'seed'),
('Jordan', 'Ultralite', 'Soft/Medium', 'Hygiene', 9, '{}', 'Light travel toothbrush. Listed weight is the brand''s 9.2 g, rounded; the Sensitive version is 8.7 g.', 'https://www.jordanoralcare.com/tooted/ultralite/', 'seed'),
('Matador', 'FlatPak Soap Bar Case', null, 'Hygiene', 11, '{}', 'Flat case for a bar of soap. Listed weight is 11 g; one retailer lists 10 g.', 'https://www.rushfaster.com.au/products/matador-flatpak-soap-bar-case', 'seed')
on conflict (normalized_key) do nothing;
