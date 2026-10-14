// Water intake goal and a rough "water weight" estimate.
// The estimate compares today's (and yesterday's) intake with the person's own recent habits,
// because day-to-day scale swings come from changes, not from a normal day's food.
// Every number here is an approximation; when morning weigh-ins exist, the model learns how much
// each factor actually moves this person's scale and rescales itself.
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const LB_PER_G = 1 / 453.6;
const OZ_TO_G = 29.57;

export const keyOf = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number); return keyOf(new Date(y, m - 1, d + n)); };

// plain-water goal in fl oz: half your body weight in ounces, plus practice sweat
export function waterGoal({weightLb, sex, practiceMin = 0, sweatLossLb = 0}){
  let base = weightLb ? Math.round(weightLb * 0.5) : (sex === 'female' ? 72 : 96);
  base = Math.max(56, Math.min(160, base));
  const extra = sweatLossLb > 0 ? Math.round(sweatLossLb * 20) : Math.round(practiceMin / 30 * 12);
  return {goal: base + extra, base, extra};
}

// one day's raw signals; totals come from the app (food), the rest from the day record
export function signals(day, foodTotals){
  const t = foodTotals || {};
  const items = (day?.entries || []).flatMap(e => (e.items || []).map(it => num(it.grams) * (num(e.mult) || 1)));
  const ch = day?.checkins || [];
  const sum = k => ch.reduce((a, c) => a + num(c.answers?.[k]), 0);
  const avg = k => { const v = ch.map(c => c.answers?.[k]).filter(x => x != null && x !== ''); return v.length ? v.reduce((a, x) => a + num(x), 0) / v.length : null; };
  const firstSleep = ch.map(c => c.answers?.sleep).find(x => x != null && x !== '');
  const w = day?.weights || {};
  const pr = day?.practice || {};
  return {
    logged: (day?.entries || []).length > 0,
    sodium: num(t.sodium_mg), carbs: num(t.carbs_g), fiber: num(t.fiber_g), foodWater: num(t.water_g),
    mass: items.reduce((a, g) => a + g, 0),
    drank: (day?.water || []).reduce((a, x) => a + num(x.oz), 0),
    alcohol: (day?.entries || []).reduce((a, e) => a + (e.items || []).filter(it => /\b(beer|wine|vodka|whiskey|rum|tequila|liquor|alcoholic)\b/i.test(`${it.name} ${it.sub || ''}`)).length, 0),
    poop: ch.length ? sum('poop') : null, pee: ch.length ? sum('pee') : null, urine: avg('urine'), sleep: firstSleep != null ? num(firstSleep) : (num(day?.activity?.sleepH) || null),
    load: num(pr.load) || (num(pr.rpe) * num(pr.minutes)) || 0, practiceMin: num(pr.minutes),
    pre: num(w.pre), post: num(w.post), fluidsDuring: num(pr.fluidsOz), morning: num(w.morning),
  };
}

const DEFAULTS = {sodium: 3400, carbs: 250, fiber: 16, mass: 1800, drank: 64, poop: 1, load: 0};
function baseline(hist){
  // hist: signals for the previous days that have food logged
  const b = {};
  for (const k of Object.keys(DEFAULTS)){
    const v = hist.map(h => h[k]).filter(x => x != null && (k !== 'poop' || x != null));
    b[k] = v.length >= 3 ? v.reduce((a, x) => a + x, 0) / v.length : DEFAULTS[k];
  }
  b.days = hist.length;
  return b;
}

