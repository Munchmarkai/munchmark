// Open Food Facts client: full-text product search and product lookups,
// with polite rate limiting (their published limits are about 10 searches and 15 product reads a minute)
// and a small on-device cache so repeat scans don't hit the network.
const SEARCH_URL = 'https://search.openfoodfacts.org/search';
const LEGACY_SEARCH = 'https://world.openfoodfacts.org/cgi/search.pl';
const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product/';
const SEARCH_FIELDS = 'code,product_name,product_name_en,generic_name,generic_name_en,brands,brands_tags,categories,categories_tags,quantity,product_quantity,product_quantity_unit,countries,countries_tags,packagings,packaging_shapes_tags,unique_scans_n,nutriments,serving_size,serving_quantity';
const PRODUCT_FIELDS = 'code,product_name,product_name_en,generic_name,brands,brands_tags,categories_tags,quantity,product_quantity,serving_size,serving_quantity,nutriments,image_front_small_url,image_front_thumb_url,packaging_shapes_tags,countries_tags';

// --- rate limiting: one queue per bucket ---
const buckets = {
  search: {perMin: 9, times: [], chain: Promise.resolve()},
  product: {perMin: 14, times: [], chain: Promise.resolve()},
};
function limited(kind, fn){
  const b = buckets[kind];
  const run = async () => {
    const now = Date.now();
    b.times = b.times.filter(t => now - t < 60000);
    if (b.times.length >= b.perMin) await new Promise(r => setTimeout(r, 60000 - (now - b.times[0]) + 50));
    b.times.push(Date.now());
    return fn();
  };
  const p = b.chain.then(run, run);
  b.chain = p.catch(() => {});
  return p;
}
export function waitFor(kind){ const b = buckets[kind]; const now = Date.now(); const n = b.times.filter(t => now - t < 60000).length; return n >= b.perMin ? Math.ceil((60000 - (now - b.times[0])) / 1000) : 0; }

// --- tiny persistent cache ---
const CK = 'macrolens.offcache.v1';
let cache = null;
function C(){ if (!cache) { try { cache = JSON.parse(localStorage.getItem(CK) || '{}'); } catch { cache = {}; } cache.q ||= {}; cache.p ||= {}; } return cache; }
function saveCache(){
  try {
    const c = C();
    for (const k of ['q', 'p']) { const keys = Object.keys(c[k]); if (keys.length > (k === 'q' ? 80 : 250)) keys.sort((a, b) => c[k][a].t - c[k][b].t).slice(0, keys.length - (k === 'q' ? 80 : 250)).forEach(x => delete c[k][x]); }
    localStorage.setItem(CK, JSON.stringify(c));
  } catch {}
}
const FRESH = 1000 * 60 * 60 * 24 * 30;

