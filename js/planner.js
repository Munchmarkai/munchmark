// Meal-idea planner: combines pantry foods into meals and solves the portions
// so each meal lands as close as possible to a calorie / protein / carb / fat target.
// Pure functions, no DOM. Nutrient arrays use the app's KEYS order (index 0 kcal, 1 protein, 2 carbs, 3 fat, 4 fiber, 8 sodium).

const K = {kcal:0, p:1, c:2, f:3, fiber:4, sodium:8};
const SWEET = /yogurt|cottage|oat|granola|cereal|cheerio|waffle|banana|apple|orange|berr|grape|pineapple|mango|peach|watermelon|raisin|peanut butter|almond milk|protein powder|\bmilk\b|honey|jelly|jam/i;
const NEUTRAL = /\begg|bread|bagel|english muffin|butter|cream cheese|cracker|almond|walnut|mixed nuts|sunflower|toast/i;

export function roleOf(food){
  if (food.role) return food.role;
  const p = food.p, kcal = Math.max(1, num(p[0]));
  const pS = 4 * num(p[1]) / kcal, cS = 4 * num(p[2]) / kcal, fS = 9 * num(p[3]) / kcal;
  const g = food.group || 0;
  if (g === 9) return 'fruit';
  if (g === 11 && kcal < 120) return 'veg';
  if ([21, 22, 36].includes(g)) return 'meal';
  if ([19, 25].includes(g) || (kcal > 420 && num(p[5]) > 20)) return 'snack';
  if (g === 14 && pS < 0.3) return kcal < 60 ? 'snack' : 'dairy';
  if (fS >= 0.6) return 'fat';
  if (pS >= 0.33) return 'protein';
  if (g === 1) return 'dairy';
  if (cS >= 0.5) return 'carb';
  return 'meal';
}
export function tasteOf(food){
  const r = roleOf(food), n = food.name;
  if (SWEET.test(n)) return 'sweet';
  if (NEUTRAL.test(n)) return 'neutral';
  if (r === 'fruit') return 'sweet';
  if (r === 'dairy') return 'sweet';
  return 'savory';
}
function bounds(food){
  const r = roleOf(food), p = food.p, kcal = num(p[0]);
  let lo = 50, hi = 250;
  if (r === 'protein') { lo = 60; hi = 250; if (num(p[1]) > 60) { lo = 20; hi = 70; } else if (kcal > 400) { lo = 15; hi = 60; } }
  if (r === 'dairy') { lo = 120; hi = 360; }
  if (r === 'carb') { lo = 40; hi = 350; if (kcal > 240) { lo = 25; hi = 130; } }
  if (r === 'veg') { lo = 50; hi = 250; if (/salsa/i.test(food.name)) { lo = 30; hi = 64; } else if (/sauce|marinara/i.test(food.name)) { lo = 60; hi = 130; } }
  if (r === 'fruit') { lo = 60; hi = 250; if (kcal > 200) { lo = 15; hi = 45; } }
  if (r === 'fat') { lo = 8; hi = 40; if (kcal > 800) { lo = 5; hi = 15; } else if (kcal < 300) { lo = 30; hi = 100; } }
  if (r === 'meal') { const u = num(food.unitG) || 150; lo = Math.max(80, u * 0.75); hi = Math.min(600, u * 3); }
  return [lo, hi];
}
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

// sauces only make sense with certain partners
const SAUCE_OK = {pasta: /pasta/i, salsa: /tortilla|rice|bean|egg|chicken|beef|turkey|quinoa|potato/i};
function compatible(foods){
  const tastes = new Set(foods.map(tasteOf));
  if (tastes.has('sweet') && tastes.has('savory')) return false;
  for (const f of foods){
    if (/pasta sauce|marinara/i.test(f.name) && !foods.some(o => o !== f && SAUCE_OK.pasta.test(o.name))) return false;
    if (/salsa/i.test(f.name) && !foods.some(o => o !== f && SAUCE_OK.salsa.test(o.name))) return false;
  }
  if (foods.filter(f => roleOf(f) === 'dairy').length > 1) return false;
  return true;
}

// bounded weighted least squares over grams/100, by coordinate descent
function solve(foods, t, w){
  const n = foods.length, A = foods.map(f => [num(f.p[0]), num(f.p[1]), num(f.p[2]), num(f.p[3])]);
  const T = [t.calories, t.protein_g, t.carbs_g, t.fat_g].map(v => Math.max(v, 1));
  const B = foods.map(bounds).map(([lo, hi]) => [lo / 100, hi / 100]);
  const x = B.map(([lo, hi]) => (lo + hi) / 4 + lo / 2);
  const resid = () => [0, 1, 2, 3].map(k => A.reduce((a, row, i) => a + row[k] * x[i], 0) - T[k]);
  for (let it = 0; it < 40; it++){
    for (let i = 0; i < n; i++){
      const r = resid();
      let num_ = 0, den = 0;
      for (let k = 0; k < 4; k++){ const wk = w[k] / (T[k] * T[k]); num_ += wk * A[i][k] * (r[k] - A[i][k] * x[i]); den += wk * A[i][k] * A[i][k]; }
      if (den > 0) x[i] = Math.min(B[i][1], Math.max(B[i][0], -num_ / den));
    }
  }
  return x.map(v => v * 100);
}