// Components in lb for a given moment. `today` = signals for the day being estimated, `yday` = the day before.
// When estimating a morning weight, pass asMorning=true: "today" has nothing eaten yet, so yesterday counts as today.
function components(today, yday, base, ctx, asMorning){
  const T = asMorning ? yday : today, Y = asMorning ? ctx.yday2 : yday;
  const c = {};
  const dNa = (T?.sodium ?? base.sodium) - base.sodium, dNaY = (Y?.sodium ?? base.sodium) - base.sodium;
  // ~0.31 L of body water holds 1,000 mg of sodium at blood concentration; assume half is still held the same day, a quarter the next
  c.sodium = (0.5 * dNa + 0.25 * dNaY) / 1000 * 0.31 * 2.2046;
  const dC = (T?.carbs ?? base.carbs) - base.carbs, dCY = (Y?.carbs ?? base.carbs) - base.carbs;
  const dLoad = (T?.load ?? 0) - base.load;
  // stored carbs (glycogen) hold ~3 g water per gram; hard practice burns some of it
  let glyc = 0.45 * dC + 0.25 * dCY - 0.25 * dLoad;
  glyc = Math.max(-350, Math.min(350, glyc));
  c.carbs = glyc * 4 * LB_PER_G;
  // food still in the gut: about half of today's food mass, a quarter of yesterday's, plus stool bulk from fiber
  const dM = (T?.mass ?? base.mass) - base.mass, dMY = (Y?.mass ?? base.mass) - base.mass;
  const dF = (T?.fiber ?? base.fiber) - base.fiber;
  let gut = (0.45 * dM + 0.2 * dMY + 5 * dF) * LB_PER_G;
  // bowel movements on the day that food was eaten
  const poop = T?.poop;
  if (poop != null) gut -= (poop - base.poop) * 0.35;
  c.gut = gut;
  // hydration: dark urine or unreplaced sweat means less water on board
  let hyd = 0;
  // pee color is read on the morning itself; practice sweat and alcohol come from the day before (mostly replaced overnight)
  const urine = asMorning ? today?.urine : T?.urine;
  if (urine != null) hyd += (3 - urine) * 0.25;
  // the scale drop across practice is the water still missing afterwards (what was drunk during is already back in)
  if (T && T.pre && T.post) hyd -= Math.max(0, T.pre - T.post) * (asMorning ? 0.15 : 0.45);
  if (T?.alcohol > 0) hyd -= 0.25 * Math.min(4, T.alcohol);
  c.hydration = hyd;
  // short sleep nudges water retention up a little
  const sl = today?.sleep;
  c.sleep = sl != null && sl < 6 ? (6 - sl) * 0.15 : 0;
  // steady offsets (shown, but they don't change day to day)
  c.cycle = ctx.cycle || 0;
  return c;
}
const MOVING = ['sodium', 'carbs', 'gut', 'hydration', 'sleep'];

function cyclePhase(profile, dateKey){
  if (profile.sex !== 'female' || !profile.cycleStart) return {lb: 0, day: null};
  const len = Math.max(21, Math.min(40, num(profile.cycleLength) || 28));
  const [y, m, d] = profile.cycleStart.split('-').map(Number), [Y, M, D] = dateKey.split('-').map(Number);
  const days = Math.round((new Date(Y, M - 1, D) - new Date(y, m - 1, d)) / 864e5);
  if (days < 0) return {lb: 0, day: null};
  const cd = (days % len) + 1;
  // water retention tends to build in the last week before a period and ease after it starts
  const lb = cd <= 2 ? 1.2 : cd <= 5 ? 0.5 : cd >= len - 6 ? 0.6 + 0.9 * (cd - (len - 7)) / 7 : cd >= len - 13 ? 0.4 : 0;
  return {lb, day: cd};
}

// Learn how strongly each factor moves this person's morning weight (ridge regression toward the default of 1).
function calibrate(rows){
  if (rows.length < 10) return null;
  const K = ['sodium', 'carbs', 'gut', 'hydration'];
  const A = K.map(() => K.map(() => 0)), b = K.map(() => 0), lam = 3;
  for (const r of rows){ for (let i = 0; i < K.length; i++){ b[i] += r.x[K[i]] * r.y; for (let j = 0; j < K.length; j++) A[i][j] += r.x[K[i]] * r.x[K[j]]; } }
  for (let i = 0; i < K.length; i++){ A[i][i] += lam; b[i] += lam * 1; }
  // solve A k = b (Gaussian elimination)
  const n = K.length, M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++){
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    if (Math.abs(M[i][i]) < 1e-9) return null;
    for (let r = 0; r < n; r++){ if (r === i) continue; const f = M[r][i] / M[i][i]; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; }
  }
  const k = {}; K.forEach((key, i) => { k[key] = Math.max(0, Math.min(3, M[i][n] / M[i][i])); });
  const mean = rows.reduce((a, r) => a + r.y, 0) / rows.length;
  let ssr = 0, sst = 0;
  for (const r of rows){ const p = K.reduce((a, key) => a + k[key] * r.x[key], 0); ssr += (r.y - p) ** 2; sst += (r.y - mean) ** 2; }
  return {k, r2: sst > 0 ? Math.max(0, 1 - ssr / sst) : 0, n: rows.length};
}

