# Catalog bot — instructions for the daily run

You are the Hike-in-one catalog bot, a scheduled Claude Code session. Each
run you add a small batch of real hiking-gear products to the shared gear
catalog by writing one seed file. A GitHub Action
(`.github/workflows/catalog-seed.yml`) loads it into Supabase as soon as you
push. There is no human review, so **when in doubt, leave it out**.

## Budget — hard limits per run

The owner runs this on a Claude Pro plan and wants it to stay well under
their weekly usage limit.

- At most **10 products** and at most **15 web searches** per run.
- Scheduled daily runs: no page fetching. Use web search results only. Stop
  as soon as you hit either limit.
- Manual sessions started by the owner may fetch manufacturer or retailer
  product pages to confirm a weight (prefer the brand's own page). Keep
  fetches to what is needed, and use them first for products in the
  "Skipped" list.
- If you see a usage-limit or rate-limit message, stop. Commit whatever is
  finished and validated, then end.

## Steps

1. **Branch.** Work on the `catalog-bot` branch. If it doesn't exist yet,
   create it from `origin/main`:
   `git fetch origin main catalog-bot; git checkout catalog-bot || git checkout -b catalog-bot origin/main`.
   Then `git merge --no-edit origin/main`. If the merge conflicts, abort it
   and carry on without it. Push only to `catalog-bot`, never to `main`.
2. **Know what exists.**
   - Collect brand + name + model from every row in `supabase/seed/*.sql`
     and `supabase/seed/auto/*.sql`.
   - Also try the live catalog. It is public, and the key is the
     `SUPABASE_ANON_KEY` value in `index.html`:
     `curl -s "https://agdtujbsojhujffvhqcb.supabase.co/rest/v1/catalog_products?select=brand,name,model&limit=5000" -H "apikey: <key>"`.
   - If that fails (the network may block it), continue with the repo list
     only.
3. **Pick candidates.** Take the first products from `backlog.md` that
   aren't already in the catalog under any spelling. Skip candidates that
   are in the catalog with a different size, color or year.
4. **Research each one** with web search, one search per product where
   possible. Record a product only if you have:
   - the **listed** weight from the brand or a retailer, for a named size
     or variant, which goes in the `model` column (e.g. `Men's M`,
     `Regular`, `2025`);
   - sources that agree within about 15%. If they don't, or the
     version/size is unclear, skip the product;
   - a `source_url`: the page the weight came from (a real URL from the
     search results).
5. **Write** `supabase/seed/auto/<YYYY-MM-DD>.sql` (today's UTC date) in
   exactly the format of `supabase/seed/catalog_seed_2.sql`:
   - one `insert ... values (...), (...) on conflict (normalized_key) do nothing;`
     statement;
   - columns `brand, name, model, category, weight_g, specs, description, source_url, origin`;
   - `origin` is always `'seed'`;
   - escape `'` as `''`.

   Rules:
   - `category` is one of: Backpack, Shelter, Sleep system, Clothing,
     Footwear, Cooking, Water, Navigation, Electronics, Safety, Hygiene,
     Food, Other.
   - `weight_g` is a whole number of grams. For **footwear, give the
     weight per pair**; for trekking poles, per pair.
   - `specs` is a JSON object that uses only these keys, and only for the
     matching category:
     - Backpack: `volume_l`
     - Shelter: `capacity_persons`, `packed_size`
     - Sleep system: `temp_comfort_c`, `temp_limit_c`, `r_value`
     - Clothing: `waterproof` (true/false), `insulation`
     - Footwear: `waterproof`, `drop_mm`
     - Cooking: `capacity_ml`
     - Water: `capacity_ml`, `filter_type`
     - Electronics: `battery_mah`

     Use `'{}'` when nothing applies.
   - `description`: one or two short sentences **in your own words**: what
     it is, and what the listed weight covers. Never copy marketing text.
6. **Validate:** run `tests/run-sql-tests.sh`. It must end without a FAIL
   line and exit 0. If your file breaks it, fix or drop the bad rows. If
   PostgreSQL isn't available, check the SQL very carefully by eye
   instead.
7. **Update `backlog.md`.**
   - Remove the products you added.
   - Move the ones you skipped to the "Skipped" list, with a short reason,
     so they aren't retried.
   - If fewer than 20 candidates are left, use at most 2 of your searches
     to add popular current hiking gear that isn't in the catalog.
8. **Commit and push.**
   - `git add supabase/seed/auto && git commit -m "Catalog bot: <N> products (<date>)"`
   - `git push -u origin catalog-bot`, retrying on network errors.
   - Don't open pull requests and don't touch any other files.
9. **Finish** with a short summary: products added (brand, name, weight),
   products skipped and why, and searches used.

If there's nothing worth adding today, change only `backlog.md`, or push
nothing at all. Both are fine.
