// Product lookup from a link — free, no AI.
//
// The app sends a product page URL (a brand's or shop's page); this
// function fetches it and reads the facts the page itself publishes for
// search engines: schema.org Product data (JSON-LD), OpenGraph tags, and
// as a last resort a "Weight: …" line in the page text. It returns a
// suggestion the user reviews before anything is saved to the catalog.
// Photos and marketing descriptions are deliberately NOT returned —
// they're the site's copyrighted content; specs and the link are facts.
//
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function →
// Via Editor, name it exactly "product-lookup", paste this whole file.
// Keep "Enforce JWT Verification" ON: only signed-in app users can call
// it, so strangers can't use your project as a free web fetcher.
// No secrets needed. Free tier: 500,000 calls per month.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 4;
const USER_AGENT = "HikeInOneLookup/1.0 (gear catalog; fetches a page a user asked for)";

export const CATEGORIES = ["Backpack", "Shelter", "Sleep system", "Clothing", "Footwear", "Cooking", "Water",
  "Navigation", "Electronics", "Safety", "Hygiene", "Food", "Other"];

// ---------------------------------------------------------------- URLs
// Only public http(s) pages: no localhost, private networks, cloud
// metadata endpoints or odd ports.
export function checkTargetUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(String(raw).trim()); } catch (_e) { throw new LookupError("That doesn't look like a web link.", 400); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new LookupError("Only http(s) links can be looked up.", 400);
  if (u.username || u.password) throw new LookupError("Links with a username or password aren't supported.", 400);
  if (u.port && u.port !== "80" && u.port !== "443") throw new LookupError("Links with a custom port aren't supported.", 400);
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host.includes(".") || /(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(host) || host === "metadata.google.internal") {
    throw new LookupError("That address isn't a public website.", 400);
  }
  if (isPrivateIp(host)) throw new LookupError("That address isn't a public website.", 400);
  return u;
}

export function isPrivateIp(host: string): boolean {
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (host.includes(":")) {
    const h = host.toLowerCase();
    return h === "::" || h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe8") ||
      h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb") || h.startsWith("::ffff:");
  }
  return false;
}

export class LookupError extends Error {
  status: number;
  constructor(message: string, status = 422) { super(message); this.status = status; }
}

// ---------------------------------------------------------------- weights
const UNIT_GRAMS: Record<string, number> = { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 };
function unitKey(u: string): string | null {
  const s = u.toLowerCase().replace(/\.$/, "");
  if (["g", "gr", "gram", "grams", "gramm", "grm"].includes(s)) return "g";
  if (["kg", "kgs", "kilogram", "kilograms", "kgm"].includes(s)) return "kg";
  if (["oz", "ounce", "ounces", "onz"].includes(s)) return "oz";
  if (["lb", "lbs", "pound", "pounds", "lbr"].includes(s)) return "lb";
  return null;
}
function num(s: string): number { return parseFloat(String(s).replace(",", ".")); }
// Grams are whole numbers, so "1,240 g" / "1.240 g" use a thousands
// separator; for kg/oz/lb a comma is the European decimal point.
function amount(s: string, unit: string): number {
  const t = String(s).trim();
  if (unit === "g" && /^\d{1,3}([.,]\d{3})+$/.test(t)) return Number(t.replace(/[.,]/g, ""));
  return num(t);
}

