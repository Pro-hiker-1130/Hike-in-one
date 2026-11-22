insert into public.catalog_products (brand, name, model, category, weight_g, specs, description, source_url, origin) values
('Big Agnes', 'Q-Core SLX', 'Regular', 'Sleep system', 454, '{}', 'Insulated inflatable sleeping pad. Listed weight is for the regular size; one retailer lists 465 g.', 'https://www.packstack.io/reviews/sleep-system/big-agnes-q-core-slx', 'seed'),
('Therm-a-Rest', 'Trail Lite', 'Regular', 'Sleep system', 740, '{}', 'Self-inflating sleeping pad. Listed weight is the brand figure for the regular size, about 1 lb 10 oz.', 'https://cascadedesigns.com/products/trail-lite-sleeping-pad', 'seed'),
('Sea to Summit', 'Spark SP1', 'Regular, 40F', 'Sleep system', 348, '{}', 'Ultralight down summer sleeping bag, earlier 40F version. Listed weight is the brand figure of 348 g; a reviewer measured about 354 g.', 'https://www.wildearth.com.au/assets/brochures/ASP1-L200.pdf', 'seed'),
('Klymit', 'Static V Base', 'Regular', 'Sleep system', 530, '{}', 'Uninsulated inflatable sleeping pad. Listed weight is the brand figure of 530 g for the regular size.', 'https://www.opticsplanet.com/klymit-static-v-sleeping-pad-1409836.html', 'seed')
on conflict (normalized_key) do nothing;
