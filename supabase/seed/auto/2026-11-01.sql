insert into public.catalog_products (brand, name, model, category, weight_g, specs, description, source_url, origin) values
('Sea to Summit', 'Ultra-Sil Hanging Toiletry Bag', 'Small', 'Hygiene', 80, '{}', 'Light hanging wash bag. Listed weight is the brand''s 80 g for the small size; one retailer weighed it at 100 g.', 'https://seatosummit.co.uk/products/hanging-toiletry-bag', 'seed'),
('Sea to Summit', 'Airlite Towel', 'Small', 'Hygiene', 30, '{}', 'Ultralight microfibre towel, 80 x 40 cm. Listed weight is about 30 g; one listing says 28 g.', 'https://shop.packpaddle.com/airlite-towel-small', 'seed'),
('Lifeventure', 'Travel Toiletry Bag', null, 'Hygiene', 56, '{}', 'Compact wash bag, 22 x 10 x 10 cm. Listed weight is 56 g.', 'https://www.cotswoldoutdoor.com/p/lifeventure-travel-toiletry-bag-B43F390051.html', 'seed'),
('BioLite', 'Charge 20 PD', null, 'Electronics', 165, '{"battery_mah":6000}', 'USB-C power bank. Listed weight is 165 g; the older USB version is also listed at 165 g.', 'https://www.backpackinglight.com.au/products/biolite-charge-20-pd-powerbank', 'seed'),
('Goal Zero', 'Venture 35', null, 'Electronics', 287, '{"battery_mah":9600}', 'Waterproof power bank (IP67). Listed weight is 287 g.', 'https://countryfile.com/reviews/goal-zero-venture-35-power-bank', 'seed'),
('BioLite', 'SolarPanel 5+ 2.0', null, 'Electronics', 390, '{}', 'Folding solar panel with an onboard battery. Listed weight is about 390 g (13.8 oz).', 'https://www.rei.com/product/190751', 'seed'),
('Nitecore', 'NB10000 Gen 4', null, 'Electronics', 143, '{"battery_mah":10000}', 'Ultralight carbon power bank. Listed weight is the brand''s 143 g; independent weighings give 145-146 g.', 'https://www.nitecore.com/product/nb10000gen4', 'seed')
on conflict (normalized_key) do nothing;