// "1.24 kg", "595 g / 21 oz", "1 lb 5 oz", {value: 1240, unitCode: "GRM"}
export function weightToGrams(w: unknown): number | null {
  if (w == null) return null;
  if (typeof w === "object") {
    const o = w as Record<string, unknown>;
    const unit = unitKey(String(o.unitCode ?? o.unitText ?? "g"));
    const value = amount(String(o.value ?? ""), unit ?? "");
    if (!isFinite(value) || !unit) return weightToGrams(o.value);
    return sane(value * UNIT_GRAMS[unit]);
  }
  const s = String(w).toLowerCase();
  const lbOz = s.match(/(\d+(?:[.,]\d+)?)\s*(?:lbs?|pounds?)\.?\s*(?:,|and)?\s*(\d+(?:[.,]\d+)?)\s*(?:oz|ounces?)/);
  if (lbOz) return sane(num(lbOz[1]) * UNIT_GRAMS.lb + num(lbOz[2]) * UNIT_GRAMS.oz);
  const m = s.match(/(\d+(?:[.,]\d+)*)\s*(kgs?|kilograms?|grams?|gramm|gr|g|oz|ounces?|lbs?|pounds?)\b/);
  if (m) { const u = unitKey(m[2]) as string; return sane(amount(m[1], u) * UNIT_GRAMS[u]); }
  return null;
}
function sane(g: number): number | null {
  const r = Math.round(g);
  return r >= 1 && r <= 50000 ? r : null;
}

// ---------------------------------------------------------------- category
const CATEGORY_RULES: [RegExp, string][] = [
  [/sleeping bag|quilt|sleeping pad|sleep(ing)? mat|air ?mat|camp(ing)? pillow|bag liner/, "Sleep system"],
  [/trail runner|running shoe|hiking shoe|hiking boot|\bboots?\b|\bshoes?\b|sandals?/, "Footwear"],
  [/\btents?\b|\btarp\b|bivy|bivvy sack|\bshelter\b|hammock/, "Shelter"],
  [/water filter|purifi|\bfilter\b|water bottle|\bbottle\b|bladder|reservoir|hydration/, "Water"],
  [/\bstoves?\b|\bpots?\b|cook ?set|cookware|\bmug\b|spork|kettle|\butensil/, "Cooking"],
  [/\bgps\b|compass|satellite (messenger|communicator)|inreach|\bmaps?\b/, "Navigation"],
  [/headlamp|head torch|power ?bank|battery|charger|\blantern\b|\bwatch\b/, "Electronics"],
  [/first aid|emergency|whistle|bear spray|\bbear (can|canister)\b/, "Safety"],
  [/backpack|rucksack|daypack|\bpack\b|\bpacks\b/, "Backpack"],
  [/jacket|\bshell\b|fleece|\bpants\b|trousers|shirt|hoodie|hoody|gloves?|beanie|\bhat\b|socks?|base ?layer|puffy|\bvest\b|anorak|poncho/, "Clothing"],
  [/trowel|toothbrush|sanitizer|\bsoap\b|toilet/, "Hygiene"],
  [/freeze[- ]dried|\bmeal\b|energy bar|\bfood\b/, "Food"],
];
export function guessCategory(...texts: (string | null | undefined)[]): string {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  for (const [re, cat] of CATEGORY_RULES) if (re.test(t)) return cat;
  return "Other";
}

