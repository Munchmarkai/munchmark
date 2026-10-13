// Turns typed meals like "2 eggs, 1 cup rice and 6 oz chicken" into food items with grams.
import { LABELS, ALIASES } from './labels.js';
import { search, tokens } from './search.js';

const NUMWORDS = {a:1, an:1, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, half:0.5, couple:2, few:3, dozen:12};
const FRACS = {'½':0.5, '¼':0.25, '¾':0.75, '⅓':1/3, '⅔':2/3, '⅛':0.125};
// unit -> grams, or 'serving' words matched against USDA household measures
const MASS = {g:1, gram:1, grams:1, gr:1, kg:1000, oz:28.35, ounce:28.35, ounces:28.35, lb:453.6, lbs:453.6, pound:453.6, pounds:453.6, ml:1, l:1000, 'fl oz':29.6, floz:29.6};
const MEASURE = ['cup','cups','tbsp','tablespoon','tablespoons','tsp','teaspoon','teaspoons','slice','slices','piece','pieces','scoop','scoops','bar','bars','can','cans','bottle','bottles','glass','glasses','bowl','bowls','plate','plates','serving','servings','handful','handfuls','patty','patties','link','links','strip','strips','wedge','wedges','stick','sticks','pat','order','orders','large','medium','small','each','whole','container','package','packet','sandwich','item'];
const SINGULAR = w => w.replace(/(es|s)$/, '').replace(/ie$/, 'y');
const VOLUME_ML = {cup:240, tbsp:15, tablespoon:15, tsp:5, teaspoon:5, glass:240, can:355, bottle:500};

export function labelByName(name){
  const n = name.toLowerCase().trim();
  if (ALIASES[n]) return LABELS.find(l => l[0] === ALIASES[n]) || null;
  return LABELS.find(l => l[0] === n) || null;
}
export function labelFuzzy(q){
  const exact = labelByName(q); if (exact) return exact;
  const qt = tokens(q); if (!qt.length) return null;
  let best = null, bestScore = 0;
  for (const l of LABELS){
    const lt = tokens(l[0]);
    const hits = qt.filter(t => lt.includes(t)).length;
    if (!hits) continue;
    const score = hits / Math.max(qt.length, lt.length);
    if (score > bestScore) { bestScore = score; best = l; }
  }
  return bestScore >= 0.67 ? best : null;
}

function parseQty(s){
  s = s.trim();
  let m = s.match(/^(\d+)\s*([½¼¾⅓⅔⅛])/);
  if (m) return [Number(m[1]) + FRACS[m[2]], s.slice(m[0].length)];
  m = s.match(/^([½¼¾⅓⅔⅛])/);
  if (m) return [FRACS[m[1]], s.slice(1)];
  m = s.match(/^(\d+)\s+(\d+)\/(\d+)/);
  if (m) return [Number(m[1]) + Number(m[2]) / Number(m[3]), s.slice(m[0].length)];
  m = s.match(/^(\d+)\/(\d+)/);
  if (m) return [Number(m[1]) / Number(m[2]), s.slice(m[0].length)];
  m = s.match(/^(\d+(?:\.\d+)?)/);
  if (m) return [Number(m[1]), s.slice(m[0].length)];
  m = s.match(/^(an?|one|two|three|four|five|six|seven|eight|nine|ten|half|couple|few|dozen)\b(\s+of)?/i);
  if (m) return [NUMWORDS[m[1].toLowerCase()], s.slice(m[0].length)];
  return [null, s];
}

const JOINED = [...LABELS.map(l => l[0]), ...Object.keys(ALIASES), 'mac and cheese', 'mac n cheese', 'salt and pepper', 'half and half', 'fish and chips', 'rice and beans']
  .filter(n => /,| and | with |&/.test(n)).sort((a, b) => b.length - a.length);
export function splitMeal(text){
  let s = String(text).toLowerCase();
  const kept = [];
  for (const n of JOINED){
    const i = s.indexOf(n);
    if (i >= 0) { s = s.split(n).join(`\u0001${kept.length}\u0001`); kept.push(n); }
  }
  return s.split(/,|;|\n|\band\b|\bwith\b|\bplus\b|\+|&/i)
    .map(p => p.replace(/\u0001(\d+)\u0001/g, (_, k) => kept[Number(k)]).trim())
    .filter(Boolean);
}

// grams for "qty unit" against a USDA food row (cols: ... s1g s1d s2g s2d at the end)
function gramsFromMeasure(f, unit){
  const n = f.length, opts = [[f[n-4], f[n-3]], [f[n-2], f[n-1]]].filter(o => o[0] && o[1]);
  const u = SINGULAR(unit);
  for (const [g, d] of opts){
    const dd = d.toLowerCase();
    const lead = parseFloat(dd) || (dd.startsWith('.') ? parseFloat('0' + dd) : 1);
    if (dd.includes(u)) return g / (lead || 1);
  }
  return null;
}