// days: {date: day}, totalsOf(date) -> food totals, profile, todayKey
// The headline is the water weight on that morning (driven by the day before, which is fully logged by then),
// the same moment a morning weigh-in measures. `forecast` looks ahead to the next morning from what's logged so far.
export function estimate(days, totalsOf, profile, todayKey){
  const memo = new Map();
  const sig = k => { if (!memo.has(k)) memo.set(k, signals(days[k], totalsOf(k))); return memo.get(k); };
  const hist = (k, from, to) => { const h = []; for (let i = from; i <= to; i++){ const s = sig(addDays(k, -i)); if (s.logged) h.push(s); } return h; };
  const morningOf = k => {
    const b = baseline(hist(k, 2, 8));
    return {b, x: components(sig(k), sig(addDays(k, -1)), b, {yday2: sig(addDays(k, -2)), cycle: cyclePhase(profile, k).lb}, true)};
  };
  const today = sig(todayKey), yday = sig(addDays(todayKey, -1));
  const cyc = cyclePhase(profile, todayKey);
  const {b: base, x: comp} = morningOf(todayKey);

  // weigh-ins: trend (smoothed) vs that morning's weight, and calibration rows
  const keys = []; for (let i = 60; i >= 0; i--) keys.push(addDays(todayKey, -i));
  let trend = null; const rows = []; const series = [];
  for (const k of keys){
    const w = num(days[k]?.weights?.morning);
    if (!w) continue;
    if (trend == null) trend = w;
    const resid = w - trend;
    if (hist(k, 2, 8).length >= 3 && sig(addDays(k, -1)).logged) {
      const {x} = morningOf(k);
      rows.push({x, y: resid - x.cycle - x.sleep});
    }
    series.push({k, w, trend});
    trend = trend + 0.15 * (w - trend);
  }
  const cal = calibrate(rows);
  const scale = c => { const o = {...c}; if (cal) for (const key of Object.keys(cal.k)) o[key] = c[key] * cal.k[key]; return o; };
  const sum = c => MOVING.reduce((a, k) => a + c[k], 0) + c.cycle;
  const scaled = scale(comp);
  let forecast = null;
  if (today.logged) {
    const next = addDays(todayKey, 1);
    const f = scale(components(sig(next), today, baseline(hist(todayKey, 1, 7)), {yday2: yday, cycle: cyclePhase(profile, next).lb}, true));
    forecast = {total: sum(f), components: f};
  }
  const lastW = series.length ? series[series.length - 1] : null;
  const todayW = num(days[todayKey]?.weights?.morning);
  return {
    total: sum(scaled), components: scaled, base, today, yday, forecast, creatine: !!profile.creatine, cycleDay: cyc.day,
    trend: lastW ? lastW.trend : null, morning: todayW || null, scaleVsTrend: todayW && lastW ? todayW - lastW.trend : null,
    calibration: cal, baselineDays: base.days,
  };
}

export function bloatLabel(lb){
  if (lb <= -1.5) return {label: 'Drained', tone: 'low'};
  if (lb <= -0.5) return {label: 'Lean', tone: 'low'};
  if (lb < 0.6) return {label: 'Normal', tone: 'ok'};
  if (lb < 1.6) return {label: 'A bit puffy', tone: 'mid'};
  return {label: 'Bloated', tone: 'high'};
}
export const COMPONENT_LABEL = {sodium: 'Sodium', carbs: 'Carbs (stored with water)', gut: 'Food still in your gut', hydration: 'Hydration and sweat', sleep: 'Short sleep', cycle: 'Menstrual cycle'};
export { OZ_TO_G };
