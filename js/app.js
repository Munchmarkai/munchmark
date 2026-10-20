import { buildIndex, search, tokens } from './search.js';
import { LABELS, PANTRY } from './labels.js';
import { mealIdeas, dayPlan, scaleT, roleOf } from './planner.js';
import { summarize, weekStart, addDays, SPORTS } from './week.js';
import { playWrapped } from './wrapped.js';
import { parseMeal, labelByName, parseIngredients, parseSegment, splitMeal, gramsFromMeasure } from './parse.js';
import * as store from './store.js';
import { offP100, getProduct, displayName } from './off.js';
import { scan as packScan, setVocab, readScale, readText, readWords, brandOf } from './packscan.js';
import { roleFromCategories } from './brands.js';
import { parseDiet, applyDiet } from './diet.js';
import { waterGoal, estimate, bloatLabel, COMPONENT_LABEL } from './water.js';
import { CHAINS, CHAIN_BY, KIND_LABEL, initRestaurants, menuFor, genericMenu, detectChain, chainByName, kindFromName, rankMenu, portionsOf, nutOf, suggest, parseMenuText, parseMenuWords, estimateMenuItem, stripChainName, menuRole } from './restaurants.js';
import * as G from './gemini.js';
import { GEMINI_PROXY as PROXY_SET, SHARED_DAILY_LIMIT } from './config.js';
// the example address from the instructions isn't a real server
const GEMINI_PROXY = ((v) => !v || /yourname\.workers\.dev/i.test(v) ? '' : /^https?:\/\//i.test(v) ? v : 'https://' + v)(String(PROXY_SET || '').trim());
import { searchOnline, webSearchURL, setFdcKey } from './online.js';
import { parseLabel, labelToP100 } from './label.js';
import { WEIGH_POINTS, QUESTIONS, URINE, sportDefaults, hrMax, zoneOf, summarizeHR, connectHR, dayMetrics, feelScore, weekStats, replicate, COMPARE_ROWS } from './sports.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const int = n => Math.round(n).toLocaleString();
const dec = n => n >= 10 ? String(Math.round(n)) : (Math.round(n * 10) / 10).toString();
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const uid = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- reference ---------- */
const KEYS = ['calories','protein_g','carbs_g','fat_g','fiber_g','sugar_g','sat_fat_g','cholesterol_mg','sodium_mg','potassium_mg','calcium_mg','iron_mg','magnesium_mg','zinc_mg','vitamin_a_mcg','vitamin_c_mg','vitamin_d_mcg','vitamin_b12_mcg','folate_mcg','water_g'];
const KI = Object.fromEntries(KEYS.map((k, i) => [k, i]));
const NUTRIENTS = [
  {k:'fiber_g', label:'Fiber', unit:'g', dv:28},
  {k:'sugar_g', label:'Sugars', unit:'g', dv:0},
  {k:'sodium_mg', label:'Sodium', unit:'mg', dv:2300, limit:true},
  {k:'potassium_mg', label:'Potassium', unit:'mg', dv:4700},
  {k:'sat_fat_g', label:'Saturated fat', unit:'g', dv:20, limit:true},
  {k:'cholesterol_mg', label:'Cholesterol', unit:'mg', dv:300, limit:true},
  {k:'calcium_mg', label:'Calcium', unit:'mg', dv:1300},
  {k:'iron_mg', label:'Iron', unit:'mg', dv:18},
  {k:'magnesium_mg', label:'Magnesium', unit:'mg', dv:420},
  {k:'zinc_mg', label:'Zinc', unit:'mg', dv:11},
  {k:'vitamin_a_mcg', label:'Vitamin A', unit:'mcg', dv:900},
  {k:'vitamin_c_mg', label:'Vitamin C', unit:'mg', dv:90},
  {k:'vitamin_d_mcg', label:'Vitamin D', unit:'mcg', dv:20},
  {k:'vitamin_b12_mcg', label:'Vitamin B12', unit:'mcg', dv:2.4},
  {k:'folate_mcg', label:'Folate', unit:'mcg', dv:400},
];
const NMAP = Object.fromEntries(NUTRIENTS.map(n => [n.k, n]));
const KEYN = ['fiber_g','sodium_mg','potassium_mg','sugar_g'];
const MEALS = [['breakfast','Breakfast'],['lunch','Lunch'],['dinner','Dinner'],['snack','Snack']];
const MEAL_LABEL = Object.fromEntries(MEALS);
const MULTS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const MULT_LABEL = {0.5:'½',0.75:'¾',1:'1',1.25:'1¼',1.5:'1½',2:'2'};
const ACT = {sedentary:1.2, light:1.375, active:1.55, very:1.725};
const GOAL = {lose:-500, lose_slow:-250, maintain:0, gain:300};

/* ---------- dates ---------- */
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const toDate = k => { const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d); };
const shift = (k, n) => { const d = toDate(k); d.setDate(d.getDate() + n); return dayKey(d); };
const longDay = k => toDate(k).toLocaleDateString(undefined, {weekday:'long', month:'short', day:'numeric'});
const shortDay = k => toDate(k).toLocaleDateString(undefined, {month:'short', day:'numeric'});
const relDay = k => k === dayKey() ? 'Today' : k === shift(dayKey(), -1) ? 'Yesterday' : toDate(k).toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'});
function defaultMeal(){ const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : (h >= 17 && h < 22) ? 'dinner' : 'snack'; }

/* ---------- state ---------- */
const S = {
  tab:'today', viewDate:dayKey(), profile:{}, days:{}, open:null, confirmDel:null,
  mode:'photo', plate:[], meal:defaultMeal(), plateName:'',
  photo:null, rec:{state:'unknown', progress:0, text:'', results:null, busy:false, error:'', added:new Set()},
  bc:{stream:null, timer:0, busy:false},
  draft:{}, dirty:false,
  pantry:[], pan:{photo:null, busy:false, stepText:'', frac:0, detect:null, sel:new Set(), pk:null, pkSel:new Set(), ideas:null, plan:null, mode:'ideas'},
  wk:{start:null, report:false}, bcTarget:null,
  bf:{photo:null, busy:false, probs:null, level:null},
  pk:{busy:false, res:null, step:'', frac:0, added:new Set(), choice:{}},
  recipes:[], containers:[],
  ml:{edit:null, log:null, cEdit:null},
  wb:{photo:null, busy:false, matches:null, pick:null, frac:1, err:'', scaleOz:null},
  sp:{view:'day', date:dayKey(), setup:false, ci:{}, cmpA:null, cmpB:null, importMsg:''},
  hr:{conn:null, name:'', bpm:0, rec:false, samples:[], err:''},
  desc:{text:'', applied:null, online:null}, rest:{chain:null, src:'', ask:null, manual:null, no:false, filter:''},
  eo:{q:'', chain:null, kind:null, menu:null, busy:false, step:'', err:'', tKcal:'', tP:''},
  myFoods:[], online:{q:'', busy:false, items:null, errors:[]}, lbl:null,
  gm:{photo:null, type:null},
};
let DB = null, INDEX = null, BYID = null, R = null;

/* ---------- food helpers ---------- */
const p100Of = f => f.slice(3, 3 + KEYS.length);
const tidy = d => String(d || '').replace(/\s+/g, ' ').replace(/^\.(\d)/, '0.$1').replace(/\s*,\s*$/, '').trim();
function shortName(n){
  let s = String(n).replace(/^(Fast foods?|Restaurant|Beverages|Snacks|Cereals ready-to-eat|Alcoholic beverage),\s*/i, '');
  const parts = s.split(', ');
  s = parts.slice(0, 3).join(', ');
  return s.length > 48 ? s.slice(0, 46) + '…' : s;
}
function usdaItem(ndb, grams, name, portionText){
  const f = BYID.get(ndb); if (!f) return null;
  const n = f.length, opts = [];
  if (portionText) opts.push({t:portionText, g:grams});
  if (f[n-4] && f[n-3]) opts.push({t:tidy(f[n-3]), g:f[n-4]});
  if (f[n-2] && f[n-1]) opts.push({t:tidy(f[n-1]), g:f[n-2]});
  opts.push({t:'1 oz', g:28.35}, {t:'100 g', g:100}, {t:'grams', g:1});
  const seen = new Set(); const uniq = opts.filter(o => { const k = o.t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  let opt = 0, qty = 1;
  if (!portionText) {
    const i = uniq.findIndex(o => Math.abs(o.g - grams) < 0.5 && o.t !== 'grams');
    if (i >= 0) opt = i; else { opt = uniq.length - 1; qty = Math.round(grams); }
  }
  return {id:uid(), src:'usda', ndb, name: name || friendly(ndb) || shortName(f[1]), sub:f[1], p:p100Of(f), opts:uniq, opt, qty};
}
const itemGrams = it => num(it.qty) * it.opts[it.opt].g;
function totalsOf(items, mult = 1){
  const t = Object.fromEntries(KEYS.map(k => [k, 0]));
  for (const it of items){
    const g = it.grams != null ? it.grams : itemGrams(it);
    KEYS.forEach((k, i) => { t[k] += num(it.p[i]) * g / 100 * mult; });
  }
  return t;
}
let NDB_NAME = null;
function friendly(ndb){
  if (!NDB_NAME) { NDB_NAME = new Map(); for (const l of LABELS) if (l[1].length === 1 && !NDB_NAME.has(l[1][0][0])) NDB_NAME.set(l[1][0][0], cap(l[0])); }
  return NDB_NAME.get(ndb) || null;
}
function labelItems(label){
  const L = typeof label === 'string' ? labelByName(label) : label;
  if (!L) return [];
  const single = L[1].length === 1;
  return L[1].map(([ndb, g]) => {
    const it = usdaItem(ndb, g, single ? cap(L[0]) : friendly(ndb), single ? L[2] : `${g} g`);
    if (it) { it.label = L[0]; if (!single) it.group = L[0]; }
    return it;
  }).filter(Boolean);
}
function labelKcal(L){ return L[1].reduce((a, [ndb, g]) => a + num(BYID.get(ndb)?.[3]) * g / 100, 0); }
function altsFor(it){
  const q = it.label && !it.group ? it.label : shortName(it.sub);
  return search(INDEX, q, 8).filter(f => f[0] !== it.ndb).slice(0, 6);
}

/* ---------- persistence ---------- */
async function loadAll(){
  const all = await store.getAll();
  S.profile = all.profile || {};
  S.pantry = Array.isArray(all.pantry) ? all.pantry : [];
  S.recipes = Array.isArray(all.recipes) ? all.recipes : [];
  S.containers = Array.isArray(all.containers) ? all.containers : [];
  S.myFoods = Array.isArray(all.myfoods) ? all.myfoods : [];
  S.days = {};
  for (const [k, v] of Object.entries(all)) if (k.startsWith('day-') && v && v.date) S.days[v.date] = v;
}
function saveDay(date){ const d = S.days[date]; store.put('day-' + date, dayHasData(d) ? d : null); }
function saveProfile(){ store.put('profile', S.profile); }
function savePantry(){ store.put('pantry', S.pantry); }
const settings = () => (S.profile.settings ||= {});
const wrappedOn = () => settings().wrapped !== false;

/* ---------- targets & body math ---------- */
const heightIn = p => num(p.ft) * 12 + num(p.inch);
function calcBody(p){
  const h = heightIn(p), w = num(p.weightLb), age = num(p.age);
  if (!(h >= 36 && w >= 50 && age >= 10 && (p.sex === 'male' || p.sex === 'female'))) return null;
  const kg = w * 0.45359237, cm = h * 2.54;
  const bmi = kg / ((cm / 100) ** 2);
  const bmr = 10 * kg + 6.25 * cm - 5 * age + (p.sex === 'male' ? 5 : -161);
  const tdee = bmr * (ACT[p.activity] || ACT.light);
  const floor = p.sex === 'male' ? 1500 : 1200;
  const raw = tdee + (GOAL[p.goal] ?? 0);
  let goal = Math.max(raw, Math.min(floor, tdee));
  const custom = num(p.customKcal) >= 800;
  const floorHit = goal > raw && !custom;
  if (custom) goal = num(p.customKcal);
  goal = Math.round(goal / 10) * 10;
  // protein: 1 g per pound of body weight, with 10% either way counting as on target
  const protein = Math.round(w), proteinLo = Math.round(w * 0.9), proteinHi = Math.round(w * 1.1);
  const fat = Math.round(goal * 0.28 / 9);
  const carbs = Math.max(0, Math.round((goal - protein * 4 - fat * 9) / 4));
  return {kg, cm, bmi, bmr, tdee, goal, protein, proteinLo, proteinHi, fat, carbs, floorHit, custom};
}
function targets(){
  const c = calcBody(S.profile);
  if (c) return {calories:c.goal, protein_g:c.protein, protein_lo:c.proteinLo, protein_hi:c.proteinHi, carbs_g:c.carbs, fat_g:c.fat, set:true};
  const k = num(S.profile.customKcal) >= 800 ? num(S.profile.customKcal) : 2200, pg = Math.round(k * 0.25 / 4);
  return {calories:k, protein_g:pg, protein_lo:Math.round(pg * 0.9), protein_hi:Math.round(pg * 1.1), carbs_g:Math.round(k*0.47/4), fat_g:Math.round(k*0.28/9), set:false};
}
function navyBF(p){
  const h = heightIn(p), n = num(p.neck), wa = num(p.waist), hip = num(p.hip);
  if (!h || !n || !wa) return null;
  let v = null;
  if (p.sex === 'male') { if (wa > n) v = 86.010 * Math.log10(wa - n) - 70.041 * Math.log10(h) + 36.76; }
  else if (p.sex === 'female') { if (hip && wa + hip > n) v = 163.205 * Math.log10(wa + hip - n) - 97.684 * Math.log10(h) - 78.387; }
  return v && v > 2 && v < 70 ? v : null;
}
const bmiCat = b => b < 18.5 ? 'Underweight' : b < 25 ? 'Healthy weight' : b < 30 ? 'Overweight' : 'Obese';
const BF_BANDS = {
  male:   {min:2, max:40, bands:[[2,6,'Essential'],[6,14,'Athletic'],[14,18,'Fit'],[18,25,'Average'],[25,40,'High']]},
  female: {min:10, max:45, bands:[[10,14,'Essential'],[14,21,'Athletic'],[21,25,'Fit'],[25,32,'Average'],[32,45,'High']]},
};
function bfCat(sex, v){ const B = BF_BANDS[sex] || BF_BANDS.male; return (B.bands.find(([lo, hi]) => v < hi) || B.bands[B.bands.length - 1])[2]; }
const entryTotals = e => totalsOf(e.items || [], num(e.mult) || 1);
function dayTotals(date){
  const t = Object.fromEntries(KEYS.map(k => [k, 0]));
  for (const e of S.days[date]?.entries || []) { const x = entryTotals(e); KEYS.forEach(k => t[k] += x[k]); }
  return t;
}

/* ---------- Nutrition Facts label ---------- */
function nfHTML(t, serving){
  const pct = (v, dv) => Math.round(v / dv * 100) + '%';
  const val = (k) => { const n = NMAP[k]; return (n.unit === 'mg' ? int(t[k]) : dec(t[k])) + n.unit; };
  const r = (label, k, cls = '', bold = true) => { const n = NMAP[k]; return `<div class="nf-row ${cls}"><span>${bold ? `<b>${label}</b>` : label} ${val(k)}</span><b>${n.dv ? pct(t[k], n.dv) : ''}</b></div>`; };
  return `<div class="nf tnum" aria-label="Nutrition Facts">
    <div class="nf-title">Nutrition Facts</div>
    <div class="nf-serv"><span>Serving size</span><b>${esc(serving)}</b></div>
    <div class="nf-x"></div><div class="nf-amt">Amount per serving</div>
    <div class="nf-cal"><span>Calories</span><b>${int(t.calories)}</b></div>
    <div class="nf-m"></div><div class="nf-dvh">% Daily Value*</div>
    <div class="nf-row"><span><b>Total Fat</b> ${dec(t.fat_g)}g</span><b>${pct(t.fat_g, 78)}</b></div>
    ${r('Saturated Fat', 'sat_fat_g', 'in', false)}${r('Cholesterol', 'cholesterol_mg')}${r('Sodium', 'sodium_mg')}
    <div class="nf-row"><span><b>Total Carbohydrate</b> ${dec(t.carbs_g)}g</span><b>${pct(t.carbs_g, 275)}</b></div>
    ${r('Dietary Fiber', 'fiber_g', 'in', false)}${r('Total Sugars', 'sugar_g', 'in', false)}
    <div class="nf-row"><span><b>Protein</b> ${dec(t.protein_g)}g</span><b>${pct(t.protein_g, 50)}</b></div>
    <div class="nf-x"></div>
    ${['vitamin_d_mcg','calcium_mg','iron_mg','potassium_mg','vitamin_a_mcg','vitamin_c_mg','vitamin_b12_mcg','magnesium_mg','zinc_mg','folate_mcg'].map(k => r(NMAP[k].label, k, 'thin', false)).join('')}
    <div class="nf-m"></div>
    <p class="nf-foot"><span>*</span><span>% Daily Value is based on a 2,000-calorie diet. USDA reference values; your portion and recipe change the real numbers.</span></p>
  </div>`;
}

/* ---------- render: today ---------- */
function renderToday(){
  renderBanner();
  renderWater(); renderWaterWeight();
  const date = S.viewDate, isToday = date === dayKey();
  $('#day-title').textContent = relDay(date);
  $('#day-sub').textContent = isToday || date === shift(dayKey(), -1) ? longDay(date) : String(toDate(date).getFullYear());
  $('#day-next').disabled = isToday;
  const t = dayTotals(date), g = targets();
  $('#goal-set').hidden = g.set;
  const left = g.calories - t.calories, frac = Math.min(1, t.calories / g.calories);
  const ring = $('#ring-fill');
  ring.setAttribute('stroke-dashoffset', String(326.73 * (1 - frac)));
  ring.classList.toggle('over', left < 0);
  $('#kcal-left').textContent = int(Math.abs(left));
  $('#kcal-left-lbl').textContent = left < 0 ? 'kcal over' : 'kcal left';
  $('#kcal-eaten').textContent = int(t.calories);
  $('#kcal-goal').textContent = int(g.calories);
  const pv = t.protein_g, plo = g.protein_lo, phi = g.protein_hi;
  const pState = pv > phi ? 'over' : pv >= plo ? 'in' : '';
  $('#macros').innerHTML = `<div><div class="macro-top tnum"><b>Protein${pState === 'in' ? ' <em class="ok">in range</em>' : pState === 'over' ? ' <em class="hi">above range</em>' : ''}</b><span>${int(pv)} / ${int(plo)}–${int(phi)} g</span></div>
      <div class="bar range" style="--lo:${plo / phi * 100}%"><i style="--c:var(--protein);width:${Math.min(100, pv / (phi || 1) * 100)}%"></i></div></div>` +
    [['carbs_g','Carbs','--carbs'],['fat_g','Fat','--fat']].map(([k, l, c]) =>
    `<div><div class="macro-top tnum"><b>${l}</b><span>${int(t[k])} / ${int(g[k])} g</span></div><div class="bar"><i style="--c:var(${c});width:${Math.min(100, t[k] / (g[k] || 1) * 100)}%"></i></div></div>`).join('');
  const keys = Array.from({length:7}, (_, i) => shift(date, i - 6));
  const vals = keys.map(k => dayTotals(k).calories);
  const top = Math.max(g.calories * 1.15, ...vals.map(v => v * 1.05), 1);
  const logged = vals.filter(v => v > 0);
  $('#week-avg').textContent = logged.length ? `Avg ${int(logged.reduce((a, b) => a + b, 0) / logged.length)} kcal on ${logged.length} logged day${logged.length > 1 ? 's' : ''}` : 'No days logged yet';
  $('#week').innerHTML = keys.map((k, i) => `<button type="button" class="wd" data-action="day-pick" data-date="${k}" aria-current="${k === date}" aria-label="${esc(longDay(k))}: ${int(vals[i])} kcal">
      <span class="wd-col"><i class="${vals[i] > g.calories ? 'over' : ''}" style="height:${vals[i] / top * 100}%"></i><span class="wd-goal" style="bottom:${g.calories / top * 100}%"></span></span>
      <span>${toDate(k).toLocaleDateString(undefined, {weekday:'narrow'})}</span></button>`).join('');
  $('#keyn').innerHTML = KEYN.map(k => {
    const n = NMAP[k], v = t[k], pct = n.dv ? v / n.dv * 100 : 0;
    return `<div class="kn ${n.limit ? `limit${pct > 100 ? ' hot' : ''}` : ''}"><div class="kn-top"><b>${n.label}</b><span class="tnum">${n.dv ? Math.round(pct) + '%' : 'no daily value'}</span></div>
      <div class="kn-val tnum">${n.unit === 'mg' ? int(v) : dec(v)}<small>${n.unit}${n.dv ? ' of ' + int(n.dv) + (n.limit ? ' max' : '') : ''}</small></div>
      ${n.dv ? `<div class="bar"><i style="width:${Math.min(100, pct)}%"></i></div>` : ''}</div>`;
  }).join('');
  $('#nlist').innerHTML = NUTRIENTS.filter(n => !KEYN.includes(n.k)).map(n => {
    const v = t[n.k], pct = n.dv ? v / n.dv * 100 : 0;
    return `<li class="nrow ${n.limit ? 'limit' + (pct > 100 ? ' hot' : '') : ''}"><span>${n.label}${n.limit ? ' <em>(limit)</em>' : ''}</span><span class="tnum">${n.unit === 'mg' ? int(v) : dec(v)} ${n.unit} <em>· ${Math.round(pct)}%</em></span><div class="bar"><i style="width:${Math.min(100, pct)}%"></i></div></li>`;
  }).join('');
  const entries = S.days[date]?.entries || [];
  if (!entries.length) {
    $('#meals').innerHTML = `<div class="empty"><b>${isToday ? 'Nothing logged yet today' : 'Nothing logged this day'}</b><p>Snap a photo, scan a barcode or type what you ate. Calories, macros, sodium, potassium, fiber and vitamins fill in here.</p><button type="button" class="btn primary" data-action="tab" data-tab="scan">Add food</button></div>`;
    return;
  }
  $('#meals').innerHTML = `<div class="view" style="gap:16px">${MEALS.map(([mk, ml]) => {
    const list = entries.filter(e => (e.meal || 'snack') === mk);
    if (!list.length) return '';
    const sum = list.reduce((a, e) => a + entryTotals(e).calories, 0);
    return `<div class="meal-group"><div class="meal-head"><b>${ml}</b><span class="tnum">${int(sum)} kcal</span></div><ul class="entries">${list.map(entryHTML).join('')}</ul></div>`;
  }).join('')}</div>`;
}
function entryHTML(e){
  const m = num(e.mult) || 1, t = entryTotals(e), open = S.open === e.id;
  const thumb = e.thumb ? `<img src="${esc(e.thumb)}" alt="">` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/></svg>`;
  const time = e.time ? new Date(e.time).toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'}) : '';
  return `<li class="entry"><button type="button" class="entry-row" data-action="entry-toggle" data-id="${esc(e.id)}" aria-expanded="${open}">
      <span class="thumb">${thumb}</span>
      <span style="min-width:0"><span class="entry-name">${esc(e.name)}</span><span class="entry-sub pcf tnum"><i class="p">P ${int(t.protein_g)}</i> · <i class="c">C ${int(t.carbs_g)}</i> · <i class="f">F ${int(t.fat_g)}</i>${time ? ' · ' + esc(time) : ''}</span></span>
      <span class="entry-kcal tnum">${int(t.calories)}<small>kcal</small></span></button>
    ${open ? `<div class="entry-detail">
      <ul class="results">${(e.items || []).map(i => `<li><div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:8px 0"><span><b style="font-weight:600">${esc(i.name)}</b><br><small class="sub">${int(i.grams * m)} g · ${esc(i.portion || '')}</small></span><span class="k tnum">${int(num(i.p[0]) * i.grams / 100 * m)}</span></div></li>`).join('')}</ul>
      <div class="lbl">Portion eaten</div>
      <div class="chips">${MULTS.map(x => `<button type="button" class="chip" data-action="entry-mult" data-id="${esc(e.id)}" data-m="${x}" aria-pressed="${x === m}">${MULT_LABEL[x]}×</button>`).join('')}</div>
      <div class="sub tnum">Sodium ${int(t.sodium_mg)} mg · Potassium ${int(t.potassium_mg)} mg · Fiber ${dec(t.fiber_g)} g · Sugars ${dec(t.sugar_g)} g</div>
      <div class="row2"><button type="button" class="btn ghost sm" data-action="entry-again" data-id="${esc(e.id)}">Log again</button><button type="button" class="btn danger sm" data-action="entry-del" data-id="${esc(e.id)}">${S.confirmDel === e.id ? 'Tap again to delete' : 'Delete'}</button></div>
    </div>` : ''}</li>`;
}

/* ---------- render: add food ---------- */
function renderScan(){
  $$('[data-action="mode"]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === S.mode)));
  ['photo','barcode','type'].forEach(m => $('#mode-' + m).hidden = m !== S.mode);
  if (S.mode !== 'barcode') bcStop();
  renderPhoto(); renderPlate();
}
function renderPhoto(){
  const frame = $('#frame'), p = S.photo, r = S.rec;
  frame.classList.toggle('has-photo', !!p); frame.classList.toggle('scanning', r.busy);
  $('#frame-img').hidden = !p; if (p && $('#frame-img').src !== p.url) $('#frame-img').src = p.url;
  $('#frame-empty').hidden = !!p; $('#clear-photo').hidden = !p || r.busy;
  let html = '';
  const pkFound = p && !S.pk.busy && S.pk.res && S.pk.res.items.length;
  let recNote = '';
  const gmSt = p && S.gm.photo && S.gm.photo.ph === p ? S.gm.photo : null, gmHas = !!gmSt?.items?.length;
  if ((r.state === 'missing' && !gemOn() && !sharedAsk()) || r.state === 'error') {
    const box = `<div class="recbox"><span><b>${pkFound ? 'Not a packaged food?' : 'Food recognizer'}</b><br><span class="sub">${r.state === 'error' ? esc(r.error) : pkFound ? 'For home-cooked or restaurant meals, download the food recognizer once (about 150 MB, Wi-Fi).' : 'Packaged foods are read from the label. For meals and fresh food, download the recognizer once (about 150 MB, Wi-Fi recommended); then it works offline.'}</span></span>
      <button type="button" class="btn ${pkFound ? 'ghost' : 'primary'}" data-action="rec-download">${r.state === 'error' ? 'Try again' : 'Download recognizer'}</button></div>`;
    if (pkFound) recNote = box; else html = box;
  } else if (r.state === 'loading') {
    html = `<div class="recbox"><span><span class="spin"></span> <b id="rec-text">${esc(r.text || 'Starting…')}</b></span><div class="progress"><i id="rec-bar" style="width:${Math.round(r.progress * 100)}%"></i></div></div>`;
  } else if (r.busy) {
    html = `<div class="recbox"><span><span class="spin"></span> <b>Recognizing…</b></span></div>`;
  }
  const pk = S.pk;
  if (p && pk.busy) html = `<div class="recbox"><span><span class="spin"></span> <b id="pk-step">${esc(pk.step || 'Reading the label…')}</b></span></div>` + html;
  $('#rec-status').innerHTML = html;
  const pkItems = p && !pk.busy && pk.res ? pk.res.items.slice(0, 3) : [];
  const rHTML = restHTML();
  const dEl = $('#desc-out'); if (dEl) dEl.innerHTML = descOutHTML();
  // Gemini's label-data matches cover the packaged section, so it only shows when they don't
  const pkHTML = pkItems.length && (!gmHas || gmSt.items.some(x => x.kind === 'packaged' && !x.db)) ? `<div class="sec"><div class="sec-head"><h2 class="h">Packaged food</h2><span class="sub">Matched from the label</span></div><p class="fine credit">Product data: <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> contributors (ODbL) or USDA FoodData Central.</p><ul class="pks">${pkItems.map(it => pkCard(it, 'photo')).join('')}</ul></div>` : '';
  const gmHTML = gmSectionHTML(gmSt, 'photo', 'Gemini sees');
  const restLink = S.photo && !S.rest.chain && !S.rest.ask && !S.rest.open ? '<p class="fine"><button type="button" class="linkbtn" data-action="rest-open">From a restaurant? Pick it for its menu</button></p>' : '';
  // when Gemini already named the restaurant items, the chain's USDA menu is a fallback, so it folds away
  const restHTML2 = gmHas && rHTML && S.rest.chain ? `<details class="help"><summary>More from the ${esc(CHAIN_BY[S.rest.chain].name)} menu (USDA numbers)</summary>${rHTML}</details>` : rHTML;
  if (!r.results || r.busy) { $('#rec-results').innerHTML = gmHTML + restHTML2 + pkHTML + recNote + (p && !pk.busy ? restLink : ''); return; }
  const unsure = r.results[0].p < 0.3;
  const clipHTML = `<div class="sec"><div class="sec-head"><h2 class="h">${gmHas ? 'On-device guesses' : unsure ? 'Best guesses' : 'Looks like'}</h2><button type="button" class="linkbtn" data-action="mode" data-mode="type">Not here? Type it</button></div>
    ${pkItems.length ? '<p class="fine">Not packaged? These are the closest dishes.</p>' : unsure ? '<p class="fine">Not sure about this one. Pick the closest match, or type it in.</p>' : ''}
    <ul class="guesses">${r.results.map(g => { const L = labelByName(g.label); const on = r.added.has(g.label);
      return `<li class="guess ${on ? 'added' : ''}"><span><b>${esc(cap(g.label))}</b><small>${esc(L[2])} · ${int(labelKcal(L))} kcal</small><span class="pct"><i style="width:${Math.max(3, Math.round(g.p * 100))}%"></i></span></span>
        <button type="button" class="btn ${on ? 'ghost' : 'primary'} sm" data-action="guess-add" data-label="${esc(g.label)}">${on ? 'Added' : 'Add'}</button></li>`; }).join('')}</ul>${S.desc.applied?.portion ? `<p class="fine">Adding uses your portion: “${esc(S.desc.applied.portion)}”.</p>` : ''}</div>`;
  $('#rec-results').innerHTML = gmHTML + restHTML2 + pkHTML + (gmHas ? `<details class="help"><summary>On-device guesses</summary>${clipHTML}</details>` : clipHTML) + restLink;
}
// one editable food row (amount, unit, closer-match picker); used by the plate and the meal builder
function itemRowHTML(it){
  const g = itemGrams(it), kcal = num(it.p[0]) * g / 100;
  const alts = it.src === 'usda' ? (it.alts ||= altsFor(it)) : [];
  return `<li class="pitem" data-id="${it.id}">
      <div class="pitem-top"><span><b>${esc(it.name)}</b><small>${it.line ? '“' + esc(it.line) + '” · ' : ''}${esc(it.group ? it.group + ' · ' : '')}${esc(it.sub)}</small></span><span class="k tnum" data-kcal>${int(kcal)}</span>
        <button type="button" class="x" data-action="pitem-del" data-id="${it.id}" aria-label="Remove ${esc(it.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="qty"><button type="button" data-action="qty" data-id="${it.id}" data-d="-1" aria-label="Less">−</button>
        <input type="number" inputmode="decimal" step="any" min="0" value="${esc(it.qty)}" data-qty="${it.id}" aria-label="Amount">
        <button type="button" data-action="qty" data-id="${it.id}" data-d="1" aria-label="More">+</button>
        <select data-unit="${it.id}" aria-label="Unit">${it.opts.map((o, i) => `<option value="${i}" ${i === it.opt ? 'selected' : ''}>${esc(o.t)}${o.t === 'grams' || / g$/.test(o.t) || /\(\s*[\d.]+\s*(g|ml)\s*\)/i.test(o.t) ? '' : ` (${dec(o.g)} g)`}</option>`).join('')}</select></div>
      ${alts.length ? `<select class="alt" data-alt="${it.id}" aria-label="Change food"><option value="">Not quite right? Pick a closer match…</option>${alts.map(f => `<option value="${f[0]}">${esc(shortName(f[1]))} · ${int(f[3])} kcal/100 g</option>`).join('')}</select>` : ''}
    </li>`;
}
// an editable item lives either on the plate or in the meal being built
function findItem(id){
  let it = S.plate.find(x => x.id === id);
  if (it) return {it, where:'plate'};
  it = S.ml.edit?.items.find(x => x.id === id);
  return it ? {it, where:'recipe'} : {it:null};
}
function rerenderItems(where){ if (where === 'recipe') renderMeals(); else renderPlate(); }
function itemTotalsChanged(where){ if (where === 'recipe') renderRecipeTotals(); else renderPlateTotals(); }
function renderPlate(){
  const items = S.plate;
  $('#plate').hidden = !items.length;
  if (!items.length) return;
  $('#pitems').innerHTML = items.map(itemRowHTML).join('');
  $$('[data-action="meal"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.meal === S.meal)));
  const nameEl = $('#plate-name');
  nameEl.placeholder = defaultPlateName();
  if (document.activeElement !== nameEl) nameEl.value = S.plateName;
  renderPlateTotals();
  $('#log-target').textContent = `Logging to ${S.viewDate === dayKey() ? 'today' : relDay(S.viewDate)}`;
}
function defaultPlateName(){
  const names = []; for (const it of S.plate) { const n = it.group || it.name; if (!names.includes(n)) names.push(n); }
  const s = names.slice(0, 3).map(cap).join(', ');
  return names.length > 3 ? s + ' +' + (names.length - 3) : (s || MEAL_LABEL[S.meal]);
}
function renderPlateTotals(){
  const t = totalsOf(S.plate);
  const grams = S.plate.reduce((a, it) => a + itemGrams(it), 0);
  $('#plate-label').innerHTML = nfHTML(t, `${int(grams)} g total`);
  $('#plate-add').textContent = `Add to ${MEAL_LABEL[S.meal]} · ${int(t.calories)} kcal`;
  $('#plate-add').disabled = !(t.calories > 0 || grams > 0);
}
function addToPlate(items, opts = {}){
  if (!items.length) return;
  S.plate.push(...items);
  renderPlate();
  if (!opts.quiet) toast(items.length > 1 ? `Added ${items.length} items to your plate` : `Added ${items[0].name} to your plate`);
  if (opts.scroll !== false) requestAnimationFrame(() => $('#plate').scrollIntoView({behavior: reduced() ? 'auto' : 'smooth', block:'nearest'}));
}
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- photo + recognizer ---------- */
async function recognizer(){ if (!R) R = await import('./recognizer.js'); return R; }
async function checkRecognizer(){
  try { const r = await recognizer(); S.rec.state = (await r.isDownloaded()) ? 'ready' : 'missing'; }
  catch { S.rec.state = 'error'; S.rec.error = 'The recognizer could not start in this browser. Typing and barcodes still work.'; }
  renderPhoto(); if (S.tab === 'pantry') renderPantry();
}
async function downloadRecognizer(){
  if (!navigator.onLine) { S.rec.state = 'error'; S.rec.error = 'You’re offline. Connect to Wi-Fi to download the recognizer.'; renderPhoto(); return; }
  Object.assign(S.rec, {state:'loading', progress:0, text:'Starting download…'}); renderPhoto(); if (S.tab === 'pantry') renderPantry();
  if (S.wb.photo) { S.wb.busy = true; S.wb.step = 'Downloading the image model…'; if (S.tab === 'today') renderWater(); }
  try {
    const r = await recognizer();
    await r.load((p, text) => { S.rec.progress = p; S.rec.text = text; const b = $('#rec-bar'), tx = $('#rec-text'); if (b) b.style.width = Math.round(p * 100) + '%'; if (tx) tx.textContent = text; const ws = $('#wb-step'); if (ws) ws.textContent = `${text} ${Math.round(p * 100)}%`; });
    S.rec.state = 'ready'; renderPhoto(); if (S.tab === 'pantry') renderPantry(); if (S.tab === 'body') { renderBodyPhoto(); if (S.bf.photo && !S.bf.probs) setBodyPhotoAgain(); } toast('Recognizer ready. It now works offline.');
    if (S.photo && !S.rec.results) classifyPhoto();
    if (S.wb.photo) { if (S.wb.needModel && S.wb.photo.orig) { S.wb.needModel = false; snapBottle(S.wb.photo.orig); } else { S.wb.busy = false; if (S.tab === 'today') renderWater(); } }
  } catch (e) {
    console.error(e);
    S.rec.state = 'error'; S.rec.error = 'The download didn’t finish. Check your connection and try again.'; renderPhoto(); if (S.tab === 'pantry') renderPantry();
    if (S.wb.photo) { S.wb.busy = false; S.wb.err = 'The download didn’t finish. Tap your bottle for now:'; if (S.tab === 'today') renderWater(); }
  }
}
async function classifyPhoto(){
  if (!S.photo || S.rec.state !== 'ready') return;
  S.rec.busy = true; S.rec.results = null; renderPhoto();
  try {
    const r = await recognizer();
    S.rec.results = await r.classify(S.photo.blob, 6);
    S.rec.added = new Set();
  } catch (e) {
    console.error(e);
    S.rec.state = 'error'; S.rec.error = 'Recognition failed on this photo. Try again, or type the food instead.';
  } finally { S.rec.busy = false; renderPhoto(); updateRestaurant(); if (S.rec.results) $('#rec-results').scrollIntoView({behavior: reduced() ? 'auto' : 'smooth', block:'nearest'}); }
}
async function decodeImg(file){
  if (window.createImageBitmap) { try { return await createImageBitmap(file, {imageOrientation:'from-image'}); } catch {} }
  return await new Promise((res, rej) => { const u = URL.createObjectURL(file); const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('decode')); im.src = u; });
}
const toBlob = (cv, q) => new Promise(res => cv.toBlob(res, 'image/jpeg', q));
async function prepPhoto(file){
  const src = await decodeImg(file);
  const W = src.width, H = src.height, s = Math.min(1, 1024 / Math.max(W, H));
  const cv = document.createElement('canvas'); cv.width = Math.round(W * s); cv.height = Math.round(H * s);
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
  const blob = await toBlob(cv, 0.88);
  const side = Math.min(W, H), tc = document.createElement('canvas'); tc.width = tc.height = 112;
  tc.getContext('2d').drawImage(src, (W - side) / 2, (H - side) / 2, side, side, 0, 0, 112, 112);
  const thumb = tc.toDataURL('image/jpeg', 0.62);
  if (src.close) src.close();
  if (!blob) throw new Error('encode');
  return {blob, thumb, url:URL.createObjectURL(blob), orig:file};
}
async function setPhoto(file){
  if (!file) return;
  try {
    const p = await prepPhoto(file);
    if (S.photo) URL.revokeObjectURL(S.photo.url);
    S.photo = p; S.rec.results = null; S.rec.added = new Set();
    S.rest = {chain:null, src:'', ask:null, manual:null, no:false, filter:''};
    S.gm.photo = sharedAsk() ? {ph:p, consent:true} : null;
    renderPhoto();
    runPackaged();
    if (gemOn()) geminiPhoto();
    if (S.rec.state === 'ready') classifyPhoto();
  } catch { toast('Couldn’t open that photo. Try a JPEG or PNG.'); }
}

/* ---------- barcode ---------- */
function bcMsg(t, isErr){ const el = $('#bc-msg'); el.textContent = t || ''; el.hidden = !t; el.className = isErr ? 'err' : 'notice'; }
async function bcStart(){
  if (!('BarcodeDetector' in window)) { bcMsg('This browser can’t read barcodes with the camera. Type the number under the barcode instead.', true); return; }
  try {
    const supported = await BarcodeDetector.getSupportedFormats();
    const formats = ['ean_13','ean_8','upc_a','upc_e'].filter(f => supported.includes(f));
    const det = new BarcodeDetector({formats: formats.length ? formats : undefined});
    const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}, width:{ideal:1280}}, audio:false});
    S.bc.stream = stream;
    const v = $('#bc-video'); v.srcObject = stream; v.hidden = false; $('#bc-guide').hidden = false; $('#bc-empty').hidden = true;
    await v.play();
    $('#bc-start').disabled = true; $('#bc-stop').disabled = false; bcMsg('Hold steady with the barcode inside the box.');
    const tick = async () => {
      if (!S.bc.stream) return;
      try {
        const codes = await det.detect(v);
        if (codes && codes.length) { const c = codes[0].rawValue; bcStop(); if (navigator.vibrate) navigator.vibrate(60); $('#bc-code').value = c; lookupBarcode(c); return; }
      } catch {}
      S.bc.timer = setTimeout(tick, 250);
    };
    tick();
  } catch (e) {
    bcStop();
    bcMsg(e && e.name === 'NotAllowedError' ? 'Camera access was blocked. Allow the camera for this app in Chrome’s site settings, or type the number.' : 'Couldn’t start the camera. Type the number under the barcode instead.', true);
  }
}
function bcStop(){
  clearTimeout(S.bc.timer);
  if (S.bc.stream) { S.bc.stream.getTracks().forEach(t => t.stop()); S.bc.stream = null; }
  const v = $('#bc-video'); if (v) { v.srcObject = null; v.hidden = true; }
  const g = $('#bc-guide'); if (g) g.hidden = true; const em = $('#bc-empty'); if (em) em.hidden = false;
  const s1 = $('#bc-start'), s2 = $('#bc-stop'); if (s1) s1.disabled = false; if (s2) s2.disabled = true;
}
function offPlateItem(p){
  const opts = [];
  if (p.servingG) opts.push({t: tidy(p.servingSize) || '1 serving', g: p.servingG});
  opts.push({t:'1 oz', g:28.35}, {t:'100 g', g:100}, {t:'grams', g:1});
  return {id:uid(), src:p.fdc ? 'fdc' : 'off', code:p.code, name:displayName(p), sub:`${p.quantity ? p.quantity + ' · ' : ''}${p.fdc ? 'USDA FoodData Central' : 'Open Food Facts'}`, p:offP100(p.nutriments), opts, opt:0, qty:1};
}
function offPantryFood(p){
  return {key:'off' + p.code, src:'off', code:p.code, name:displayName(p), p:offP100(p.nutriments), unitG:p.servingG || 0, unitD:p.servingG ? (tidy(p.servingSize) || '1 serving') : '', group:0,
    role: roleFromCategories(p.categories, p.name) || null, image:p.image || '', cats: (p.categories || []).slice(0, 12), full: p.brands || ''};
}
const hasKcal = p => p && p.nutriments && (Number.isFinite(Number(p.nutriments['energy-kcal_100g'])) || Number.isFinite(Number(p.nutriments['energy_100g'])));
async function lookupBarcode(code){
  code = String(code || '').replace(/\D/g, '');
  if (code.length < 8 || code.length > 14) { bcMsg('Barcodes are 8 to 14 digits. Check the number and try again.', true); return; }
  if (!navigator.onLine) { bcMsg('You’re offline. Barcode lookups need a connection; typing foods works offline.', true); return; }
  bcMsg('Looking up ' + code + '…');
  try {
    const pr = await getProduct(code);
    if (!pr) { bcMsg('That barcode isn’t in Open Food Facts yet. Search for the food under Type instead.', true); return; }
    if (!hasKcal(pr)) { bcMsg('Found the product, but it has no nutrition data. Search for it under Type instead.', true); return; }
    const name = displayName(pr);
    if (S.bcTarget === 'pantry') {
      S.bcTarget = null; bcMsg('');
      addPantry(offPantryFood(pr));
      setTab('pantry'); toast(`Added ${name} to your pantry`); return;
    }
    addToPlate([offPlateItem(pr)]);
    bcMsg(`Added ${name}${pr.servingG ? '' : '. No serving size listed, so it’s set to 1 oz; adjust it on your plate.'}`);
  } catch { bcMsg('Couldn’t reach Open Food Facts. Check your connection and try again.', true); }
}