// friendly portion: "1½ cups (237 g)", "5.5 oz (156 g)", "2 large (100 g)", "150 g"
const FR = {0.5:'½', 1.5:'1½', 2.5:'2½', 3.5:'3½', 0.25:'¼', 0.75:'¾'};
const fq = n => FR[n] || String(n);
const COUNTABLE = /^(large|medium|small|extra large|slice|piece|egg|bagel|tortilla|muffin|patty|link|container|packet|bar|waffle|fruit|can|scoop|roll|biscuit|cookie|chop|breast|thigh|wing|sandwich|item|each|banana|apple|orange|peach|pear)/i;
const PLURAL = {tablespoon:'tablespoons', teaspoon:'teaspoons', thigh:'thighs', breast:'breasts', chop:'chops', roll:'rolls', biscuit:'biscuits', cookie:'cookies', cup:'cups', slice:'slices', piece:'pieces', patty:'patties', link:'links', bagel:'bagels', tortilla:'tortillas', muffin:'muffins', container:'containers', packet:'packets', scoop:'scoops', bar:'bars', waffle:'waffles', can:'cans', fruit:'fruit', egg:'eggs', serving:'servings', tbsp:'tbsp', tsp:'tsp', large:'large', medium:'medium', small:'small', oz:'oz'};
export function portion(food, grams){
  const d = String(food.unitD || '').replace(/\s+/g, ' ').replace(/\(.*?\)/g, '').replace(/,.*$/, '').trim();
  const g = num(food.unitG);
  const m = d.match(/^(\d+(?:\.\d+)?|\.\d+)\s*(.*)$/);
  if (/^\d+(\.\d+)?\s*oz$/.test(d) || (!d && roleOf(food) === 'protein')) {
    const oz = Math.max(0.5, Math.round(grams / 28.35 * 2) / 2);
    return {grams: Math.round(oz * 28.35), text: `${fq(oz)} oz`};
  }
  if (g && m && m[2] && !/^g$|gram|nlea|serving/i.test(m[2])) {
    const lead = parseFloat(m[1].startsWith('.') ? '0' + m[1] : m[1]) || 1, per = g / lead;
    const countable = COUNTABLE.test(m[2]);
    let n = countable ? Math.max(1, Math.round(grams / per)) : Math.round(grams / per * 2) / 2;
    if (n < 0.5) n = grams / per >= 0.2 ? 0.25 : 0.5;
    const word = m[2].split(' ')[0], rest = m[2].slice(word.length);
    const unit = n > 1 && PLURAL[word] ? PLURAL[word] + rest : m[2];
    return {grams: Math.round(n * per), text: `${fq(n)} ${unit}`};
  }
  const r = grams < 30 ? Math.max(5, Math.round(grams)) : Math.round(grams / 5) * 5;
  return {grams: r, text: `${r} g`};
}

function totals(parts){
  const t = new Array(19).fill(0);
  for (const {food, grams} of parts) food.p.forEach((v, i) => { t[i] += num(v) * grams / 100; });
  return t;
}
function matchScore(t, target, opts){
  const T = [target.calories, target.protein_g, target.carbs_g, target.fat_g];
  const w = [3, 2, 1, 1];
  let err = 0, ws = 0;
  for (let k = 0; k < 4; k++){ if (T[k] <= 0) continue; err += w[k] * Math.min(1, Math.abs(t[k] - T[k]) / T[k]); ws += w[k]; }
  let s = 100 - (err / (ws || 1)) * 100;
  if (opts.sodiumBudget && t[K.sodium] > opts.sodiumBudget) s -= Math.min(15, (t[K.sodium] / opts.sodiumBudget - 1) * 15);
  if (opts.highFiber) s += Math.min(5, t[K.fiber] / 2);
  return Math.max(0, Math.min(100, s));
}

const SNACK_TEMPLATES = [['P','S'], ['S','F'], ['P','F'], ['C','F'], ['P']];
const TEMPLATES = [['P','C','S'], ['P','C','S','F'], ['P','C'], ['P','C','F'], ['P','S','F'], ['P','S'], ['C','S','F'], ['M','S'], ['M']];