async function getJSON(url, timeout = 12000){
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try { const r = await fetch(url, {signal: ctl.signal, headers: {Accept: 'application/json'}}); if (!r.ok) throw new Error('http ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

// Normalize a product from either API into one shape.
export function normalize(p){
  if (!p) return null;
  const name = String(p.product_name_en || p.product_name || p.generic_name_en || p.generic_name || '').trim();
  let brands = p.brands;
  if (Array.isArray(brands)) brands = brands.map(b => /^([a-z]{2}:)?[a-z0-9-]+$/.test(b) ? tagText(b) : b).join(', ');
  if (!brands && Array.isArray(p.brands_tags)) brands = p.brands_tags.map(tagText).join(', ');
  brands = String(brands || '').replace(/(^|,)\s*xx:/g, '$1').trim();
  const shapes = [];
  if (Array.isArray(p.packaging_shapes_tags)) shapes.push(...p.packaging_shapes_tags);
  if (Array.isArray(p.packagings)) for (const pk of p.packagings) { const s = pk && (pk.shape?.id || pk.shape); if (s) shapes.push(String(s)); }
  const cats = Array.isArray(p.categories_tags) ? p.categories_tags : Array.isArray(p.categories) ? p.categories : String(p.categories || '').split(',').map(s => s.trim()).filter(Boolean);
  const countries = Array.isArray(p.countries_tags) ? p.countries_tags : Array.isArray(p.countries) ? p.countries : String(p.countries || '').split(',');
  return {code: String(p.code || ''), name, brands, quantity: String(p.quantity || ''), categories: cats.map(String), countries: countries.map(String),
    shapes: shapes.map(s => String(s).replace(/^en:/, '').toLowerCase()), scans: Number(p.unique_scans_n) || 0,
    nutriments: p.nutriments || {}, servingSize: String(p.serving_size || ''), servingG: Number(p.serving_quantity) || 0,
    image: p.image_front_small_url || p.image_front_thumb_url || ''};
}
const tagText = t => String(t).replace(/^[a-z]{2}:/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export async function searchProducts(q){
  q = String(q || '').trim().toLowerCase();
  if (!q) return [];
  const c = C(), hit = c.q[q];
  if (hit && Date.now() - hit.t < FRESH) return hit.r;
  let list = null;
  try {
    const u = `${SEARCH_URL}?q=${encodeURIComponent(q)}&langs=en&page_size=15&boost_phrase=true&fields=${SEARCH_FIELDS}`;
    const j = await limited('search', () => getJSON(u));
    list = (j.hits || []).map(normalize);
  } catch (e) {
    try {
      const u = `${LEGACY_SEARCH}?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=15&fields=${SEARCH_FIELDS}`;
      const j = await limited('search', () => getJSON(u, 15000));
      list = (j.products || []).map(normalize);
    } catch (e2) { throw e2; }
  }
  list = list.filter(x => x && x.code && x.name);
  c.q[q] = {t: Date.now(), r: list}; saveCache();
  return list;
}

export async function getProduct(code){
  code = String(code || '').replace(/\D/g, '');
  if (!code) return null;
  const c = C(), hit = c.p[code];
  if (hit && Date.now() - hit.t < FRESH) return hit.r;
  const j = await limited('product', () => getJSON(`${PRODUCT_URL}${code}.json?fields=${PRODUCT_FIELDS}`));
  if (!j || j.status === 0 || !j.product) { c.p[code] = {t: Date.now(), r: null}; saveCache(); return null; }
  const r = normalize({code, ...j.product});
  c.p[code] = {t: Date.now(), r}; saveCache();
  return r;
}

// per-100 g nutrient array in the app's KEYS order
export function offP100(n){
  n = n || {};
  const g = k => { const v = Number(n[k]); return Number.isFinite(v) ? v : null; };
  const x = (k, m) => { const v = g(k); return v == null ? null : v * m; };
  const kcal = g('energy-kcal_100g') ?? (g('energy_100g') != null ? g('energy_100g') / 4.184 : null);
  const sodium = g('sodium_100g') != null ? g('sodium_100g') * 1000 : (g('salt_100g') != null ? g('salt_100g') * 400 : null);
  return [kcal, g('proteins_100g'), g('carbohydrates_100g'), g('fat_100g'), g('fiber_100g'), g('sugars_100g'), g('saturated-fat_100g'),
    x('cholesterol_100g', 1000), sodium, x('potassium_100g', 1000), x('calcium_100g', 1000), x('iron_100g', 1000), x('magnesium_100g', 1000), x('zinc_100g', 1000),
    x('vitamin-a_100g', 1e6), x('vitamin-c_100g', 1000), x('vitamin-d_100g', 1e6), x('vitamin-b12_100g', 1e6), x('vitamin-b9_100g', 1e6) ?? x('folates_100g', 1e6)];
}
export const displayName = p => {
  const b = String(p.brands || '').split(',')[0].trim(), name = String(p.name || '').trim();
  if (!b || name.toLowerCase().includes(b.toLowerCase())) return name;
  // "Bush's Best" + "Best Black Beans" -> "Bush's Best Black Beans"
  const bw = b.split(/\s+/), nw = name.split(/\s+/);
  let k = 0;
  for (let n = Math.min(bw.length, nw.length); n > 0; n--) if (bw.slice(-n).join(' ').toLowerCase() === nw.slice(0, n).join(' ').toLowerCase()) { k = n; break; }
  return [b, ...nw.slice(k)].join(' ');
};