export function parseSegment(seg, index, foodsById){
  let [qty, rest] = parseQty(seg);
  rest = rest.trim().replace(/^of\s+/i, '');
  let unit = null, grams = null;
  const lower = rest.toLowerCase();
  const fl = lower.match(/^fl\.?\s*oz\.?\b\s*/);
  const mu = fl ? ['fl oz', fl[0]] : (lower.match(/^([a-z]+)\.?\s+/) || []);
  const word = fl ? 'fl oz' : (mu[1] || '');
  if (word && MASS[word] !== undefined) { unit = word; rest = rest.slice(fl ? fl[0].length : mu[0].length); }
  else if (word && MEASURE.includes(word)) { unit = word; rest = rest.slice(mu[0].length).replace(/^of\s+/i, ''); }
  // a measure word later in the phrase ("pizza slice", "large bowl of chili") wins over a size word
  const SIZE = /^(large|medium|small|big|whole)$/;
  let words = rest.trim().split(/\s+/);
  const mi = words.findIndex(w => MEASURE.includes(w.toLowerCase()) && !SIZE.test(w.toLowerCase()));
  if (mi >= 0 && (!unit || SIZE.test(unit))) { unit = words[mi].toLowerCase(); words.splice(mi, 1); }
  words = words.filter(w => !SIZE.test(w.toLowerCase()) && w.toLowerCase() !== 'of');
  if (unit === 'big') unit = null;
  const name = words.join(' ').trim();
  if (!name) return null;

  const label = labelFuzzy(name);
  let items, foodName, portionText;
  if (label) {
    items = label[1].map(([ndb, g]) => ({ndb, g}));
    foodName = label[0]; portionText = label[2];
  } else {
    const hit = search(index, name, 1)[0];
    if (!hit) return {text:seg, missing:true};
    const n = hit.length;
    const dg = hit[n-4] || 100;
    items = [{ndb: hit[0], g: dg}];
    foodName = hit[1]; portionText = hit[n-3] || '100 g';
  }
  const baseTotal = items.reduce((a, i) => a + i.g, 0);
  let factor = 1;
  if (unit && MASS[unit] !== undefined) {
    grams = (qty ?? 1) * MASS[unit];
    factor = grams / baseTotal;
  } else if (unit) {
    // a household measure: try the USDA food's own measures, then volume, then the label's portion
    const main = foodsById.get(items[0].ndb);
    let per = main ? gramsFromMeasure(main, unit) : null;
    const u = SINGULAR(unit);
    if (per == null && /^(large|medium|small|each|whole|item|serving|order|plate|bowl|sandwich|package|container)$/.test(u)) per = baseTotal / (leadingCount(portionText) || 1);
    const grp = main ? main[2] : 0;
    if (per == null && u === 'can') per = grp === 14 ? 355 : grp === 15 ? 113 : null;
    if (per == null && VOLUME_ML[u] && u !== 'can' && (grp === 14 || grp === 6 || u !== 'bottle')) per = VOLUME_ML[u];
    if (per == null) per = baseTotal / (leadingCount(portionText) || 1);
    factor = ((qty ?? 1) * per) / baseTotal;
  } else if (qty != null) {
    // "2 eggs" against a label portion of "2 large eggs" -> per-unit weight
    const count = leadingCount(portionText);
    factor = count ? qty / count : qty;
  }
  return {text:seg, label: label ? label[0] : null, name: foodName, items: items.map(i => ({ndb:i.ndb, g: round1(i.g * factor)})), portion: describe(qty, unit, portionText, factor)};
}

function leadingCount(t){
  const m = String(t).match(/^(\d+(?:\.\d+)?|[½¼¾⅛])/);
  if (!m) return null;
  return FRACS[m[1]] ?? Number(m[1]);
}
function describe(qty, unit, portionText, factor){
  if (unit) return `${fmtQty(qty ?? 1)} ${unit}`;
  if (qty != null) {
    const m = String(portionText).match(/^(\d+(?:\.\d+)?|[½¼¾⅛])\s*(.*)$/);
    if (m) return `${fmtQty(qty)} ${m[2]}`;
    return qty === 1 ? portionText : `${fmtQty(qty)} × ${portionText}`;
  }
  return portionText;
}
const fmtQty = q => Number.isInteger(q) ? String(q) : String(Math.round(q * 100) / 100);
const round1 = n => Math.round(n * 10) / 10;

export function parseMeal(text, index, foodsById){
  return splitMeal(text).map(s => parseSegment(s, index, foodsById)).filter(Boolean);
}
