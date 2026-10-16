// Online nutrition search: Open Food Facts (worldwide packaged foods) plus USDA FoodData Central
// (US branded labels and typical dishes, public domain). FoodData Central needs a free api.data.gov key;
// without one the shared DEMO_KEY works for about 30 searches an hour.
import { searchProducts, offP100, displayName } from './off.js';

const FDC = 'https://api.nal.usda.gov/fdc/v1/foods/search';
// FoodData Central nutrient numbers -> the app's nutrient order
const NUM = {'208':0,'203':1,'205':2,'204':3,'291':4,'269':5,'606':6,'601':7,'307':8,'306':9,'301':10,'303':11,'304':12,'309':13,'320':14,'401':15,'328':16,'418':17,'435':18,'255':19};
const toks = s => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length >= 2 && !/^(and|the|with|of|in)$/.test(w));
const title = s => String(s || '').toLowerCase().replace(/\b([a-z])([a-z']*)/g, (m, a, b) => a.toUpperCase() + b).replace(/\b(Oz|Fl|Pk|Ct)\b/g, x => x.toLowerCase());

let blockedUntil = 0, defaultKey = '';
// the person's own api.data.gov key from Settings, used when a caller doesn't pass one
export function setFdcKey(k){ defaultKey = String(k || '').trim(); }
const CK = 'macrolens.fdccache.v1';
function cacheGet(k){ try { const c = JSON.parse(localStorage.getItem(CK) || '{}'), e = c[k]; return e && Date.now() - e.t < 7 * 864e5 ? e.v : null; } catch { return null; } }
function cacheSet(k, v){
  try {
    const c = JSON.parse(localStorage.getItem(CK) || '{}'); c[k] = {t:Date.now(), v};
    const keys = Object.keys(c); if (keys.length > 80) for (const x of keys.sort((a, b) => c[a].t - c[b].t).slice(0, keys.length - 80)) delete c[x];
    localStorage.setItem(CK, JSON.stringify(c));
  } catch {}
}
export function fdcItem(f){
  const p = new Array(20).fill(0);
  let kj = 0, folTot = 0, vitDiu = 0;
  for (const n of f.foodNutrients || []){
    const num = String(n.nutrientNumber ?? ''), v = Number(n.value);
    if (!Number.isFinite(v)) continue;
    if (num === '268') { kj = v; continue; }
    if (num === '417') { folTot = v; continue; }
    if (num === '324') { vitDiu = v; continue; }
    const k = NUM[num]; if (k != null) p[k] = v;
  }
  if (!p[0] && kj) p[0] = kj / 4.184;
  if (!p[18] && folTot) p[18] = folTot;
  if (!p[16] && vitDiu) p[16] = vitDiu / 40;
  const unit = String(f.servingSizeUnit || '').toLowerCase();
  const sg = /^(g|grm|ml|mlt)$/.test(unit) ? Number(f.servingSize) || 0 : 0;
  const hh = String(f.householdServingFullText || '').trim();
  return {src:'fdc', id:'fdc' + f.fdcId, fdcId:f.fdcId, dataType:f.dataType, name:title(f.description), brand:title(f.brandName || f.brandOwner || ''), upc:f.gtinUpc || '',
    servingG:sg, servingD:sg ? (hh && !/^\d+(\.\d+)?\s*(g|ml)$/i.test(hh) ? `${hh.toLowerCase()} (${Math.round(sg)} ${unit.startsWith('m') ? 'ml' : 'g'})` : `${Math.round(sg)} ${unit.startsWith('m') ? 'ml' : 'g'}`) : '', p};
}
export async function searchFDC(q, key = defaultKey){
  const k = (key ? 'k:' : 'd:') + q.toLowerCase().trim();
  const hit = cacheGet(k); if (hit) return hit;
  if (Date.now() < blockedUntil) throw new Error('rate');
  const url = `${FDC}?api_key=${encodeURIComponent(key || 'DEMO_KEY')}&query=${encodeURIComponent(q)}&dataType=${encodeURIComponent('Branded,Survey (FNDDS)')}&pageSize=20`;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 12000);
  let r;
  try { r = await fetch(url, {signal:ctl.signal}); } finally { clearTimeout(t); }
  if (r.status === 429 || r.status === 403) { blockedUntil = Date.now() + 15 * 60e3; throw new Error('rate'); }
  if (!r.ok) throw new Error('http ' + r.status);
  const j = await r.json();
  const items = (j.foods || []).map(fdcItem).filter(x => x.p[0] > 0 || x.p[1] + x.p[2] + x.p[3] > 0);
  cacheSet(k, items);
  return items;
}
export function offItem(p){
  return {src:'off', id:'off' + p.code, code:p.code, name:displayName(p), brand:p.brands || '', servingG:p.servingG || 0, servingD:p.servingG ? (p.servingSize || '1 serving') : '', p:offP100(p.nutriments), image:p.image || ''};
}
// both sources at once, merged and ranked by how well the name and brand match the words typed
export async function searchOnline(q, {fdcKey = '', fdc = true} = {}){
  const errors = []; let a = [], b = [];
  await Promise.all([
    searchProducts(q, {fallback:false}).then(r => { a = r.map(offItem); }).catch(() => errors.push('off')),
    fdc ? searchFDC(q, fdcKey).then(r => { b = r; }).catch(e => errors.push(e.message === 'rate' ? 'fdc-rate' : 'fdc')) : Promise.resolve(),
  ]);
  const qt = toks(q);
  const score = it => {
    const t = toks(`${it.brand} ${it.name}`);
    const hit = qt.filter(w => t.some(x => x === w || (w.length >= 4 && (x.startsWith(w) || w.startsWith(x)) && x.length >= 4))).length;
    let s = qt.length ? hit / qt.length : 0;
    s += 0.15 * (t.length ? qt.filter(w => t.includes(w)).length / t.length : 0);
    if (it.servingG) s += 0.04;
    if (!(it.p[0] > 0)) s -= 0.3;
    return s;
  };
  const seen = new Set();
  const items = [...a, ...b].map(it => ({...it, score:score(it)})).filter(it => it.score >= 0.34).sort((x, y) => y.score - x.score)
    .filter(it => { const k = toks(`${it.brand} ${it.name}`).join(' ') + '|' + Math.round(it.p[0]); if (seen.has(k)) return false; seen.add(k); return true; });
  return {items:items.slice(0, 20), errors};
}
export const webSearchURL = q => `https://www.google.com/search?q=${encodeURIComponent(`${q} nutrition facts`)}`;