export function mealIdeas(pantry, target, opts = {}){
  const usable = pantry.filter(f => f && f.p && num(f.p[0]) > 0 && roleOf(f) !== 'snack');
  const by = {P:[], C:[], S:[], F:[], M:[]};
  for (const f of usable){
    const r = roleOf(f);
    if (r === 'protein' || r === 'dairy') by.P.push(f);
    else if (r === 'carb') by.C.push(f);
    else if (r === 'veg' || r === 'fruit') by.S.push(f);
    else if (r === 'fat') by.F.push(f);
    else if (r === 'meal') by.M.push(f);
  }
  for (const k in by) by[k] = by[k].slice(0, 12);
  const w = [3, 2.2, 1, 1];
  const seen = new Set(), out = [];
  const consider = foods => {
    const key = foods.map(f => f.key).sort().join('|');
    if (seen.has(key)) return; seen.add(key);
    if (!compatible(foods)) return;
    const grams = solve(foods, target, w);
    const parts = foods.map((food, i) => { const pr = portion(food, grams[i]); return {food, grams: pr.grams, text: pr.text}; }).filter(p => p.grams > 0);
    const t = totals(parts);
    const noProtein = !foods.some(f => ['protein','dairy','meal'].includes(roleOf(f)));
    out.push({parts, totals: t, match: matchScore(t, target, opts) - Math.max(0, parts.length - 3) * 1.5 - (noProtein ? 4 : 0), taste: foods.some(f => tasteOf(f) === 'sweet') ? 'sweet' : 'savory'});
  };
  for (const tpl of (opts.templates || TEMPLATES)){
    const pools = tpl.map(s => by[s]);
    if (pools.some(p => !p.length)) continue;
    const rec = (i, acc) => {
      if (i === pools.length) { consider(acc); return; }
      for (const f of pools[i]) { if (!acc.includes(f)) rec(i + 1, acc.concat([f])); }
    };
    rec(0, []);
  }
  out.sort((a, b) => b.match - a.match);
  // keep it varied: no repeat of the same main food more than twice, no identical protein+carb pair
  const picked = [], useCount = new Map(), pairs = new Set();
  for (const idea of out){
    const keys = idea.parts.map(p => p.food.key);
    const main = idea.parts.slice(0, 2).map(p => p.food.key).join('+');
    if (pairs.has(main)) continue;
    if (keys.some(k => (useCount.get(k) || 0) >= 2)) continue;
    picked.push(idea); pairs.add(main); keys.forEach(k => useCount.set(k, (useCount.get(k) || 0) + 1));
    if (picked.length >= (opts.count || 8)) break;
  }
  return picked.map(i => ({...i, name: nameOf(i.parts)}));
}

export function nameOf(parts){
  const n = parts.map((p, i) => i ? p.food.name.charAt(0).toLowerCase() + p.food.name.slice(1) : p.food.name);
  if (n.length === 1) return n[0];
  return n.slice(0, -1).join(', ') + ' & ' + n[n.length - 1];
}

// A whole day: `meals` meals plus an optional snack, chosen to add up to the daily goals.
export function dayPlan(pantry, daily, opts = {}){
  const meals = opts.meals || 3, snack = opts.snack !== false;
  const mealShare = snack ? 0.88 / meals : 1 / meals;
  const mt = scaleT(daily, mealShare), st = scaleT(daily, 0.12);
  const sodiumBudget = opts.lowSodium ? 2300 / (meals + (snack ? 1 : 0)) : 0;
  const pool = mealIdeas(pantry, mt, {...opts, sodiumBudget, count: 30});
  const spool = snack ? mealIdeas(pantry, st, {...opts, sodiumBudget, count: 12, templates: SNACK_TEMPLATES}) : [];
  const slots = meals === 2 ? ['lunch','dinner'] : meals === 4 ? ['breakfast','lunch','dinner','dinner'] : ['breakfast','lunch','dinner'];
  const isBreakfasty = i => i.taste === 'sweet' || /\begg/i.test(i.name);
  const chosen = [], run = new Array(19).fill(0), usedMain = new Set();
  const dayErr = t => { const T = [daily.calories, daily.protein_g, daily.carbs_g, daily.fat_g], w = [3, 2, 1, 1]; return [0, 1, 2, 3].reduce((a, k) => a + w[k] * Math.abs(t[k] - T[k]) / Math.max(T[k], 1), 0); };
  for (let m = 0; m < meals; m++){
    const left = meals - m;
    let best = null, bestE = Infinity;
    const wantBreakfast = slots[m] === 'breakfast';
    const fits = pool.filter(i => wantBreakfast ? isBreakfasty(i) : i.taste !== 'sweet');
    for (const idea of (fits.length ? fits : pool)){
      const main = idea.parts[0].food.key;
      if (usedMain.has(main) || chosen.includes(idea)) continue;
      const t = run.map((v, i) => v + idea.totals[i] * left);   // assume the rest look alike
      const e = dayErr(t);
      if (e < bestE) { bestE = e; best = idea; }
    }
    if (!best) break;
    chosen.push(best); usedMain.add(best.parts[0].food.key); best.totals.forEach((v, i) => run[i] += v);
  }
  let snackIdea = null;
  if (snack && spool.length){
    let bestE = Infinity;
    for (const s of spool){ const e = dayErr(run.map((v, i) => v + s.totals[i])); if (e < bestE) { bestE = e; snackIdea = s; } }
    if (snackIdea) snackIdea.totals.forEach((v, i) => run[i] += v);
  }
  const plan = chosen.map((idea, i) => ({slot: slots[i] || 'dinner', idea}));
  if (snackIdea) plan.push({slot:'snack', idea:snackIdea});
  return {plan, totals: run, match: Math.max(0, 100 - dayErr(run) / 7 * 100)};
}
export const scaleT = (t, s) => ({calories: t.calories * s, protein_g: t.protein_g * s, carbs_g: t.carbs_g * s, fat_g: t.fat_g * s});
