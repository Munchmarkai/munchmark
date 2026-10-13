// Weekly recap: per-day totals, averages, highlights and sport-aware suggestions. Pure, no DOM.
// Nutrient arrays follow the app's KEYS order.
const KEYS = ['calories','protein_g','carbs_g','fat_g','fiber_g','sugar_g','sat_fat_g','cholesterol_mg','sodium_mg','potassium_mg','calcium_mg','iron_mg','magnesium_mg','zinc_mg','vitamin_a_mcg','vitamin_c_mg','vitamin_d_mcg','vitamin_b12_mcg','folate_mcg'];
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

export const SPORTS = {
  none:      {label:'No regular sport', kind:'none'},
  lifting:   {label:'Weightlifting / strength', kind:'strength'},
  running:   {label:'Running', kind:'endurance'},
  cycling:   {label:'Cycling', kind:'endurance'},
  swimming:  {label:'Swimming', kind:'endurance'},
  basketball:{label:'Basketball', kind:'team'},
  soccer:    {label:'Soccer', kind:'team'},
  football:  {label:'Football', kind:'team'},
  baseball:  {label:'Baseball / softball', kind:'team'},
  volleyball:{label:'Volleyball', kind:'team'},
  tennis:    {label:'Tennis / pickleball', kind:'team'},
  wrestling: {label:'Wrestling / combat sports', kind:'combat'},
  other:     {label:'Other sport', kind:'team'},
};
// typical sports-nutrition ranges, grams per kg of body weight per day
const RANGES = {
  none:      {p:[0.8, 1.6], c:null},
  strength:  {p:[1.6, 2.2], c:[3, 5]},
  endurance: {p:[1.2, 1.6], c:[5, 7]},
  team:      {p:[1.4, 1.7], c:[5, 7]},
  combat:    {p:[1.6, 2.0], c:[4, 6]},
};

export const weekStart = key => { const [y, m, d] = key.split('-').map(Number); const dt = new Date(y, m - 1, d); const wd = (dt.getDay() + 6) % 7; dt.setDate(dt.getDate() - wd); return fmt(dt); };
export const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); const dt = new Date(y, m - 1, d + n); return fmt(dt); };
const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

function entryTotals(e){
  const t = new Array(KEYS.length).fill(0), m = num(e.mult) || 1;
  for (const it of e.items || []) it.p.forEach((v, i) => { t[i] += num(v) * num(it.grams) / 100 * m; });
  return t;
}

// days: {date: {entries}}, target: {calories, protein_g, carbs_g, fat_g}, body: {kg, sport, trainingDays, goal, age, sex}
export function summarize(days, start, target, body = {}){
  const list = [];
  for (let i = 0; i < 7; i++){
    const date = addDays(start, i), entries = days[date]?.entries || [];
    const t = new Array(KEYS.length).fill(0);
    for (const e of entries) entryTotals(e).forEach((v, k) => t[k] += v);
    list.push({date, entries, t, logged: entries.length > 0});
  }
  const logged = list.filter(d => d.logged);
  const n = logged.length || 1;
  const avg = KEYS.map((_, k) => logged.reduce((a, d) => a + d.t[k], 0) / n);
  const near = (v, goal, tol) => goal > 0 && Math.abs(v - goal) / goal <= tol;
  for (const d of list){
    d.hitKcal = d.logged && near(d.t[0], target.calories, 0.1);
    d.hitProtein = d.logged && d.t[1] >= target.protein_g * 0.9;
    d.score = d.logged ? [0, 1, 2, 3].reduce((a, k) => a + Math.abs(d.t[k] - [target.calories, target.protein_g, target.carbs_g, target.fat_g][k]) / Math.max(1, [target.calories, target.protein_g, target.carbs_g, target.fat_g][k]) * [3, 2, 1, 1][k], 0) : Infinity;
  }
  const bestDay = logged.length ? logged.reduce((a, b) => b.score < a.score ? b : a) : null;
  // foods eaten most often (by item name), with calories they added
  const foods = new Map();
  let biggestProtein = null, entriesCount = 0;
  for (const d of logged) for (const e of d.entries){
    entriesCount++;
    const et = entryTotals(e);
    if (!biggestProtein || et[1] > biggestProtein.protein) biggestProtein = {name: e.name, protein: et[1], date: d.date};
    for (const it of e.items || []){
      const key = String(it.name).toLowerCase();
      const cur = foods.get(key) || {name: it.name, count: 0, kcal: 0, sodium: 0};
      cur.count++; cur.kcal += num(it.p[0]) * num(it.grams) / 100 * (num(e.mult) || 1); cur.sodium += num(it.p[8]) * num(it.grams) / 100 * (num(e.mult) || 1);
      foods.set(key, cur);
    }
  }
  const topFoods = [...foods.values()].sort((a, b) => b.count - a.count || b.kcal - a.kcal).slice(0, 5);
  const topSodium = [...foods.values()].sort((a, b) => b.sodium - a.sodium).slice(0, 3);
  let streak = 0, run = 0;
  for (const d of list){ run = d.logged ? run + 1 : 0; streak = Math.max(streak, run); }
  const s = {start, end: addDays(start, 6), days: list, loggedDays: logged.length, entries: entriesCount, avg, target, bestDay, topFoods, topSodium, streak,
    proteinDays: list.filter(d => d.hitProtein).length, kcalDays: list.filter(d => d.hitKcal).length, biggestProtein};
  s.suggestions = suggest(s, body);
  return s;
}