// ---------------------------------------------------------------- HTML
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", reg: "®", trade: "™" };
export function decodeEntities(s: string): string {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9#]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
function clean(s: unknown, max = 120): string {
  if (s == null) return "";
  return decodeEntities(String(s)).replace(/<[^>]*>/g, "").replace(/[®™]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function jsonLdNodes(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const body = m[1].replace(/^\s*<!--/, "").replace(/-->\s*$/, "").replace(/^\s*\/\/<!\[CDATA\[|\/\/\]\]>\s*$/g, "").trim();
    try { out.push(JSON.parse(body)); } catch (_e) { /* broken JSON-LD is common; skip it */ }
  }
  return out;
}
function findProducts(node: unknown, out: Record<string, unknown>[], depth = 0): void {
  if (!node || depth > 6) return;
  if (Array.isArray(node)) { node.forEach((n) => findProducts(n, out, depth + 1)); return; }
  if (typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  const types = ([] as unknown[]).concat(o["@type"] ?? []).map(String);
  if (types.some((t) => /^(Product|ProductGroup|IndividualProduct|ProductModel)$/i.test(t))) out.push(o);
  for (const k of ["@graph", "mainEntity", "itemListElement", "item"]) if (o[k]) findProducts(o[k], out, depth + 1);
}
function nameOf(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return nameOf(v[0]);
  if (typeof v === "object") return clean((v as Record<string, unknown>).name);
  return clean(v);
}
function meta(html: string, key: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)\\s*=\\s*["']${key.replace(/[.:]/g, "\\$&")}["'][^>]*>`, "i");
  const tag = html.match(re);
  if (!tag) return "";
  const c = tag[0].match(/content\s*=\s*("([^"]*)"|'([^']*)')/i);
  return c ? clean(c[2] ?? c[3]) : "";
}
function pageText(html: string): string {
  return decodeEntities(html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ");
}
// "Trail weight: 1 lb 5 oz", "Weight (size M) 1,240 g", "Gewicht: 595 g"
export function weightFromText(text: string): { grams: number; text: string } | null {
  const re = /\b(?:(?:total|trail|minimum|min\.?|packed|packaged|average|avg\.?|item|product|net)\s+)?(?:weight|gewicht|poids|peso)\b[^0-9]{0,40}?((?:\d+(?:[.,]\d+)*)\s*(?:kgs?|kilograms?|grams?|gramm|gr|g|oz|ounces?|lbs?|pounds?)\b(?:\.?\s*,?\s*\d+(?:[.,]\d+)?\s*(?:oz|ounces?)\b)?)/gi;
  let m;
  while ((m = re.exec(text))) {
    const grams = weightToGrams(m[1]);
    if (grams) {
      const start = Math.max(0, m.index);
      return { grams, text: text.slice(start, Math.min(text.length, m.index + m[0].length)).trim().slice(0, 80) };
    }
  }
  return null;
}

function stripBrand(name: string, brand: string): string {
  if (!brand) return name;
  const re = new RegExp("^" + brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s:\\-–—|]+", "i");
  const stripped = name.replace(re, "").trim();
  return stripped.length >= 2 ? stripped : name;
}

export interface LookupResult {
  name: string; brand: string; model: string; category: string;
  weight_g: number | null; weight_text: string; product_url: string; source_url: string;
  found: string[];
}

export function extractProduct(html: string, pageUrl: string): LookupResult {
  const products: Record<string, unknown>[] = [];
  jsonLdNodes(html).forEach((n) => findProducts(n, products));
  const p = products[0] || {};
  const found: string[] = [];

  let brand = nameOf(p.brand) || nameOf(p.manufacturer) || meta(html, "product:brand") || meta(html, "og:brand") || meta(html, "brand");
  let name = clean(p.name) || meta(html, "og:title") || clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  // Page titles often carry " | Shop name" or " - Free shipping" tails.
  if (!p.name) name = name.split(/\s+[|–—]\s+|\s+-\s+(?=[^-]*$)/)[0].trim();
  name = stripBrand(name, brand);
  const modelRaw = typeof p.model === "string" ? clean(p.model, 80) : nameOf(p.model);
  const model = modelRaw && modelRaw.length <= 40 && !/^[A-Z0-9_-]{6,}$/.test(modelRaw) && modelRaw.toLowerCase() !== name.toLowerCase() ? modelRaw : "";

  let weight_g: number | null = null, weight_text = "";
  const props = ([] as unknown[]).concat(p.additionalProperty ?? []) as Record<string, unknown>[];
  const variants = ([] as unknown[]).concat(p.hasVariant ?? []) as Record<string, unknown>[];
  const candidates: unknown[] = [p.weight, ...props.filter((x) => /weight|gewicht/i.test(String(x?.name ?? ""))).map((x) => x.value ?? x),
    ...variants.map((v) => v?.weight)];
  for (const c of candidates) {
    const g = weightToGrams(c);
    if (g) { weight_g = g; weight_text = typeof c === "object" ? `${(c as Record<string, unknown>).value ?? ""} ${(c as Record<string, unknown>).unitText ?? (c as Record<string, unknown>).unitCode ?? ""}`.trim() : clean(c, 80); break; }
  }
  if (!weight_g) {
    const t = weightFromText(pageText(html));
    if (t) { weight_g = t.grams; weight_text = t.text; }
  }

  const category = guessCategory(name, clean(p.category, 200), meta(html, "product:category"), meta(html, "og:description"));
  let canonical = "";
  const link = html.match(/<link[^>]+rel\s*=\s*["']canonical["'][^>]*>/i);
  if (link) canonical = (link[0].match(/href\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
  let product_url = pageUrl;
  try { if (canonical) { const c = new URL(decodeEntities(canonical), pageUrl); if (/^https?:$/.test(c.protocol)) product_url = c.href; } } catch (_e) { /* keep pageUrl */ }

  if (name) found.push("name");
  if (brand) found.push("brand");
  if (model) found.push("model");
  if (weight_g) found.push("weight");
  if (category !== "Other") found.push("category");
  brand = brand.slice(0, 80);
  return { name: name.slice(0, 120), brand, model, category, weight_g, weight_text, product_url: product_url.slice(0, 500), source_url: pageUrl.slice(0, 500), found };
}

// ---------------------------------------------------------------- fetch
async function readLimited(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) { await reader.cancel(); break; }
    chunks.push(value);
  }
  const buf = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return new TextDecoder().decode(buf);
}

async function assertPublicDns(host: string): Promise<void> {
  // Re-check where the name actually points (a public name can resolve to
  // a private address). Skipped where the runtime offers no DNS API.
  const resolve = (globalThis as unknown as { Deno?: { resolveDns?: (h: string, t: string) => Promise<string[]> } }).Deno?.resolveDns;
  if (!resolve || isPrivateIp(host)) return;
  for (const type of ["A", "AAAA"]) {
    try {
      const ips = await resolve(host, type);
      if (ips.some(isPrivateIp)) throw new LookupError("That address isn't a public website.", 400);
    } catch (e) { if (e instanceof LookupError) throw e; }
  }
}

export async function lookup(rawUrl: string): Promise<LookupResult> {
  let url = checkTargetUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicDns(url.hostname);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url.href, { redirect: "manual", signal: ctrl.signal,
        headers: { "User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en,*;q=0.5" } });
    } catch (_e) {
      throw new LookupError("Couldn't reach that website (it may be down or slow).", 502);
    } finally { clearTimeout(timer); }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = checkTargetUrl(new URL(res.headers.get("location") as string, url).href);
      continue;
    }
    if (res.status === 403 || res.status === 429 || res.status === 503) throw new LookupError("That website doesn't allow automatic lookups — fill the details in by hand.", 422);
    if (!res.ok) throw new LookupError(`That page returned an error (HTTP ${res.status}).`, 422);
    const type = res.headers.get("content-type") || "";
    if (!/html|xml/i.test(type)) throw new LookupError("That link isn't a web page.", 422);
    const result = extractProduct(await readLimited(res), url.href);
    if (!result.name) throw new LookupError("Couldn't find product details on that page.", 422);
    return result;
  }
  throw new LookupError("Too many redirects.", 422);
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

const DenoNs = (globalThis as unknown as { Deno?: { serve?: (h: (r: Request) => Promise<Response>) => void } }).Deno;
if (DenoNs?.serve) {
  DenoNs.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
    if (req.method !== "POST") return json({ error: "Use POST" }, 405);
    try {
      const body = await req.json();
      return json({ product: await lookup(String(body?.url ?? "")) });
    } catch (e) {
      if (e instanceof LookupError) return json({ error: e.message }, e.status);
      return json({ error: "Lookup failed." }, 500);
    }
  });
}