/* ---------- packaged-food matches (shared by Photo and Pantry) ---------- */
const localMatches = q => search(INDEX, q, 4).map(f => ({ndb:f[0], name:shortName(f[1]), full:f[1], kcal:num(f[3])}));
function pkChoice(it){ const c = S.pk.choice[it.id]; return c != null ? c : (it.matches.length ? 'm0' : it.local && it.local.length ? 'l0' : 'none'); }
function pkPicked(it){
  const c = pkChoice(it);
  if (c[0] === 'm') return {kind:'off', product: it.matches[Number(c.slice(1))]?.product};
  if (c[0] === 'l') return {kind:'usda', food: it.local[Number(c.slice(1))]};
  return {kind:'none'};
}
const CONF_TXT = {sure:'Strong match', likely:'Likely match', maybe:'Best guess · check the flavor or size'};
function pkCard(it, mode){
  const pick = pkPicked(it), p = pick.product, f = pick.food;
  let title = 'No match picked', meta = '', img = '';
  if (p) { title = displayName(p); const k = num(offP100(p.nutriments)[0]); meta = [p.quantity, p.servingG ? `${int(k * p.servingG / 100)} kcal per ${tidy(p.servingSize) || p.servingG + ' g'}` : `${int(k)} kcal per 100 g`].filter(Boolean).join(' · '); img = p.image; }
  else if (f) { title = f.name; meta = `${int(f.kcal)} kcal per 100 g · USDA`; }
  const opts = [...it.matches.map((m, i) => [`m${i}`, `${displayName(m.product)}${m.product.quantity ? ' · ' + m.product.quantity : ''}`]),
    ...(it.local || []).map((l, i) => [`l${i}`, `${l.name} (USDA, generic)`]), ['none', 'None of these']];
  const c = pkChoice(it);
  const on = mode === 'pantry' ? S.pan.pkSel.has(it.id) : S.pk.added.has(it.id);
  const shape = it.shape && it.shape !== 'produce' ? ` · ${it.shape}` : '';
  return `<li class="pk ${on && mode !== 'pantry' ? 'added' : ''}" data-id="${esc(it.id)}">
    <span class="pk-thumbs"><img src="${esc(it.thumb)}" alt="From your photo">${img ? `<img src="${esc(img)}" alt="Database photo" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>
    <span class="pk-main"><small class="pk-read">${it.via === 'barcode' ? 'Barcode' : 'Read'}: “${esc(it.via === 'barcode' ? it.code : it.read)}”${esc(shape)}</small>
      <b>${esc(title)}</b>${meta ? `<small>${esc(meta)}</small>` : ''}
      ${p || f ? `<em class="conf ${esc(it.conf)}">${it.ambiguous ? 'Brand found · pick the flavor or variety below' : CONF_TXT[it.conf] || ''}</em>` : ''}
      ${it.ambiguous ? '<small class="fine">Or type the flavor in Add details and tap Use details.</small>' : ''}
      ${opts.length > 1 ? `<select class="alt" data-pk-alt="${esc(it.id)}" data-mode="${mode}" aria-label="Choose the right product">${opts.map(([v, t]) => `<option value="${v}" ${v === c ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>` : ''}
    </span>
    ${mode === 'pantry' ? `<input type="checkbox" class="pk-check" data-pk="${esc(it.id)}" ${on ? 'checked' : ''} ${pick.kind === 'none' ? 'disabled' : ''} aria-label="Add ${esc(title)}">`
      : `<button type="button" class="btn ${on ? 'ghost' : 'primary'} sm" data-action="pk-add" data-id="${esc(it.id)}" ${pick.kind === 'none' ? 'disabled' : ''}>${on ? 'Added' : 'Add'}</button>`}
  </li>`;
}
async function pickedFood(it, forPantry){
  const pick = pkPicked(it);
  if (pick.kind === 'off') {
    let pr = pick.product;
    try { const full = await getProduct(pr.code); if (full) pr = {...pr, ...full, nutriments: {...pr.nutriments, ...full.nutriments}}; } catch {}
    if (!hasKcal(pr)) return null;
    return forPantry ? offPantryFood(pr) : offPlateItem(pr);
  }
  if (pick.kind === 'usda') {
    const f = BYID.get(pick.food.ndb); if (!f) return null;
    if (forPantry) return pantryFood(f[0]);
    const n = f.length; return usdaItem(f[0], f[n-4] || 100, null, null);
  }
  return null;
}
async function runPackaged(){
  const ph = S.photo; if (!ph) return;
  Object.assign(S.pk, {busy:true, res:null, step:'Reading the label…', frac:0, added:new Set(), choice:{}});
  renderPhoto();
  try {
    const clip = S.rec.state === 'ready' ? await recognizer() : null;
    const res = await packScan(ph.orig || ph.blob, {single:true, clip, local:localMatches, hint:S.desc.applied?.hint || '', onStep:(t, f) => { S.pk.step = t; S.pk.frac = f; const el = $('#pk-step'); if (el) el.textContent = t; }});
    if (S.photo !== ph) return;
    // a weak match is still worth showing when a brand was read or typed; the flavor can be fixed from the list
    res.items = res.items.filter(it => it.via === 'barcode' || (it.matches.length && (it.conf !== 'maybe' || it.brand || it.hinted)));
    S.pk.res = res;
  } catch (e) { console.error(e); S.pk.res = {items:[], error:true}; }
  finally { if (S.photo === ph) { S.pk.busy = false; renderPhoto(); updateRestaurant(); } }
}

/* ---------- typing & search ---------- */
async function typeAdd(){
  const text = $('#type-in').value.trim(), msg = $('#type-msg');
  if (!text) { $('#type-in').focus(); return; }
  const items = [], missing = [], online = [], ask = [];   // ask: what Gemini gets when the app can't find it
  const gem = gemOn() || sharedAsk();
  for (const chunk of text.split(/[;\n,]+/).map(x => x.trim()).filter(Boolean)){
    const pt = pantryTagged(chunk);
    if (pt != null) { const it = pantryItemFor(pt); if (it) items.push(it); else missing.push(`${pt} (not in your pantry)`); continue; }
    const chainHere = detectChain(chunk);
    if (!chainHere) { const mineAll = myFoodFor(chunk); if (mineAll) { items.push(mineAll); continue; } }
    if (!chainHere && brandOf(chunk)) { if (navigator.onLine) { online.push(chunk); continue; } }
    for (const seg of splitMeal(chunk)){
      if (chainHere) { const ci = chainItemFor(seg, chainHere, true); if (ci) { items.push(ci); continue; } if (!nameWords(stripChainName(seg, chainHere)).length) continue; if (gem) { ask.push(/\b(from|at)\b/i.test(seg) || detectChain(seg) ? seg : `${seg} from ${chainHere.name}`); continue; } }
      const mine = myFoodFor(seg); if (mine) { items.push(mine); continue; }
      const r = parseSegment(seg, INDEX, BYID);
      if (!r) continue;
      if (r.missing) { if (gem) ask.push(r.text); else missing.push(r.text); continue; }
      items.push(...itemsFromParsed(r));
    }
  }
  const show = () => {
    msg.hidden = !missing.length && !ask.length; msg.className = missing.length ? 'err' : 'notice';
    msg.textContent = [missing.length ? `Couldn’t find: ${missing.join(', ')}. Try the search below, or search online.` : '', ask.length ? `Not in the app’s list: ${ask.join(', ')}. Asked Gemini below.` : ''].filter(Boolean).join(' ');
  };
  show();
  if (items.length) { addToPlate(items); $('#type-in').value = ''; }
  for (const seg of online){
    msg.hidden = false; msg.className = 'notice'; msg.textContent = `Looking up “${seg}” online…`;
    try {
      const {q, items:res} = await lookupOnline(seg);
      const top = res[0];
      if (top && top.score >= 0.8) { const it = onlinePlateItem(top, seg); addToPlate([it]); rememberOnline(top); $('#type-in').value = ''; }
      else { S.online = {q, busy:false, items:res, errors:[], seg}; renderTypeExtra(); if (gem) ask.push(seg); else missing.push(`${seg} (pick the right one below)`); }
    } catch {
      const r = parseSegment(seg, INDEX, BYID);
      if (r && !r.missing) addToPlate(itemsFromParsed(r)); else if (gem) ask.push(seg); else missing.push(seg);
    }
  }
  show();
  if (ask.length) geminiText(ask.join(', '));
}
function rememberOnline(r){ addMyFood({name:r.name, brand:r.brand, servingG:r.servingG || 100, servingD:r.servingD || '100 g', p:r.p, src:'custom', from:r.src}); }
let searchT = 0;
function runSearch(){
  const q = $('#search-in').value.trim(), out = $('#search-results');
  if (q.length < 2) { out.innerHTML = ''; return; }
  const qt = tokens(q);
  const labs = LABELS.filter(l => { const lt = tokens(l[0]); return qt.every(t => lt.some(w => w.startsWith(t))); }).slice(0, 4);
  const usda = search(INDEX, q, 12);
  const mine = S.myFoods.filter(f => qt.every(t => tokens(`${f.brand || ''} ${f.name}`).some(w => w.startsWith(t)))).slice(0, 5);
  out.innerHTML = mine.map(f => `<li><button type="button" data-action="add-my" data-id="${esc(f.id)}"><span><b><span class="tag">Mine</span>${esc(f.brand ? f.brand + ' ' : '')}${esc(f.name)}</b><small>${esc(f.servingD || '100 g')}</small></span><span class="k tnum">${int(f.p[0] * (f.servingG || 100) / 100)} kcal</span></button></li>`).join('') + labs.map(l => `<li><button type="button" data-action="add-label" data-label="${esc(l[0])}"><span><b><span class="tag">Quick</span>${esc(cap(l[0]))}</b><small>${esc(l[2])}</small></span><span class="k tnum">${int(labelKcal(l))} kcal</span></button></li>`).join('') +
    usda.map(f => { const n = f.length, sg = f[n-4], sd = f[n-3]; const g = sg || 100; return `<li><button type="button" data-action="add-usda" data-ndb="${f[0]}"><span><b>${esc(shortName(f[1]))}</b><small>${esc(sd ? tidy(sd) : '100 g')} · ${esc(f[1])}</small></span><span class="k tnum">${int(num(f[3]) * g / 100)} kcal</span></button></li>`; }).join('') ||
    `<li><p class="fine" style="padding:10px 0">No matches. Try fewer or simpler words, like “chicken thigh”.</p></li>`;
  out.innerHTML += `<li><button type="button" data-action="online-search"><span><b><span class="tag">Online</span>Search store brands &amp; labels for “${esc(q)}”</b><small>Open Food Facts and USDA FoodData Central</small></span><span class="k">›</span></button></li>`;
}

/* ---------- body ---------- */
function fillBodyForm(){
  const p = S.profile;
  S.draft = {sex:p.sex || '', age:p.age || '', ft:p.ft || '', inch:p.inch ?? '', weightLb:p.weightLb || '', activity:p.activity || 'light', goal:p.goal || 'maintain', customKcal:p.customKcal || '', neck:p.neck || '', waist:p.waist || '', hip:p.hip || '', sport:p.sport || 'none', trainingDays:p.trainingDays ?? 0};
  const d = S.draft;
  $('#b-age').value = d.age; $('#b-ft').value = d.ft; $('#b-in').value = d.inch; $('#b-wt').value = d.weightLb;
  $('#b-act').value = d.activity; $('#b-goal').value = d.goal; $('#b-kcal').value = d.customKcal;
  $('#b-neck').value = d.neck; $('#b-waist').value = d.waist; $('#b-hip').value = d.hip;
  $('#b-sport').value = d.sport; $('#b-days').value = String(d.trainingDays || 0);
  $('#set-wrapped').checked = wrappedOn();
  $('#set-creatine').checked = !!p.creatine; const fk = $('#set-fdc'); if (fk) fk.value = (p.settings || {}).fdcKey || ''; const gk = $('#set-gem'); if (gk) gk.value = (p.settings || {}).gemKey || ''; renderGemStatus(); $('#b-cycle').value = p.cycleStart || ''; $('#b-cyclelen').value = p.cycleLength || '';
  syncSex();
}
function syncSex(){ $$('[data-action="sex"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sex === S.draft.sex))); $('#hip-field').hidden = S.draft.sex === 'male'; $('#cycle-fields').hidden = S.draft.sex !== 'female'; }
function readForm(){
  const d = S.draft;
  d.age = $('#b-age').value; d.ft = $('#b-ft').value; d.inch = $('#b-in').value; d.weightLb = $('#b-wt').value;
  d.activity = $('#b-act').value; d.goal = $('#b-goal').value; d.customKcal = $('#b-kcal').value;
  d.neck = $('#b-neck').value; d.waist = $('#b-waist').value; d.hip = $('#b-hip').value;
  d.sport = $('#b-sport').value; d.trainingDays = Number($('#b-days').value) || 0;
}
function scaleBar(min, max, bands, colors, value, labels){
  const pos = Math.max(0, Math.min(100, (value - min) / (max - min) * 100));
  return `<div class="scale"><span class="scale-mark" style="left:${pos}%"></span><div class="scale-track">${bands.map(([lo, hi], i) => `<i style="flex:${hi - lo};background:${colors[i]}"></i>`).join('')}</div><div class="scale-labels">${labels.map(l => `<span>${l}</span>`).join('')}</div></div>`;
}
function renderBody(){
  const d = S.draft, c = calcBody(d), el = $('#body-stats');
  $('#b-save').textContent = S.dirty ? 'Save stats' : 'Saved'; $('#b-save').disabled = !S.dirty;
  if (!c) { el.innerHTML = `<div class="empty"><b>Add your stats</b><p>Sex, age, height and weight give you BMI, a daily calorie goal and macro targets for the Today screen.</p></div>`; }
  else {
    const age = num(d.age), navy = navyBF(d), B = BF_BANDS[d.sex] || BF_BANDS.male, w = num(d.weightLb);
    el.innerHTML = `<div class="card sec"><h3 class="h">BMI</h3>
        <div class="stat-big"><b class="tnum">${c.bmi.toFixed(1)}</b><span class="pill">${bmiCat(c.bmi)}</span></div>
        ${scaleBar(15, 40, [[15,18.5],[18.5,25],[25,30],[30,40]], ['var(--fat)','var(--good)','var(--carbs)','var(--warn)'], c.bmi, ['15','18.5','25','30','40'])}
        <p class="fine">BMI only uses height and weight, so muscular builds can read high. ${age && age < 20 ? 'Under age 20, doctors read BMI against age-and-sex percentile charts, so treat these adult categories as a rough guide.' : 'The tape-measure body fat below says more about composition.'}</p></div>
      <div class="card sec"><h3 class="h">Daily targets</h3>
        <div class="kv tnum"><div><span>Burn at rest (BMR)</span><b>${int(c.bmr)}</b></div><div><span>Burn with activity</span><b>${int(c.tdee)}</b></div></div>
        <div class="stat-big" style="margin-top:4px"><b class="tnum">${int(c.goal)}</b><span class="sub">kcal a day${c.custom ? ' (custom)' : ''}</span></div>
        <div class="mtargets tnum"><div style="--c:var(--protein)"><span>Protein</span><b>${c.protein} g</b><small>${c.proteinLo}–${c.proteinHi} g range</small></div><div style="--c:var(--carbs)"><span>Carbs</span><b>${c.carbs} g</b></div><div style="--c:var(--fat)"><span>Fat</span><b>${c.fat} g</b></div></div>
        <p class="fine">${c.floorHit ? 'The goal is held at a minimum so the deficit stays safe. ' : ''}Mifflin-St Jeor formula. Protein is 1 g per pound of body weight; anywhere within 10% of that counts as on target. Fat is 28% of calories and carbs fill the rest.</p></div>
`;
  }
  renderBodyPhoto();
  const list = (S.profile.checkins || []).slice().sort((a, b) => b.date < a.date ? -1 : 1).slice(0, 12);
  $('#hist-sec').hidden = !list.length;
  $('#hist').innerHTML = `<thead><tr><th>Date</th><th>Weight</th><th>BMI</th><th>Body fat</th></tr></thead><tbody>${list.map(c => `<tr><td>${esc(shortDay(c.date))}</td><td>${c.weightLb ? dec(num(c.weightLb)) + ' lb' : '—'}</td><td>${c.bmi ? num(c.bmi).toFixed(1) : '—'}</td><td>${c.bfp ? num(c.bfp).toFixed(1) + '%' : '—'}</td></tr>`).join('')}</tbody>`;
}
function saveStats(){
  readForm();
  const d = S.draft, c = calcBody(d), navy = navyBF(d);
  const p = Object.assign({}, S.profile, {sex:d.sex, age:num(d.age) || '', ft:num(d.ft) || '', inch:d.inch === '' ? '' : Number(d.inch) || 0, weightLb:num(d.weightLb) || '',
    activity:d.activity, goal:d.goal, customKcal:num(d.customKcal) || '', neck:num(d.neck) || '', waist:num(d.waist) || '', hip:num(d.hip) || '', sport:d.sport || 'none', trainingDays:d.trainingDays || 0});
  if (c) {
    const today = dayKey(), list = (p.checkins || []).filter(x => x.date !== today);
    const prev = (p.checkins || []).find(x => x.date === today);
    const blend = bfBlend(d);
    list.push({date:today, weightLb:num(d.weightLb), bmi:Math.round(c.bmi * 10) / 10, bfp: blend ? Math.round(blend.v * 10) / 10 : (prev?.bfp || 0)});
    p.checkins = list.sort((a, b) => a.date < b.date ? -1 : 1).slice(-120);
  }
  S.profile = p; S.dirty = false; saveProfile(); renderBody(); renderToday();
}


/* ---------- body-fat photo check ---------- */
const BF_LEVELS = {
  male: [[8, 'Clear six-pack and visible veins on the arms and lower stomach; shoulder muscles look separated.'],
         [12, 'Abs show in good light; flat stomach; some veins on the arms.'],
         [15, 'Faint outline of the upper abs; little fat at the waist; muscles visible but softer.'],
         [20, 'No visible abs; slight softness at the waist and lower back.'],
         [25, 'Rounder waist; some fat at the sides and chest; no definition at the stomach.'],
         [30, 'Stomach sticks out a little; fat at the chest, back and hips.'],
         [36, 'Waist is the widest part of the torso; fat spread across chest, back and arms.']],
  female: [[15, 'Visible abs and muscle lines; very little fat at the hips and thighs.'],
           [20, 'Some ab outline; toned arms and legs; a little fat at the hips.'],
           [25, 'Flat but soft stomach; curves at the hips and thighs; little muscle definition.'],
           [30, 'Softer stomach; more fat at the hips, thighs and upper arms.'],
           [35, 'Rounder stomach; fuller hips, thighs and arms.'],
           [40, 'Stomach sticks out; fat across the waist, hips, thighs and arms.'],
           [46, 'Waist is the widest part of the torso; fat spread across the whole body.']],
};
// Deurenberg BMI equation (adult and child versions)
function bmiBF(p){
  const c = calcBody(p); if (!c) return null;
  const age = num(p.age), male = p.sex === 'male' ? 1 : 0;
  const v = age < 16 ? 1.51 * c.bmi - 0.70 * age - 3.6 * male + 1.4 : 1.20 * c.bmi + 0.23 * age - 10.8 * male - 5.4;
  return v > 3 && v < 65 ? v : null;
}
function bfBlend(d){
  const est = [];
  const navy = navyBF(d); if (navy) est.push({name:'Tape measure (U.S. Navy)', v:navy, w:0.45});
  const lv = S.bf.level != null ? (BF_LEVELS[d.sex] || BF_LEVELS.male)[S.bf.level] : null;
  if (lv) est.push({name:'Photo check', v:lv[0], w:0.35});
  const b = bmiBF(d); if (b) est.push({name:'BMI formula', v:b, w:0.2});
  if (!est.length) return null;
  const W = est.reduce((a, e) => a + e.w, 0), v = est.reduce((a, e) => a + e.v * e.w, 0) / W;
  const spread = Math.max(...est.map(e => e.v)) - Math.min(...est.map(e => e.v));
  const half = Math.max(2.5, Math.min(6, spread / 2 + (est.length === 1 ? 2 : 0.5)));
  return {v, low: v - half, high: v + half, est};
}
function renderBodyPhoto(){
  const d = S.draft, b = S.bf, out = $('#bf-out');
  const frame = $('#bfframe'); frame.classList.toggle('has-photo', !!b.photo); frame.classList.toggle('scanning', b.busy);
  $('#bfframe-img').hidden = !b.photo; if (b.photo && $('#bfframe-img').src !== b.photo.url) $('#bfframe-img').src = b.photo.url;
  $('#bfframe-empty').hidden = !!b.photo; $('#bf-clear').hidden = !b.photo || b.busy;
  if (d.sex !== 'male' && d.sex !== 'female') { out.innerHTML = '<p class="fine">Pick your sex in Your stats first; the guide is different for men and women.</p>'; return; }
  const L = BF_LEVELS[d.sex];
  const sug = b.probs ? b.probs.indexOf(Math.max(...b.probs)) : -1;
  let rec = '';
  if (b.photo && b.busy) rec = `<div class="recbox"><span><span class="spin"></span> <b>Looking at your photo…</b></span></div>`;
  else if (b.photo && !b.probs && S.rec.state !== 'ready' && S.rec.state !== 'loading') rec = `<div class="recbox"><span><b>Want a suggestion?</b><br><span class="sub">Download the recognizer once and it will suggest a level from your photo. Or just pick the closest description below.</span></span><button type="button" class="btn ghost" data-action="rec-download">Download recognizer</button></div>`;
  const res = bfBlend(d);
  out.innerHTML = `${rec}
    <p class="fine">${b.photo ? 'Compare your photo with these and tap the closest match.' : 'Take a photo, or tap the description that fits you best.'}${sug >= 0 ? ' The recognizer’s suggestion is marked; it’s a rough guess, so trust your eyes.' : ''}</p>
    <ul class="levels">${L.map(([v, cue], i) => `<li><button type="button" data-action="bf-level" data-i="${i}" aria-pressed="${b.level === i}"><b>${i === L.length - 1 ? v + '%+' : '~' + v + '%'}</b><span>${i === sug ? '<em>Suggested from your photo</em><br>' : ''}${esc(cue)}</span></button></li>`).join('')}</ul>
    ${res ? `<div class="card sec"><h3 class="h">Your body fat estimate</h3>
      <div class="stat-big"><b class="tnum">${Math.round(res.v)}%</b><span class="sub tnum">likely ${Math.round(res.low)}–${Math.round(res.high)}%</span><span class="pill">${bfCat(d.sex, res.v)}</span></div>
      <ul class="methods tnum">${res.est.map(e => `<li><span>${esc(e.name)}</span><span>${e.v.toFixed(1)}%</span></li>`).join('')}</ul>
      ${num(d.weightLb) ? `<div class="kv tnum"><div><span>Lean mass</span><b>${int(num(d.weightLb) * (1 - res.v / 100))} lb</b></div><div><span>Fat mass</span><b>${int(num(d.weightLb) * res.v / 100)} lb</b></div></div>` : ''}
      <p class="fine">${res.est.length < 3 ? 'Add ' + [!navyBF(d) && 'tape measurements', S.bf.level == null && 'a photo check'].filter(Boolean).join(' and ') + ' for a tighter estimate. ' : ''}Blends every method you've filled in. Within a few points of a DEXA scan when measured carefully.</p>
      <button type="button" class="btn primary" data-action="bf-save">Save to check-ins</button></div>` : ''}`;
}
async function setBodyPhoto(file){
  if (!file) return;
  try { const ph = await prepPhoto(file); if (S.bf.photo) URL.revokeObjectURL(S.bf.photo.url); S.bf.photo = ph; S.bf.probs = null; } catch { toast('Couldn’t open that photo. Try a JPEG or PNG.'); return; }
  renderBodyPhoto();
  if (S.rec.state === 'unknown') await checkRecognizer();
  if (S.rec.state !== 'ready' || (S.draft.sex !== 'male' && S.draft.sex !== 'female')) { renderBodyPhoto(); return; }
  S.bf.busy = true; renderBodyPhoto();
  try {
    const r = await recognizer();
    S.bf.probs = await r.classifyBody(S.bf.photo.blob, S.draft.sex);
    if (S.bf.level == null) S.bf.level = S.bf.probs.indexOf(Math.max(...S.bf.probs));
  } catch (e) { console.error(e); toast('Couldn’t read that photo. Pick the closest description instead.'); }
  finally { S.bf.busy = false; renderBodyPhoto(); }
}
function setBodyPhotoAgain(){ const ph = S.bf.photo; if (!ph) return; (async () => { S.bf.busy = true; renderBodyPhoto(); try { const r = await recognizer(); S.bf.probs = await r.classifyBody(ph.blob, S.draft.sex); if (S.bf.level == null) S.bf.level = S.bf.probs.indexOf(Math.max(...S.bf.probs)); } catch {} finally { S.bf.busy = false; renderBodyPhoto(); } })(); }
function saveBodyFat(){
  readForm();
  const res = bfBlend(S.draft); if (!res) return;
  const c = calcBody(S.draft), today = dayKey(), p = S.profile;
  const list = (p.checkins || []).filter(x => x.date !== today);
  list.push({date:today, weightLb:num(S.draft.weightLb) || '', bmi: c ? Math.round(c.bmi * 10) / 10 : 0, bfp: Math.round(res.v * 10) / 10});
  p.checkins = list.sort((a, b) => a.date < b.date ? -1 : 1).slice(-120);
  p.lastBody = {date:today, pct:Math.round(res.v * 10) / 10, low:Math.round(res.low), high:Math.round(res.high)};
  saveProfile(); renderBody(); toast(`Saved ${Math.round(res.v)}% body fat to check-ins`);
}

/* ---------- backup ---------- */
function exportBackup(){
  // the Gemini key stays on this phone and out of backup files
  const data = JSON.stringify({app:'macro-lens', version:2, exported:new Date().toISOString(), profile:{...S.profile, settings:{...(S.profile.settings || {}), gemKey:undefined, gemInfo:undefined}}, days:S.days, pantry:S.pantry, recipes:S.recipes.map(r => ({...r, items:r.items.map(stripItem)})), containers:S.containers, myFoods:S.myFoods});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], {type:'application/json'}));
  a.download = `munchmark-backup-${dayKey()}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Backup saved to your Downloads');
}
async function importBackup(file){
  try {
    const j = JSON.parse(await file.text());
    if (!j || j.app !== 'macro-lens' || typeof j.days !== 'object') throw 0;
    let n = 0;
    for (const [k, v] of Object.entries(j.days)) { if (v && v.date === k && Array.isArray(v.entries)) { S.days[k] = v; saveDay(k); n++; } }
    if (j.profile && typeof j.profile === 'object') { const keep = {gemKey:settings().gemKey, gemInfo:settings().gemInfo}; S.profile = j.profile; if (keep.gemKey) Object.assign(settings(), keep); saveProfile(); fillBodyForm(); }
    if (Array.isArray(j.pantry)) { S.pantry = j.pantry; savePantry(); }
    if (Array.isArray(j.recipes)) { S.recipes = j.recipes; saveRecipes(); }
    if (Array.isArray(j.containers)) { S.containers = j.containers; saveContainers(); }
    if (Array.isArray(j.myFoods)) { S.myFoods = j.myFoods; saveMyFoods(); }
    renderToday(); renderBody(); toast(`Restored ${n} day${n === 1 ? '' : 's'} of data`);
  } catch { toast('That file isn’t a Munchmark backup.'); }
}


/* ---------- weekly recap ---------- */
function bodyInfo(){
  const p = S.profile, c = calcBody(p);
  return {kg: c ? c.kg : 0, sport: p.sport || 'none', trainingDays: p.trainingDays || 0, goal: p.goal || 'maintain', sex: p.sex, age: num(p.age)};
}
const weekOf = start => summarize(S.days, start, targets(), bodyInfo());
function rangeText(start){
  const a = toDate(start), b = toDate(addDays(start, 6));
  const m1 = a.toLocaleDateString(undefined, {month:'short'}), m2 = b.toLocaleDateString(undefined, {month:'short'});
  return m1 === m2 ? `${m1} ${a.getDate()} – ${b.getDate()}` : `${m1} ${a.getDate()} – ${m2} ${b.getDate()}`;
}
function lastWeekStart(){ return addDays(weekStart(dayKey()), -7); }
function renderBanner(){
  const el = $('#wrap-banner'); if (!el) return;
  const ls = lastWeekStart();
  const has = Array.from({length:7}, (_, i) => addDays(ls, i)).some(k => (S.days[k]?.entries || []).length);
  if (!has || settings().seenWeek === ls) { el.innerHTML = ''; return; }
  el.innerHTML = `<button type="button" class="banner" data-action="banner"><span><b>${wrappedOn() ? 'Your week is wrapped' : 'Your weekly recap is ready'}</b><small>${esc(rangeText(ls))} · tap to ${wrappedOn() ? 'play' : 'see it'}</small></span>
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${wrappedOn() ? '<path d="M8 5.5v13l10.5-6.5z"/>' : '<path d="M5 20V12h3v8zm5 0V6h3v14zm5 0v-9h3v9z"/>'}</svg></button>`;
}
function playWeek(start){
  const s = weekOf(start);
  const ws = weekStatsOf(start), wd = Array.from({length:7}, (_, i) => drankOz(addDays(start, i))).filter(v => v > 0);
  s.extra = {waterAvg: wd.length ? wd.reduce((a, b) => a + b, 0) / wd.length : 0, waterDays: wd.length, waterGoal: waterTarget(start).base, feel: ws.checkins >= 3 ? ws.feel : null, checkins: ws.checkins, sweat: ws.sweat};
  if (!s.loggedDays) { toast('Log some meals this week first'); return; }
  playWrapped(s, {
    onClose: () => { if (start === lastWeekStart()) { settings().seenWeek = start; saveProfile(); renderBanner(); } },
    onReport: () => { S.wk.start = start; S.wk.report = true; setTab('week'); },
  });
}
function renderWeek(){
  const cur = weekStart(dayKey());
  if (!S.wk.start) S.wk.start = cur;
  const start = S.wk.start, s = weekOf(start), g = s.target;
  const pinned = pins().some(p => p.start === start);
  const pinBtn = `<button type="button" class="btn ${pinned ? 'primary' : 'ghost'} sm" data-action="pin-week" data-start="${start}" aria-pressed="${pinned}">${pinned ? '★ Pinned week' : 'Pin this week'}</button>`;
  const wdays = Array.from({length:7}, (_, i) => drankOz(addDays(start, i))).filter(v => v > 0);
  const waterAvg = wdays.length ? wdays.reduce((a, b) => a + b, 0) / wdays.length : 0;
  $('#wk-title').textContent = start === cur ? 'This week' : start === addDays(cur, -7) ? 'Last week' : rangeText(start);
  $('#wk-sub').textContent = start === cur ? `${rangeText(start)} · so far` : rangeText(start);
  $('#wk-next').disabled = start >= cur;
  const body = $('#wk-body');
  if (wrappedOn() && !S.wk.report) {
    body.innerHTML = `<div class="wk-cover"><svg class="wr-deco" viewBox="0 0 200 200" aria-hidden="true" fill="none" stroke-width="2"><circle cx="100" cy="100" r="96"/><circle cx="100" cy="100" r="64"/><circle cx="100" cy="100" r="30"/></svg>
        <p class="eb">${start === cur ? 'So far this week' : 'Your week in review'}</p>
        <h2>${esc(rangeText(start))}</h2>
        <div class="wk-quick tnum"><span><b>${s.loggedDays}</b>days logged</span><span><b>${s.loggedDays ? int(s.avg[0]) : '—'}</b>avg calories</span><span><b>${s.proteinDays}</b>protein in range</span></div>
        <button type="button" class="play" data-action="wk-play" ${s.loggedDays ? '' : 'disabled'}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>${s.loggedDays ? 'Play your week' : 'Log meals to unlock'}</button></div>
      <div class="row2">${pinBtn}<button type="button" class="btn ghost sm" data-action="sp-compare">Compare weeks</button></div>
      <p class="fine">Your recap plays as full-screen stories: each day, your averages, top foods and tips for next week. Prefer a plain report? <button type="button" class="linkbtn" data-action="wk-report">Show it here</button> or turn off Wrapped style in Body → Settings.</p>`;
    return;
  }
  if (!s.loggedDays) { body.innerHTML = `${pinBtn}<div class="empty"><b>Nothing logged this week</b><p>Log meals on a few days and this page fills in with daily totals, averages, top foods and tips.</p></div>`; return; }
  const a = s.avg, row = (l, v, t, u) => `<li class="nrow"><span>${l}</span><span class="tnum">${u === 'mg' ? int(v) : dec(v)} ${u}${t ? ` <em>· ${Math.round(v / t * 100)}%</em>` : ''}</span><div class="bar"><i style="width:${t ? Math.min(100, v / t * 100) : 0}%"></i></div></li>`;
  body.innerHTML = `${S.wk.report && wrappedOn() ? `<button type="button" class="btn ghost sm" data-action="wk-cover">Back to Wrapped view</button>` : ''}
    <div class="card sec">
      <h3 class="h">Daily average</h3>
      <div class="stat-big"><b class="tnum">${int(a[0])}</b><span class="sub">calories · goal ${int(g.calories)}</span></div>
      <div class="kv tnum"><div><span>Days logged</span><b>${s.loggedDays} of 7</b></div><div><span>Protein in range</span><b>${s.proteinDays} days</b></div><div><span>Calories on target</span><b>${s.kcalDays} days</b></div><div><span>Longest streak</span><b>${s.streak} days</b></div>${waterAvg ? `<div><span>Water a day</span><b>${int(waterAvg)} oz</b></div>` : ''}</div>
    </div>
    <div class="row2">${pinBtn}<button type="button" class="btn ghost sm" data-action="sp-compare">Compare weeks</button></div>
    <div class="sec"><h3 class="h">Day by day</h3><div class="card"><ul class="wk-days tnum">${s.days.map(d => {
      const P = d.t[1] * 4, C = d.t[2] * 4, F = d.t[3] * 9, sum = P + C + F || 1;
      return `<li class="${d.logged ? '' : 'off'}"><span><b>${toDate(d.date).toLocaleDateString(undefined, {weekday:'short'})}</b><small>${toDate(d.date).getDate()}</small></span>
        <span><span class="stack">${d.logged ? `<i class="p" style="flex:${P / sum}"></i><i class="c" style="flex:${C / sum}"></i><i class="f" style="flex:${F / sum}"></i>` : ''}</span><small>${d.logged ? `P ${int(d.t[1])} · C ${int(d.t[2])} · F ${int(d.t[3])}` : 'not logged'}${s.bestDay && s.bestDay.date === d.date ? ' · <span class="badge">best day</span>' : ''}</small></span>
        <em>${d.logged ? int(d.t[0]) : '—'}<small>kcal</small></em></li>`; }).join('')}</ul></div></div>
    <div class="sec"><h3 class="h">Averages</h3><ul class="nlist card" style="padding:4px 14px">
      ${row('Protein', a[1], g.protein_g, 'g')}${row('Carbs', a[2], g.carbs_g, 'g')}${row('Fat', a[3], g.fat_g, 'g')}${row('Fiber', a[4], 28, 'g')}${row('Sodium (limit)', a[8], 2300, 'mg')}${row('Potassium', a[9], 4700, 'mg')}${row('Sugars', a[5], 0, 'g')}
    </ul></div>
    ${s.topFoods.length ? `<div class="sec"><h3 class="h">Top foods</h3><div class="card"><ol class="topfoods">${s.topFoods.map(f => `<li><span>${esc(f.name)}</span><em>×${f.count}</em></li>`).join('')}</ol></div></div>` : ''}
    <div class="sec"><h3 class="h">Suggestions for next week</h3><ul class="tips">${s.suggestions.map(t => `<li class="${t.tone}"><b>${esc(t.title)}</b>${esc(t.text)}</li>`).join('')}</ul>
    <p class="fine">Based on your goals${S.profile.sport && S.profile.sport !== 'none' ? ` and ${esc(SPORTS[S.profile.sport]?.label.toLowerCase() || 'sport')}` : ''}. Set your sport in Body for sport-specific tips.</p></div>`;
}

/* ---------- pantry & meal ideas ---------- */
let NDB_UNIT = null;
function friendlyUnit(ndb, f){
  if (!NDB_UNIT) { NDB_UNIT = new Map(); for (const l of LABELS) if (l[1].length === 1 && /^1 /.test(l[2]) && !NDB_UNIT.has(l[1][0][0])) NDB_UNIT.set(l[1][0][0], [l[1][0][1], l[2]]); }
  const u = NDB_UNIT.get(ndb), n = f.length;
  return u ? {unitG:u[0], unitD:u[1]} : {unitG:f[n-4] || 0, unitD:f[n-3] || ''};
}
function pantryFood(ndb, name, role){
  const f = BYID.get(ndb); if (!f) return null;
  return {key:'ndb' + ndb, ndb, name: name || friendly(ndb) || shortName(f[1]), full: f[1], role: role || null, group:f[2], p:p100Of(f), ...friendlyUnit(ndb, f), src:'usda'};
}
function addPantry(food){
  if (!food) return false;
  if (S.pantry.some(x => x.key === food.key)) return false;
  if (!food.role) food.role = roleOf(food);
  S.pantry.push(food); savePantry(); S.pan.ideas = null; S.pan.plan = null;
  return true;
}
const ROLE_LABEL = {protein:'Protein', dairy:'Dairy & milk', carb:'Carbs & grains', veg:'Vegetables', fruit:'Fruit', fat:'Fats, nuts & cheese', meal:'Ready meals', snack:'Snacks (not used in meal ideas)'};
function readGoals(){
  const g = (S.profile.planGoals ||= {});
  g.calories = num($('#g-kcal').value); g.protein_g = num($('#g-p').value); g.carbs_g = num($('#g-c').value); g.fat_g = num($('#g-f').value);
  clearTimeout(readGoals.t); readGoals.t = setTimeout(saveProfile, 400);
}
function planGoals(){
  const g = S.profile.planGoals || {}, t = targets();
  return {calories: num(g.calories) || t.calories, protein_g: num(g.protein_g) || t.protein_g, carbs_g: num(g.carbs_g) || t.carbs_g, fat_g: num(g.fat_g) || t.fat_g};
}
let dietCache = {t:null, v:null};
function diet(){ const t = S.profile.dietText || ''; if (dietCache.t !== t) dietCache = {t, v: parseDiet(t)}; return dietCache.v; }
function dietOpts(){
  const d = diet();
  return {meals: d.meals || (d.noBreakfast ? 2 : 3), snacks: d.snacks ?? 1, noBreakfast: d.noBreakfast, lowSodium: !!d.flags.lowSodium, sodiumMax: d.flags.sodiumMax || 1500,
    highFiber: !!d.flags.highFiber, lowSugar: !!d.flags.lowSugar, exclude: d.exclude.length ? (f => d.exclude.some(e => e.test(f))) : null, prefer: d.prefer};
}
const mealShareOf = o => (1 - 0.12 * o.snacks) / o.meals;
// the goal fields, adjusted by anything typed in the diet box
function effectiveGoals(){ return applyDiet(planGoals(), diet(), calcBody(S.profile) ? num(S.profile.weightLb) : 0); }
function renderDietSum(){
  const el = $('#diet-sum'); if (!el) return;
  const d = diet(), o = dietOpts(), g = effectiveGoals(), base = planGoals();
  const out = o.exclude ? S.pantry.filter(o.exclude).map(f => f.name) : [];
  const changed = ['calories','protein_g','carbs_g','fat_g'].some(k => Math.abs(g[k] - base[k]) > 1);
  if (!S.profile.dietText) { el.innerHTML = ''; return; }
  el.innerHTML = `${d.understood.length ? `<div class="dietsum">${d.understood.map(u => `<span>${esc(u)}</span>`).join('')}</div>` : ''}
    ${out.length ? `<div class="dietsum"><span class="out">Leaving out: ${esc(out.slice(0, 8).join(', '))}${out.length > 8 ? ` +${out.length - 8} more` : ''}</span></div>` : ''}
    ${d.unknown.length ? `<div class="dietsum">${d.unknown.map(u => `<span class="unk">Not sure what “${esc(u)}” means</span>`).join('')}</div>` : ''}
    <p class="plangoal tnum">Planning for <b>${int(g.calories)} kcal</b> · ${int(g.protein_g)} g protein · ${int(g.carbs_g)} g carbs · ${int(g.fat_g)} g fat · ${o.meals} meal${o.meals > 1 ? 's' : ''}${o.snacks ? ` + ${o.snacks} snack${o.snacks > 1 ? 's' : ''}` : ''}${changed ? ' <span class="sub">(adjusted by what you typed)</span>' : ''}</p>`;
}
function renderPantry(){
  const p = S.pan;
  const frame = $('#pframe'); frame.classList.toggle('has-photo', !!p.photo); frame.classList.toggle('scanning', p.busy);
  $('#pframe-img').hidden = !p.photo; if (p.photo && $('#pframe-img').src !== p.photo.url) $('#pframe-img').src = p.photo.url;
  $('#pframe-empty').hidden = !!p.photo;
  const r = S.rec; let st = '';
  if ((r.state === 'missing' || r.state === 'error') && !p.busy) st = `<div class="recbox"><span><b>Sharper matching (optional)</b><br><span class="sub">${r.state === 'error' ? esc(r.error) : 'Labels are read without it. Download the image model once (about 150 MB, Wi-Fi) and it also checks each package’s shape and spots fresh food like bananas.'}</span></span><button type="button" class="btn ghost" data-action="rec-download">${r.state === 'error' ? 'Try again' : 'Download image model'}</button></div>`;
  else if (r.state === 'loading') st = `<div class="recbox"><span><span class="spin"></span> <b id="rec-text">${esc(r.text || 'Starting…')}</b></span><div class="progress"><i id="rec-bar" style="width:${Math.round(r.progress * 100)}%"></i></div></div>`;
  if (p.busy) st = `<div class="recbox"><span><span class="spin"></span> <b id="pan-step">${esc(p.stepText || 'Reading the labels…')}</b></span><div class="progress"><i id="pan-bar" style="width:${Math.round((p.frac || 0) * 100)}%"></i></div></div>` + (r.state === 'missing' ? '' : '');
  $('#pan-status').innerHTML = st;
  renderDetect();
  $('#pan-count').textContent = S.pantry.length ? `${S.pantry.length} item${S.pantry.length === 1 ? '' : 's'}` : '';
  $('#pan-clear').hidden = !S.pantry.length;
  const groups = {};
  for (const f of S.pantry) (groups[f.role || roleOf(f)] ||= []).push(f);
  $('#pan-list').innerHTML = S.pantry.length ? Object.keys(ROLE_LABEL).filter(k => groups[k]).map(k => `<div class="pgroup"><span class="lbl">${ROLE_LABEL[k]}</span><div class="chips">${groups[k].map(f => `<span class="pchip">${esc(f.name)}<button type="button" data-action="pan-del" data-key="${esc(f.key)}" aria-label="Remove ${esc(f.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></span>`).join('')}</div></div>`).join('')
    : `<div class="empty"><b>Your pantry is empty</b><p>Snap your cabinet or groceries, or add foods by name or barcode. Meal ideas use only what's here.</p></div>`;
  const g = planGoals();
  for (const [id, k] of [['g-kcal','calories'],['g-p','protein_g'],['g-c','carbs_g'],['g-f','fat_g']]) { const el = $('#' + id); if (document.activeElement !== el) el.value = Math.round(g[k]); }
  const tg = targets();
  $('#g-hint').textContent = tg.set ? `Daily totals. Your protein range is ${tg.protein_lo}–${tg.protein_hi} g (1 g per pound of body weight, give or take 10%).` : 'Daily totals. Add your stats in Body for personal targets.';
  const di = $('#diet-in'); if (document.activeElement !== di) di.value = S.profile.dietText || '';
  renderDietSum();
  renderIdeas();
}
function renderDetect(){
  const p = S.pan, el = $('#pan-detect');
  if (p.busy) { el.innerHTML = ''; return; }
  const pkItems = p.pk ? p.pk.items : null;
  if (!pkItems && !p.detect) { el.innerHTML = ''; return; }
  let html = '';
  if (pkItems && pkItems.length) {
    const n = pkItems.filter(it => p.pkSel.has(it.id) && pkPicked(it).kind !== 'none').length;
    html += `<div class="card sec"><div class="sec-head"><h3 class="h">Products on your shelf</h3><span class="sub">Fix any wrong match</span></div>
      ${p.pk.offline ? '<p class="notice">Couldn’t reach the grocery database, so these are generic USDA matches. Try again with a connection for exact brands.</p>' : ''}
      <ul class="pks">${pkItems.map(it => pkCard(it, 'pantry')).join('')}</ul>
      <button type="button" class="btn primary" data-action="pan-add-pk" ${n ? '' : 'disabled'}>Add ${n} product${n === 1 ? '' : 's'} to pantry</button></div>`;
  }
  if (p.detect && p.detect.length) {
    const n = p.sel.size;
    html += `<div class="card sec"><div class="sec-head"><h3 class="h">${pkItems && pkItems.length ? 'Other foods spotted' : 'Spotted in your photo'}</h3><span class="sub">Fresh food without labels</span></div>
      <ul class="detect">${p.detect.map(d => `<li><label><input type="checkbox" data-det="${esc(d.name)}" ${p.sel.has(d.name) ? 'checked' : ''}><span>${esc(d.name)}</span><em>${d.p >= 0.5 ? 'sure' : d.p >= 0.25 ? 'likely' : 'maybe'}</em></label></li>`).join('')}</ul>
      <button type="button" class="btn ghost" data-action="pan-add-detected" ${n ? '' : 'disabled'}>Add ${n} to pantry</button></div>`;
  }
  if (!html) html = `<p class="notice">Couldn't read any labels in that photo. Get closer so the brand and product name fill more of the frame, turn labels to face the camera, or use the Barcode button below.</p>`;
  el.innerHTML = html;
}
async function scanPantry(file){
  if (!file) return;
  try { const ph = await prepPhoto(file); if (S.pan.photo) URL.revokeObjectURL(S.pan.photo.url); S.pan.photo = ph; } catch { toast('Couldn’t open that photo. Try a JPEG or PNG.'); return; }
  Object.assign(S.pan, {detect:null, pk:null, pkSel:new Set(), busy:true, stepText:'Starting…', frac:0});
  renderPantry();
  const ph = S.pan.photo;
  try {
    if (S.rec.state === 'unknown') await checkRecognizer();
    const clip = S.rec.state === 'ready' ? await recognizer() : null;
    const res = await packScan(ph.orig || ph.blob, {clip, local:localMatches, debug: !!window.__mlDebug, onStep:(t, f) => {
      S.pan.stepText = t; S.pan.frac = f; const tx = $('#pan-step'), bar = $('#pan-bar'); if (tx) tx.textContent = t; if (bar) bar.style.width = Math.round(f * 100) + '%'; }});
    if (S.pan.photo !== ph) return;
    res.items = res.items.filter(it => !S.pantry.some(x => it.matches[0] && x.key === 'off' + it.matches[0].product.code));
    res.items.forEach(it => { it.id = 'p' + it.id; });
    S.pan.pk = res;
    S.pan.pkSel = new Set(res.items.filter(it => it.conf !== 'maybe' || it.via === 'barcode' || it.ambiguous || (res.offline && (it.local || []).length)).map(it => it.id));
    if (clip) {
      S.pan.stepText = 'Looking for fresh food…'; const tx = $('#pan-step'); if (tx) tx.textContent = S.pan.stepText;
      const found = await clip.classifyMany(ph.blob, () => {});
      const ROLE = Object.fromEntries(PANTRY.map(x => [x[0], x[3]]));
      S.pan.detect = found.filter(d => ['fruit','veg','protein'].includes(ROLE[d.name]) && !/package|can|bag|box|jar|carton|tub/i.test(PANTRY.find(x => x[0] === d.name)?.[1] || '') && !S.pantry.some(x => x.name === d.name)).slice(0, 8);
      S.pan.sel = new Set(S.pan.detect.filter(d => d.p >= 0.3).map(d => d.name));
    }
  } catch (e) { console.error(e); toast('Couldn’t read that photo. Try again or add foods by name.'); }
  finally { if (S.pan.photo === ph) { S.pan.busy = false; renderPantry(); } }
}
let panT = 0, dietT = 0;
function runPanSearch(){
  const q = $('#pan-search').value.trim(), out = $('#pan-results');
  if (q.length < 2) { out.innerHTML = ''; return; }
  const qt = tokens(q);
  const quick = PANTRY.filter(p => { const lt = tokens(p[0]); return qt.every(t => lt.some(w => w.startsWith(t))); }).slice(0, 5);
  const usda = search(INDEX, q, 8).filter(f => !quick.some(p => p[2] === f[0]));
  const mine = S.myFoods.filter(f => qt.every(t => tokens(`${f.brand || ''} ${f.name}`).some(w => w.startsWith(t)))).slice(0, 4);
  out.innerHTML = mine.map(f => `<li><button type="button" data-action="pan-add-my" data-id="${esc(f.id)}"><span><b><span class="tag">Mine</span>${esc(f.brand ? f.brand + ' ' : '')}${esc(f.name)}</b><small>${esc(f.servingD || '')}</small></span><span class="k">Add</span></button></li>`).join('') + quick.map(p => `<li><button type="button" data-action="pan-add" data-ndb="${p[2]}" data-name="${esc(p[0])}" data-role="${p[3]}"><span><b><span class="tag">Quick</span>${esc(p[0])}</b><small>${esc(ROLE_LABEL[p[3]] || '')}</small></span><span class="k">Add</span></button></li>`).join('') +
    usda.map(f => `<li><button type="button" data-action="pan-add" data-ndb="${f[0]}"><span><b>${esc(shortName(f[1]))}</b><small>${esc(f[1])}</small></span><span class="k">Add</span></button></li>`).join('') ||
    `<li><p class="fine" style="padding:10px 0">No matches. Try a simpler word.</p></li>`;
}
function ideaHTML(idea, slot, idx){
  const t = idea.totals, m = Math.round(idea.match);
  return `<div class="idea"><div class="idea-top"><span>${slot ? `<small>${esc(MEAL_LABEL[slot])}</small>` : ''}<b>${esc(idea.name)}</b></span><span class="match ${m < 85 ? 'mid' : ''}">${m}% match</span></div>
    <ul>${idea.parts.map(p => `<li><span>${esc(p.food.name)}</span><span>${esc(p.text)}${/ g$/.test(p.text) ? '' : ` · ${p.grams} g`}</span></li>`).join('')}</ul>
    <p class="mac tnum"><b>${int(t[0])} kcal</b> · P ${int(t[1])} g · C ${int(t[2])} g · F ${int(t[3])} g · fiber ${dec(t[4])} g · sodium ${int(t[8])} mg</p>
    <button type="button" class="btn ghost sm" data-action="idea-log" data-idx="${idx}" data-slot="${slot || ''}">Log this meal</button></div>`;
}
function renderIdeas(){
  const out = $('#pan-out'), p = S.pan;
  if (p.mode === 'day' && p.plan) {
    const g = effectiveGoals(), d = p.plan, t = d.totals;
    S.pan.logList = d.plan.map(x => x.idea);
    out.innerHTML = `<div class="sec-head"><h2 class="h">Your day</h2><span class="match ${d.match < 85 ? 'mid' : ''}">${Math.round(d.match)}% match</span></div>
      ${d.plan.map((x, i) => ideaHTML(x.idea, x.slot, i)).join('')}
      <div class="daytot tnum"><b>Day total:</b> ${int(t[0])} of ${int(g.calories)} kcal · P ${int(t[1])}/${int(g.protein_g)} g · C ${int(t[2])}/${int(g.carbs_g)} g · F ${int(t[3])}/${int(g.fat_g)} g</div>
      ${gapHTML(t, g)}
      <p class="fine">Built only from your pantry, with portions solved to land on your numbers. Cook and season to taste.</p>`;
  } else if (p.mode === 'ideas' && p.ideas) {
    S.pan.logList = p.ideas;
    const o = dietOpts(), mt = scaleT(effectiveGoals(), mealShareOf(o));
    out.innerHTML = p.ideas.length ? `<div class="sec-head"><h2 class="h">Meal ideas</h2><span class="sub tnum">target ${int(mt.calories)} kcal · ${int(mt.protein_g)} g protein</span></div>
      ${p.ideas.map((x, i) => ideaHTML(x, null, i)).join('')}
      <p class="fine">Each idea is sized to one of your ${o.meals} meals${o.snacks ? ` (with ${o.snacks === 1 ? 'a snack' : o.snacks + ' snacks'} set aside)` : ''}. Built only from your pantry${o.exclude ? ', leaving out what you said to skip' : ''}. Cook and season to taste.</p>`
      : `<p class="notice">${o.exclude && S.pantry.filter(f => !o.exclude(f)).length < S.pantry.length ? 'After leaving out what you said to skip, there isn’t enough left to build a meal. Add more foods that fit your diet.' : 'Not enough to build meals yet. Add at least one protein (like eggs, chicken or Greek yogurt) and one carb (like rice, bread or oats).'}</p>`;
  } else out.innerHTML = '';
}
// when the pantry can't reach a macro, suggest a few foods that would close the gap (and fit the typed diet)
const GAP_FOODS = {protein:['Chicken breast','Eggs','Greek yogurt','Canned tuna','Tofu','Cottage cheese','Lentils','Protein powder'],
  carbs:['White rice','Oats','Potatoes','Bread','Bananas','Pasta','Sweet potatoes'], fat:['Olive oil','Avocados','Almonds','Peanut butter','Cheddar cheese','Walnuts','Butter']};
function gapHTML(t, g){
  const o = dietOpts();
  const gaps = [['protein', 1, g.protein_g], ['carbs', 2, g.carbs_g], ['fat', 3, g.fat_g]].map(([n, i, goal]) => ({n, short: goal ? (goal - t[i]) / goal : 0, need: goal - t[i]})).filter(x => x.short > 0.12).sort((a, b) => b.short - a.short);
  if (!gaps.length) return '';
  const rows = gaps.slice(0, 2).map(gp => {
    const picks = GAP_FOODS[gp.n].map(nm => PANTRY.find(x => x[0] === nm)).filter(Boolean).map(x => pantryFood(x[2], x[0], x[3]))
      .filter(f => f && !S.pantry.some(y => y.key === f.key) && !(o.exclude && o.exclude(f))).slice(0, 4);
    if (!picks.length) return '';
    return `<p class="fine"><b>About ${int(gp.need)} g ${gp.n} short.</b> Add one of these to your pantry and plan again:</p>
      <div class="chips">${picks.map(f => `<button type="button" class="chip" data-action="pan-add" data-ndb="${f.ndb}" data-name="${esc(f.name)}" data-role="${esc(f.role || '')}">+ ${esc(f.name)}</button>`).join('')}</div>`;
  }).join('');
  return rows ? `<div class="sec">${rows}</div>` : '';
}
function makeIdeas(mode){
  const msg = $('#pan-msg'); msg.hidden = true;
  if (S.pantry.length < 2) { msg.textContent = 'Add a few foods to your pantry first.'; msg.hidden = false; return; }
  readGoals();
  const g = effectiveGoals(), o = dietOpts();
  if (!(g.calories > 300)) { msg.textContent = 'Set a daily calorie goal first.'; msg.hidden = false; return; }
  S.pan.mode = mode;
  const sodiumBudget = o.lowSodium ? o.sodiumMax / (o.meals + o.snacks) : 0;
  if (mode === 'day') S.pan.plan = dayPlan(S.pantry, g, o);
  else S.pan.ideas = mealIdeas(S.pantry, scaleT(g, mealShareOf(o)), {...o, sodiumBudget, count: 8});
  renderIdeas();
  requestAnimationFrame(() => $('#pan-out').scrollIntoView({behavior: reduced() ? 'auto' : 'smooth', block:'start'}));
}
function logIdea(idea, slot){
  const items = idea.parts.map(pt => {
    const f = pt.food;
    if (f.src === 'usda' && f.ndb) { const it = usdaItem(f.ndb, pt.grams, f.name, `${pt.text}${/ g$/.test(pt.text) ? '' : ` (${pt.grams} g)`}`); if (it) it.group = idea.name; return it; }
    return {id:uid(), src:'off', code:f.code, name:f.name, sub:'Open Food Facts', group:idea.name, p:f.p, opts:[{t:pt.text, g:pt.grams}, {t:'100 g', g:100}, {t:'grams', g:1}], opt:0, qty:1};
  }).filter(Boolean);
  S.plate.push(...items); S.plateName = idea.name; if (slot) S.meal = slot;
  setTab('scan'); toast('On your plate. Adjust portions, then add it to your log.');
}

/* ---------- day records ---------- */
function dayOf(date){ return (S.days[date] ||= {date, entries:[]}); }
const anyVal = o => !!o && Object.values(o).some(v => Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object') ? anyVal(v) : v != null && v !== '' && v !== 0 && v !== false);
function dayHasData(d){ return !!d && ((d.entries || []).length > 0 || (d.water || []).length > 0 || (d.checkins || []).length > 0 || anyVal(d.weights) || anyVal(d.practice) || anyVal(d.activity)); }
function saveRecipes(){ store.put('recipes', S.recipes.map(r => ({...r, items: r.items.map(stripItem)}))); }
function saveContainers(){ store.put('containers', S.containers); }
const stripItem = ({alts, ...rest}) => rest;
const clone = o => JSON.parse(JSON.stringify(o));
const lb1 = v => (Math.round(Number(v) * 10) / 10).toFixed(1);
const sgn = (v, d = 1) => { const r = Number(v); return (r > 0.049 ? '+' : r < -0.049 ? '−' : '±') + Math.abs(r).toFixed(d); };
const timeOf = t => new Date(t).toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'});
const OZ_ML = 29.5735, OZ_G = 28.3495, LB_G = 453.592;
const toGrams = (v, u) => num(v) * (u === 'oz' ? OZ_G : u === 'lb' ? LB_G : u === 'kg' ? 1000 : 1);
const WATER_P = KEYS.map(k => k === 'water_g' ? 100 : 0);
// memoized day totals for one render pass (the water-weight model reads many days)
function totalsMemo(){ const m = new Map(); return k => { if (!m.has(k)) m.set(k, dayTotals(k)); return m.get(k); }; }

/* ---------- photos: one hidden picker for every new photo button ---------- */
const picker = {cb:null};
function pickImage(cb, camera = true){ picker.cb = cb; $(camera ? '#in-anycam' : '#in-anygal').click(); }
async function smallPhoto(file, max = 320){
  const src = await decodeImg(file);
  const s = Math.min(1, max / Math.max(src.width, src.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(src.width * s); cv.height = Math.round(src.height * s);
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
  if (src.close) src.close();
  return cv.toDataURL('image/jpeg', 0.8);
}

/* ---------- water ---------- */
const drankOz = date => (S.days[date]?.water || []).reduce((a, x) => a + num(x.oz), 0);
function sweatOf(day){ const w = day?.weights || {}, pr = day?.practice || {}; return num(w.pre) && num(w.post) ? Math.max(0, num(w.pre) - num(w.post) + num(pr.fluidsOz) / 16) : 0; }
function waterTarget(date){
  const day = S.days[date];
  return waterGoal({weightLb: num(S.profile.weightLb) || num(day?.weights?.morning), sex: S.profile.sex, practiceMin: num(day?.practice?.minutes), sweatLossLb: sweatOf(day)});
}
const containers = kind => S.containers.filter(c => !kind || c.kind === kind);
function addWater(oz, opts = {}){
  const date = opts.date || S.viewDate;
  oz = Math.round(oz * 10) / 10;
  if (!(oz > 0 && oz < 400)) { toast('Enter an amount in ounces'); return false; }
  const d = dayOf(date); (d.water ||= []).push({t:new Date().toISOString(), oz, ...(opts.src ? {src:opts.src} : {})});
  saveDay(date); store.persist();
  if (S.tab === 'today') { renderWater(); renderWaterWeight(); }
  toast(`Logged ${dec(oz)} oz of water${opts.src ? ' · ' + opts.src : ''}`);
  return true;
}
const CAM_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.5h3l1.6-2.3h6.8L17 8.5h3v10H4z"/><circle cx="12" cy="13.2" r="3.3"/></svg>';
const X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const BOTTLE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 2.5h5M10 2.5v3l-2 2.5v12a1.5 1.5 0 0 0 1.5 1.5h5A1.5 1.5 0 0 0 16 20V8l-2-2.5v-3"/><path d="M8 12h8"/></svg>';
const BOX_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 9.5h17l-1.5 9a1.5 1.5 0 0 1-1.5 1.3H6.5A1.5 1.5 0 0 1 5 18.5z"/><path d="M2.5 9.5 4 6h16l1.5 3.5"/></svg>';
function renderWater(){
  const el = $('#water-card'); if (!el) return;
  const date = S.viewDate, day = S.days[date], drank = drankOz(date), g = waterTarget(date);
  const foodOz = dayTotals(date).water_g / OZ_ML;
  const list = day?.water || [], last = list[list.length - 1];
  const bottles = containers('bottle');
  el.innerHTML = `<div class="sec-head"><h2 class="h">Water</h2><span class="sub tnum">goal ${int(g.goal)} oz${g.extra ? ` · +${int(g.extra)} for practice` : ''}</span></div>
    <div class="water-top"><div class="stat-big"><b class="tnum">${dec(drank)}</b><span class="sub">of ${int(g.goal)} oz${drank >= g.goal ? ' · goal hit' : ''}</span></div>
      <button type="button" class="btn ghost sm" data-action="wb-snap">${CAM_SVG}Snap bottle</button></div>
    <div class="bar wbar"><i style="width:${Math.min(100, drank / g.goal * 100)}%"></i></div>
    ${bottles.length ? `<div class="chips">${bottles.map(c => `<button type="button" class="chip bottle" data-action="wb-full" data-id="${esc(c.id)}">${c.photos?.[0] ? `<img src="${esc(c.photos[0])}" alt="">` : ''}+ ${esc(c.name)} · ${dec(c.capOz)} oz</button>`).join('')}</div>` : ''}
    <div class="chips">${[8, 12, 16, 20, 32].map(oz => `<button type="button" class="chip" data-action="water-add" data-oz="${oz}">+${oz} oz</button>`).join('')}</div>
    <div class="fix-row"><div class="unit"><input type="number" id="water-custom" inputmode="decimal" min="0" step="any" placeholder="Other amount" aria-label="Other amount in ounces"><em>oz</em></div><button type="button" class="btn ghost sm" data-action="water-custom">Add</button></div>
    ${wbPanelHTML()}
    <p class="fine">${last ? `Last: ${dec(last.oz)} oz at ${esc(timeOf(last.t))}${last.src ? ' (' + esc(last.src) + ')' : ''} · <button type="button" class="linkbtn" data-action="water-undo">Undo</button><br>` : ''}Goal is half your body weight in ounces, plus extra on practice days. Food added about ${int(foodOz)} oz of water on top.${bottles.length ? '' : ' Save your bottles under Meals → Containers to log one with a photo or one tap.'}</p>`;
}
// bottle photo: which saved bottle is it, how full, or weigh it
function wbPanelHTML(){
  const w = S.wb; if (!w.photo) return '';
  const bottles = containers('bottle'), c = bottles.find(x => x.id === w.pick);
  let body;
  if (w.busy) body = `<div class="recbox"><span><span class="spin"></span> <b id="wb-step">${esc(w.step || 'Looking at your bottle…')}</b></span></div>`;
  else if (!bottles.length) body = `<p class="fine">No bottles saved yet. Add yours once and the app recognizes it next time.</p><button type="button" class="btn primary sm" data-action="c-new" data-kind="bottle">Add this bottle</button>`;
  else {
    const top = w.matches && w.matches[0];
    const note = w.err ? esc(w.err) : top && top.conf === 'sure' ? 'Recognized your bottle:' : top && top.conf === 'guess' ? 'Best guess, check it:' : 'Which bottle is it?';
    body = `<p class="fine">${note}</p>
      ${w.needModel ? `<button type="button" class="btn ghost sm" data-action="rec-download">Download image model (150 MB, once)</button>` : ''}
      <div class="chips">${bottles.map(b => `<button type="button" class="chip" data-action="wb-pick" data-id="${esc(b.id)}" aria-pressed="${b.id === w.pick}">${esc(b.name)}</button>`).join('')}</div>
      ${c ? `<div class="lbl">How much did you drink?</div>
        <div class="chips">${[[1, 'All of it'], [0.75, '¾'], [0.5, '½'], [0.25, '¼']].map(([f, l]) => `<button type="button" class="chip" data-action="wb-frac" data-f="${f}" aria-pressed="${w.scaleOz == null && w.frac === f}">${l}</button>`).join('')}
          ${c.emptyG ? `<button type="button" class="chip" data-action="wb-weigh" aria-pressed="${w.scaleOz != null}">${w.scaleBusy ? 'Reading…' : 'Weigh it'}</button>` : ''}</div>
        ${w.scaleOz != null ? `<p class="fine tnum">Scale ${int(w.scaleG)} g − empty bottle ${int(c.emptyG)} g = ${dec(w.scaleOz)} oz of water in it.</p>` : ''}
        ${w.scaleMiss ? '<p class="fine">Couldn’t read the scale in that photo.</p>' : ''}
        ${w.scaleFile && !w.scaleBusy ? `<button type="button" class="linkbtn" data-action="wb-tapread">${w.scaleOz != null ? 'Wrong number? Tap it in the photo' : 'Tap the number in the photo'}</button>` : ''}
        <button type="button" class="btn primary" data-action="wb-log">Log ${dec(wbOz())} oz</button>` : ''}`;
  }
  return `<div class="wbpanel"><img src="${esc(w.photo.url)}" alt="Your bottle"><div class="wbmain">${body}</div><button type="button" class="x" data-action="wb-cancel" aria-label="Cancel">${X_SVG}</button></div>`;
}
function wbOz(){ const w = S.wb, c = containers('bottle').find(x => x.id === w.pick); if (!c) return 0; return w.scaleOz != null ? w.scaleOz : c.capOz * w.frac; }
function wbReset(){ if (S.wb.photo) URL.revokeObjectURL(S.wb.photo.url); S.wb = {photo:null, busy:false, matches:null, pick:null, frac:1, err:'', scaleOz:null, scaleFile:null, scaleMiss:false}; }
async function snapBottle(file){
  let ph; try { ph = await prepPhoto(file); } catch { toast('Couldn’t open that photo. Try a JPEG or PNG.'); return; }
  wbReset(); Object.assign(S.wb, {photo:ph, busy:true, step:'Looking at your bottle…'});
  renderWater();
  try {
    const bottles = containers('bottle');
    if (!bottles.length) return;
    if (bottles.length === 1) S.wb.pick = bottles[0].id;
    if (!bottles.some(b => (b.photos || []).length)) { S.wb.err = 'Add photos to your saved bottles so the app can tell them apart. For now, tap yours:'; return; }
    if (S.rec.state === 'unknown') await checkRecognizer();
    if (S.rec.state !== 'ready') { S.wb.needModel = true; S.wb.err = 'Recognizing bottles needs the image model. Tap yours for now:'; return; }
    const m = await matchContainers(ph.blob, 'bottle', t => { S.wb.step = t; const el = $('#wb-step'); if (el) el.textContent = t; });
    S.wb.matches = m;
    if (m[0] && m[0].conf !== 'none') S.wb.pick = m[0].c.id;
  } catch (e) { console.error(e); S.wb.err = 'Couldn’t read that photo. Tap your bottle:'; }
  finally { if (S.wb.photo === ph) { S.wb.busy = false; if (S.tab === 'today') renderWater(); } }
}
// scale reading -> grams (most kitchen scales show grams unless they say otherwise)
function readingToG(r){
  if (!r || r.value == null) return null;
  const u = r.unit === 'ml' ? 'g' : r.unit;
  return toGrams(r.value, u || 'g');
}
function applyBottleRead(r){
  const w = S.wb, c = containers('bottle').find(x => x.id === w.pick); if (!c) return;
  const g = readingToG(r);
  if (g == null) { w.scaleOz = null; w.scaleMiss = true; }
  else { w.scaleMiss = false; w.scaleG = g; w.scaleOz = Math.max(0, Math.round((g - c.emptyG) / OZ_ML * 10) / 10); }
}
async function weighBottle(file){
  const w = S.wb; if (!containers('bottle').some(x => x.id === w.pick)) return;
  w.scaleBusy = true; w.scaleFile = file; renderWater();
  try { applyBottleRead(await readScale(file)); }
  catch (e) { console.error(e); w.scaleMiss = true; }
  finally { w.scaleBusy = false; if (S.tab === 'today') renderWater(); }
}

// When the automatic read misses, the person taps the display and only that area is read again.
function tapToRead(file, onResult){
  if (!file) return;
  const url = URL.createObjectURL(file);
  const ov = document.createElement('div'); ov.className = 'tapov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Tap the number on the display');
  ov.innerHTML = `<div class="tapov-in"><b>Tap the number on the scale’s display</b><img src="${url}" alt="Your photo"><p class="fine" id="tapov-msg">The app zooms in there and reads it again.</p><button type="button" class="btn ghost" data-tapclose>Cancel</button></div>`;
  const close = () => { ov.remove(); URL.revokeObjectURL(url); };
  ov.querySelector('[data-tapclose]').addEventListener('click', close);
  ov.querySelector('img').addEventListener('click', async ev => {
    const r = ev.currentTarget.getBoundingClientRect();
    const reg = {cx:(ev.clientX - r.left) / r.width, cy:(ev.clientY - r.top) / r.height};
    ov.querySelector('#tapov-msg').innerHTML = '<span class="spin"></span> Reading that spot…';
    let res = null; try { res = await readScale(file, () => {}, reg); } catch (e) { console.error(e); }
    close();
    if (!res || res.value == null) toast('Still couldn’t read it. Type the number instead.');
    onResult(res || {value:null, others:[]});
  });
  document.body.append(ov);
}

/* ---------- containers: recognize your own bottles and Tupperware ---------- */
async function containerEmbs(c){
  const photos = c.photos || [];
  if (c.embN === photos.length && c.embs) return c.embs;
  const r = await recognizer(), out = [];
  for (const ph of photos){ const b = await (await fetch(ph)).blob(); for (const v of await r.embedViews(b)) out.push(v.map(x => Math.round(x * 1e4) / 1e4)); }
  c.embs = out; c.embN = photos.length; saveContainers();
  return out;
}
async function matchContainers(blob, kind, onStep = () => {}){
  const r = await recognizer(); await r.load();
  onStep('Comparing with your saved containers…');
  const q = await r.embedViews(blob), out = [];
  for (const c of containers(kind)){
    const E = await containerEmbs(c);
    let best = -1;
    for (const e of E) for (const v of q){ let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * e[i]; if (s > best) best = s; }
    out.push({c, sim:best});
  }
  out.sort((a, b) => b.sim - a.sim);
  if (out.length) {
    const gap = out.length > 1 ? out[0].sim - out[1].sim : 1;
    out[0].conf = out[0].sim >= 0.8 && gap >= 0.03 ? 'sure' : out[0].sim >= 0.66 ? 'guess' : 'none';
  }
  return out;
}

/* ---------- water weight (bloat) estimate ---------- */
function renderWaterWeight(){
  const el = $('#ww-card'); if (!el) return;
  const date = S.viewDate, day = S.days[date] || {}, T = totalsMemo();
  const est = estimate(S.days, T, S.profile, date);
  const lab = bloatLabel(est.total);
  const comps = Object.entries(est.components).filter(([, v]) => Math.abs(v) >= 0.05).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const mx = Math.max(0.5, ...comps.map(([, v]) => Math.abs(v)));
  const morning = day.weights?.morning || '';
  const weighDays = Array.from({length: 60}, (_, i) => shift(date, -i)).filter(k => num(S.days[k]?.weights?.morning)).length;
  const tips = [], isToday = date === dayKey();
  if (!est.yday.logged) tips.push(`Log ${isToday ? 'yesterday' : 'the day before'}’s food. This morning’s water weight mostly comes from what you ate the day before.`);
  if (est.baselineDays < 3) tips.push(`Log food on ${3 - est.baselineDays} more day${3 - est.baselineDays === 1 ? '' : 's'} so it compares against your own normal week instead of an average one.`);
  if (!num(morning) && date === dayKey()) tips.push('Weigh yourself each morning after the bathroom, before eating or drinking.');
  if (!(day.checkins || []).length) tips.push('Do a check-in in Sports: bathroom trips and pee color sharpen the gut and hydration parts.');
  if (!day.practice?.minutes && SPORTS[S.profile.sport]?.kind !== 'none' && S.profile.sport) tips.push('Log practice (and weights before and after) so sweat and carb burn count.');
  if (S.profile.sex === 'female' && !S.profile.cycleStart) tips.push('Add your cycle in Body to include the monthly swing.');
  if (!est.calibration) tips.push(`${Math.max(0, 10 - weighDays)} more morning weigh-ins and it learns how strongly your body reacts to each factor.`);
  const eatenShare = T(date).calories / (targets().calories || 2000), lateDay = new Date().getHours() >= 19;
  const fc = isToday && est.forecast && (eatenShare >= 0.5 || lateDay) ? est.forecast : null, flab = fc && bloatLabel(fc.total);
  el.innerHTML = `<div class="sec-head"><h2 class="h">Water weight</h2><span class="sub">rough estimate</span></div>
    <div class="stat-big"><b class="tnum">${sgn(est.total)}</b><span class="sub">lb ${isToday ? 'this' : 'that'} morning vs your normal</span><span class="pill ww-${lab.tone}">${lab.label}</span></div>
    ${comps.length ? `<ul class="ww-comps">${comps.map(([k, v]) => `<li><span>${esc(COMPONENT_LABEL[k] || k)}</span><span class="ww-bar"><i class="${v < 0 ? 'neg' : 'pos'}" style="width:${Math.abs(v) / mx * 50}%"></i></span><b class="tnum">${sgn(v)}</b></li>`).join('')}</ul>` : '<p class="fine">Nothing unusual today: food, drinks and training look like your normal week.</p>'}
    ${est.creatine ? '<p class="fine">Creatine also keeps a steady 1–3 lb of water in your muscles. It isn’t counted above because it doesn’t change day to day.</p>' : ''}
    ${est.cycleDay ? `<p class="fine">Cycle day ${est.cycleDay}.</p>` : ''}
    ${fc ? `<p class="wwfc tnum">Tomorrow morning, from what you’ve logged so far: <b>${sgn(fc.total)} lb</b> <span class="pill ww-${flab.tone}">${flab.label}</span><br><span class="fine">Updates as you log food, water and practice.</span></p>` : ''}
    <div class="field"><label for="ww-morning">Morning weight <span class="hint">saves when you leave the box</span></label><div class="unit"><input type="number" id="ww-morning" inputmode="decimal" step="0.1" min="0" data-weigh="morning" data-date="${date}" value="${esc(morning)}" placeholder="—"><em>lb</em></div></div>
    ${est.scaleVsTrend != null ? `<div class="kv tnum"><div><span>Trend weight</span><b>${lb1(est.trend)} lb</b></div><div><span>Scale vs trend</span><b>${sgn(est.scaleVsTrend)} lb</b></div></div>
      <p class="fine">The trend smooths out daily swings. The gap between your scale and the trend is mostly water and food, so it should roughly match the estimate above.</p>` : ''}
    ${est.calibration ? `<p class="fine">${est.calibration.r2 >= 0.25 ? `Tuned to your body from ${est.calibration.n} morning weigh-ins; it explains about ${Math.round(est.calibration.r2 * 100)}% of your day-to-day scale changes.` : `Learning from ${est.calibration.n} morning weigh-ins. Your scale doesn’t line up with these factors clearly yet, so it leans on typical values; more consistent logging helps.`}</p>` : ''}
    <p class="fine">Water weight comes and goes within a day or two. It isn’t fat, and it’s not something to sweat off.</p>
    ${tips.length ? `<details class="help"><summary>Make it more accurate</summary><ul>${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}`;
}
function setWeight(date, point, val){
  const d = dayOf(date); d.weights ||= {}; d.weightsT ||= {};
  const v = Math.round(num(val) * 10) / 10;
  if (v > 0) { d.weights[point] = v; d.weightsT[point] = new Date().toISOString(); } else { delete d.weights[point]; delete d.weightsT[point]; }
  saveDay(date);
}

/* ---------- meals you cook (recipes) ---------- */
const recipeRaw = r => r.items.reduce((a, it) => a + itemGrams(it), 0) + (r.water || []).reduce((a, w) => a + num(w.g), 0);
const recipeCooked = r => num(r.cookedG) || recipeRaw(r);
// added water left after cooking (boiled-off water comes out of it first)
const recipeWaterNet = r => Math.max(0, (r.water || []).reduce((a, w) => a + num(w.g), 0) - (num(r.cookedG) ? Math.max(0, recipeRaw(r) - num(r.cookedG)) : 0));
function recipeTotals(r){
  const t = totalsOf(r.items);
  t.water_g += recipeWaterNet(r);
  return t;
}
function draftCooked(e){
  const v = toGrams(e.cookedIn, e.cookedUnit);
  if (!(v > 0)) return 0;
  const pot = S.containers.find(c => c.id === e.potId);
  return Math.max(0, v - num(pot?.emptyG));
}
const perLine = (t, g) => g > 0 ? `Per 100 g: ${int(t.calories / g * 100)} kcal · P ${dec(t.protein_g / g * 100)} g · C ${dec(t.carbs_g / g * 100)} g · F ${dec(t.fat_g / g * 100)} g` : '';
function cookWarn(raw, cooked){
  if (!cooked) return '';
  if (cooked > raw * 1.12) return '<p class="notice">That’s heavier than all the raw ingredients together. Did the pot get weighed too? Pick it under “minus container” or subtract it.</p>';
  if (cooked < raw * 0.35) return '<p class="notice">That’s far lighter than the raw ingredients. Double-check the weight and unit.</p>';
  return '';
}
const newRecipe = () => ({name:'', items:[], water:[], text:'', cookedIn:'', cookedUnit:'g', potId:'', servings:'', msg:null, ocr:null});
function renderMeals(){
  const el = $('#meals-body'); if (!el) return;
  $$('#view-meals .seg [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
  if (S.tab === 'containers') return renderContainers(el);
  if (S.tab === 'eatout') return renderEatOut(el);
  if (S.ml.log) return renderPortion(el);
  if (S.ml.edit) return renderRecipeEdit(el);
  const list = S.recipes.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0));
  el.innerHTML = `<div class="sec-head"><h2 class="h">Meals you cook</h2><button type="button" class="btn primary sm" data-action="r-new">+ New meal</button></div>
    ${list.length ? `<ul class="rlist">${list.map(r => { const t = recipeTotals(r), g = recipeCooked(r);
      return `<li class="card rcard"><button type="button" class="rmain" data-action="r-log" data-id="${esc(r.id)}"><b>${esc(r.name)}</b>
          <small>${r.items.length} ingredient${r.items.length === 1 ? '' : 's'} · batch ${int(g)} g · ${int(t.calories)} kcal${r.servings ? ` · ${r.servings} servings` : ''}</small>
          <small class="tnum">${esc(perLine(t, g))}</small></button>
        <div class="row2"><button type="button" class="btn primary sm" data-action="r-log" data-id="${esc(r.id)}">Log a portion</button><button type="button" class="btn ghost sm" data-action="r-edit" data-id="${esc(r.id)}">Edit</button></div></li>`; }).join('')}</ul>`
    : `<div class="empty"><b>Save meals you make often</b><p>1. Snap the ingredient list (or type it).<br>2. Weigh the finished pot.<br>3. Each time you eat, weigh your bowl. The app works out your share, assuming the food is evenly mixed.</p><button type="button" class="btn primary" data-action="r-new">Make your first meal</button></div>`}`;
}
function renderRecipeEdit(el){
  const e = S.ml.edit, raw = recipeRaw(e), cooked = draftCooked(e), t = recipeTotals({...e, cookedG:cooked}), m = e.msg;
  const pots = containers('food').filter(c => c.emptyG);
  el.innerHTML = `<div class="sec-head"><h2 class="h">${e.id ? 'Edit meal' : 'New meal'}</h2><button type="button" class="linkbtn" data-action="r-cancel">Cancel</button></div>
    <div class="field"><label for="r-name">Name</label><input type="text" id="r-name" maxlength="60" value="${esc(e.name)}" placeholder="e.g. Turkey chili"></div>
    <div class="card sec"><h3 class="h">Ingredients</h3>
      <p class="fine">Snap the ingredient list from a recipe card, cookbook or screen, or type it, one per line. Amounts count as raw or dry unless the line says cooked or canned.</p>
      <div class="row2"><button type="button" class="btn primary" data-action="r-photo" data-cam="1">${CAM_SVG}Photo of list</button><button type="button" class="btn ghost" data-action="r-photo">From gallery</button></div>
      ${e.ocr ? `<div class="recbox"><span><span class="spin"></span> <b id="r-ocr-step">${esc(e.ocr.step || 'Reading the list…')}</b></span></div>` : ''}
      ${m && m.err ? `<p class="err">${esc(m.err)}</p>` : ''}
      ${m && !m.err ? `<p class="notice">${m.added ? `Added ${m.added} ingredient${m.added === 1 ? '' : 's'}${m.fromPhoto ? ' from the photo. Check each one below, especially amounts.' : '.'}` : 'Nothing new added.'}
        ${m.missing.length ? `<br><b>Couldn’t match:</b> ${esc(m.missing.join('; '))}. Search for ${m.missing.length === 1 ? 'it' : 'them'} below.` : ''}
        ${m.skipped.length ? `<br>Skipped (no real calories): ${esc(m.skipped.join(', '))}.` : ''}</p>` : ''}
      ${e.ocrText ? `<details class="help"><summary>Text read from the photo</summary><pre class="ocrtext">${esc(e.ocrText)}</pre></details>` : ''}
      <div class="field"><label for="r-text">Type or paste ingredients</label><textarea id="r-text" placeholder="2 lb ground turkey&#10;1 can black beans&#10;1 cup dry rice&#10;2 cups water&#10;1 onion">${esc(e.text)}</textarea></div>
      <div class="row2"><button type="button" class="btn ghost" data-action="r-parse">Add these</button><button type="button" class="btn ghost" data-action="r-pack">${e.pk ? '<span class="spin"></span> Reading…' : 'Snap a package'}</button></div>
      <div class="field"><label for="r-search">Search one ingredient</label><input type="text" id="r-search" autocomplete="off" placeholder="e.g. olive oil"><ul class="results" id="r-results"></ul></div>
    </div>
    ${e.items.length || e.water.length ? `<ul class="pitems card" id="r-items">${e.items.map(itemRowHTML).join('')}${e.water.map(w => `<li class="pitem"><div class="pitem-top"><span><b>Water</b><small>${w.text ? '“' + esc(w.text) + '” · ' : ''}adds weight, no calories</small></span><span class="k tnum">0</span>
        <button type="button" class="x" data-action="r-water-del" data-id="${esc(w.id)}" aria-label="Remove water">${X_SVG}</button></div>
        <div class="qty"><div class="unit"><input type="number" inputmode="decimal" min="0" step="any" value="${esc(w.g)}" data-rwater="${esc(w.id)}" aria-label="Water in grams"><em>g</em></div></div></li>`).join('')}</ul>` : ''}
    <button type="button" class="linkbtn" data-action="r-water-add">+ Add water</button>
    <div class="card sec"><h3 class="h">Batch weight</h3>
      <div class="kv tnum"><div><span>Raw ingredients</span><b id="r-raw">${int(raw)} g</b></div><div><span>Whole batch</span><b><span id="r-kcal">${int(t.calories)}</span> kcal</b></div></div>
      <div class="field"><label for="r-cooked">Cooked weight of the whole batch <span class="hint">optional, more accurate</span></label>
        <div class="fix-row"><input type="number" id="r-cooked" inputmode="decimal" min="0" step="any" value="${esc(e.cookedIn)}" placeholder="${int(raw)}"><select id="r-cooked-unit" aria-label="Unit">${['g','oz','lb'].map(u => `<option ${u === e.cookedUnit ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
        ${pots.length ? `<select id="r-pot" aria-label="Minus container"><option value="">Minus container: none (I zeroed the scale)</option>${pots.map(c => `<option value="${esc(c.id)}" ${c.id === e.potId ? 'selected' : ''}>Minus ${esc(c.name)} (${int(c.emptyG)} g)</option>`).join('')}</select>` : ''}
        <p class="fine">Cooking boils off water, so weighing the finished food makes every portion more accurate. Left blank, the raw total is used.</p>
        <div id="r-cookwarn">${cookWarn(raw, cooked)}</div></div>
      <div class="field"><label for="r-serv">Servings in the batch <span class="hint">optional</span></label><input type="number" id="r-serv" inputmode="numeric" min="0" value="${esc(e.servings)}" placeholder="—"></div>
      <p class="fine tnum" id="r-per">${esc(perLine(t, cooked || raw))}</p>
    </div>
    <div id="r-label">${e.items.length ? nfHTML(t, `whole batch · ${int(cooked || raw)} g`) : ''}</div>
    <button type="button" class="btn primary" data-action="r-save">Save meal</button>
    ${e.id ? `<button type="button" class="btn danger" data-action="r-del">${e.confirmDel ? 'Tap again to delete' : 'Delete meal'}</button>` : ''}`;
}
function renderRecipeTotals(){
  const e = S.ml.edit; if (!e || !$('#r-raw')) return;
  const raw = recipeRaw(e), cooked = draftCooked(e), t = recipeTotals({...e, cookedG:cooked});
  $('#r-raw').textContent = `${int(raw)} g`; $('#r-kcal').textContent = int(t.calories);
  $('#r-per').textContent = perLine(t, cooked || raw);
  $('#r-label').innerHTML = e.items.length ? nfHTML(t, `whole batch · ${int(cooked || raw)} g`) : '';
  $('#r-cookwarn').innerHTML = cookWarn(raw, cooked);
  const c = $('#r-cooked'); if (c) c.placeholder = int(raw);
}
function addRecipeText(text, fromPhoto){
  const e = S.ml.edit; if (!e) return;
  let added = 0; const missing = [], skipped = [];
  const lines = String(text).split('\n'), rest = [];
  for (const line of lines){
    const pt = pantryTagged(line.trim());
    if (pt != null) { const it = pantryItemFor(pt.replace(/^[^A-Za-z0-9½¼¾]+/, '')); if (it) { it.line = line.trim(); e.items.push(it); added++; } else missing.push(`${pt} (not in your pantry)`); continue; }
    const mine = line.trim() && myFoodFor(line.trim());
    if (mine) { mine.line = line.trim(); e.items.push(mine); added++; continue; }
    rest.push(line);
  }
  const res = parseIngredients(rest.join('\n'), INDEX, BYID);
  for (const r of res){
    if (r.skip) { skipped.push(r.text); continue; }
    if (r.water != null) { e.water.push({id:uid(), g:r.water, text:r.text}); added++; continue; }
    if (r.missing) { missing.push(r.text); continue; }
    const single = r.items.length === 1;
    for (const i of r.items){
      const it = usdaItem(i.ndb, i.g, single ? (r.label ? cap(r.label) : shortName(r.name)) : null, single ? r.portion : `${dec(i.g)} g`);
      if (!it) continue;
      if (r.label) it.label = r.label;
      if (!single) it.group = r.label || r.name;
      it.line = r.text;
      e.items.push(it); added++;
    }
  }
  e.msg = {added, missing, skipped, fromPhoto};
  if (!fromPhoto) e.text = '';
  if (!e.name && e.items.length) e.name = '';
}
async function recipeFromPhoto(file){
  const e = S.ml.edit; if (!e) return;
  e.ocr = {step:'Reading the list…'}; e.msg = null; renderMeals();
  try {
    const text = await readText(file, t => { if (e.ocr) e.ocr.step = t; const el = $('#r-ocr-step'); if (el) el.textContent = t; });
    if (!text.trim()) e.msg = {err:'Couldn’t read any text. Hold the phone straight over the list, fill the frame and use good light, or type it.'};
    else { e.ocrText = text; addRecipeText(text, true); }
  } catch (err) { console.error(err); e.msg = {err:'Couldn’t read that photo. Try again, or type the list.'}; }
  finally { e.ocr = null; if (S.ml.edit === e && S.tab === 'meals') renderMeals(); }
}
async function recipePackage(file){
  const e = S.ml.edit; if (!e) return;
  e.pk = true; e.msg = null; renderMeals();
  try {
    const ph = await prepPhoto(file);
    const clip = S.rec.state === 'ready' ? await recognizer() : null;
    const res = await packScan(ph.orig || ph.blob, {single:true, clip, local:localMatches, onStep:() => {}});
    URL.revokeObjectURL(ph.url);
    const it0 = res.items.find(x => x.matches.length || (x.local || []).length);
    if (!it0) e.msg = {err:'Couldn’t identify that package. Search for it by name instead.'};
    else {
      delete S.pk.choice[it0.id];
      const food = await pickedFood(it0, false);
      if (food) { food.line = 'package photo'; e.items.push(food); toast(`Added ${food.name}. Set how much went in.`); }
      else e.msg = {err:'Found the product, but it has no nutrition data. Search for it by name instead.'};
    }
  } catch (err) { console.error(err); e.msg = {err:'Couldn’t read that photo.'}; }
  finally { e.pk = false; if (S.ml.edit === e && S.tab === 'meals') renderMeals(); }
}
function runRSearch(){
  const inp = $('#r-search'), out = $('#r-results'); if (!inp || !out) return;
  const q = inp.value.trim();
  if (q.length < 2) { out.innerHTML = ''; return; }
  const qt = tokens(q);
  const labs = LABELS.filter(l => l[1].length === 1 && tokens(l[0]).length && qt.every(t => tokens(l[0]).some(w => w.startsWith(t)))).slice(0, 3);
  const usda = search(INDEX, q, 8);
  const mine = S.myFoods.filter(f => qt.every(t => tokens(`${f.brand || ''} ${f.name}`).some(w => w.startsWith(t)))).slice(0, 4);
  out.innerHTML = mine.map(f => `<li><button type="button" data-action="r-add-my" data-id="${esc(f.id)}"><span><b><span class="tag">Mine</span>${esc(f.name)}</b><small>${esc(f.servingD || '')}</small></span><span class="k">Add</span></button></li>`).join('') + labs.map(l => `<li><button type="button" data-action="r-add-label" data-label="${esc(l[0])}"><span><b><span class="tag">Quick</span>${esc(cap(l[0]))}</b><small>${esc(l[2])}</small></span><span class="k">Add</span></button></li>`).join('') +
    usda.map(f => `<li><button type="button" data-action="r-add-usda" data-ndb="${f[0]}"><span><b>${esc(shortName(f[1]))}</b><small>${esc(f[1])}</small></span><span class="k">Add</span></button></li>`).join('') ||
    `<li><p class="fine" style="padding:10px 0">No matches. Try a simpler word.</p></li>`;
}
function saveRecipe(){
  const e = S.ml.edit;
  if (!e.items.length) { toast('Add at least one ingredient'); return; }
  const name = (e.name || '').trim() || e.items.slice(0, 2).map(i => i.name).join(' & ');
  const r = {id:e.id || uid(), name:name.slice(0, 60), items:e.items.map(stripItem), water:e.water, cookedIn:e.cookedIn, cookedUnit:e.cookedUnit, potId:e.potId,
    cookedG:Math.round(draftCooked(e)), servings:num(e.servings) || 0, created:e.created || Date.now(), updated:Date.now()};
  const i = S.recipes.findIndex(x => x.id === r.id);
  if (i >= 0) S.recipes[i] = r; else S.recipes.push(r);
  saveRecipes(); store.persist();
  S.ml.edit = null; renderMeals(); toast(`Saved ${r.name}`);
}

/* portion of a saved meal, by weight */
function openPortion(id){
  const r = S.recipes.find(x => x.id === id); if (!r) return;
  S.ml.log = {rid:id, val:'', unit:'g', cont:S.profile.lastCont && S.containers.some(c => c.id === S.profile.lastCont) ? S.profile.lastCont : 'tared', bowlG:'', photo:null, busy:false, read:null, detected:null, meal:defaultMeal()};
  renderMeals(); window.scrollTo({top:0});
}
function portionCalc(){
  const L = S.ml.log, r = L && S.recipes.find(x => x.id === L.rid); if (!r) return null;
  const gross = toGrams(L.val, L.unit);
  let tare = 0;
  if (L.cont === 'bowl') tare = num(L.bowlG);
  else if (L.cont !== 'tared') tare = num(S.containers.find(c => c.id === L.cont)?.emptyG);
  const food = Math.max(0, gross - tare), batch = recipeCooked(r), frac = batch ? food / batch : 0;
  const t = recipeTotals(r);
  return {r, gross, tare, food, batch, frac, t:Object.fromEntries(KEYS.map(k => [k, t[k] * frac]))};
}
function renderPortion(el){
  const L = S.ml.log, r = S.recipes.find(x => x.id === L.rid);
  if (!r) { S.ml.log = null; return renderMeals(); }
  const foods = containers('food').filter(c => c.emptyG);
  const batch = recipeCooked(r);
  el.innerHTML = `<div class="sec-head"><h2 class="h">Log ${esc(r.name)}</h2><button type="button" class="linkbtn" data-action="pl-cancel">Back</button></div>
    <div class="card sec"><h3 class="h">How much did you eat?</h3>
      <p class="fine">Set your bowl or container on a food scale and snap the display, or type the weight.</p>
      <div class="row2"><button type="button" class="btn primary" data-action="pl-snap" data-cam="1">${CAM_SVG}Photo of scale</button><button type="button" class="btn ghost" data-action="pl-snap">From gallery</button></div>
      ${L.photo ? `<div class="wbpanel"><img src="${esc(L.photo.url)}" alt="Your scale"><div class="wbmain">${L.busy ? `<div class="recbox"><span><span class="spin"></span> <b id="pl-step">Reading the scale…</b></span></div>`
        : L.read && L.read.value != null ? `<p class="fine">Read <b>${esc(L.read.text || L.read.value)}${L.read.unit ? ' ' + esc(L.read.unit) : ''}</b> from the display.${L.read.others.length ? ' Not it?' : ''}</p>${L.read.others.length ? `<div class="chips">${L.read.others.map(v => `<button type="button" class="chip" data-action="pl-alt" data-v="${v}">${v}</button>`).join('')}</div>` : ''}`
        : `<p class="fine">Couldn’t read the display. Get closer, avoid glare, or type the number.</p>`}
        ${!L.busy && L.file ? `<button type="button" class="linkbtn" data-action="pl-tapread">${L.read && L.read.value != null ? 'Wrong number? Tap it in the photo' : 'Tap the number in the photo'}</button>` : ''}
        ${L.detected ? `<p class="fine">${L.detected.conf === 'sure' ? 'Spotted' : 'Looks like'} your <b>${esc(L.detected.name)}</b> on the scale.</p>` : ''}</div></div>` : ''}
      <div class="fix-row"><input type="number" id="pl-val" inputmode="decimal" min="0" step="any" value="${esc(L.val)}" placeholder="Weight" aria-label="Weight on the scale">
        <div class="seg unitseg">${['g','oz','lb'].map(u => `<button type="button" data-action="pl-unit" data-u="${u}" aria-pressed="${L.unit === u}">${u}</button>`).join('')}</div></div>
      <div class="field"><label for="pl-cont">Container on the scale</label><select id="pl-cont">
        <option value="tared" ${L.cont === 'tared' ? 'selected' : ''}>None, or I zeroed the scale with it on</option>
        ${foods.map(c => `<option value="${esc(c.id)}" ${L.cont === c.id ? 'selected' : ''}>${esc(c.name)} (−${int(c.emptyG)} g)</option>`).join('')}
        <option value="bowl" ${L.cont === 'bowl' ? 'selected' : ''}>Another bowl (type its weight)</option></select></div>
      ${L.cont === 'bowl' ? `<div class="field"><label for="pl-bowl">Empty bowl weight</label><div class="unit"><input type="number" id="pl-bowl" inputmode="decimal" min="0" step="any" value="${esc(L.bowlG)}"><em>g</em></div><p class="fine">Using this bowl a lot? Save it under Containers.</p></div>` : ''}
      ${r.servings ? `<div class="chips">${[1, 0.5, 2].map(f => `<button type="button" class="chip" data-action="pl-serv" data-f="${f}">${f === 1 ? '1 serving' : f === 0.5 ? '½ serving' : '2 servings'} (${int(batch / r.servings * f)} g)</button>`).join('')}</div>` : ''}
    </div>
    <div id="pl-result"></div>
    <div class="chips">${MEALS.map(([k, l]) => `<button type="button" class="chip" data-action="pl-meal" data-meal="${k}" aria-pressed="${L.meal === k}">${l}</button>`).join('')}</div>
    <button type="button" class="btn primary" id="pl-log" data-action="pl-log">Log it</button>
    <p class="logto">Logging to ${S.viewDate === dayKey() ? 'today' : esc(relDay(S.viewDate))}</p>`;
  renderPortionResult();
}
function renderPortionResult(){
  const out = $('#pl-result'), btn = $('#pl-log'); if (!out) return;
  const c = portionCalc(); if (!c) return;
  if (!(c.food > 0)) { out.innerHTML = '<p class="fine">Enter the weight to see your share of the batch.</p>'; btn.disabled = true; btn.textContent = 'Log it'; return; }
  const pct = c.frac * 100;
  out.innerHTML = `<div class="card sec"><div class="stat-big"><b class="tnum">${int(c.t.calories)}</b><span class="sub">kcal · ${int(c.food)} g of food${c.tare ? ` (${int(c.gross)} − ${int(c.tare)} g container)` : ''}</span></div>
      <p class="pcf tnum"><i class="p">P ${int(c.t.protein_g)} g</i> · <i class="c">C ${int(c.t.carbs_g)} g</i> · <i class="f">F ${int(c.t.fat_g)} g</i> · fiber ${dec(c.t.fiber_g)} g · sodium ${int(c.t.sodium_mg)} mg</p>
      <p class="fine tnum">That’s ${pct < 10 ? pct.toFixed(1) : Math.round(pct)}% of the ${int(c.batch)} g batch, assuming everything is evenly mixed.</p>
      ${c.frac > 1.02 ? '<p class="notice">That’s more than the whole batch. Check the batch weight in Edit, or whether the container was subtracted.</p>' : ''}</div>`;
  btn.disabled = false; btn.textContent = `Log ${int(c.t.calories)} kcal to ${MEAL_LABEL[S.ml.log.meal]}`;
}
async function scalePortion(file){
  const L = S.ml.log; if (!L) return;
  let ph; try { ph = await prepPhoto(file); } catch { toast('Couldn’t open that photo. Try a JPEG or PNG.'); return; }
  if (L.photo) URL.revokeObjectURL(L.photo.url);
  Object.assign(L, {photo:ph, busy:true, read:null, detected:null}); renderMeals();
  const step = t => { const el = $('#pl-step'); if (el) el.textContent = t; };
  L.file = file;
  try {
    applyPortionRead(L, await readScale(file, step));
    if (containers('food').some(c => c.emptyG && (c.photos || []).length)) {
      if (S.rec.state === 'unknown') await checkRecognizer();
      if (S.rec.state === 'ready') {
        step('Checking which container it is…');
        const m = (await matchContainers(ph.blob, 'food', step)).filter(x => x.c.emptyG);
        if (m[0] && m[0].conf !== 'none') { L.cont = m[0].c.id; L.detected = {name:m[0].c.name, conf:m[0].conf}; }
      }
    }
  } catch (e) { console.error(e); toast('Couldn’t read that photo. Type the weight instead.'); }
  finally { L.busy = false; if (S.ml.log === L && S.tab === 'meals') renderMeals(); }
}
function applyPortionRead(L, r){
  L.read = r;
  if (r && r.value != null) {
    let v = r.value, u = r.unit;
    if (u === 'kg') { v *= 1000; u = 'g'; }
    if (!['g', 'oz', 'lb'].includes(u)) u = 'g';
    L.val = String(Math.round(v * 10) / 10); L.unit = u;
  }
}
function logPortion(){
  const c = portionCalc(); if (!c || !(c.food > 0)) { toast('Enter the weight first'); return; }
  const {r, frac} = c, L = S.ml.log, date = S.viewDate, day = dayOf(date);
  const items = r.items.map(it => { const g = itemGrams(it); return {name:it.name, sub:it.sub, portion:`${dec(g * frac)} g of the ${dec(g)} g in the batch`, grams:Math.round(g * frac * 10) / 10, p:it.p, src:it.src, ndb:it.ndb, code:it.code}; });
  const wg = recipeWaterNet(r) * frac;
  if (wg >= 1) items.push({name:'Water (in the recipe)', sub:'', portion:`${int(wg)} g`, grams:Math.round(wg), p:WATER_P, src:'water'});
  const entry = {id:uid(), meal:L.meal, time:new Date().toISOString(), name:r.name, thumb:L.photo ? L.photo.thumb : '', items, mult:1, recipe:r.id, portionG:Math.round(c.food)};
  day.entries.push(entry); saveDay(date); store.persist();
  if (L.cont !== 'bowl') { S.profile.lastCont = L.cont; saveProfile(); }
  if (L.photo) URL.revokeObjectURL(L.photo.url);
  S.ml.log = null;
  toast(`Logged ${int(c.food)} g of ${r.name} · ${int(c.t.calories)} kcal`); setTab('today');
}

/* ---------- containers screen ---------- */
function renderContainers(el){
  const ce = S.ml.cEdit;
  if (ce) { el.innerHTML = containerEditHTML(ce); return; }
  const row = c => { const n = (c.photos || []).length;
    return `<li class="ccard"><span class="cthumb">${n ? `<img src="${esc(c.photos[0])}" alt="">` : c.kind === 'bottle' ? BOTTLE_SVG : BOX_SVG}</span>
      <span><b>${esc(c.name)}</b><small>${[c.kind === 'bottle' ? `${dec(c.capOz)} oz (${int(c.capOz * OZ_ML)} ml)` : '', c.emptyG ? `empty ${int(c.emptyG)} g` : c.kind === 'food' ? 'add its empty weight' : '', `${n} photo${n === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</small></span>
      <button type="button" class="btn ghost sm" data-action="c-edit" data-id="${esc(c.id)}">Edit</button></li>`; };
  el.innerHTML = `<div class="sec"><div class="sec-head"><h2 class="h">Water bottles</h2><button type="button" class="btn ghost sm" data-action="c-new" data-kind="bottle">+ Add bottle</button></div>
      ${containers('bottle').length ? `<ul class="clist card">${containers('bottle').map(row).join('')}</ul>` : `<div class="empty"><b>No bottles yet</b><p>Save each bottle once with a few photos and how much it holds. Then snap it on Today, or tap its button, to log the water.</p></div>`}</div>
    <div class="sec"><div class="sec-head"><h2 class="h">Food containers</h2><button type="button" class="btn ghost sm" data-action="c-new" data-kind="food">+ Add container</button></div>
      ${containers('food').length ? `<ul class="clist card">${containers('food').map(row).join('')}</ul>` : `<div class="empty"><b>No containers yet</b><p>Tupperware, bowls and pots. Save the empty weight once and it’s subtracted when you weigh a portion of a saved meal, recognized right from the scale photo.</p></div>`}</div>
    <p class="fine">Telling containers apart from a photo uses the on-device image model (a one-time download). Photos stay on this phone.</p>`;
}
function containerEditHTML(ce){
  const bottle = ce.kind === 'bottle', photos = ce.photos || [];
  return `<div class="card sec"><div class="sec-head"><h2 class="h">${ce.id ? 'Edit' : 'New'} ${bottle ? 'water bottle' : 'food container'}</h2><button type="button" class="linkbtn" data-action="c-cancel">Cancel</button></div>
    <div class="field"><label for="c-name">Name</label><input type="text" id="c-name" maxlength="40" value="${esc(ce.name || '')}" placeholder="${bottle ? 'e.g. Blue Owala' : 'e.g. Big glass Pyrex'}"></div>
    ${bottle ? `<div class="field"><label for="c-cap">How much it holds</label><div class="fix-row"><input type="number" id="c-cap" inputmode="decimal" min="0" step="any" value="${esc(ce.cap ?? '')}" placeholder="24"><select id="c-capu" aria-label="Unit"><option value="oz" ${ce.capU !== 'ml' ? 'selected' : ''}>oz</option><option value="ml" ${ce.capU === 'ml' ? 'selected' : ''}>ml</option></select></div><p class="fine">Usually printed on the bottom, the label or the box.</p></div>` : ''}
    <div class="field"><label for="c-empty">Empty weight <span class="hint">${bottle ? 'optional: lets you weigh a half-full bottle' : 'lets the app subtract it on the scale'}</span></label>
      <div class="fix-row"><input type="number" id="c-empty" inputmode="decimal" min="0" step="any" value="${esc(ce.empty ?? '')}" placeholder="—"><select id="c-emptyu" aria-label="Unit"><option value="g" ${ce.emptyU !== 'oz' ? 'selected' : ''}>g</option><option value="oz" ${ce.emptyU === 'oz' ? 'selected' : ''}>oz</option></select></div>
      <button type="button" class="btn ghost sm" data-action="c-weigh" ${ce.scaleBusy ? 'disabled' : ''}>${ce.scaleBusy ? '<span class="spin"></span> Reading the scale…' : `${CAM_SVG}Photo of it empty on the scale`}</button>
      ${ce.scaleNote ? `<p class="fine">${esc(ce.scaleNote)}</p>` : ''}
      ${ce.scaleFile && !ce.scaleBusy ? `<button type="button" class="linkbtn" data-action="c-tapread">${num(ce.empty) ? 'Wrong number? Tap it in the photo' : 'Tap the number in the photo'}</button>` : ''}</div>
    <div class="field"><span class="lbl">Photos <span class="hint">${photos.length} saved</span></span>
      ${photos.length ? `<div class="cphotos">${photos.map((p, i) => `<span><img src="${esc(p)}" alt="Photo ${i + 1}"><button type="button" class="x" data-action="c-photo-del" data-i="${i}" aria-label="Remove photo ${i + 1}">${X_SVG}</button></span>`).join('')}</div>` : ''}
      <div class="row2"><button type="button" class="btn ghost" data-action="c-photo" data-cam="1">${CAM_SVG}Take photo</button><button type="button" class="btn ghost" data-action="c-photo">From gallery</button></div>
      <p class="fine">Take 2–3 photos from different sides, the way you’d normally snap it${bottle ? ' (in your hand is fine)' : ', including one on your scale'}. More photos, better recognition.</p></div>
    <button type="button" class="btn primary" data-action="c-save">Save</button>
    ${ce.id ? `<button type="button" class="btn danger" data-action="c-del">${ce.confirmDel ? 'Tap again to delete' : 'Delete'}</button>` : ''}</div>`;
}
function saveContainer(){
  const ce = S.ml.cEdit, name = (ce.name || '').trim();
  if (!name) { toast('Give it a name'); return; }
  const capOz = ce.kind === 'bottle' ? (ce.capU === 'ml' ? num(ce.cap) / OZ_ML : num(ce.cap)) : 0;
  if (ce.kind === 'bottle' && !(capOz > 0)) { toast('Enter how much it holds'); return; }
  const emptyG = toGrams(ce.empty, ce.emptyU === 'oz' ? 'oz' : 'g');
  const photos = ce.photos || [];
  const c = {id:ce.id || uid(), kind:ce.kind, name:name.slice(0, 40), capOz:Math.round(capOz * 10) / 10, emptyG:Math.round(emptyG), photos,
    embs:ce.embN === photos.length ? ce.embs : null, embN:ce.embN === photos.length ? ce.embN : -1, created:ce.created || Date.now()};
  const i = S.containers.findIndex(x => x.id === c.id);
  if (i >= 0) S.containers[i] = c; else S.containers.push(c);
  saveContainers(); store.persist();
  const back = ce.back; S.ml.cEdit = null; toast(`Saved ${c.name}`);
  if (S.rec.state === 'ready' && photos.length) containerEmbs(c).catch(() => {});
  if (back === 'today') { setTab('today'); if (S.wb.photo && c.kind === 'bottle') { S.wb.pick = c.id; renderWater(); } } else renderMeals();
}
async function addContainerPhoto(file, fromScale){
  const ce = S.ml.cEdit; if (!ce) return;
  try { const url = await smallPhoto(file); (ce.photos ||= []).push(url); ce.embN = -1; }
  catch { toast('Couldn’t open that photo. Try a JPEG or PNG.'); }
  if (S.ml.cEdit === ce && S.tab === 'containers' && !(fromScale && ce.scaleBusy)) renderMeals();
}
function applyContainerRead(ce, r){
  if (!r || r.value == null) { ce.scaleNote = 'Couldn’t read the display. Get closer and avoid glare, or type the weight.'; return; }
  if (r.unit === 'oz') { ce.empty = r.value; ce.emptyU = 'oz'; }
  else if (r.unit === 'lb') { ce.empty = Math.round(r.value * 16 * 10) / 10; ce.emptyU = 'oz'; }
  else { ce.empty = Math.round(readingToG(r)); ce.emptyU = 'g'; }
  ce.scaleNote = `Read ${r.text || r.value}${r.unit ? ' ' + r.unit : ''} from the display. Fix it above if that’s wrong. The photo was saved too, so it can be recognized on the scale later.`;
}
async function weighContainer(file){
  const ce = S.ml.cEdit; if (!ce) return;
  ce.scaleBusy = true; ce.scaleNote = ''; ce.scaleFile = file; renderMeals();
  try {
    applyContainerRead(ce, await readScale(file));
    await addContainerPhoto(file, true);
  } catch (e) { console.error(e); ce.scaleNote = 'Couldn’t read that photo.'; }
  finally { ce.scaleBusy = false; if (S.ml.cEdit === ce && S.tab === 'containers') renderMeals(); }
}

/* ---------- sports ---------- */
const QSHORT = {energy:'Energy', hunger:'Hunger', mood:'Mood', soreness:'Soreness', stress:'Stress', urine:'Pee color', pee:'Times peed', poop:'Times pooped', caffeine:'Caffeine', sleep:'Sleep hours', sleepq:'Sleep quality', perf:'Practice rating', focus:'Focus', cramps:'Cramps'};
const PKINDS = [['practice','Practice'],['lift','Lift'],['conditioning','Conditioning'],['match','Match / meet'],['rest','Rest day']];
function sportCfg(){
  const p = S.profile;
  if (!p.sports) p.sports = sportDefaults(p.sport);
  const c = p.sports; c.points ||= ['morning','pre','post']; c.questions ||= []; c.custom ||= [];
  return c;
}
const isWeightClass = () => SPORTS[S.profile.sport]?.kind === 'combat';
const wkLabel = s => { const cur = weekStart(dayKey()); return s === cur ? 'This week' : s === addDays(cur, -7) ? 'Last week' : rangeText(s); };
function renderSports(){
  const el = $('#sports-body'); if (!el) return;
  const sp = S.sp, cfg = sportCfg();
  const views = [['day','Today'],['checkin','Check-in'],['history','History'],['compare','Compare']];
  const setup = !cfg.done || sp.setup;
  let html = setup ? '' : `<div class="seg" role="tablist" aria-label="Sports">${views.map(([k, l]) => `<button type="button" role="tab" data-action="sp-view" data-v="${k}" aria-selected="${sp.view === k}">${l}</button>`).join('')}</div>`;
  if (setup) html += setupHTML();
  else if (sp.view === 'checkin') html += spNav() + checkinHTML();
  else if (sp.view === 'history') html += spNav() + historyHTML();
  else if (sp.view === 'compare') html += compareHTML();
  else html += spNav() + classHTML(sp.date) + weighHTML(sp.date) + practiceHTML(sp.date) + hrHTML() + activityHTML(sp.date);
  el.innerHTML = html;
}
function spNav(){
  const d = S.sp.date;
  return `<div class="daynav"><button type="button" class="iconbtn" data-action="sp-prev" aria-label="Previous day"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg></button>
    <div class="daynav-label"><b>${esc(relDay(d))}</b><span>${esc(longDay(d))}</span></div>
    <button type="button" class="iconbtn" data-action="sp-next" aria-label="Next day" ${d >= dayKey() ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg></button></div>`;
}
function setupHTML(){
  const cfg = sportCfg(), p = S.profile, combat = isWeightClass();
  return `<div class="card sec"><h2 class="h">Set up your sport</h2>
    <div class="field"><label for="sp-sport">Sport</label><select id="sp-sport">${Object.entries(SPORTS).map(([k, v]) => `<option value="${k}" ${k === (p.sport || 'none') ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></div>
    ${combat ? `<div class="grid2"><div class="field"><label for="sp-class">Weight class</label><div class="unit"><input type="number" id="sp-class" inputmode="decimal" step="any" min="0" value="${esc(cfg.weightClass || '')}" placeholder="e.g. 165"><em>lb</em></div></div>
      <div class="field"><label for="sp-wdate">Next weigh-in</label><input type="date" id="sp-wdate" value="${esc(cfg.weighDate || '')}"></div></div>
      <p class="fine">Pace is planned at no more than 1.5% of body weight a week, the limit in high school wrestling weight-management rules. The app never suggests cutting water to make weight.</p>` : ''}
    <div class="lbl">Weigh-ins to track</div>
    <div class="chips">${Object.entries(WEIGH_POINTS).map(([k, v]) => `<button type="button" class="chip" data-action="sp-point" data-k="${k}" aria-pressed="${cfg.points.includes(k)}">${esc(v.label)}</button>`).join('')}</div>
    <div class="lbl">Check-in questions</div>
    <div class="chips">${Object.keys(QUESTIONS).map(k => `<button type="button" class="chip" data-action="sp-q" data-k="${k}" aria-pressed="${cfg.questions.includes(k)}">${esc(QSHORT[k])}</button>`).join('')}</div>
    ${cfg.custom.length ? `<ul class="cilist">${cfg.custom.map(c => `<li><span><b>${esc(c.q)}</b><small>${c.type === 'scale' ? '1–10 scale' : c.type === 'count' ? 'count' : 'yes / no'}</small></span><button type="button" class="linkbtn" data-action="sp-cdel" data-id="${esc(c.id)}">Remove</button></li>`).join('')}</ul>` : ''}
    <div class="field"><label for="sp-cq">Add your own question</label><input type="text" id="sp-cq" maxlength="80" placeholder="e.g. How heavy do your legs feel?">
      <div class="fix-row"><select id="sp-ct" aria-label="Answer type"><option value="scale">Scale 1–10</option><option value="count">Count</option><option value="yesno">Yes / no</option></select><button type="button" class="btn ghost sm" data-action="sp-cadd">Add</button></div></div>
    <button type="button" class="btn primary" data-action="sp-done">Done</button></div>`;
}
function classHTML(date){
  const cfg = sportCfg(); if (!isWeightClass() || !num(cfg.weightClass)) return '';
  const cls = num(cfg.weightClass);
  let cur = 0, curDate = null;
  for (let i = 0; i < 7; i++){ const k = shift(date, -i), v = num(S.days[k]?.weights?.morning); if (v) { cur = v; curDate = k; break; } }
  if (!cur) cur = num(S.profile.weightLb);
  if (!cur) return `<div class="card sec"><h3 class="h">${int(cls)} lb class</h3><p class="fine">Log a morning weight below to see where you stand.</p></div>`;
  const over = cur - cls, days = cfg.weighDate ? Math.round((toDate(cfg.weighDate) - toDate(date)) / 864e5) : null;
  let pace, tone = 'ok';
  if (over <= 0) pace = `You’re ${lb1(-over)} lb under. Eat enough to fuel practice and hold steady.`;
  else if (days == null) pace = 'Add your next weigh-in date (Change setup) to get a weekly pace.';
  else if (days <= 0) pace = 'That weigh-in date has passed. Set your next one in setup.';
  else {
    const perWeek = over / (days / 7), pct = perWeek / cur * 100;
    if (pct <= 1.5) pace = `About ${lb1(perWeek)} lb a week (${pct.toFixed(1)}% of your weight) gets you there. That’s within the 1.5%-a-week limit: a small calorie deficit does it, with no water cutting.`;
    else { tone = 'warn'; pace = `That’s ${lb1(perWeek)} lb a week (${pct.toFixed(1)}% of your weight), faster than the 1.5%-a-week limit. Talk to your coach about the next class up or a later target. Cutting water to make weight costs strength and can be dangerous.`; }
  }
  const est = estimate(S.days, totalsMemo(), S.profile, date);
  return `<div class="card sec class-card ${tone}"><div class="sec-head"><h3 class="h">${int(cls)} lb class</h3><span class="sub">${days != null && days > 0 ? `${days} day${days === 1 ? '' : 's'} to weigh-in` : ''}</span></div>
    <div class="stat-big"><b class="tnum">${sgn(over)}</b><span class="sub">lb vs class · now ${lb1(cur)} lb${curDate && curDate !== date ? ` (${esc(shortDay(curDate))})` : ''}</span></div>
    <p class="fine">${esc(pace)}</p>
    ${Math.abs(est.total) >= 0.5 ? `<p class="fine">About ${sgn(est.total)} lb of today’s weight is water swing (see Today). It comes and goes, so don’t count it as progress.</p>` : ''}
    <button type="button" class="linkbtn" data-action="sp-setup">Change setup</button></div>`;
}
function weighHTML(date){
  const cfg = sportCfg(), day = S.days[date] || {}, w = day.weights || {}, wt = day.weightsT || {}, pr = day.practice || {};
  const rows = cfg.points.map(k => { const P = WEIGH_POINTS[k];
    return `<div class="wrow"><label for="w-${k}"><b>${esc(P.label)}</b><small>${esc(P.hint)}${wt[k] ? `${P.hint ? ' · ' : ''}${esc(timeOf(wt[k]))}` : ''}</small></label><div class="unit"><input type="number" id="w-${k}" inputmode="decimal" step="0.1" min="0" data-weigh="${k}" data-date="${date}" value="${esc(w[k] || '')}" placeholder="—"><em>lb</em></div></div>`; }).join('');
  const out = [], sweat = sweatOf(day), yd = S.days[shift(date, -1)]?.weights || {};
  if (sweat > 0) out.push(`<li><b>Sweat loss at practice: ${lb1(sweat)} lb</b><span>${lb1(w.pre)} → ${lb1(w.post)} lb${num(pr.fluidsOz) ? `, plus ${int(pr.fluidsOz)} oz you drank` : ''}${num(pr.minutes) ? ` · ${lb1(sweat / (num(pr.minutes) / 60))} lb an hour` : ''}. Drink about ${int(sweat * 16)}–${int(sweat * 24)} oz over the next few hours to replace it.</span></li>`);
  if (num(yd.night) && num(w.morning)) out.push(`<li><b>Overnight: ${sgn(num(w.morning) - num(yd.night))} lb</b><span>Last night ${lb1(yd.night)} → this morning ${lb1(w.morning)} (breathing, sweat and the bathroom).</span></li>`);
  if (num(yd.morning) && num(w.morning)) out.push(`<li><b>Since yesterday morning: ${sgn(num(w.morning) - num(yd.morning))} lb</b><span>Day-to-day changes are mostly water and food still in your gut.</span></li>`);
  if (num(w.morning) && num(w.night)) out.push(`<li><b>Morning to night: ${sgn(num(w.night) - num(w.morning))} lb</b><span>Food and drink you’re carrying; most of it is gone by morning.</span></li>`);
  return `<div class="card sec"><div class="sec-head"><h3 class="h">Weigh-ins</h3><button type="button" class="linkbtn" data-action="sp-setup">Change</button></div>
    <div class="wrows">${rows}</div>
    ${out.length ? `<ul class="wnotes">${out.join('')}</ul>` : '<p class="fine">Same scale, same clothes (or none). Towel off after practice. Each box saves when you leave it.</p>'}</div>`;
}
function practiceHTML(date){
  const pr = S.days[date]?.practice || {};
  const load = num(pr.rpe) * num(pr.minutes);
  const lvl = load < 300 ? 'light' : load < 600 ? 'moderate' : load < 900 ? 'hard' : 'very hard';
  return `<div class="card sec"><h3 class="h">Practice</h3>
    <div class="chips">${PKINDS.map(([k, l]) => `<button type="button" class="chip" data-action="sp-kind" data-k="${k}" aria-pressed="${pr.kind === k}">${l}</button>`).join('')}</div>
    ${pr.kind === 'rest' ? '<p class="fine">Rest day logged.</p>' : `<div class="grid2"><div class="field"><label for="pr-min">Minutes</label><input type="number" id="pr-min" inputmode="numeric" min="0" data-pr="minutes" data-date="${date}" value="${esc(pr.minutes || '')}" placeholder="—"></div>
      <div class="field"><label for="pr-fl">Drank during</label><div class="unit"><input type="number" id="pr-fl" inputmode="decimal" min="0" data-pr="fluidsOz" data-date="${date}" value="${esc(pr.fluidsOz || '')}" placeholder="—"><em>oz</em></div></div></div>
    <div class="lbl">How hard was it? <span class="hint">1 easy, 10 hardest ever</span></div>
    <div class="scale10">${Array.from({length:10}, (_, i) => `<button type="button" data-action="sp-rpe" data-v="${i + 1}" aria-pressed="${num(pr.rpe) === i + 1}">${i + 1}</button>`).join('')}</div>
    ${load ? `<p class="fine tnum">Training load ${int(load)} (${lvl}): effort × minutes. Used for week comparisons and the carb part of the water-weight estimate.</p>` : ''}
    ${pr.hr ? hrSummaryHTML(pr.hr) : ''}`}</div>`;
}
function hrSummaryHTML(h){
  const tot = h.zones.reduce((a, z) => a + z, 0) || 1;
  return `<div class="sec"><div class="kv tnum"><div><span>Avg heart rate</span><b>${h.avg} bpm</b></div><div><span>Max</span><b>${h.max} bpm</b></div></div>
    <div class="zones" aria-hidden="true">${h.zones.map((z, i) => `<i class="z${i + 1}" style="flex:${z / tot}"></i>`).join('')}</div>
    <p class="fine tnum">Time in zones: ${h.zones.map((z, i) => `Z${i + 1} ${dec(z)} min`).join(' · ')}. Zones use an estimated max of ${h.hrMax} bpm for your age.</p></div>`;
}
const WATCH_HELP = `<details class="help"><summary>Which watches and straps work?</summary><ul>
  <li><b>Heart-rate chest straps and armbands</b> (Polar, Garmin, Wahoo, Coospo and most others) connect directly.</li>
  <li><b>Galaxy Watch or Pixel Watch:</b> install a heart-rate broadcast app on the watch (search the watch’s Play Store for “heart rate broadcast”), start it, then tap Connect.</li>
  <li><b>Apple Watch:</b> needs an iPhone app that rebroadcasts heart rate, and Safari on iPhone can’t connect to Bluetooth, so it won’t work with this web version.</li>
  <li><b>Steps, workouts and sleep:</b> import them from Samsung Health below. Automatic syncing with Samsung Health, Health Connect or Apple Health needs an app-store version of the app.</li></ul></details>`;
function hrHTML(){
  const h = S.hr;
  if (!('bluetooth' in navigator)) return `<div class="card sec"><h3 class="h">Heart rate</h3><p class="fine">This browser can’t connect to Bluetooth heart-rate devices. Chrome on Android can.</p>${WATCH_HELP}</div>`;
  if (!h.conn) return `<div class="card sec"><h3 class="h">Heart rate</h3>
    <p class="fine">Connect a heart-rate strap or a watch that broadcasts heart rate, then record practice to see time in each heart-rate zone. It isn’t used for calorie burn.</p>
    ${h.err ? `<p class="err">${esc(h.err)}</p>` : ''}
    <button type="button" class="btn ghost" data-action="hr-connect">Connect heart-rate device</button>${WATCH_HELP}</div>`;
  const max = hrMax(S.profile.age), z = h.bpm ? zoneOf(h.bpm, max) : 0;
  return `<div class="card sec"><div class="sec-head"><h3 class="h">Heart rate · ${esc(h.name)}</h3><button type="button" class="linkbtn" data-action="hr-disconnect">Disconnect</button></div>
    <div class="hrlive"><b class="tnum" id="hr-bpm">${h.bpm || '—'}</b><span>bpm</span><em id="hr-zone" class="z${z}">${z ? 'Zone ' + z : ''}</em></div>
    ${h.rec ? `<p class="fine tnum">Recording · <span id="hr-time">${fmtDur(Date.now() - h.start)}</span></p><button type="button" class="btn primary" data-action="hr-stop">Stop and save to practice</button>`
      : `<button type="button" class="btn primary" data-action="hr-start">Start recording</button>`}
    <p class="fine">Keep this screen open while recording. Phones pause Bluetooth for web apps in the background.</p></div>`;
}
function activityHTML(date){
  const a = S.days[date]?.activity || {};
  return `<div class="card sec"><div class="sec-head"><h3 class="h">Activity</h3>${a.src ? `<span class="sub">from ${esc(a.src)}</span>` : ''}</div>
    <div class="grid2"><div class="field"><label for="act-steps">Steps</label><input type="number" id="act-steps" inputmode="numeric" min="0" data-act="steps" data-date="${date}" value="${esc(a.steps || '')}" placeholder="—"></div>
      <div class="field"><label for="act-sleep">Sleep</label><div class="unit"><input type="number" id="act-sleep" inputmode="decimal" step="0.25" min="0" max="16" data-act="sleepH" data-date="${date}" value="${esc(a.sleepH || '')}" placeholder="—"><em>h</em></div></div></div>
    ${(a.exercise || []).length ? `<ul class="wnotes">${a.exercise.map(x => `<li><b>${esc(x.type)} · ${int(x.minutes)} min</b><span>${[x.avgHR && `avg HR ${int(x.avgHR)}`, x.maxHR && `max ${int(x.maxHR)}`].filter(Boolean).join(' · ') || 'from your watch'}</span></li>`).join('')}</ul>` : ''}
    <button type="button" class="btn ghost" data-action="health-import">Import from Samsung Health</button>
    ${S.sp.importMsg ? `<p class="notice">${esc(S.sp.importMsg)}</p>` : ''}
    <details class="help"><summary>How to export from Samsung Health</summary><p class="fine">In Samsung Health, open Settings and choose <b>Download personal data</b>. It saves CSV files on your phone, in a Samsung Health folder inside Downloads. Tap Import here and pick the step, exercise, sleep and weight files (or a zip of the folder). Your Galaxy Watch data is included because it syncs to Samsung Health. Watch calories aren’t used for your food targets.</p></details></div>`;
}

/* check-ins */
function ciQuestions(){
  const cfg = sportCfg(), day = S.days[S.sp.date] || {};
  const done = new Set((day.checkins || []).flatMap(c => Object.keys(c.answers || {})));
  const qs = cfg.questions.filter(k => QUESTIONS[k] && !(QUESTIONS[k].morning && done.has(k))).map(k => ({k, ...QUESTIONS[k]}));
  for (const c of cfg.custom) qs.push({k:c.id, q:c.q, type:c.type, low:'Low', high:'High'});
  return qs;
}
function qHTML(q){
  const v = S.sp.ci[q.k];
  if (q.type === 'scale') return `<div class="ciq"><b>${esc(q.q)}</b><div class="scale10">${Array.from({length:10}, (_, i) => `<button type="button" data-action="ci-ans" data-k="${esc(q.k)}" data-v="${i + 1}" aria-pressed="${v === i + 1}">${i + 1}</button>`).join('')}</div><div class="ends"><span>${esc(q.low || '')}</span><span>${esc(q.high || '')}</span></div></div>`;
  if (q.type === 'color') return `<div class="ciq"><b>${esc(q.q)}</b><div class="swatches">${URINE.map((c, i) => `<button type="button" data-action="ci-ans" data-k="${q.k}" data-v="${i + 1}" aria-pressed="${v === i + 1}" style="--sw:${c}" aria-label="Shade ${i + 1} of 8"></button>`).join('')}</div><div class="ends"><span>Pale: well hydrated</span><span>Dark: drink more</span></div></div>`;
  if (q.type === 'count') return `<div class="ciq row"><b>${esc(q.q)}</b><div class="stepper"><button type="button" data-action="ci-step" data-k="${esc(q.k)}" data-d="-1" aria-label="Fewer">−</button><span class="tnum">${v ?? 0}</span><button type="button" data-action="ci-step" data-k="${esc(q.k)}" data-d="1" aria-label="More">+</button></div></div>`;
  if (q.type === 'hours') return `<div class="ciq row"><b>${esc(q.q)}</b><div class="unit hours"><input type="number" inputmode="decimal" step="0.25" min="0" max="16" data-ci-hours="${q.k}" value="${esc(v ?? '')}" aria-label="${esc(q.q)}"><em>h</em></div></div>`;
  return `<div class="ciq row"><b>${esc(q.q)}</b><div class="chips">${[[1, 'Yes'], [0, 'No']].map(([x, l]) => `<button type="button" class="chip" data-action="ci-ans" data-k="${esc(q.k)}" data-v="${x}" aria-pressed="${v === x}">${l}</button>`).join('')}</div></div>`;
}
function ciSummary(a){
  const cfg = sportCfg(), out = [];
  for (const [k, v] of Object.entries(a || {})){
    const Q = QUESTIONS[k], C = cfg.custom.find(c => c.id === k), type = Q?.type || C?.type;
    out.push(`${Q ? QSHORT[k] : C ? C.q : 'Removed question'} ${type === 'yesno' ? (v ? 'yes' : 'no') : type === 'hours' ? v + ' h' : type === 'color' ? v + '/8' : v}`);
  }
  return out.join(' · ');
}
function checkinHTML(){
  const date = S.sp.date, list = S.days[date]?.checkins || [], qs = ciQuestions();
  return `<div class="card sec"><div class="sec-head"><h3 class="h">Check in</h3><span class="sub">${date === dayKey() ? esc(timeOf(new Date())) : esc(shortDay(date))}</span></div>
    <p class="fine">About 20 seconds. Do it when you wake up, before and after practice, and before bed. Skip anything that doesn’t apply.</p>
    ${qs.length ? qs.map(qHTML).join('') : '<p class="fine">No questions turned on.</p>'}
    <button type="button" class="btn primary" data-action="ci-save">Save check-in</button>
    <button type="button" class="linkbtn" data-action="sp-setup">Change questions</button></div>
    ${list.length ? `<div class="sec"><h3 class="h">${date === dayKey() ? 'Today' : 'That day'}: ${list.length} check-in${list.length > 1 ? 's' : ''}</h3><ul class="cilist card">${list.map((c, i) => `<li><span><b>${esc(timeOf(c.t))}</b><small>${esc(ciSummary(c.answers))}</small></span><button type="button" class="linkbtn" data-action="ci-del" data-i="${i}">${S.sp.ciDel === i ? 'Tap again' : 'Delete'}</button></li>`).join('')}</ul></div>` : ''}`;
}
function saveCheckin(){
  const qs = ciQuestions(), ci = S.sp.ci, ans = {};
  if (!qs.some(q => ci[q.k] != null && ci[q.k] !== '')) { toast('Answer at least one question'); return; }
  for (const q of qs){ const v = ci[q.k]; if (v != null && v !== '') ans[q.k] = Number(v); else if (q.type === 'count') ans[q.k] = 0; }
  const d = dayOf(S.sp.date); (d.checkins ||= []).push({t:new Date().toISOString(), answers:ans});
  saveDay(S.sp.date); store.persist(); S.sp.ci = {}; renderSports(); toast('Check-in saved');
}

/* history */
function weightChart(end){
  const pts = [];
  for (let i = 41; i >= 0; i--){ const k = shift(end, -i), v = num(S.days[k]?.weights?.morning); if (v) pts.push({i:41 - i, v}); }
  if (pts.length < 2) return '<p class="fine">Log morning weights for a few days to see your trend here.</p>';
  const trend = []; let tr = pts[0].v; for (const p of pts){ tr = tr + 0.15 * (p.v - tr); trend.push(tr); }
  const cls = isWeightClass() ? num(sportCfg().weightClass) : 0;
  const vals = pts.map(p => p.v).concat(trend, cls ? [cls] : []);
  const lo = Math.min(...vals) - 0.5, hi = Math.max(...vals) + 0.5;
  const X = i => 10 + i / 41 * 300, Y = v => 10 + (hi - v) / (hi - lo) * 100;
  return `<div class="card sec"><div class="sec-head"><h3 class="h">Morning weight · 6 weeks</h3><span class="sub tnum">trend ${lb1(trend[trend.length - 1])} lb</span></div>
    <svg class="wchart" viewBox="0 0 320 120" role="img" aria-label="Morning weight over the last 6 weeks">
      ${cls ? `<line x1="10" x2="310" y1="${Y(cls).toFixed(1)}" y2="${Y(cls).toFixed(1)}" class="cls"/><text x="310" y="${(Y(cls) - 4).toFixed(1)}" text-anchor="end" class="cls">${int(cls)} class</text>` : ''}
      <polyline class="trend" points="${pts.map((p, j) => `${X(p.i).toFixed(1)},${Y(trend[j]).toFixed(1)}`).join(' ')}"/>
      ${pts.map(p => `<circle cx="${X(p.i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="2.6"/>`).join('')}
    </svg><p class="fine">Dots are morning weigh-ins; the line is your trend with water swings smoothed out.</p></div>`;
}
function historyHTML(){
  const end = S.sp.date, T = totalsMemo();
  const rows = Array.from({length:14}, (_, i) => shift(end, -i)).map(k => { const m = dayMetrics(S.days[k], T(k)); return {k, m, f:feelScore(m)}; });
  return `${weightChart(end)}<div class="card"><div class="tblwrap"><table class="hist tnum"><thead><tr><th>Day</th><th>AM lb</th><th>Water</th><th>kcal</th><th>Prot</th><th>Sweat</th><th>Load</th><th>Feel</th></tr></thead>
    <tbody>${rows.map(({k, m, f}) => `<tr><td>${esc(toDate(k).toLocaleDateString(undefined, {weekday:'short', day:'numeric'}))}</td><td>${m.morning ? lb1(m.morning) : '—'}</td><td>${m.water ? int(m.water) : '—'}</td><td>${m.logged ? int(m.kcal) : '—'}</td><td>${m.logged ? int(m.protein) : '—'}</td><td>${m.sweat != null ? lb1(m.sweat) : '—'}</td><td>${m.load ? int(m.load) : '—'}</td><td>${f != null ? f.toFixed(1) : '—'}</td></tr>`).join('')}</tbody></table></div></div>
    <p class="fine">Water in oz, sweat in lb. Feel score (1–10) averages energy, mood, sleep quality, focus and practice rating (counted twice), with soreness and stress counted in reverse.</p>`;
}

/* week comparison and pins */
function weekStatsOf(start, T = totalsMemo()){
  return weekStats(Array.from({length:7}, (_, i) => { const k = addDays(start, i); return {date:k, m:dayMetrics(S.days[k], T(k))}; }));
}
const pins = () => (S.profile.pins ||= []);
function togglePin(start){
  const P = pins(), i = P.findIndex(p => p.start === start);
  if (i >= 0) { P.splice(i, 1); toast('Unpinned'); }
  else { P.unshift({start, label:`Week of ${shortDay(start)}`, at:Date.now(), snap:weekStatsOf(start)}); S.sp.cmpA = 'pin:' + start; toast('Pinned. Compare it any time in Sports → Compare.'); }
  saveProfile();
}
function compareHTML(){
  const cur = weekStart(dayKey()), T = totalsMemo(), P = pins();
  const weeks = Array.from({length:10}, (_, i) => addDays(cur, -7 * i)).map(s => ({start:s, st:weekStatsOf(s, T)}))
    .filter(w => w.start === cur || w.st.logged || w.st.checkins || w.st.morning != null || w.st.water != null);
  const scored = weeks.filter(w => w.st.feel != null && w.st.checkins >= 3);
  const best = scored.length > 1 ? scored.reduce((a, b) => b.st.feel > a.st.feel ? b : a) : null;
  const opts = [...P.map(p => ({key:'pin:' + p.start, label:`★ ${p.label}`})), ...weeks.map(w => ({key:'wk:' + w.start, label:wkLabel(w.start)}))];
  const A = opts.some(o => o.key === S.sp.cmpA) ? S.sp.cmpA : P[0] ? 'pin:' + P[0].start : best && best.start !== cur ? 'wk:' + best.start : (opts.find(o => o.key !== 'wk:' + cur) || {}).key;
  const B = opts.some(o => o.key === S.sp.cmpB) ? S.sp.cmpB : 'wk:' + cur;
  const statOf = key => { if (!key) return null; const s = key.slice(key.indexOf(':') + 1), live = weekStatsOf(s, T), pin = key.startsWith('pin:') && P.find(p => p.start === s); return pin && !live.logged && !live.checkins && live.morning == null ? pin.snap : live; };
  const a = statOf(A), b = statOf(B);
  const sel = (id, v) => `<select id="${id}" aria-label="${id === 'cmp-a' ? 'Week you want to repeat' : 'Week to compare'}">${opts.map(o => `<option value="${esc(o.key)}" ${o.key === v ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  let table = '', recs = '';
  if (a && b && A !== B) {
    const rows = COMPARE_ROWS.filter(([k]) => a[k] != null || b[k] != null).map(([k, label, fmt, dir]) => {
      const x = a[k], y = b[k]; let c = '';
      if (dir && x != null && y != null && Math.abs(y - x) >= 0.3) c = (dir === 'high' ? y > x : dir === 'low' ? y < x : Math.abs(y - 5) < Math.abs(x - 5)) ? 'up' : 'down';
      return `<tr><td>${label}</td><td>${x != null ? fmt(x) : '—'}</td><td class="${c}">${y != null ? fmt(y) : '—'}</td></tr>`; }).join('');
    table = rows ? `<div class="card"><div class="tblwrap"><table class="hist tnum cmp"><thead><tr><th></th><th>Repeat</th><th>Compare</th></tr></thead><tbody>${rows}</tbody></table></div></div>` : '';
    const sug = replicate(a, b);
    recs = `<div class="sec"><h3 class="h">To get back to that week</h3>${sug.length ? `<ul class="tips">${sug.map(s => `<li><b>${esc(s.text)}</b></li>`).join('')}</ul>` : '<p class="fine">Your food, water, sleep and training already look like that week. Keep it going.</p>'}
      ${a.feel != null && b.feel != null ? `<p class="fine">Feel score ${a.feel.toFixed(1)} then vs ${b.feel.toFixed(1)} now. Differences are averages a day; small ones are noise.</p>` : '<p class="fine">Do check-ins most days so the feel score can tell good weeks apart.</p>'}</div>`;
  }
  return `<div class="card sec"><h3 class="h">Compare two weeks</h3>
      <div class="field"><label for="cmp-a">The week you want to repeat</label>${sel('cmp-a', A)}</div>
      <div class="field"><label for="cmp-b">Compared with</label>${sel('cmp-b', B)}</div>
      ${A === B ? '<p class="fine">Pick two different weeks.</p>' : ''}</div>
    ${table}${recs}
    ${P.length ? `<div class="sec"><h3 class="h">Pinned weeks</h3><ul class="cilist card">${P.map(p => `<li><span class="grow"><input type="text" class="pinname" data-pin="${esc(p.start)}" value="${esc(p.label)}" maxlength="40" aria-label="Name for this pinned week"><small>${esc(rangeText(p.start))}${p.snap?.feel != null ? ` · feel ${p.snap.feel.toFixed(1)}` : ''}</small></span><button type="button" class="linkbtn" data-action="pin-week" data-start="${esc(p.start)}">Unpin</button></li>`).join('')}</ul></div>` : ''}
    <div class="sec"><h3 class="h">Your weeks</h3><ul class="cilist card">${weeks.map(w => { const pinned = P.some(p => p.start === w.start);
      return `<li><span><b>${esc(wkLabel(w.start))}${best && best.start === w.start ? ' <span class="badge">best feel</span>' : ''}</b><small>${w.st.feel != null ? `feel ${w.st.feel.toFixed(1)} · ` : ''}${w.st.logged} day${w.st.logged === 1 ? '' : 's'} logged · ${w.st.checkins} check-in${w.st.checkins === 1 ? '' : 's'}${w.st.weightChange != null ? ` · ${sgn(w.st.weightChange)} lb` : ''}</small></span>
        <button type="button" class="btn ${pinned ? 'primary' : 'ghost'} sm" data-action="pin-week" data-start="${w.start}" aria-pressed="${pinned}">${pinned ? '★ Pinned' : 'Pin'}</button></li>`; }).join('')}</ul>
      <p class="fine">Felt great one week? Pin it. It stays here (and on the Week tab) so you can always compare against it and see what to repeat.</p></div>`;
}

/* heart rate over Bluetooth */
let hrTick = 0, wakeLock = null;
const fmtDur = ms => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return `${h ? h + ':' : ''}${h ? String(m).padStart(2, '0') : m}:${String(s % 60).padStart(2, '0')}`; };
async function hrConnect(){
  S.hr.err = '';
  try {
    const c = await connectHR(onBpm, () => { const wasRec = S.hr.rec; S.hr.conn = null; S.hr.bpm = 0; if (wasRec) hrStop(); if (S.tab === 'sports') renderSports(); toast('Heart-rate device disconnected'); });
    S.hr.conn = c; S.hr.name = c.name;
  } catch (e) {
    if (!(e && e.name === 'NotFoundError')) S.hr.err = e && e.message === 'nobt' ? 'Bluetooth isn’t available in this browser.' : 'Couldn’t connect. Check that Bluetooth is on, the strap is on your chest (they sleep when dry) or the watch app is broadcasting.';
  }
  if (S.tab === 'sports') renderSports();
}
function onBpm(bpm){
  const h = S.hr; h.bpm = bpm;
  if (h.rec) h.samples.push({t:Date.now(), bpm});
  const el = $('#hr-bpm');
  if (el) { el.textContent = bpm; const z = zoneOf(bpm, hrMax(S.profile.age)), ze = $('#hr-zone'); if (ze) { ze.textContent = 'Zone ' + z; ze.className = 'z' + z; } }
}
async function hrStart(){
  Object.assign(S.hr, {rec:true, samples:[], start:Date.now(), date:S.sp.date});
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
  clearInterval(hrTick); hrTick = setInterval(() => { const el = $('#hr-time'); if (el) el.textContent = fmtDur(Date.now() - S.hr.start); }, 1000);
  renderSports();
}
function hrStop(){
  const h = S.hr; clearInterval(hrTick); try { wakeLock?.release(); } catch {} wakeLock = null;
  h.rec = false;
  const sum = summarizeHR(h.samples, S.profile.age);
  if (sum && sum.minutes >= 1) {
    const d = dayOf(h.date || S.sp.date); d.practice ||= {};
    d.practice.hr = sum; if (!num(d.practice.minutes)) d.practice.minutes = sum.minutes; if (!d.practice.kind) d.practice.kind = 'practice';
    saveDay(d.date); toast(`Saved ${sum.minutes} min · average ${sum.avg} bpm`);
  } else toast('Recorded less than a minute, so nothing was saved');
  h.samples = []; if (S.tab === 'sports') renderSports();
}

/* Samsung Health export import */
async function healthImport(files){
  if (!files.length) return;
  S.sp.importMsg = 'Reading your files…'; renderSports();
  try {
    const {importSamsung} = await import('./healthimport.js');
    const {days} = await importSamsung(files);
    let n = 0; const c = {steps:0, ex:0, sleep:0, wt:0};
    for (const [k, v] of Object.entries(days)){
      if (!(v.steps || v.exercise.length || v.sleepH || v.weightLb)) continue;
      const d = dayOf(k), a = (d.activity ||= {});
      if (v.steps) { a.steps = v.steps; c.steps++; }
      if (v.activeMin) a.activeMin = v.activeMin;
      if (v.exercise.length) { a.exercise = v.exercise; c.ex++; }
      if (v.sleepH) { a.sleepH = v.sleepH; c.sleep++; }
      a.src = 'Samsung Health';
      if (v.weightLb && !num(d.weights?.morning)) { (d.weights ||= {}).morning = v.weightLb; c.wt++; }
      saveDay(k); n++;
    }
    S.sp.importMsg = n ? `Imported ${n} day${n === 1 ? '' : 's'}: steps on ${c.steps}, workouts on ${c.ex}, sleep on ${c.sleep}${c.wt ? `, weight on ${c.wt}` : ''}.` : 'No steps, workouts, sleep or weight found in those files. Pick the CSV files from the Samsung Health export folder.';
  } catch (e) { console.error(e); S.sp.importMsg = 'Couldn’t read those files. Pick the CSV files (or a zip) from the Samsung Health export.'; }
  renderSports();
}

/* ---------- shared item builders ---------- */
// a plate item from per-100 g numbers with an optional serving size
function servingItem({src, code, name, sub, p, servingG, servingD}, grams, portionText){
  const opts = [];
  if (portionText && grams) opts.push({t:portionText, g:grams});
  if (servingG) opts.push({t:tidy(servingD) || '1 serving', g:servingG});
  opts.push({t:'1 oz', g:28.35}, {t:'100 g', g:100}, {t:'grams', g:1});
  const seen = new Set(), uniq = opts.filter(o => { const k = o.t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  let opt = 0, qty = 1;
  if (!portionText && grams) {
    if (servingG && Math.abs(grams / servingG - Math.round(grams / servingG * 4) / 4) < 0.01) qty = Math.round(grams / servingG * 4) / 4;
    else { opt = uniq.length - 1; qty = Math.round(grams); }
  }
  return {id:uid(), src, code, name, sub, p, opts:uniq, opt, qty};
}
function itemsFromParsed(r){
  const out = [], single = r.items.length === 1;
  for (const i of r.items){
    const it = usdaItem(i.ndb, i.g, single ? (r.label ? cap(r.label) : shortName(r.name)) : null, single ? r.portion : `${dec(i.g)} g`);
    if (!it) continue;
    if (r.label) it.label = r.label;
    if (!single) it.group = r.label || r.name;
    out.push(it);
  }
  return out;
}
// "200 g", "2 bars", "1.5 servings", "6 oz", "1 cup" anywhere in a phrase -> grams for this food
const MASS_G = {g:1, gram:1, grams:1, kg:1000, oz:28.35, ounce:28.35, ounces:28.35, lb:453.6, lbs:453.6, pound:453.6, pounds:453.6, ml:1};
const FR = {'½':0.5, '¼':0.25, '¾':0.75, half:0.5, a:1, an:1, one:1, two:2, three:3, four:4};
function amountIn(text, food){
  const s = ` ${String(text).toLowerCase()} `;
  let m = s.match(/(\d+(?:\.\d+)?|½|¼|¾)\s*(kg|grams?|g|ounces?|oz|lbs?|pounds?|ml)\b/);
  if (m) return {g:(FR[m[1]] ?? Number(m[1])) * MASS_G[m[2]], text:`${m[1]} ${m[2]}`};
  m = s.match(/(\d+(?:\.\d+)?|½|¼|¾|half|an?|one|two|three|four)\s+(cups?|tbsp|tablespoons?|tsp|teaspoons?)\b/);
  if (m) {
    const q = FR[m[1]] ?? Number(m[1]), u = m[2];
    const row = food && food.ndb ? BYID.get(food.ndb) : null;
    const per = row ? gramsFromMeasure(row, u) : null;
    const ml = /^c/.test(u) ? 240 : /^(tbsp|table)/.test(u) ? 15 : 5;
    return {g:q * (per || ml), text:`${m[1]} ${u}`};
  }
  m = s.match(/(\d+(?:\.\d+)?|½|¼|¾|half|an?|one|two|three|four)\s+(servings?|bars?|pieces?|cans?|containers?|packets?|packs?|bottles?|scoops?|slices?|pouches?|bags?|cartons?|cups?|eggs?|links?|patty|patties|items?)\b/);
  if (m) return {g:(FR[m[1]] ?? Number(m[1])) * (food?.unitG || food?.servingG || 100), count:FR[m[1]] ?? Number(m[1]), text:`${m[1]} ${m[2]}`};
  m = s.match(/^\s*(\d+(?:\.\d+)?|½|¼|¾)\s+[a-z]/);
  if (m) return {g:(FR[m[1]] ?? Number(m[1])) * (food?.unitG || food?.servingG || 100), count:FR[m[1]] ?? Number(m[1]), text:m[1]};
  return null;
}
const nameWords = s => tokens(String(s).replace(/\d+(\.\d+)?|½|¼|¾/g, ' ')).filter(t => !/^(g|gram|kg|oz|ounc|ounce|lb|lbs|pound|ml|cup|tbsp|tsp|serving|bar|piec|piece|can|contain|container|packet|pack|bottl|bottle|scoop|slice|pouch|bag|carton|item|of|the|my|a|an|and|half)$/.test(t));
function bestByName(name, list, nameOf){
  const q = nameWords(name); if (!q.length) return null;
  let best = null, bs = 0;
  for (const f of list){
    const ft = tokens(nameOf(f)), own = tokens(f.name || '');
    const hit = q.filter(t => ft.some(x => x === t || (t.length >= 4 && x.length >= 4 && (x.startsWith(t) || t.startsWith(x))))).length;
    const sc = hit / q.length + 0.2 * Math.min(1, hit / Math.max(1, own.length));
    if (sc > bs) { bs = sc; best = f; }
  }
  return bs >= 0.6 ? {food:best, score:bs} : null;
}

/* ---------- "(pantry)" tag: use the exact item already in your pantry ---------- */
const PANTRY_TAG = /\s*(\(\s*(in\s+(my\s+)?)?pantry(\s+item)?\s*\)|\b(in|from)\s+(my\s+)?pantry\b|\bpantry\s+item\b|\bpantry\b)\s*\.?\s*$/i;
const pantryTagged = seg => PANTRY_TAG.test(seg) ? seg.replace(PANTRY_TAG, '').trim() : null;
function pantryItemFor(text){
  const hit = bestByName(text, S.pantry, f => `${f.name} ${f.full || ''}`);
  if (!hit) return null;
  const f = hit.food, amt = amountIn(text, f);
  const grams = amt ? amt.g : (f.unitG || 100);
  const label = amt ? amt.text : (f.unitG ? (f.unitD || '1 serving') : '100 g');
  let it;
  if (f.src === 'usda' && f.ndb) it = usdaItem(f.ndb, grams, f.name, amt && !amt.count ? `${label}` : (amt && amt.count ? `${dec(amt.count)} × ${f.unitD || 'serving'}` : label));
  else it = servingItem({src:f.src, code:f.code, name:f.name, sub:'From your pantry', p:f.p, servingG:f.unitG, servingD:f.unitD}, grams);
  if (it) it.sub = 'From your pantry' + (it.sub && it.src === 'usda' ? ' · ' + it.sub : '');
  return it;
}

/* ---------- My foods (saved from nutrition labels and online results) ---------- */
function saveMyFoods(){ store.put('myfoods', S.myFoods); }
function myFoodFor(text){
  const hit = bestByName(text, S.myFoods, f => `${f.brand || ''} ${f.name}`);
  if (!hit || hit.score < 0.75) return null;
  // a saved food only stands in when most of its name was typed, or every typed word (two or more) is in it
  const q = nameWords(text), own = tokens(`${hit.food.brand || ''} ${hit.food.name}`).filter(t => !/^(and|the|of|with)$/.test(t));
  const hits = q.filter(t => own.some(x => x === t || (t.length >= 4 && x.length >= 4 && (x.startsWith(t) || t.startsWith(x))))).length;
  if (!(hits / Math.max(1, own.length) >= 0.5 || (q.length >= 2 && hits === q.length))) return null;
  const f = hit.food, amt = amountIn(text, f);
  return servingItem({src:'custom', name:f.name, sub:f.brand ? `${f.brand} · My foods` : 'My foods', p:f.p, servingG:f.servingG, servingD:f.servingD}, amt ? amt.g : (f.servingG || 100));
}
function addMyFood(f){
  const key = `${(f.brand || '').toLowerCase()}|${f.name.toLowerCase()}`;
  S.myFoods = S.myFoods.filter(x => `${(x.brand || '').toLowerCase()}|${x.name.toLowerCase()}` !== key);
  S.myFoods.unshift({...f, id:f.id || 'my' + uid().slice(1), created:Date.now()});
  S.myFoods = S.myFoods.slice(0, 300); saveMyFoods();
}

/* ---------- restaurant items in typed text: "large fries from mcdonalds", "10 piece mcnuggets" ---------- */
// named: the restaurant is named in the same text; otherwise it only comes from the photo, so demand a closer match
function chainItemFor(seg, chain, named = false){
  if (!chain) return null;
  const words = stripChainName(seg, chain);
  if (!nameWords(words).length) return null;
  const ranked = rankMenu(menuFor(chain.key), {words}).filter(x => x.role !== 'part');
  const top = ranked[0];
  if (!top || top.score < (named ? 0.9 : 1.6)) return null;
  return menuPlateItem(top, portionPick(top, seg));
}
function portionPick(it, text){
  const po = portionsOf(it), s = String(text || '').toLowerCase();
  const n = s.match(/(\d+)\s*(-|\s)?\s*(pc|piece|pieces|count|ct|nuggets?|strips?|slices?|wings?|tacos?)\b/) || (it.counts ? s.match(/^\s*(\d+)\b/) : null);
  if (n && it.counts) { const want = Number(n[1]); let bi = 0; po.forEach((p, i) => { if (Math.abs(parseInt(p.t) - want) < Math.abs(parseInt(po[bi].t) - want)) bi = i; }); return bi; }
  for (const w of ['large', 'medium', 'small', '12 inch', 'footlong', '6 inch', 'kid']) if (s.includes(w)) { const i = po.findIndex(p => p.t.toLowerCase().includes(w === 'footlong' ? '12 inch' : w)); if (i >= 0) return i; }
  if (it.counts && it.counts.choices.includes(6) && /mcnugget|nugget/i.test(it.full)) return po.findIndex(p => parseInt(p.t) === 6);
  return 0;
}
function menuPlateItem(it, i = 0){
  const po = portionsOf(it)[i] || portionsOf(it)[0];
  const chain = it.chain ? CHAIN_BY[it.chain] : null;
  if (it.ai) return servingItem({src:'ai', name:it.name, sub:`${chain ? chain.name : it.place ? it.place : 'Menu'} · Gemini · ${SRC_WORD[it.src] || 'estimate'}`, p:it.p, servingG:po.g, servingD:po.t}, po.g, po.t);
  const pi = usdaItem(it.ndb, po.g, it.name, po.t);
  if (!pi) return null;
  pi.sub = chain && !it.generic ? `${chain.name} · USDA` : it.estimated ? `Estimated from ${it.basedOn}` : 'Typical version · USDA';
  pi.label = null;
  return pi;
}

/* ---------- typed brand foods -> online lookup ---------- */
async function lookupOnline(seg){
  const q = seg.replace(/(\d+(\.\d+)?|½|¼|¾)\s*(kg|grams?|g|ounces?|oz|lbs?|ml|servings?|bars?|pieces?|cans?|bottles?|packs?|scoops?|cups?)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const {items} = await searchOnline(q, {fdcKey:settings().fdcKey || ''});
  return {q, items};
}
function onlinePlateItem(r, text){
  const amt = text ? amountIn(text, r) : null;
  return servingItem({src:r.src === 'fdc' ? 'fdc' : 'off', code:r.code, name:r.brand && !r.name.toLowerCase().includes(r.brand.toLowerCase()) ? `${r.brand} ${r.name}` : r.name,
    sub:r.src === 'fdc' ? 'USDA FoodData Central' : 'Open Food Facts', p:r.p, servingG:r.servingG, servingD:r.servingD}, amt ? amt.g : (r.servingG || 100));
}

/* ---------- photo details: words that refine what the camera saw ---------- */
const PORTION_ONLY = /^\s*((about|around|like|roughly)\s+)?(\d+(\.\d+)?|½|¼|¾|half|a half|quarter|double|triple|x\s?\d|\d\s?x)\s*(oz|ounces?|g|grams?|lbs?|kg|cups?|tbsp|tsp|slices?|pieces?|servings?|bowls?|plates?|portions?)?\s*$|^\s*(small|medium|large|extra large|kids?|half|double)( size| portion| serving)?\s*$/i;
const normPortion = p => String(p).trim().toLowerCase().replace(/^(about|around|like|roughly)\s+/, '').replace(/^(a )?half\b/, '0.5').replace(/^quarter\b/, '0.25').replace(/^double\b/, '2').replace(/^triple\b/, '3').replace(/^x\s?(\d)/, '$1').replace(/^(\d)\s?x$/, '$1');
function analyzeDesc(text){
  const out = {plate:[], missing:[], portion:null, hint:[], brandSegs:[], notes:[]};
  const named = detectChain(text), chain = named || (S.rest.chain ? CHAIN_BY[S.rest.chain] : null);
  out.chain = named;
  // a package in the photo: the words describe it (flavor, size), so they steer the label search instead of adding foods
  const ocr = S.pk.res?.text || '';
  const pkgCtx = !!(S.photo && !named && (S.pk.res?.items?.length || brandOf(ocr)));
  const ocrT = new Set(tokens(ocr));
  for (const chunk of String(text).split(/[,;\n]+/).map(x => x.trim()).filter(Boolean)){
    const pt = pantryTagged(chunk);
    if (pt != null) {
      const it = pantryItemFor(pt);
      if (it) { out.plate.push(it); out.notes.push(`${it.name} from your pantry`); } else out.missing.push(`${pt} (no pantry match)`);
      continue;
    }
    if (pkgCtx) {
      if (PORTION_ONLY.test(chunk)) { out.portion = chunk; continue; }
      const r = /^\s*(\d|½|¼|¾|an?\s)/.test(chunk) ? parseSegment(chunk, INDEX, BYID) : null;
      if (r && !r.missing && !nameWords(chunk).some(t => ocrT.has(t))) { const its = itemsFromParsed(r); out.plate.push(...its); out.notes.push(its.map(i => i.name).join(', ')); }
      else out.hint.push(chunk);
      continue;
    }
    if (!detectChain(chunk)) { const mine = myFoodFor(chunk); if (mine) { out.plate.push(mine); out.notes.push(mine.name); continue; } }
    if (!detectChain(chunk) && brandOf(chunk)) { out.brandSegs.push(chunk); out.hint.push(chunk); continue; }
    for (const seg of splitMeal(chunk)){
      if (PORTION_ONLY.test(seg)) { out.portion = seg; continue; }
      const ci = chainItemFor(seg, chain, !!named);
      if (ci) { out.plate.push(ci); out.notes.push(ci.name); continue; }
      if (chain && !nameWords(stripChainName(seg, chain)).length && detectChain(seg)) continue;   // just "from mcdonalds"
      const mine = myFoodFor(seg);
      if (mine) { out.plate.push(mine); out.notes.push(mine.name); continue; }
      if (brandOf(seg)) { out.brandSegs.push(seg); out.hint.push(seg); continue; }
      const r = parseSegment(seg, INDEX, BYID);
      if (r && !r.missing) { const its = itemsFromParsed(r); out.plate.push(...its); out.notes.push(its.map(i => i.name).join(', ')); }
      else out.hint.push(seg);
    }
  }
  out.hint = out.hint.join(' ');
  return out;
}
function photoGuessItems(label){
  const por = S.desc.applied?.portion;
  if (por) {
    const r = parseMeal(`${normPortion(por)} ${label}`, INDEX, BYID)[0];
    if (r && !r.missing) { const its = itemsFromParsed(r); if (its.length) return its; }
  }
  return labelItems(label);
}
async function applyDesc(){
  const text = ($('#photo-desc')?.value || '').trim();
  S.desc.text = text;
  if (!text) { S.desc.applied = null; S.desc.online = null; renderPhoto(); if (S.photo && gemOn()) geminiPhoto(); return; }
  // with Gemini, the details go along with the photo; "(pantry)" items still come from your pantry
  if (S.photo && gemOn()) {
    const plate = [], missing = [];
    for (const c of text.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean)){ const pt = pantryTagged(c); if (pt == null) continue; const it = pantryItemFor(pt); if (it) plate.push(it); else missing.push(`${pt} (no pantry match)`); }
    S.desc.applied = {plate, missing, portion:null, hint:gemNote(), brandSegs:[], notes:plate.map(i => `${i.name} from your pantry`), gem:true};
    S.desc.online = null;
    if (plate.length) addToPlate(plate, {quiet:true});
    if (!S.pk.busy) runPackaged();
    geminiPhoto();
    toast(S.desc.applied.hint ? 'Asking Gemini again with your details' : 'Added from your pantry');
    return;
  }
  const a = analyzeDesc(text);
  S.desc.applied = a;
  if (a.plate.length) addToPlate(a.plate, {quiet:true});
  // the photo's label search and restaurant menu both use the typed words
  if (S.photo && a.hint && !S.pk.busy) runPackaged();
  else if (S.photo) updateRestaurant();
  S.desc.online = null;
  if (a.brandSegs.length && (!S.photo || !S.pk.res?.items?.length) && navigator.onLine) {
    S.desc.online = {busy:true, q:a.brandSegs.join(', ')}; renderPhoto();
    try { const r = await lookupOnline(a.brandSegs.join(' ')); S.desc.online = {busy:false, q:r.q, items:r.items.slice(0, 6), seg:a.brandSegs[0]}; }
    catch { S.desc.online = {busy:false, q:a.brandSegs.join(', '), items:[], err:true}; }
  }
  renderPhoto();
  const bits = [a.plate.length ? `added ${a.plate.length} food${a.plate.length === 1 ? '' : 's'} to your plate` : '', a.portion ? `photo picks use “${a.portion}”` : '', a.hint && S.photo ? 'searching the label with your words' : ''].filter(Boolean);
  toast(bits.length ? cap(bits.join(' · ')) : 'Details saved for this photo');
}
function descOutHTML(){
  const a = S.desc.applied, o = S.desc.online;
  if (!a && !o) return '';
  let html = '';
  if (a) {
    const parts = [...a.notes.map(n => `<span>${esc(n)}</span>`), a.portion ? `<span>Portion: ${esc(a.portion)}</span>` : '', a.hint ? `<span>${a.gem ? 'Sent to Gemini with the photo' : 'Label search'}: “${esc(a.hint)}”</span>` : '', ...a.missing.map(m => `<span class="unk">${esc(m)}</span>`)].filter(Boolean);
    if (parts.length) html += `<div class="dietsum">${parts.join('')}</div>`;
  }
  if (o) {
    if (o.busy) html += `<div class="recbox"><span><span class="spin"></span> <b>Looking up “${esc(o.q)}” online…</b></span></div>`;
    else if (o.items && o.items.length) html += `<div class="sec"><div class="sec-head"><h2 class="h">Found online</h2><span class="sub">for “${esc(o.q)}”</span></div><ul class="results">${o.items.map((r, i) => onlineRowHTML(r, i, 'desc')).join('')}</ul></div>`;
    else html += `<p class="notice">${o.err ? 'Couldn’t reach the online databases.' : `Nothing online matched “${esc(o.q)}”.`} <a href="${esc(webSearchURL(o.q))}" target="_blank" rel="noopener">Search the web</a>, then scan the nutrition label under Type.</p>`;
  }
  return html;
}
function onlineRowHTML(r, i, ctx){
  const kcal = r.servingG ? r.p[0] * r.servingG / 100 : r.p[0];
  return `<li><button type="button" data-action="online-add" data-ctx="${ctx}" data-i="${i}"><span><b>${r.src === 'fdc' ? '<span class="tag">USDA label</span>' : '<span class="tag">Open Food Facts</span>'}${esc(r.brand && !r.name.toLowerCase().includes(r.brand.toLowerCase()) ? r.brand + ' ' : '')}${esc(r.name)}</b>
    <small>${esc(r.servingD || '100 g')} · P ${dec(r.p[1] * (r.servingG || 100) / 100)} g · C ${dec(r.p[2] * (r.servingG || 100) / 100)} g · F ${dec(r.p[3] * (r.servingG || 100) / 100)} g</small></span><span class="k tnum">${int(kcal)} kcal</span></button></li>`;
}

/* ---------- restaurant packaging in the photo ---------- */
async function updateRestaurant(){
  const ph = S.photo, R = S.rest;
  const words = [S.pk.res?.text || '', S.desc.text || '', gmWords()].join(' ');
  let chain = R.manual ? CHAIN_BY[R.manual] : detectChain(words), src = R.manual ? 'picked' : chain ? 'text' : '', ask = null;
  if (!chain && ph && !R.no && S.rec.state === 'ready') {
    try {
      if (R.clipFor !== ph) { R.clip = await (await recognizer()).classifyChain(ph.blob); R.clipFor = ph; }
      if (R.clip.key && R.clip.p >= 0.55) { chain = CHAIN_BY[R.clip.key]; src = 'image'; }
      else if (R.clip.key && R.clip.p >= 0.3) ask = R.clip.key;
    } catch (e) { console.error(e); }
  }
  if (S.photo !== ph) return;
  Object.assign(S.rest, {chain:chain && !R.no ? chain.key : null, src, ask:R.no ? null : ask});
  renderPhoto();
}
function menuRowHTML(it, ctx){
  const po = portionsOf(it), sel = Math.max(0, portionPick(it, S.desc.applied?.portion || S.desc.text || ''));
  const n = nutOf(it, po[sel].g);
  return `<li class="guess"><span><b>${esc(it.name)}${it.retired ? ' <em class="old">may be discontinued</em>' : ''}</b><small class="tnum">${int(n.kcal)} kcal · P ${int(n.p)} · C ${int(n.c)} · F ${int(n.f)}${n.na > 1200 ? ` · ${int(n.na)} mg sodium` : ''}</small>
    ${po.length > 1 ? `<select class="alt" data-menu-size="${esc(it.id)}" data-ctx="${ctx}" aria-label="Size">${po.map((p, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(p.t)}</option>`).join('')}</select>` : `<small>${esc(po[0].t)}</small>`}</span>
    <button type="button" class="btn primary sm" data-action="menu-add" data-id="${esc(it.id)}" data-ctx="${ctx}">Add</button></li>`;
}
function restHTML(){
  const R = S.rest; if (!S.photo) return '';
  if (!R.chain) {
    const ask = R.ask && CHAIN_BY[R.ask];
    return ask ? `<div class="recbox"><span><b>From ${esc(ask.name)}?</b><br><span class="sub">The packaging looks like it.</span></span><div class="row2"><button type="button" class="btn primary sm" data-action="rest-yes" data-k="${ask.key}">Yes, show the menu</button><button type="button" class="btn ghost sm" data-action="rest-no">No</button></div></div>`
      : R.open ? `<div class="fix-row restpick"><span class="fine">Which restaurant?</span><select data-rest-pick aria-label="Pick the restaurant"><option value="">Pick…</option>${CHAINS.map(c => `<option value="${c.key}">${esc(c.name)}</option>`).join('')}</select></div>`
      : '';
  }
  const chain = CHAIN_BY[R.chain], menu = menuFor(R.chain);
  const words = [S.pk.res?.text || '', S.desc.text || '', gmWords()].join(' ');
  let list = rankMenu(menu, {words, guesses:S.rec.results || []}).filter(x => x.role !== 'part');
  if (R.filter) { const q = tokens(R.filter); list = list.filter(it => q.every(t => tokens(it.full).some(x => x.startsWith(t)))); }
  return `<div class="sec"><div class="sec-head"><h2 class="h">${esc(chain.name)}</h2><button type="button" class="linkbtn" data-action="rest-clear">Not ${esc(chain.name)}?</button></div>
    <p class="fine">${R.src === 'image' ? 'Recognized from the packaging.' : R.src === 'text' ? 'Read from the packaging or your details.' : 'You picked it.'} ${chain.usda ? 'Numbers are USDA’s analysis of the chain’s food.' : `The app has no official ${esc(chain.name)} numbers, so these are typical versions. For exact numbers, snap the menu in Meals → Eat out.`}</p>
    <ul class="guesses">${list.slice(0, R.filter ? 12 : 5).map(it => menuRowHTML(it, 'photo')).join('') || '<li><p class="fine">No items match.</p></li>'}</ul>
    <input type="text" data-rest-filter value="${esc(R.filter || '')}" placeholder="Search the ${esc(chain.name)} menu" aria-label="Search the menu"></div>`;
}
function findMenuItem(id, ctx){
  if (ctx === 'eo' && S.eo.menu) { const m = S.eo.menu.items.find(x => x.id === id); if (m) return m; }
  const keys = [S.rest.chain, S.eo.chain, S.eo.kind && 'kind:' + S.eo.kind].filter(Boolean);
  for (const k of keys){ const m = (k.startsWith('kind:') ? genericMenu(k.slice(5)) : menuFor(k)).find(x => x.id === id); if (m) return m; }
  for (const c of CHAINS){ const m = menuFor(c.key).find(x => x.id === id); if (m) return m; }
  return null;
}

/* ---------- nutrition label scanner ---------- */
async function scanLabel(file){
  S.lbl = {busy:true, step:'Reading the label…'}; renderTypeExtra();
  try {
    const text = await readText(file, t => { S.lbl.step = t; const el = $('#lbl-step'); if (el) el.textContent = t; });
    const L = parseLabel(text);
    if (L.found < 3) { S.lbl = {err:'Couldn’t find a nutrition label in that photo. Fill the frame with the label, keep it flat and in good light. Screenshots of a website’s nutrition info work too.', raw:text}; }
    else S.lbl = {form:{name:'', brand:'', servingText:L.servingText || (L.per100 ? '100 g' : '1 serving'), servingG:L.servingG || (L.per100 ? 100 : ''), kcal:L.kcal, protein:L.protein, carbs:L.carbs, fat:L.fat, fiber:L.fiber, sugar:L.sugar, satFat:L.satFat, sodium:L.sodium, chol:L.chol, potassium:L.potassium, calcium:L.calcium, iron:L.iron, vitD:L.vitD, per100:L.per100}, check:L.check, raw:text};
  } catch (e) { console.error(e); S.lbl = {err:'Couldn’t read that photo.'}; }
  renderTypeExtra();
  requestAnimationFrame(() => $('#type-extra')?.scrollIntoView({behavior:reduced() ? 'auto' : 'smooth', block:'start'}));
}
const LBL_FIELDS = [['kcal', 'Calories', ''], ['protein', 'Protein', 'g'], ['carbs', 'Carbs', 'g'], ['fat', 'Fat', 'g'], ['fiber', 'Fiber', 'g'], ['sugar', 'Sugars', 'g'], ['satFat', 'Sat. fat', 'g'], ['sodium', 'Sodium', 'mg'], ['chol', 'Cholesterol', 'mg'], ['potassium', 'Potassium', 'mg']];
function labelCardHTML(){
  const L = S.lbl; if (!L) return '';
  if (L.busy) return `<div class="recbox"><span><span class="spin"></span> <b id="lbl-step">${esc(L.step)}</b></span></div>`;
  if (L.err) return `<p class="err">${esc(L.err)} <button type="button" class="linkbtn" data-action="lbl-cancel">Close</button></p>`;
  const f = L.form, est = 9 * num(f.fat) + 4 * num(f.carbs) + 4 * num(f.protein);
  const off = num(f.kcal) && est ? Math.abs(est - num(f.kcal)) / num(f.kcal) : 0;
  return `<div class="card sec lblcard"><div class="sec-head"><h3 class="h">Nutrition label</h3><button type="button" class="linkbtn" data-action="lbl-cancel">Cancel</button></div>
    <p class="fine">Check the numbers against the label and fix anything misread. ${f.per100 ? 'This label lists amounts per 100 g.' : 'Amounts are per serving.'}</p>
    <div class="grid2"><div class="field"><label for="lbl-name">Food name</label><input type="text" id="lbl-name" data-lbl="name" value="${esc(f.name)}" placeholder="e.g. Salty Peanut protein bar"></div>
      <div class="field"><label for="lbl-brand">Brand</label><input type="text" id="lbl-brand" data-lbl="brand" value="${esc(f.brand)}" placeholder="e.g. Barebells"></div></div>
    <div class="grid2"><div class="field"><label for="lbl-st">Serving</label><input type="text" id="lbl-st" data-lbl="servingText" value="${esc(f.servingText)}"></div>
      <div class="field"><label for="lbl-sg">Serving weight</label><div class="unit"><input type="number" id="lbl-sg" inputmode="decimal" data-lbl="servingG" value="${esc(f.servingG ?? '')}"><em>g</em></div></div></div>
    <div class="grid3 lblgrid">${LBL_FIELDS.map(([k, l, u]) => `<div class="field"><label for="lbl-${k}">${l}</label><div class="unit"><input type="number" id="lbl-${k}" inputmode="decimal" step="any" data-lbl="${k}" value="${esc(f[k] ?? '')}">${u ? `<em>${u}</em>` : ''}</div></div>`).join('')}</div>
    <p class="fine tnum" id="lbl-check">${off > 0.25 ? `⚠ Fat, carbs and protein add up to about ${int(est)} kcal, but the label says ${int(f.kcal)}. A number may be misread.` : num(f.kcal) ? `✓ Fat, carbs and protein add up to about ${int(est)} kcal, close to the label’s ${int(f.kcal)}.` : ''}</p>
    ${!num(f.servingG) && !f.per100 ? '<p class="notice">Add the serving weight in grams (it’s usually in brackets next to the serving size) so portions work.</p>' : ''}
    <div class="row2"><button type="button" class="btn primary" data-action="lbl-save">Save to My foods &amp; add</button><button type="button" class="btn ghost" data-action="lbl-once">Add once</button></div></div>`;
}
function labelFood(){
  const f = S.lbl.form, sg = num(f.servingG) || (f.per100 ? 100 : 0);
  if (!num(f.kcal) && !num(f.protein) && !num(f.carbs) && !num(f.fat)) { toast('Enter at least the calories'); return null; }
  const name = (f.name || '').trim() || 'Scanned food';
  return {name:name.slice(0, 60), brand:(f.brand || '').trim().slice(0, 40), servingG:sg || 100, servingD:(f.servingText || '').trim() || (sg ? `${sg} g` : '1 serving'),
    p:labelToP100({...f, kcal:num(f.kcal), protein:num(f.protein), carbs:num(f.carbs), fat:num(f.fat), fiber:num(f.fiber), sugar:num(f.sugar), satFat:num(f.satFat), sodium:num(f.sodium), chol:num(f.chol), potassium:num(f.potassium), calcium:num(f.calcium), iron:num(f.iron), vitD:num(f.vitD)}, sg || 100), src:'custom'};
}
function renderTypeExtra(){
  const el = $('#type-extra'); if (!el) return;
  const o = S.online;
  const gb = $('#gm-type-btn'); if (gb) gb.hidden = !(gemOn() || sharedAsk());
  let html = labelCardHTML() + gmSectionHTML(S.gm.type, 'type', 'Gemini found');
  if (o.busy) html += `<div class="recbox"><span><span class="spin"></span> <b>Searching online for “${esc(o.q)}”…</b></span></div>`;
  else if (o.items) {
    const errs = [o.errors.includes('fdc-rate') ? 'USDA’s shared key is busy right now; add your own free key in Body → Settings.' : o.errors.includes('fdc') ? 'USDA FoodData Central didn’t answer.' : '', o.errors.includes('off') ? 'Open Food Facts didn’t answer.' : ''].filter(Boolean);
    html += `<div class="sec"><div class="sec-head"><h2 class="h">Online results</h2><span class="sub">“${esc(o.q)}”</span></div>
      ${errs.length ? `<p class="notice">${esc(errs.join(' '))}</p>` : ''}
      ${o.items.length ? `<ul class="results">${o.items.map((r, i) => onlineRowHTML(r, i, 'type')).join('')}</ul>` : '<p class="fine">No online matches.</p>'}
      <p class="fine">Not the right one? <a href="${esc(webSearchURL(o.q))}" target="_blank" rel="noopener">Search the web for its nutrition</a>, screenshot the nutrition facts, then tap <b>Scan nutrition label</b> and pick the screenshot.</p></div>`;
  }
  el.innerHTML = html;
}
async function runOnline(q){
  q = String(q || '').trim(); if (q.length < 2) { toast('Type a food or brand first'); return; }
  if (!navigator.onLine) { toast('You’re offline. Online search needs a connection.'); return; }
  S.online = {q, busy:true, items:null, errors:[]}; renderTypeExtra();
  try { const r = await searchOnline(q, {fdcKey:settings().fdcKey || ''}); S.online = {q, busy:false, items:r.items, errors:r.errors}; }
  catch { S.online = {q, busy:false, items:[], errors:['off', 'fdc']}; }
  renderTypeExtra();
}

/* ---------- Gemini (optional, with the person's own free key) ---------- */
const gemKey = () => String(settings().gemKey || '').trim();
// 'key': this phone's own key · 'shared': the app's shared server from config.js · '': neither
const gemMode = () => gemKey() ? 'key' : GEMINI_PROXY ? 'shared' : '';
const gemAuth = () => gemKey() ? {key:gemKey()} : {proxy:GEMINI_PROXY, limit:SHARED_DAILY_LIMIT};
// with the shared server, nothing goes to Google until the person says yes once
const sharedAsk = () => gemMode() === 'shared' && settings().gemShared == null && navigator.onLine;
const gemOn = () => navigator.onLine && (gemMode() === 'key' || (gemMode() === 'shared' && settings().gemShared === true));
const SRC_WORD = {label:'read from the label', official:'published numbers', menu:'calories from the menu', estimate:'estimate'};
const SRC_TAG = {label:'Label', official:'Published', menu:'Menu', estimate:'Estimate'};
async function photoB64(file, max){ return (await smallPhoto(file, max)).split(',')[1]; }
const portionLabel = s => String(s || '').replace(/\s*\(\s*\d+(\.\d+)?\s*(g|ml)\s*\)\s*$/i, '').trim() || String(s || '1 serving');
const gmWords = () => { const st = S.gm.photo; return st && st.ph === S.photo && st.items ? st.items.map(x => `${x.restaurant} ${x.name}`).join(' ') : ''; };
function gemErrText(e){
  if (e && e.own) return e.message;
  if (e && e.shared && e.kind === 'key') return 'The app’s shared Gemini server isn’t working right now.';
  if (e && e.shared && e.kind === 'net') return 'Couldn’t reach the app’s shared Gemini server.';
  if (e && e.shared && e.kind === 'rate' && e.daily) return 'The app’s free Gemini quota for today is used up. It resets at midnight Pacific time.';
  switch (e && e.kind) {
    case 'key': return 'Gemini didn’t accept your key. Check it in Body → Settings.';
    case 'rate': return e.daily ? 'Gemini’s free daily limit is used up. It resets at midnight Pacific time.' : 'Gemini got too many requests this minute. Try again shortly.';
    case 'region': return 'Gemini isn’t available where you are.';
    case 'blocked': return 'Gemini wouldn’t look at this one.';
    case 'net': return `${e.message} Check your connection.`;
    case 'server': return 'Gemini is busy right now. Try again in a minute.';
    default: return `Gemini couldn’t answer this time${e && e.status ? ` (error ${e.status})` : ''}.`;
  }
}
// remember which model answered, for Settings
function noteModel(r){ const i = settings().gemInfo; if (!i || i.model !== r.model || i.search !== r.search) { settings().gemInfo = {model:r.model, search:r.search, t:Date.now()}; saveProfile(); } }
const gmName = x => { const by = x.restaurant || x.brand; return by && !x.name.toLowerCase().includes(by.toLowerCase().replace(/[’']s$/, '')) ? `${by} ${x.name}` : x.name; };
const dbGrams = x => x.gramsKnown ? x.grams : (x.db.servingG || 100);
const rowNut = x => x.db && x.useDb ? {kcal:x.db.p[0] * dbGrams(x) / 100, protein:x.db.p[1] * dbGrams(x) / 100, carbs:x.db.p[2] * dbGrams(x) / 100, fat:x.db.p[3] * dbGrams(x) / 100} : x;
function gmPlateItem(x){
  if (x.db && x.useDb) { const it = onlinePlateItem(x.db, x.gramsKnown ? `${x.grams} g` : ''); it.name = gmName(x); it.sub = `${it.sub} label data · matched by Gemini`; return it; }
  const by = x.restaurant || x.brand;
  return servingItem({src:'ai', name:gmName(x), sub:`${by ? by + ' · ' : ''}Gemini · ${SRC_WORD[x.source]}`, p:x.p, servingG:x.grams, servingD:portionLabel(x.portion)}, x.grams, portionLabel(x.portion));
}
function groundingHTML(g){
  if (!g) return '';
  const src = g.sources.length ? `<p class="fine gm-src">Sources: ${g.sources.map(s => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(', ')}</p>` : '';
  // Google asks apps that use Search grounding to show its search suggestions with the answer
  return (g.entry ? `<iframe class="gm-sugg" title="Google Search suggestions" sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc="${esc('<base target="_blank">' + g.entry)}"></iframe>` : '') + src;
}
function gmRowHTML(x, i, ctx, added){
  const n = rowNut(x), dbK = x.db ? x.db.p[0] * dbGrams(x) / 100 : 0;
  return `<li class="guess gmrow ${added ? 'added' : ''}"><span><b>${esc(gmName(x))}</b>
      <small class="tnum">${esc(portionLabel(x.portion))}${x.gramsKnown && !/\d\s*(g|ml)\b/i.test(portionLabel(x.portion)) ? ` · ${int(x.grams)} ${x.kind === 'drink' ? 'ml' : 'g'}` : ''} · ${int(n.kcal)} kcal · P ${dec(n.protein)} · C ${dec(n.carbs)} · F ${dec(n.fat)}</small>
      <small><span class="tag">${x.db && x.useDb ? 'Label data' : SRC_TAG[x.source]}</span>${x.conf === 'low' ? 'Not sure. Check this one.' : x.conf === 'medium' && x.source === 'estimate' ? 'Estimated portion' : ''}</small>
      ${x.db ? `<select class="alt" data-gm-src="${ctx}:${i}" aria-label="Which numbers"><option value="db" ${x.useDb ? 'selected' : ''}>${x.db.src === 'fdc' ? 'USDA' : 'Open Food Facts'} label data · ${int(dbK)} kcal</option><option value="ai" ${x.useDb ? '' : 'selected'}>Gemini’s numbers · ${int(x.kcal)} kcal</option></select>` : ''}</span>
    <button type="button" class="btn ${added ? 'ghost' : 'primary'} sm" data-action="gm-add" data-ctx="${ctx}" data-i="${i}">${added ? 'Added' : 'Add'}</button></li>`;
}
function gmSectionHTML(st, ctx, title){
  if (!st) return '';
  if (st.consent) return consentHTML(ctx);
  if (st.busy) return `<div class="recbox"><span><span class="spin"></span> <b>${esc(st.step || 'Asking Gemini…')}</b></span></div>`;
  if (st.err) return `<p class="notice">${esc(st.err)}${ctx === 'photo' ? ' The on-device results are below.' : ''} <button type="button" class="linkbtn" data-action="gm-retry" data-ctx="${ctx}">Try again</button></p>`;
  if (!st.items.length) return `<p class="notice">${esc(st.notes || (ctx === 'photo' ? 'Gemini didn’t see any food in this photo.' : 'Gemini didn’t find a food in that.'))}</p>`;
  const left = st.items.map((x, i) => i).filter(i => !st.added.has(i));
  const tot = left.reduce((a, i) => a + rowNut(st.items[i]).kcal, 0);
  return `<div class="sec gm"><div class="sec-head"><h2 class="h">${esc(title)}</h2><span class="sub">${esc(G.modelName(st.model))}${st.search ? ' · Google Search' : ''}</span></div>
    <ul class="guesses">${st.items.map((x, i) => gmRowHTML(x, i, ctx, st.added.has(i))).join('')}</ul>
    ${st.items.length > 1 && left.length ? `<button type="button" class="btn primary wide" data-action="gm-add-all" data-ctx="${ctx}">Add ${left.length === st.items.length ? 'all' : 'the rest'} · ${int(tot)} kcal</button>` : ''}
    ${st.notes ? `<p class="fine">${esc(st.notes)}</p>` : ''}
    ${st.cut ? '<p class="fine">Gemini’s answer was cut short, so a food may be missing.</p>' : ''}
    ${groundingHTML(st.grounding)}</div>`;
}
// packaged items: look the product up in Open Food Facts / USDA so the label's exact numbers can be used
async function labelMatch(st, done){
  for (const x of st.items.filter(x => x.brand && x.kind === 'packaged').slice(0, 3)){
    try {
      const rest = x.name.replace(new RegExp(x.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ').replace(/\s+/g, ' ').trim();
      const {items} = await searchOnline(`${x.brand} ${rest}`, {fdcKey:settings().fdcKey || ''});
      const top = items[0], bt = tokens(x.brand);
      if (!top || top.score < 0.85 || !tokens(`${top.brand} ${top.name}`).some(t => bt.includes(t))) continue;
      x.db = top;
      const dbK = top.p[0] * dbGrams(x) / 100;
      // the label's numbers win unless Gemini read them off this package itself or they disagree a lot
      x.useDb = x.source !== 'label' && !(x.kcal && Math.abs(dbK - x.kcal) / x.kcal > 0.4);
      done();
    } catch {}
  }
}
function consentHTML(ctx){
  const what = ctx === 'photo' ? 'this photo and your details' : ctx === 'eo' ? 'menu photos and restaurant names' : 'what you typed';
  return `<div class="recbox gm-ask"><span><b>Recognize with Google Gemini?</b><br><span class="sub">Munchmark can send ${what} to Google Gemini, which is much better at brands, restaurant food and portions. Google may use what’s sent to improve its products, so don’t send anything private. Google’s terms allow this only for people 18 or older. You can change this in Body → Settings. <a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a></span></span>
    <div class="row2"><button type="button" class="btn primary sm" data-action="gm-consent" data-v="1" data-ctx="${ctx}">I’m 18+, use Gemini</button><button type="button" class="btn ghost sm" data-action="gm-consent" data-v="0" data-ctx="${ctx}">Keep on-device</button></div></div>`;
}
function gemNote(){ return String($('#photo-desc')?.value ?? S.desc.text ?? '').split(/[,;\n]+/).map(x => x.trim()).filter(c => c && pantryTagged(c) == null).join(', ').slice(0, 400); }
async function geminiPhoto(force = false){
  const ph = S.photo; if (!ph) return;
  if (!gemOn()) { if (sharedAsk()) { S.gm.photo = {ph, consent:true}; renderPhoto(); } return; }
  const note = gemNote(), cur = S.gm.photo;
  if (!force && cur && cur.ph === ph && cur.note === note && (cur.busy || cur.items)) return;
  const st0 = {busy:true, ph, note, step:note ? 'Asking Gemini about the photo and your details…' : 'Asking Gemini what’s in the photo…'};
  S.gm.photo = st0; renderPhoto();
  let st;
  try {
    const r = await G.foodFromPhoto({...gemAuth(), image:await photoB64(ph.orig || ph.blob, 1280), note});
    noteModel(r);
    st = {ph, note, items:r.items, notes:r.notes, cut:r.cut, model:r.model, search:r.search, grounding:r.grounding, added:new Set()};
    const was = cur && cur.ph === ph && cur.items ? new Set([...cur.added].map(i => gmName(cur.items[i]).toLowerCase())) : new Set();
    st.items.forEach((x, i) => { if (was.has(gmName(x).toLowerCase())) st.added.add(i); });
  } catch (e) { console.warn(e); st = {ph, note, err:gemErrText(e)}; }
  if (S.photo !== ph || S.gm.photo !== st0) return;
  S.gm.photo = st; renderPhoto(); updateRestaurant();
  if (st.items) labelMatch(st, () => { if (S.gm.photo === st) renderPhoto(); });
}
async function geminiText(q){
  q = String(q || '').trim(); if (!q) { $('#type-in')?.focus(); return; }
  if (!gemOn()) {
    if (sharedAsk()) { S.gm.type = {consent:true, q}; renderTypeExtra(); return; }
    toast(!navigator.onLine ? 'You’re offline. Gemini needs a connection.' : gemMode() === 'shared' ? 'Gemini is off on this phone. Turn it on in Body → Settings.' : 'Add your Gemini key in Body → Settings first'); return;
  }
  const st0 = {busy:true, q, step:`Asking Gemini about “${q.length > 60 ? q.slice(0, 58) + '…' : q}”…`};
  S.gm.type = st0; renderTypeExtra();
  let st;
  try {
    const r = await G.foodFromText({...gemAuth(), text:q});
    noteModel(r);
    st = {q, items:r.items, notes:r.notes, cut:r.cut, model:r.model, search:r.search, grounding:r.grounding, added:new Set()};
  } catch (e) { console.warn(e); st = {q, err:gemErrText(e)}; }
  if (S.gm.type !== st0) return;
  S.gm.type = st; renderTypeExtra();
  if (st.items) labelMatch(st, () => { if (S.gm.type === st) renderTypeExtra(); });
  requestAnimationFrame(() => $('#type-extra')?.scrollIntoView({behavior:reduced() ? 'auto' : 'smooth', block:'nearest'}));
}
function gmAdd(ctx, idx){
  const st = S.gm[ctx]; if (!st || !st.items) return;
  const its = [];
  for (const i of idx){
    const x = st.items[i]; if (!x || st.added.has(i)) continue;
    its.push(gmPlateItem(x)); st.added.add(i);
    if (x.db && x.useDb) rememberOnline(x.db);
  }
  if (!its.length) return;
  addToPlate(its);
  if (ctx === 'photo') renderPhoto(); else renderTypeExtra();
}
let gemTesting = false;
async function gemTest(){
  const el = $('#gem-status'), mode = gemMode(); if (!el || gemTesting) return;
  if (!mode) { renderGemStatus(); return; }
  if (!navigator.onLine) { el.textContent = 'You’re offline. Connect to test the key.'; return; }
  el.innerHTML = '<span class="spin"></span> Testing your key…';
  gemTesting = true;
  try {
    const t = await G.testKey(gemAuth());
    settings().gemInfo = {model:t.model, search:t.search, t:Date.now()}; saveProfile();
    renderGemStatus(t.kcal); toast(mode === 'shared' ? 'The shared Gemini server works' : `Gemini connected · ${G.modelName(t.model)}`);
  } catch (e) {
    console.warn(e);
    el.textContent = gemErrText(e) + (['model', 'bad'].includes(e.kind) && e.message ? ` Google said: “${String(e.message).slice(0, 160)}”` : '');
  } finally { gemTesting = false; }
}
function renderGemStatus(kcal){
  const el = $('#gem-status'); if (!el) return;
  const i = settings().gemInfo, n = G.usedToday();
  const row = $('#gemshared-row'), mode = gemMode();
  if (row) { row.hidden = mode !== 'shared'; $('#set-gemshared').checked = settings().gemShared === true; }
  if (!mode) { el.textContent = 'Not set. Photos, menus and typing use the on-device tools.'; return; }
  if (mode === 'shared') {
    el.textContent = `This app has a shared Gemini server${settings().gemShared === false ? ', turned off on this phone' : settings().gemShared ? '' : ' (it asks before the first photo)'}.${i ? ` ${G.modelName(i.model)}, Google Search ${i.search ? 'on' : 'off'}.` : ''}${kcal ? ` Test answer: a Big Mac is about ${int(kcal)} kcal.` : ''} ${Math.min(n, SHARED_DAILY_LIMIT)} of ${SHARED_DAILY_LIMIT} requests used today on this phone. Paste your own key to use your own free quota instead.`;
    return;
  }
  if (!i) { el.textContent = 'Key saved. Tap Test to check it.'; return; }
  el.textContent = `✓ Connected: ${G.modelName(i.model)}. Google Search ${i.search ? 'on' : 'off (it isn’t on the free tier for this key)'}.${kcal ? ` Test answer: a Big Mac is about ${int(kcal)} kcal.` : ''} ${n} request${n === 1 ? '' : 's'} today.`;
}

/* ---------- eating out ---------- */
const poss = n => /['’]s$/i.test(n) ? n : `${n}’s`;
function mealTarget(){
  const g = targets(), t = dayTotals(dayKey()), h = new Date().getHours();
  const left = {kcal:g.calories - t.calories, p:g.protein_g - t.protein_g, c:g.carbs_g - t.carbs_g, f:g.fat_g - t.fat_g};
  const meals = dietOpts().meals || 3, eaten = (S.days[dayKey()]?.entries || []).filter(e => e.meal !== 'snack').length;
  const mealsLeft = Math.max(1, Math.min(Math.max(1, meals - eaten), h >= 19 ? 1 : h >= 15 ? 2 : meals));
  const r = x => Math.max(0, Math.round(x / mealsLeft));
  return {kcal:Math.max(250, Math.round(left.kcal / mealsLeft / 10) * 10), protein:Math.max(15, r(left.p)), carbs:r(left.c), fat:r(left.f), mealsLeft, left,
    note:left.kcal > 150 ? `About ${int(left.kcal)} kcal and ${int(Math.max(0, left.p))} g protein left today, split over ${mealsLeft} meal${mealsLeft > 1 ? 's' : ''}. Change these for this meal.` : 'You’re at your calorie goal for today, so these are the lightest picks.'};
}
function eoGo(){
  const q = ($('#eo-q')?.value || '').trim(); S.eo.q = q;
  if (!q) { toast('Type a restaurant name'); return; }
  const c = chainByName(q);
  S.eo.menu = null;
  if (c) { S.eo.chain = c.key; S.eo.kind = c.usda ? null : c.kind; }
  else { S.eo.chain = null; S.eo.kind = kindFromName(q); }
  renderMeals();
  // no USDA numbers for this place: Gemini knows most chains' published nutrition
  if (gemOn() && !(c && c.usda)) eoGemini(c ? c.name : q);
}
const gmMenuItem = (x, chainKey, place) => ({id:'g' + uid().slice(1), ndb:null, ai:true, src:x.source, place:place || '', name:x.name, full:x.name, chain:chainKey || null, generic:true,
  role:x.role || menuRole(x.name), retired:false, p:x.p, counts:null, printed:x.source === 'menu' ? x.kcal : null,
  sizes:[{t:portionLabel(x.portion) + (x.kcalHi > x.kcal ? ` (${int(x.kcal)}–${int(x.kcalHi)} cal)` : ''), g:x.grams}]});
async function eoGemini(name){
  S.eo.busy = true; S.eo.err = ''; S.eo.step = `Asking Gemini for ${poss(name)} menu…`; renderMeals();
  try {
    const r = await G.menuForName({...gemAuth(), name});
    noteModel(r);
    const c = chainByName(r.restaurant) || chainByName(name);
    const items = r.items.map(x => gmMenuItem(x, c ? c.key : null, r.restaurant || name));
    if (items.length) S.eo.menu = {items, chain:c ? c.key : null, ai:'name', name:r.restaurant || name, model:r.model, search:r.search, grounding:r.grounding};
    else S.eo.err = `Gemini didn’t have a menu for ${name}.`;
  } catch (e) { console.warn(e); S.eo.err = gemErrText(e) + ' These are typical dishes instead.'; }
  finally { S.eo.busy = false; if (S.tab === 'eatout') renderMeals(); }
}
async function eoPhoto(file){
  S.eo.busy = true; S.eo.err = ''; S.eo.step = 'Reading the menu…'; renderMeals();
  if (gemOn()) {
    try {
      S.eo.step = 'Gemini is reading the menu…'; renderMeals();
      const r = await G.menuFromPhoto({...gemAuth(), image:await photoB64(file, 1600), restaurant:S.eo.chain ? CHAIN_BY[S.eo.chain].name : (S.eo.q || '')});
      noteModel(r);
      const c = detectChain(r.restaurant) || chainByName(r.restaurant) || (S.eo.chain ? CHAIN_BY[S.eo.chain] : null);
      const items = r.items.map(x => gmMenuItem(x, c ? c.key : null, r.restaurant));
      if (items.length) {
        S.eo.menu = {items, chain:c ? c.key : null, ai:'photo', name:r.restaurant, model:r.model, search:r.search, grounding:r.grounding};
        if (c) { S.eo.chain = c.key; S.eo.q = c.name; } else if (r.restaurant) S.eo.q = r.restaurant;
        S.eo.busy = false; if (S.tab === 'eatout') renderMeals(); return;
      }
      toast('Gemini couldn’t read menu items there. Trying the on-device reader.');
    } catch (e) { console.warn(e); toast(gemErrText(e) + ' Using the on-device reader.'); }
  }
  try {
    const step = t => { S.eo.step = t; const el = $('#eo-step'); if (el) el.textContent = t; };
    const words = await readWords(file, step);
    const text = words.map(w => w.text).join(' ');
    let found = parseMenuWords(words);
    if (found.length < 2) { const t2 = await readText(file, step, {psm:'3'}); const f2 = parseMenuText(t2); if (f2.length > found.length) found = f2; }
    const chain = detectChain(text) || (S.eo.chain ? CHAIN_BY[S.eo.chain] : null);
    const ref = chain && chain.usda ? menuFor(chain.key) : [];
    const items = found.map(e => estimateMenuItem(e, ref)).filter(Boolean);
    if (!items.length) S.eo.err = 'Couldn’t find menu items with calories. Get closer so the item names and calorie numbers are sharp, or type the restaurant name.';
    else { S.eo.menu = {items, chain:chain ? chain.key : null}; if (chain) { S.eo.chain = chain.key; S.eo.q = chain.name; } }
  } catch (e) { console.error(e); S.eo.err = 'Couldn’t read that photo.'; }
  finally { S.eo.busy = false; if (S.tab === 'eatout') renderMeals(); }
}
function comboHTML(c, list, i, T){
  const n = c.n, onT = Math.abs(n.kcal - T.kcal) <= T.kcal * 0.1 && n.p >= T.protein * 0.9;
  return `<div class="idea"><div class="idea-top"><span><b>${esc(c.parts.map(p => p.it.name).join(' + '))}</b><small>${esc(c.parts.map(p => p.po.t).join(' · '))}</small></span>${onT ? '<span class="match">on target</span>' : ''}</div>
    <p class="mac tnum"><b>${int(n.kcal)} kcal</b> · P ${int(n.p)} g · C ${int(n.c)} g · F ${int(n.f)} g${n.na > 1500 ? ` · <span class="hi">${int(n.na)} mg sodium</span>` : ''}</p>
    <button type="button" class="btn ghost sm" data-action="eo-log" data-list="${list}" data-i="${i}">Log this</button></div>`;
}
function renderEatOut(el){
  const E = S.eo, T0 = mealTarget();
  const T = {kcal:num(E.tKcal) || T0.kcal, protein:num(E.tP) || T0.protein, carbs:T0.carbs, fat:T0.fat};
  let items = null, title = '', note = '';
  if (E.menu && E.menu.ai) {
    items = E.menu.items; const c = E.menu.chain && CHAIN_BY[E.menu.chain], nm = c ? c.name : E.menu.name;
    title = nm ? (E.menu.ai === 'photo' ? `${nm} menu` : nm) : 'Your menu';
    note = E.menu.ai === 'photo' ? `Read by ${G.modelName(E.menu.model)} from your photo: calories as printed where it could read them, otherwise ${nm ? poss(nm) + ' published' : 'published'} or estimated numbers.`
      : `${G.modelName(E.menu.model)}’s list of ${poss(nm)} published nutrition${E.menu.search ? ', checked with Google Search' : ''}. Menus change, so check anything that looks off.`;
  }
  else if (E.menu) { items = E.menu.items; const c = E.menu.chain && CHAIN_BY[E.menu.chain]; title = c ? `${c.name} menu` : 'Your menu'; note = `Calories read from your photo; protein, carbs and fat estimated from similar dishes${c && c.usda ? ` and ${poss(c.name)} own items` : ''}.`; }
  else if (E.chain && CHAIN_BY[E.chain].usda) { const c = CHAIN_BY[E.chain]; items = menuFor(c.key); title = c.name; note = `Numbers are USDA’s analysis of ${c.name} food from the 2010s. Recipes and sizes change, so treat them as close estimates.`; }
  else if (E.kind) { items = genericMenu(E.kind); const c = E.chain && CHAIN_BY[E.chain]; title = c ? c.name : (E.q || 'This restaurant'); note = `${c ? `The app has no official ${c.name} numbers` : 'That restaurant isn’t in the app’s data'}, so these are typical dishes at a ${KIND_LABEL[E.kind] || 'restaurant'}. Snap the menu for its real calories.`; }
  const sg = items && items.length ? suggest(items, T) : null;
  S.eo.sg = sg;
  const searchQ = E.chain ? CHAIN_BY[E.chain].name : E.q;
  el.innerHTML = `<div class="card sec"><h3 class="h">Where are you eating?</h3>
      <div class="fix-row"><input type="text" id="eo-q" list="eo-list" autocomplete="off" value="${esc(E.q)}" placeholder="Restaurant, e.g. McDonald's"><button type="button" class="btn primary sm" data-action="eo-go">Show ideas</button></div>
      <datalist id="eo-list">${CHAINS.map(c => `<option value="${esc(c.name)}"></option>`).join('')}</datalist>
      <div class="row2"><button type="button" class="btn ghost" data-action="eo-photo" data-cam="1">${CAM_SVG}Photo of menu</button><button type="button" class="btn ghost" data-action="eo-photo">From gallery</button></div>
      <p class="fine">Chains with 20 or more locations print calories on their menus, so a photo of the menu board gives real numbers.</p></div>
    <div class="card sec"><h3 class="h">This meal</h3>
      <div class="grid2"><div class="field"><label for="eo-kcal">Calories</label><div class="unit"><input type="number" id="eo-kcal" inputmode="numeric" value="${esc(E.tKcal || T0.kcal)}"><em>kcal</em></div></div>
        <div class="field"><label for="eo-p">Protein at least</label><div class="unit"><input type="number" id="eo-p" inputmode="numeric" value="${esc(E.tP || T0.protein)}"><em>g</em></div></div></div>
      <p class="fine">${esc(T0.note)}</p></div>
    ${sharedAsk() ? consentHTML('eo') : ''}
    ${E.busy ? `<div class="recbox"><span><span class="spin"></span> <b id="eo-step">${esc(E.step)}</b></span></div>` : ''}
    ${E.err ? `<p class="err">${esc(E.err)}</p>` : ''}
    ${sg ? `<div class="sec"><div class="sec-head"><h2 class="h">${esc(title)}</h2>${E.menu ? '<button type="button" class="linkbtn" data-action="eo-clear-menu">Clear menu</button>' : ''}</div><p class="fine">${esc(note)}</p>
      ${!E.menu && gemOn() && !E.busy ? '<p class="fine"><button type="button" class="linkbtn" data-action="eo-gm">Get the current menu from Gemini</button></p>' : ''}${E.menu?.ai ? groundingHTML(E.menu.grounding) : ''}</div>
      ${sg.best.length ? `<div class="sec"><h3 class="h">Best fits for this meal</h3>${sg.best.map((c, i) => comboHTML(c, 'best', i, T)).join('')}</div>` : '<p class="fine">Nothing on this menu fits well. Try a higher calorie target.</p>'}
      ${sg.protein.length ? `<div class="sec"><h3 class="h">Most protein for the calories</h3>${sg.protein.map((c, i) => comboHTML(c, 'protein', i, T)).join('')}</div>` : ''}
      ${sg.light.length ? `<div class="sec"><h3 class="h">Lighter</h3>${sg.light.map((c, i) => comboHTML(c, 'light', i, T)).join('')}</div>` : ''}
      <details class="help"><summary>Full menu (${items.filter(x => x.role !== 'part').length} items)</summary><ul class="guesses">${items.filter(x => x.role !== 'part').map(it => menuRowHTML(it, 'eo')).join('')}</ul></details>
      ${searchQ ? `<p class="fine"><a href="${esc(webSearchURL(searchQ))}" target="_blank" rel="noopener">Look up ${esc(poss(searchQ))} current nutrition</a>. Screenshot an item’s nutrition and scan it under Add food → Type for exact numbers.</p>` : ''}` : ''}
    ${!sg && !E.busy ? `<div class="empty"><b>Eating out?</b><p>Type the restaurant or snap its menu. You get picks sized to what’s left of your calories and protein today.</p></div>` : ''}`;
}
function logCombo(c){
  const its = c.parts.map(p => { const pi = menuPlateItem(p.it, portionsOf(p.it).findIndex(x => x.t === p.po.t)); const g = (CHAIN_BY[p.it.chain] || {}).name || S.eo.q || ''; if (pi && g && !String(pi.sub || '').startsWith(g)) pi.group = g; return pi; }).filter(Boolean);
  if (!its.length) return;
  S.plate.push(...its);
  S.plateName = c.parts.map(p => p.it.name).join(' + ').slice(0, 60);
  setTab('scan'); toast('On your plate. Adjust anything, then add it to your log.');
}

/* ---------- tabs, toast ---------- */
function setTab(t){
  S.tab = t;
  const view = ['containers', 'eatout'].includes(t) ? 'meals' : t, nav = ['pantry', 'containers', 'eatout'].includes(t) ? 'meals' : t;
  ['today','week','scan','meals','pantry','sports','body'].forEach(v => $('#view-' + v).hidden = v !== view);
  $$('.tabs [data-action="tab"]').forEach(b => b.dataset.tab === nav ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  $('#body-btn').toggleAttribute('aria-current', t === 'body');
  $$('#view-pantry .seg [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  if (t === 'meals' || t === 'containers' || t === 'eatout') renderMeals();
  if (t === 'scan') renderTypeExtra();
  if (t === 'sports') renderSports();
  if (t !== 'scan') bcStop();
  if (t === 'today') renderToday();
  if (t === 'scan') { renderScan(); if (S.rec.state === 'unknown') checkRecognizer(); }
  if (t === 'body') renderBody();
  if (t === 'week') renderWeek();
  if (t === 'pantry') { renderPantry(); if (S.rec.state === 'unknown') checkRecognizer(); }
  if (t !== 'scan' && S.bcTarget && t !== 'pantry') S.bcTarget = null;
  window.scrollTo({top:0});
}
let toastT;
function toast(msg){ const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2600); }

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-action]'); if (!b) return;
  const a = b.dataset.action;
  switch (a) {
    case 'tab': setTab(b.dataset.tab); break;
    case 'day-prev': S.viewDate = shift(S.viewDate, -1); S.open = null; renderToday(); break;
    case 'day-next': if (S.viewDate < dayKey()) { S.viewDate = shift(S.viewDate, 1); S.open = null; renderToday(); } break;
    case 'day-pick': S.viewDate = b.dataset.date; S.open = null; renderToday(); break;
    case 'entry-toggle': S.open = S.open === b.dataset.id ? null : b.dataset.id; S.confirmDel = null; renderToday(); break;
    case 'entry-mult': { const en = S.days[S.viewDate]?.entries.find(x => x.id === b.dataset.id); if (en) { en.mult = Number(b.dataset.m); saveDay(S.viewDate); renderToday(); } break; }
    case 'entry-again': {
      const en = S.days[S.viewDate]?.entries.find(x => x.id === b.dataset.id); if (!en) break;
      const d = dayKey(), day = S.days[d] || {date:d, entries:[]};
      day.entries = day.entries.concat([{...JSON.parse(JSON.stringify(en)), id:uid(), time:new Date().toISOString(), meal:defaultMeal()}]);
      S.days[d] = day; saveDay(d); S.viewDate = d; S.open = null; renderToday(); toast(`Logged ${en.name} again today`); break; }
    case 'entry-del': {
      const id = b.dataset.id;
      if (S.confirmDel !== id) { S.confirmDel = id; renderToday(); setTimeout(() => { if (S.confirmDel === id) { S.confirmDel = null; renderToday(); } }, 4000); break; }
      const day = S.days[S.viewDate]; if (!day) break;
      day.entries = day.entries.filter(x => x.id !== id); S.confirmDel = null; S.open = null; saveDay(S.viewDate); renderToday(); toast('Entry deleted'); break; }
    case 'mode': S.mode = b.dataset.mode; renderScan(); if (S.mode === 'type') setTimeout(() => $('#search-in').focus(), 50); break;
    case 'take-photo': $('#in-cam').click(); break;
    case 'pick-photo': $('#in-gal').click(); break;
    case 'clear-photo': if (S.photo) URL.revokeObjectURL(S.photo.url); S.photo = null; S.gm.photo = null; S.rec.results = null; S.pk.res = null; S.pk.busy = false; S.rest = {chain:null, src:'', ask:null, manual:null, no:false, filter:''}; renderPhoto(); break;
    case 'pk-add': {
      const it = (S.pk.res?.items || []).find(x => x.id === b.dataset.id); if (!it || S.pk.added.has(it.id)) break;
      b.disabled = true;
      pickedFood(it, false).then(food => { if (!food) { toast('That product has no nutrition data. Pick another match.'); b.disabled = false; return; } S.pk.added.add(it.id); addToPlate([food]); renderPhoto(); });
      break; }
    case 'rec-download': downloadRecognizer(); break;
    case 'guess-add': {
      const lab = b.dataset.label; if (S.rec.added.has(lab)) break;
      const items = photoGuessItems(lab); S.rec.added.add(lab); addToPlate(items); renderPhoto(); break; }
    case 'bc-start': bcStart(); break;
    case 'bc-stop': bcStop(); bcMsg(''); break;
    case 'bc-lookup': lookupBarcode($('#bc-code').value); break;
    case 'type-add': typeAdd(); break;
    case 'add-label': addToPlate(labelItems(b.dataset.label)); $('#search-results').innerHTML = ''; $('#search-in').value = ''; break;
    case 'add-usda': { const f = BYID.get(Number(b.dataset.ndb)); if (f) { const n = f.length; const it = usdaItem(f[0], f[n-4] || 100, null, null); if (it) { addToPlate([it]); $('#search-results').innerHTML = ''; $('#search-in').value = ''; } } break; }
    case 'pitem-del': {
      const {where} = findItem(b.dataset.id);
      if (where === 'recipe') S.ml.edit.items = S.ml.edit.items.filter(x => x.id !== b.dataset.id); else S.plate = S.plate.filter(x => x.id !== b.dataset.id);
      rerenderItems(where); break; }
    case 'qty': {
      const {it, where} = findItem(b.dataset.id); if (!it) break;
      const isG = it.opts[it.opt].t === 'grams';
      const down = Number(b.dataset.d) < 0, q = num(it.qty);
      const step = isG ? 10 : ((down ? q <= 1 : q < 1) ? 0.25 : 0.5);
      it.qty = Math.max(0, Math.round((num(it.qty) + step * Number(b.dataset.d)) * 100) / 100);
      rerenderItems(where); break; }
    case 'meal': S.meal = b.dataset.meal; renderPlate(); break;
    case 'plate-clear': S.plate = []; S.plateName = ''; S.rec.added = new Set(); renderPlate(); renderPhoto(); break;
    case 'plate-add': {
      if (!S.plate.length) break;
      const date = S.viewDate, day = S.days[date] || {date, entries:[]};
      const items = S.plate.map(it => ({name:it.name, sub:it.sub, portion:`${dec(num(it.qty))} × ${it.opts[it.opt].t}`.replace(/^1 × /, '').replace(/ × grams$/, ' g'), grams:Math.round(itemGrams(it) * 10) / 10, p:it.p, src:it.src, ndb:it.ndb, code:it.code}));
      const name = ($('#plate-name').value.trim() || defaultPlateName()).slice(0, 60);
      const entry = {id:uid(), meal:S.meal, time:new Date().toISOString(), name, thumb:S.photo ? S.photo.thumb : '', items, mult:1};
      day.entries = (day.entries || []).concat([entry]); S.days[date] = day; saveDay(date); store.persist();
      const kcal = entryTotals(entry).calories;
      S.plate = []; S.plateName = ''; if (S.photo) URL.revokeObjectURL(S.photo.url); S.photo = null; S.rec.results = null; S.rec.added = new Set(); S.meal = defaultMeal();
      toast(`Added ${name} · ${int(kcal)} kcal`); setTab('today'); break; }
    case 'sex': if (S.draft.sex !== b.dataset.sex) { S.bf.level = null; S.bf.probs = null; } S.draft.sex = b.dataset.sex; S.dirty = true; syncSex(); renderBody(); break;
    case 'body-save': saveStats(); toast('Stats saved'); break;
    case 'export': exportBackup(); break;
    case 'bf-take': $('#in-bfcam').click(); break;
    case 'bf-pick': $('#in-bfgal').click(); break;
    case 'bf-clear': if (S.bf.photo) URL.revokeObjectURL(S.bf.photo.url); S.bf.photo = null; S.bf.probs = null; renderBodyPhoto(); break;
    case 'bf-level': S.bf.level = Number(b.dataset.i); renderBodyPhoto(); break;
    case 'bf-save': saveBodyFat(); break;
    case 'banner': if (wrappedOn()) playWeek(lastWeekStart()); else { S.wk.start = lastWeekStart(); settings().seenWeek = S.wk.start; saveProfile(); setTab('week'); } break;
    case 'wk-prev': S.wk.start = addDays(S.wk.start || weekStart(dayKey()), -7); S.wk.report = false; renderWeek(); break;
    case 'wk-next': if (S.wk.start < weekStart(dayKey())) { S.wk.start = addDays(S.wk.start, 7); S.wk.report = false; renderWeek(); } break;
    case 'wk-play': playWeek(S.wk.start); break;
    case 'wk-report': S.wk.report = true; renderWeek(); break;
    case 'wk-cover': S.wk.report = false; renderWeek(); break;
    case 'sp-compare': S.sp.view = 'compare'; S.sp.cmpB = 'wk:' + S.wk.start; setTab('sports'); break;
    case 'pan-take': $('#in-pcam').click(); break;
    case 'pan-pick': $('#in-pgal').click(); break;
    case 'pan-add-pk': {
      const its = (S.pan.pk?.items || []).filter(it => S.pan.pkSel.has(it.id));
      b.disabled = true; b.textContent = 'Adding…';
      (async () => { let n = 0; for (const it of its){ const food = await pickedFood(it, true); if (food && addPantry(food)) n++; }
        S.pan.pk = null; S.pan.pkSel = new Set(); renderPantry(); toast(n ? `Added ${n} product${n === 1 ? '' : 's'} to your pantry` : 'Nothing new to add'); })();
      break; }
    case 'pan-add-detected': {
      let n = 0; for (const d of S.pan.detect || []) { if (!S.pan.sel.has(d.name)) continue; const P = PANTRY.find(x => x[0] === d.name); if (P && addPantry(pantryFood(P[2], P[0], P[3]))) n++; }
      S.pan.detect = null; S.pan.sel = new Set(); renderPantry(); toast(`Added ${n} item${n === 1 ? '' : 's'} to your pantry`); break; }
    case 'pan-add': { const ok = addPantry(pantryFood(Number(b.dataset.ndb), b.dataset.name || null, b.dataset.role || null)); $('#pan-search').value = ''; $('#pan-results').innerHTML = ''; renderPantry(); toast(ok ? 'Added to your pantry' : 'Already in your pantry'); break; }
    case 'pan-add-my': { const f = S.myFoods.find(x => x.id === b.dataset.id); if (f) { const ok = addPantry({key:'my' + f.id, src:'custom', name:f.brand && !f.name.toLowerCase().includes(f.brand.toLowerCase()) ? `${f.brand} ${f.name}` : f.name, p:f.p, unitG:f.servingG || 0, unitD:f.servingD || '', group:0, role:null}); $('#pan-search').value = ''; $('#pan-results').innerHTML = ''; renderPantry(); toast(ok ? 'Added to your pantry' : 'Already in your pantry'); } break; }
    case 'pan-del': S.pantry = S.pantry.filter(x => x.key !== b.dataset.key); savePantry(); S.pan.ideas = null; S.pan.plan = null; renderPantry(); break;
    case 'pan-clear': if (b.dataset.confirm) { S.pantry = []; savePantry(); S.pan.ideas = S.pan.plan = null; delete b.dataset.confirm; b.textContent = 'Clear all'; renderPantry(); } else { b.dataset.confirm = '1'; b.textContent = 'Tap again to clear'; setTimeout(() => { delete b.dataset.confirm; b.textContent = 'Clear all'; }, 4000); } break;
    case 'pan-barcode': S.bcTarget = 'pantry'; S.mode = 'barcode'; setTab('scan'); bcMsg('Scanning for your pantry. The item goes to your pantry, not your log.'); break;
    case 'pan-usebody': S.profile.planGoals = {}; saveProfile(); renderPantry(); if (S.pan.ideas || S.pan.plan) makeIdeas(S.pan.mode); toast(targets().set ? 'Using your Body targets' : 'Add your stats in Body for personal targets'); break;
    case 'pan-ideas': makeIdeas('ideas'); break;
    case 'pan-day': makeIdeas('day'); break;
    case 'idea-log': { const idea = (S.pan.logList || [])[Number(b.dataset.idx)]; if (idea) logIdea(idea, b.dataset.slot || null); break; }
    case 'import': $('#in-backup').click(); break;
    /* photo details, online, labels, restaurants */
    case 'desc-apply': applyDesc(); break;
    case 'online-search': runOnline($('#search-in').value.trim() || $('#type-in').value.trim()); break;
    case 'online-add': {
      const src = b.dataset.ctx === 'desc' ? S.desc.online : S.online, r = src?.items?.[Number(b.dataset.i)]; if (!r) break;
      addToPlate([onlinePlateItem(r, src.seg || '')]); rememberOnline(r); break; }
    case 'add-my': { const f = S.myFoods.find(x => x.id === b.dataset.id); if (f) { addToPlate([servingItem({src:'custom', name:f.name, sub:f.brand ? `${f.brand} · My foods` : 'My foods', p:f.p, servingG:f.servingG, servingD:f.servingD}, f.servingG || 100)]); $('#search-results').innerHTML = ''; $('#search-in').value = ''; } break; }
    case 'lbl-scan': pickImage(f => scanLabel(f), !!b.dataset.cam); break;
    case 'lbl-cancel': S.lbl = null; renderTypeExtra(); break;
    case 'lbl-save': case 'lbl-once': {
      const food = labelFood(); if (!food) break;
      if (a === 'lbl-save') { addMyFood(food); toast(`Saved ${food.name} to My foods`); }
      addToPlate([servingItem({src:'custom', name:food.name, sub:food.brand ? `${food.brand} · ${a === 'lbl-save' ? 'My foods' : 'From a label'}` : (a === 'lbl-save' ? 'My foods' : 'From a label'), p:food.p, servingG:food.servingG, servingD:food.servingD}, food.servingG)], {quiet:a === 'lbl-save'});
      S.lbl = null; renderTypeExtra(); break; }
    case 'menu-add': {
      const it = findMenuItem(b.dataset.id, b.dataset.ctx); if (!it) break;
      const sel = b.closest('li')?.querySelector('[data-menu-size]');
      const pi = menuPlateItem(it, sel ? Number(sel.value) : 0); if (!pi) break;
      if (b.dataset.ctx === 'eo') { S.plate.push(pi); setTab('scan'); toast(`Added ${pi.name} to your plate`); } else addToPlate([pi]);
      break; }
    case 'rest-open': S.rest.open = true; renderPhoto(); break;
    case 'rest-yes': S.rest.manual = b.dataset.k; S.rest.ask = null; updateRestaurant(); break;
    case 'rest-no': S.rest.no = true; S.rest.ask = null; renderPhoto(); break;
    case 'rest-clear': S.rest = {...S.rest, chain:null, manual:null, no:true, ask:null, filter:''}; renderPhoto(); break;
    case 'eo-go': eoGo(); break;
    case 'eo-photo': pickImage(f => eoPhoto(f), !!b.dataset.cam); break;
    case 'eo-clear-menu': S.eo.menu = null; renderMeals(); break;
    case 'eo-gm': eoGemini(S.eo.chain ? CHAIN_BY[S.eo.chain].name : S.eo.q); break;
    /* Gemini */
    case 'gm-add': gmAdd(b.dataset.ctx, [Number(b.dataset.i)]); break;
    case 'gm-add-all': { const st = S.gm[b.dataset.ctx]; if (st?.items) gmAdd(b.dataset.ctx, st.items.map((x, i) => i)); break; }
    case 'gm-retry': if (b.dataset.ctx === 'photo') geminiPhoto(true); else geminiText(S.gm.type?.q); break;
    case 'gm-type': geminiText($('#type-in').value); break;
    case 'gm-consent': {
      const yes = b.dataset.v === '1', ctx = b.dataset.ctx;
      settings().gemShared = yes; saveProfile(); renderGemStatus(); renderTypeExtra();
      if (ctx === 'photo') { if (yes) geminiPhoto(true); else { S.gm.photo = null; renderPhoto(); } }
      else if (ctx === 'type') { const q = S.gm.type?.q; S.gm.type = null; if (yes) geminiText(q); else renderTypeExtra(); }
      else { renderMeals(); toast(yes ? 'Gemini is on. Tap Show ideas or snap the menu again.' : 'Keeping everything on this phone'); }
      break; }
    case 'gem-test': { const v = $('#set-gem').value.trim(); if (v !== gemKey()) { settings().gemKey = v; settings().gemInfo = null; G.forget(); saveProfile(); } gemTest(); break; }
    case 'eo-log': { const c = S.eo.sg?.[b.dataset.list]?.[Number(b.dataset.i)]; if (c) logCombo(c); break; }
    /* water */
    case 'water-add': addWater(Number(b.dataset.oz)); break;
    case 'water-custom': { const v = num($('#water-custom').value); if (v) addWater(v); else $('#water-custom').focus(); break; }
    case 'water-undo': { const d = S.days[S.viewDate]; if (d?.water?.length) { const x = d.water.pop(); saveDay(S.viewDate); renderWater(); renderWaterWeight(); toast(`Removed ${dec(x.oz)} oz`); } break; }
    case 'wb-snap': pickImage(f => snapBottle(f), true); break;
    case 'wb-full': { const c = S.containers.find(x => x.id === b.dataset.id); if (c) addWater(c.capOz, {src:c.name}); break; }
    case 'wb-pick': S.wb.pick = b.dataset.id; S.wb.scaleOz = null; renderWater(); break;
    case 'wb-frac': S.wb.frac = Number(b.dataset.f); S.wb.scaleOz = null; renderWater(); break;
    case 'wb-weigh': pickImage(f => weighBottle(f), true); break;
    case 'wb-log': { const c = containers('bottle').find(x => x.id === S.wb.pick); if (c && addWater(wbOz(), {src:c.name})) { wbReset(); renderWater(); } break; }
    case 'wb-cancel': wbReset(); renderWater(); break;
    case 'wb-tapread': tapToRead(S.wb.scaleFile, r => { applyBottleRead(r); renderWater(); }); break;
    case 'pl-tapread': { const L = S.ml.log; tapToRead(L?.file, r => { if (S.ml.log !== L) return; applyPortionRead(L, r); renderMeals(); }); break; }
    case 'c-tapread': { const ce = S.ml.cEdit; tapToRead(ce?.scaleFile, r => { if (S.ml.cEdit !== ce) return; if (r.value != null) applyContainerRead(ce, r); renderMeals(); }); break; }
    /* meals */
    case 'r-new': S.ml.edit = newRecipe(); S.ml.log = null; renderMeals(); window.scrollTo({top:0}); break;
    case 'r-edit': { const r = S.recipes.find(x => x.id === b.dataset.id); if (r) { S.ml.edit = {...newRecipe(), ...clone(r), msg:null, ocr:null}; S.ml.edit.items.forEach(it => it.id ||= uid()); renderMeals(); window.scrollTo({top:0}); } break; }
    case 'r-cancel': S.ml.edit = null; renderMeals(); break;
    case 'r-photo': pickImage(f => recipeFromPhoto(f), !!b.dataset.cam); break;
    case 'r-pack': if (!S.ml.edit?.pk) pickImage(f => recipePackage(f), true); break;
    case 'r-parse': { const e = S.ml.edit, txt = $('#r-text').value.trim(); if (!txt) { $('#r-text').focus(); break; } e.text = txt; addRecipeText(txt, false); renderMeals(); break; }
    case 'r-add-usda': { const f = BYID.get(Number(b.dataset.ndb)); if (f && S.ml.edit) { const n = f.length, it = usdaItem(f[0], f[n-4] || 100, null, null); if (it) { S.ml.edit.items.push(it); renderMeals(); toast(`Added ${it.name}. Set the amount.`); } } break; }
    case 'r-add-label': { if (S.ml.edit) { const its = labelItems(b.dataset.label); S.ml.edit.items.push(...its); renderMeals(); } break; }
    case 'r-add-my': { const f = S.myFoods.find(x => x.id === b.dataset.id); if (f && S.ml.edit) { S.ml.edit.items.push(servingItem({src:'custom', name:f.name, sub:'My foods', p:f.p, servingG:f.servingG, servingD:f.servingD}, f.servingG || 100)); renderMeals(); } break; }
    case 'r-water-add': S.ml.edit.water.push({id:uid(), g:240, text:''}); renderMeals(); break;
    case 'r-water-del': S.ml.edit.water = S.ml.edit.water.filter(w => w.id !== b.dataset.id); renderMeals(); break;
    case 'r-save': saveRecipe(); break;
    case 'r-del': { const e = S.ml.edit; if (!e.confirmDel) { e.confirmDel = true; renderMeals(); setTimeout(() => { if (S.ml.edit === e && e.confirmDel) { e.confirmDel = false; renderMeals(); } }, 4000); break; }
      S.recipes = S.recipes.filter(x => x.id !== e.id); saveRecipes(); S.ml.edit = null; renderMeals(); toast('Meal deleted'); break; }
    case 'r-log': openPortion(b.dataset.id); break;
    case 'pl-cancel': if (S.ml.log?.photo) URL.revokeObjectURL(S.ml.log.photo.url); S.ml.log = null; renderMeals(); break;
    case 'pl-snap': pickImage(f => scalePortion(f), !!b.dataset.cam); break;
    case 'pl-unit': S.ml.log.unit = b.dataset.u; $$('[data-action="pl-unit"]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderPortionResult(); break;
    case 'pl-alt': S.ml.log.val = b.dataset.v; $('#pl-val').value = b.dataset.v; renderPortionResult(); break;
    case 'pl-serv': { const L = S.ml.log, r = S.recipes.find(x => x.id === L.rid); if (r?.servings) { L.val = String(Math.round(recipeCooked(r) / r.servings * Number(b.dataset.f))); L.unit = 'g'; L.cont = 'tared'; renderMeals(); } break; }
    case 'pl-meal': S.ml.log.meal = b.dataset.meal; $$('[data-action="pl-meal"]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderPortionResult(); break;
    case 'pl-log': logPortion(); break;
    /* containers */
    case 'c-new': { const back = S.tab === 'today' ? 'today' : null; S.ml.cEdit = {kind:b.dataset.kind, name:'', cap:'', capU:'oz', empty:'', emptyU:'g', photos:[], embN:0, back};
      if (back && S.wb.photo?.orig) addContainerPhoto(S.wb.photo.orig, true);
      setTab('containers'); break; }
    case 'c-edit': { const c = S.containers.find(x => x.id === b.dataset.id); if (c) { S.ml.cEdit = {...clone(c), cap:c.kind === 'bottle' ? c.capOz : '', capU:'oz', empty:c.emptyG || '', emptyU:'g'}; renderMeals(); window.scrollTo({top:0}); } break; }
    case 'c-cancel': { const back = S.ml.cEdit?.back; S.ml.cEdit = null; if (back === 'today') setTab('today'); else renderMeals(); break; }
    case 'c-save': saveContainer(); break;
    case 'c-del': { const ce = S.ml.cEdit; if (!ce.confirmDel) { ce.confirmDel = true; renderMeals(); setTimeout(() => { if (S.ml.cEdit === ce && ce.confirmDel) { ce.confirmDel = false; renderMeals(); } }, 4000); break; }
      S.containers = S.containers.filter(x => x.id !== ce.id); saveContainers(); S.ml.cEdit = null; renderMeals(); toast('Deleted'); break; }
    case 'c-photo': pickImage(f => addContainerPhoto(f), !!b.dataset.cam); break;
    case 'c-photo-del': { const ce = S.ml.cEdit; ce.photos.splice(Number(b.dataset.i), 1); ce.embN = -1; renderMeals(); break; }
    case 'c-weigh': pickImage(f => weighContainer(f), true); break;
    /* sports */
    case 'sp-view': S.sp.view = b.dataset.v; renderSports(); break;
    case 'sp-prev': S.sp.date = shift(S.sp.date, -1); S.sp.ci = {}; renderSports(); break;
    case 'sp-next': if (S.sp.date < dayKey()) { S.sp.date = shift(S.sp.date, 1); S.sp.ci = {}; renderSports(); } break;
    case 'sp-setup': S.sp.setup = true; renderSports(); window.scrollTo({top:0}); break;
    case 'sp-done': { const cfg = sportCfg(); cfg.done = true; S.sp.setup = false; saveProfile(); renderSports(); break; }
    case 'sp-point': { const cfg = sportCfg(), k = b.dataset.k; cfg.points = cfg.points.includes(k) ? cfg.points.filter(x => x !== k) : Object.keys(WEIGH_POINTS).filter(x => x === k || cfg.points.includes(x)); saveProfile(); b.setAttribute('aria-pressed', String(cfg.points.includes(k))); break; }
    case 'sp-q': { const cfg = sportCfg(), k = b.dataset.k; cfg.questions = cfg.questions.includes(k) ? cfg.questions.filter(x => x !== k) : Object.keys(QUESTIONS).filter(x => x === k || cfg.questions.includes(x)); saveProfile(); b.setAttribute('aria-pressed', String(cfg.questions.includes(k))); break; }
    case 'sp-cadd': { const q = $('#sp-cq').value.trim(); if (!q) { $('#sp-cq').focus(); break; } sportCfg().custom.push({id:'c_' + uid().slice(1), q:q.slice(0, 80), type:$('#sp-ct').value}); saveProfile(); renderSports(); toast('Question added'); break; }
    case 'sp-cdel': { const cfg = sportCfg(); cfg.custom = cfg.custom.filter(c => c.id !== b.dataset.id); saveProfile(); renderSports(); break; }
    case 'sp-kind': { const d = dayOf(S.sp.date); d.practice ||= {}; d.practice.kind = d.practice.kind === b.dataset.k ? '' : b.dataset.k; saveDay(S.sp.date); renderSports(); break; }
    case 'sp-rpe': { const d = dayOf(S.sp.date); d.practice ||= {}; d.practice.rpe = Number(b.dataset.v); if (!d.practice.kind) d.practice.kind = 'practice'; saveDay(S.sp.date); renderSports(); break; }
    case 'ci-ans': { const k = b.dataset.k, v = Number(b.dataset.v); S.sp.ci[k] = S.sp.ci[k] === v ? null : v; $$(`[data-action="ci-ans"][data-k="${CSS.escape(k)}"]`).forEach(x => x.setAttribute('aria-pressed', String(Number(x.dataset.v) === S.sp.ci[k]))); break; }
    case 'ci-step': { const k = b.dataset.k; S.sp.ci[k] = Math.max(0, Math.min(30, (S.sp.ci[k] || 0) + Number(b.dataset.d))); b.parentElement.querySelector('span').textContent = S.sp.ci[k]; break; }
    case 'ci-save': saveCheckin(); break;
    case 'ci-del': { const i = Number(b.dataset.i); if (S.sp.ciDel !== i) { S.sp.ciDel = i; renderSports(); setTimeout(() => { if (S.sp.ciDel === i) { S.sp.ciDel = null; if (S.tab === 'sports') renderSports(); } }, 4000); break; }
      const d = S.days[S.sp.date]; if (d?.checkins) { d.checkins.splice(i, 1); saveDay(S.sp.date); } S.sp.ciDel = null; renderSports(); toast('Check-in deleted'); break; }
    case 'hr-connect': hrConnect(); break;
    case 'hr-disconnect': { const c = S.hr.conn; if (S.hr.rec) hrStop(); S.hr.conn = null; S.hr.bpm = 0; c?.disconnect(); renderSports(); break; }
    case 'hr-start': hrStart(); break;
    case 'hr-stop': hrStop(); break;
    case 'health-import': $('#in-health').click(); break;
    case 'pin-week': togglePin(b.dataset.start); if (S.tab === 'week') renderWeek(); else renderSports(); break;
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  const ed = S.ml.edit, ce = S.ml.cEdit, L = S.ml.log;
  if (ed && ['r-name', 'r-text', 'r-cooked', 'r-serv'].includes(t.id)) {
    ({'r-name':() => ed.name = t.value, 'r-text':() => ed.text = t.value, 'r-cooked':() => ed.cookedIn = t.value, 'r-serv':() => ed.servings = t.value})[t.id]();
    if (t.id === 'r-cooked') renderRecipeTotals();
    return;
  }
  if (t.id === 'r-search') { clearTimeout(searchT); searchT = setTimeout(runRSearch, 140); return; }
  if (t.dataset.lbl && S.lbl?.form) { S.lbl.form[t.dataset.lbl] = t.value; if (['kcal', 'fat', 'carbs', 'protein'].includes(t.dataset.lbl)) { const f = S.lbl.form, est = 9 * num(f.fat) + 4 * num(f.carbs) + 4 * num(f.protein), el = $('#lbl-check'); if (el && num(f.kcal)) el.textContent = Math.abs(est - num(f.kcal)) / num(f.kcal) > 0.25 ? `⚠ Fat, carbs and protein add up to about ${int(est)} kcal, but the label says ${int(f.kcal)}.` : `✓ Adds up to about ${int(est)} kcal, close to the label’s ${int(f.kcal)}.`; } return; }
  if (t.dataset.restFilter != null && t.matches('[data-rest-filter]')) { S.rest.filter = t.value; clearTimeout(searchT); searchT = setTimeout(() => { renderPhoto(); const el = $('[data-rest-filter]'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 250); return; }
  if (t.id === 'eo-kcal') { S.eo.tKcal = t.value; clearTimeout(searchT); searchT = setTimeout(() => { renderMeals(); const el = $('#eo-kcal'); if (el) el.focus(); }, 600); return; }
  if (t.id === 'eo-p') { S.eo.tP = t.value; clearTimeout(searchT); searchT = setTimeout(() => { renderMeals(); const el = $('#eo-p'); if (el) el.focus(); }, 600); return; }
  if (t.id === 'eo-q') { S.eo.q = t.value; return; }
  if (t.dataset.rwater && ed) { const w = ed.water.find(x => x.id === t.dataset.rwater); if (w) { w.g = num(t.value); renderRecipeTotals(); } return; }
  if (ce && ['c-name', 'c-cap', 'c-empty'].includes(t.id)) { ce[{'c-name':'name', 'c-cap':'cap', 'c-empty':'empty'}[t.id]] = t.value; return; }
  if (L && t.id === 'pl-val') { L.val = t.value; renderPortionResult(); return; }
  if (L && t.id === 'pl-bowl') { L.bowlG = t.value; renderPortionResult(); return; }
  if (t.dataset.ciHours) { S.sp.ci[t.dataset.ciHours] = t.value === '' ? null : Math.min(16, num(t.value)); return; }
  if (t.id === 'b-cycle' || t.id === 'b-cyclelen') return;
  if (t.dataset.qty) {
    const {it, where} = findItem(t.dataset.qty); if (!it) return;
    it.qty = t.value === '' ? 0 : Math.max(0, Number(t.value) || 0);
    const li = t.closest('.pitem'); li.querySelector('[data-kcal]').textContent = int(num(it.p[0]) * itemGrams(it) / 100);
    itemTotalsChanged(where);
  } else if (t.id === 'plate-name') S.plateName = t.value;
  else if (t.id === 'search-in') { clearTimeout(searchT); searchT = setTimeout(runSearch, 140); }
  else if (t.closest('#view-body') && t.id && t.id.startsWith('b-')) { readForm(); S.dirty = true; renderBody(); }
  else if (t.id === 'pan-search') { clearTimeout(searchT); searchT = setTimeout(runPanSearch, 140); }
  else if (t.id && t.id.startsWith('g-')) { readGoals(); renderDietSum(); }
  else if (t.id === 'diet-in') {
    S.profile.dietText = t.value.slice(0, 600); renderDietSum();
    clearTimeout(dietT); dietT = setTimeout(() => { saveProfile(); if (S.pan.ideas || S.pan.plan) makeIdeas(S.pan.mode); }, 700);
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.weigh) {
    setWeight(t.dataset.date, t.dataset.weigh, t.value);
    if (S.tab === 'today') { renderWaterWeight(); renderWater(); } else if (S.tab === 'sports') renderSports();
    if (num(t.value)) toast(`${WEIGH_POINTS[t.dataset.weigh]?.label || 'Weight'} saved: ${lb1(t.value)} lb`);
    return;
  }
  if (t.dataset.pr) { const d = dayOf(t.dataset.date); d.practice ||= {}; d.practice[t.dataset.pr] = num(t.value) || ''; if (num(t.value) && !d.practice.kind) d.practice.kind = 'practice'; saveDay(t.dataset.date); renderSports(); return; }
  if (t.dataset.act) { const d = dayOf(t.dataset.date); d.activity ||= {}; d.activity[t.dataset.act] = num(t.value) || ''; saveDay(t.dataset.date); return; }
  if (t.dataset.pin) { const pn = pins().find(x => x.start === t.dataset.pin); if (pn) { pn.label = t.value.trim().slice(0, 40) || pn.label; saveProfile(); } return; }
  if (t.id === 'r-cooked-unit' && S.ml.edit) { S.ml.edit.cookedUnit = t.value; renderRecipeTotals(); return; }
  if (t.id === 'r-pot' && S.ml.edit) { S.ml.edit.potId = t.value; renderRecipeTotals(); return; }
  if (t.id === 'c-capu' && S.ml.cEdit) { S.ml.cEdit.capU = t.value; return; }
  if (t.id === 'c-emptyu' && S.ml.cEdit) { S.ml.cEdit.emptyU = t.value; return; }
  if (t.id === 'pl-cont' && S.ml.log) { S.ml.log.cont = t.value; S.ml.log.detected = null; renderMeals(); return; }
  if (t.id === 'sp-sport') { S.profile.sport = t.value; const cfg = sportCfg(); if (t.value === 'wrestling' && !cfg.points.includes('night')) cfg.points.push('night'); saveProfile(); fillBodyForm(); renderSports(); return; }
  if (t.id === 'sp-class') { sportCfg().weightClass = num(t.value) || ''; saveProfile(); return; }
  if (t.id === 'sp-wdate') { sportCfg().weighDate = t.value; saveProfile(); return; }
  if (t.id === 'cmp-a') { S.sp.cmpA = t.value; renderSports(); return; }
  if (t.id === 'cmp-b') { S.sp.cmpB = t.value; renderSports(); return; }
  if (t.id === 'set-creatine') { S.profile.creatine = t.checked; saveProfile(); return; }
  if (t.id === 'set-fdc') { settings().fdcKey = t.value.trim(); setFdcKey(settings().fdcKey); saveProfile(); toast(t.value.trim() ? 'USDA key saved' : 'Using the shared USDA key'); return; }
  if (t.id === 'set-gem') {
    const v = t.value.trim(); if (v === gemKey()) return;
    settings().gemKey = v; settings().gemInfo = null; G.forget(); saveProfile();
    renderTypeExtra();
    if (v) gemTest(); else { renderGemStatus(); toast('Gemini key removed'); }
    return;
  }
  if (t.id === 'set-gemshared') { settings().gemShared = t.checked; saveProfile(); renderGemStatus(); renderTypeExtra(); toast(t.checked ? 'Gemini is on for this phone' : 'Gemini is off. Everything stays on this phone.'); return; }
  if (t.dataset.gmSrc) { const [ctx, i] = t.dataset.gmSrc.split(':'), x = S.gm[ctx]?.items?.[Number(i)]; if (x) { x.useDb = t.value === 'db'; if (ctx === 'photo') renderPhoto(); else renderTypeExtra(); } return; }
  if (t.matches('[data-rest-pick]')) { if (t.value) { S.rest.manual = t.value; S.rest.no = false; updateRestaurant(); } return; }
  if (t.id === 'eo-q' && chainByName(t.value)) { eoGo(); return; }
  if (t.id === 'b-cycle') { S.profile.cycleStart = t.value; saveProfile(); return; }
  if (t.id === 'b-cyclelen') { S.profile.cycleLength = num(t.value) || ''; saveProfile(); return; }
  if (t.dataset.unit) {
    const {it, where} = findItem(t.dataset.unit); if (!it) return;
    const g = itemGrams(it); it.opt = Number(t.value);
    const o = it.opts[it.opt]; it.qty = o.t === 'grams' ? Math.round(g) : Math.max(0.25, Math.round(g / o.g * 4) / 4);
    rerenderItems(where);
  } else if (t.dataset.alt) {
    const {it, where} = findItem(t.dataset.alt); const f = BYID.get(Number(t.value)); if (!it || !f) return;
    const g = itemGrams(it); const n = usdaItem(f[0], g, null, null);
    Object.assign(it, {ndb:n.ndb, name:n.name, sub:n.sub, p:n.p, opts:n.opts, opt:n.opt, qty:n.qty, alts:null, label:null});
    rerenderItems(where);
  } else if (['b-act','b-goal','b-sport','b-days'].includes(t.id)) { readForm(); S.dirty = true; renderBody(); }
  else if (t.id === 'set-wrapped') { settings().wrapped = t.checked; saveProfile(); renderToday(); toast(t.checked ? 'Weekly recap plays as Wrapped stories' : 'Weekly recap shows as a simple report'); }
  else if (t.dataset.det) { const n = t.dataset.det; t.checked ? S.pan.sel.add(n) : S.pan.sel.delete(n); renderDetect(); }
  else if (t.dataset.pkAlt) { S.pk.choice[t.dataset.pkAlt] = t.value; if (t.dataset.mode === 'pantry') { if (t.value === 'none') S.pan.pkSel.delete(t.dataset.pkAlt); else S.pan.pkSel.add(t.dataset.pkAlt); renderDetect(); } else { S.pk.added.delete(t.dataset.pkAlt); renderPhoto(); } }
  else if (t.dataset.pk) { t.checked ? S.pan.pkSel.add(t.dataset.pk) : S.pan.pkSel.delete(t.dataset.pk); renderDetect(); }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'bc-code') { e.preventDefault(); lookupBarcode(e.target.value); }
  else if (e.target.id === 'eo-q') { e.preventDefault(); eoGo(); }
  else if (e.target.id === 'water-custom') { e.preventDefault(); const v = num(e.target.value); if (v) addWater(v); }
  else if (e.target.id === 'sp-cq') { e.preventDefault(); $('[data-action="sp-cadd"]').click(); }
});
$('#in-cam').addEventListener('change', e => { setPhoto(e.target.files[0]); e.target.value = ''; });
$('#in-gal').addEventListener('change', e => { setPhoto(e.target.files[0]); e.target.value = ''; });
$('#in-bfcam').addEventListener('change', e => { setBodyPhoto(e.target.files[0]); e.target.value = ''; });
$('#in-bfgal').addEventListener('change', e => { setBodyPhoto(e.target.files[0]); e.target.value = ''; });
$('#in-pcam').addEventListener('change', e => { scanPantry(e.target.files[0]); e.target.value = ''; });
$('#in-pgal').addEventListener('change', e => { scanPantry(e.target.files[0]); e.target.value = ''; });
$('#in-backup').addEventListener('change', e => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; });
['#in-anycam', '#in-anygal'].forEach(sel => $(sel).addEventListener('change', e => { const f = e.target.files[0], cb = picker.cb; picker.cb = null; e.target.value = ''; if (f && cb) cb(f); }));
$('#in-health').addEventListener('change', e => { const files = Array.from(e.target.files || []); e.target.value = ''; healthImport(files); });
document.addEventListener('visibilitychange', () => { if (document.hidden) bcStop(); else if (S.tab === 'today') renderToday(); });

/* install & offline */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; $('#install-btn').hidden = false; });
$('#install-btn').addEventListener('click', async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice.catch(() => {}); deferredInstall = null; $('#install-btn').hidden = true; });
window.addEventListener('appinstalled', () => { $('#install-btn').hidden = true; toast('Munchmark is on your home screen'); });
const syncOnline = () => { $('#offline-pill').hidden = navigator.onLine; };
window.addEventListener('online', syncOnline); window.addEventListener('offline', syncOnline);

/* ---------- boot ---------- */
async function boot(){
  syncOnline();
  const [db] = await Promise.all([fetch('data/foods.json').then(r => r.json()), loadAll()]);
  DB = db; INDEX = buildIndex(db); BYID = new Map(db.foods.map(f => [f[0], f]));
  const vw = new Set(); const addW = n => String(n).toLowerCase().replace(/[^a-z]+/g, ' ').split(' ').forEach(w => w.length >= 3 && vw.add(w));
  db.foods.forEach(f => addW(f[1])); LABELS.forEach(l => addW(l[0])); PANTRY.forEach(x => addW(x[0]));
  CHAINS.forEach(c => addW(c.name));
  setVocab([...vw]);
  initRestaurants({foods:db.foods, byId:BYID, search:(q, n) => search(INDEX, q, n)});
  S.pantry.forEach(f => { if (f.src === 'usda' && !f.full && BYID.get(f.ndb)) f.full = BYID.get(f.ndb)[1]; });
  fillBodyForm(); setFdcKey(settings().fdcKey);
  const h = (location.hash || '').slice(1);
  $('#b-sport').innerHTML = Object.entries(SPORTS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
  fillBodyForm();
  setTab(['scan','body','week','pantry','meals','containers','eatout','sports'].includes(h) ? h : 'today');
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot().catch(err => { console.error(err); document.querySelector('#meals').innerHTML = '<p class="err">Munchmark couldn’t load its food data. Reload the page.</p>'; });
window.__ml = {pantryFood, hrStop, healthImport, readScale, readText, parseIngredients, estimate, renderToday, renderMeals, renderSports, addWater, matchContainers, packScan, localMatches, S, parseMeal, labelItems, addToPlate, totalsOf, setTab, renderScan, addPantry, pantryFood, saveDay, playWeek, weekOf};
