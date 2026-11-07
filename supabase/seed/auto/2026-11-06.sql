insert into public.catalog_products (brand, name, model, category, weight_g, specs, description, source_url, origin) values
('Bic', 'Mini Lighter', 'J5', 'Safety', 12, '{}', 'Small disposable lighter for fire lighting. Listed weight is about 12 g; one review lists 11.5 g.', 'https://lightweightoutdoor.com/product/bic-mini-lighter-aansteker', 'seed'),
('Skratch Labs', 'Sport Hydration Drink Mix', 'Single serving', 'Food', 22, '{}', 'Electrolyte drink mix packet. Listed weight is 22 g per packet; one retailer lists 23 g.', 'https://www.trailheadpaddleshack.ca/products/skratch-labs-sport-hydration-mix-singles-22g', 'seed'),
('Tailwind', 'Endurance Fuel', 'Stick pack', 'Food', 54, '{}', 'Drink mix stick pack with about 200 kcal. Listed weight is 54 g, which one retailer counts as two 27 g servings.', 'https://rundna.com.au/products/tailwind-endurance-fuel-mix-powder-stick-54g', 'seed')
on conflict (normalized_key) do nothing;