function suggest(s, body){
  const out = [], push = (pri, title, text, tone = 'tip') => out.push({pri, title, text, tone});
  const sport = SPORTS[body.sport] || SPORTS.none, R = RANGES[sport.kind] || RANGES.none;
  const kg = num(body.kg), a = s.avg, T = s.target, r0 = v => Math.round(v).toLocaleString();
  if (!s.loggedDays) return [{pri:0, title:'Start logging', text:'Log at least a few days this week and your recap fills in with averages, highlights and tips.', tone:'tip'}];
  if (s.loggedDays < 4) push(1, 'Log more days', `You logged ${s.loggedDays} day${s.loggedDays > 1 ? 's' : ''}. Five or more makes the averages and tips much more accurate.`);

  // calories
  const floor = body.sex === 'female' ? 1200 : 1500;
  if (a[0] < floor * 0.95) push(2, 'Eat a bit more', `You averaged ${r0(a[0])} calories a day, below a healthy minimum for most people. Add a snack or a bigger breakfast so your body has fuel${sport.kind !== 'none' ? ' for training' : ''}.`, 'warn');
  else if (a[0] < T.calories * 0.88) { const gap = T.calories - a[0]; push(3, 'Under your calorie goal', `You averaged ${r0(a[0])} of your ${r0(T.calories)} calorie goal, about ${r0(gap)} short each day. ${gap > 450 ? 'Add a snack and slightly bigger portions at meals' : 'One extra snack a day'} would close the gap${body.goal === 'gain' ? ' and keep a lean bulk moving' : sport.kind !== 'none' ? ' and fuel your training' : ''}.`); }
  else if (a[0] > T.calories * 1.12) push(3, 'Over your calorie goal', `You averaged ${r0(a[0])} calories, about ${r0(a[0] - T.calories)} over your goal. Your biggest calorie foods were ${s.topFoods.slice().sort((x, y) => y.kcal - x.kcal).slice(0, 2).map(f => f.name).join(' and ')}; a smaller portion of those is the easiest fix.`);
  else push(6, 'Calories on point', `You averaged ${r0(a[0])} calories, right around your ${r0(T.calories)} goal.`, 'good');

  // protein, by sport range when weight is known
  if (kg) {
    const gkg = a[1] / kg, [lo, hi] = R.p;
    if (gkg < lo * 0.95) push(2, 'More protein', `Protein averaged ${r0(a[1])} g (${gkg.toFixed(1)} g per kg).${sport.kind !== 'none' ? ` For ${sport.label.toLowerCase()}, aim for ${lo}–${hi} g per kg, about ${r0(lo * kg)}–${r0(hi * kg)} g a day.` : ` Aim for at least ${r0(T.protein_g)} g.`} Easy adds: a cup of Greek yogurt (about 20 g), 4 oz chicken (about 35 g) or 3 eggs (about 19 g).`);
    else if (s.proteinDays >= 5) push(5, 'Protein streak', `You hit your protein goal on ${s.proteinDays} of 7 days. That's what builds and keeps muscle.`, 'good');
    if (R.c) {
      const ckg = a[2] / kg, [clo, chi] = R.c;
      if (ckg < clo * 0.9) push(2, 'Fuel your training', `Carbs averaged ${ckg.toFixed(1)} g per kg. ${sport.label} usually runs best on ${clo}–${chi} g per kg on training days (about ${r0(clo * kg)} g). Add rice, oats, potatoes, fruit or pasta around workouts.`);
    }
  } else if (a[1] < T.protein_g * 0.9) push(2, 'More protein', `Protein averaged ${r0(a[1])} g against a ${r0(T.protein_g)} g goal. Add a protein food to each meal.`);

  if (a[4] < 20) push(4, 'More fiber', `Fiber averaged ${a[4].toFixed(0)} g a day; the daily value is 28 g. Beans, berries, oats, whole-wheat bread and vegetables add it fast.`);
  if (a[8] > 2300) push(3, 'Watch the sodium', `Sodium averaged ${r0(a[8])} mg, over the 2,300 mg limit. Top sources this week: ${s.topSodium.map(f => f.name).join(', ')}.${sport.kind !== 'none' ? ' Heavy sweaters lose sodium, but this is still high for most days.' : ''}`);
  if (a[9] < 3000) push(4, 'Boost potassium', `Potassium averaged ${r0(a[9])} mg (daily value 4,700 mg). Bananas, potatoes, beans, yogurt and spinach are the big ones${sport.kind !== 'none' ? ', and it matters more when you sweat' : ''}.`);
  if (sport.kind !== 'none') push(7, 'Hydrate around training', `Drink water before, during and after training${num(body.trainingDays) ? ` (${body.trainingDays} days a week)` : ''}, and add a sports drink or salty snack on long or hot sessions.`);
  return out.sort((x, y) => x.pri - y.pri).slice(0, 5);
}
