import { buildIndex, search, tokens } from './search.js';
import { LABELS, PANTRY } from './labels.js';
import { mealIdeas, dayPlan, scaleT, roleOf } from './planner.js';
import { summarize, weekStart, addDays, SPORTS } from './week.js';
import { playWrapped } from './wrapped.js';
import { parseMeal, labelByName } from './parse.js';
import * as store from './store.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const int = n => Math.round(n).toLocaleString();
const dec = n => n >= 10 ? String(Math.round(n)) : (Math.round(n * 10) / 10).toString();
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const uid = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- reference ---------- */
const KEYS = ['calories','protein_g','carbs_g','fat_g','fiber_g','sugar_g','sat_fat_g','cholesterol_mg','sodium_mg','potassium_mg','calcium_mg','iron_mg','magnesium_mg','zinc_mg','vitamin_a_mcg','vitamin_c_mg','vitamin_d_mcg','vitamin_b12_mcg','folate_mcg'];
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
  pantry:[], pan:{photo:null, busy:false, step:0, steps:0, detect:null, sel:new Set(), ideas:null, plan:null, mode:'ideas'},
  wk:{start:null, report:false}, bcTarget:null,
  bf:{photo:null, busy:false, probs:null, level:null},
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
  S.days = {};
  for (const [k, v] of Object.entries(all)) if (k.startsWith('day-') && v && v.date) S.days[v.date] = v;
}
function saveDay(date){ const d = S.days[date]; store.put('day-' + date, d && d.entries.length ? d : null); }
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
  const protein = Math.round(1.6 * kg), fat = Math.round(goal * 0.28 / 9);
  const carbs = Math.max(0, Math.round((goal - protein * 4 - fat * 9) / 4));
  return {kg, cm, bmi, bmr, tdee, goal, protein, fat, carbs, floorHit, custom};
}
function targets(){
  const c = calcBody(S.profile);
  if (c) return {calories:c.goal, protein_g:c.protein, carbs_g:c.carbs, fat_g:c.fat, set:true};
  const k = num(S.profile.customKcal) >= 800 ? num(S.profile.customKcal) : 2200;
  return {calories:k, protein_g:Math.round(k*0.25/4), carbs_g:Math.round(k*0.47/4), fat_g:Math.round(k*0.28/9), set:false};
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
  $('#macros').innerHTML = [['protein_g','Protein','--protein'],['carbs_g','Carbs','--carbs'],['fat_g','Fat','--fat']].map(([k, l, c]) =>
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
  if (r.state === 'missing' || r.state === 'error') {
    html = `<div class="recbox"><span><b>Food recognizer</b><br><span class="sub">${r.state === 'error' ? esc(r.error) : 'Downloads once (about 150 MB, Wi-Fi recommended), then works offline on your phone.'}</span></span>
      <button type="button" class="btn primary" data-action="rec-download">${r.state === 'error' ? 'Try again' : 'Download recognizer'}</button></div>`;
  } else if (r.state === 'loading') {
    html = `<div class="recbox"><span><span class="spin"></span> <b id="rec-text">${esc(r.text || 'Starting…')}</b></span><div class="progress"><i id="rec-bar" style="width:${Math.round(r.progress * 100)}%"></i></div></div>`;
  } else if (r.busy) {
    html = `<div class="recbox"><span><span class="spin"></span> <b>Recognizing…</b></span></div>`;
  }
  $('#rec-status').innerHTML = html;
  if (!r.results || r.busy) { $('#rec-results').innerHTML = ''; return; }
  const unsure = r.results[0].p < 0.3;
  $('#rec-results').innerHTML = `<div class="sec"><div class="sec-head"><h2 class="h">${unsure ? 'Best guesses' : 'Looks like'}</h2><button type="button" class="linkbtn" data-action="mode" data-mode="type">Not here? Type it</button></div>
    ${unsure ? '<p class="fine">Not sure about this one. Pick the closest match, or type it in.</p>' : ''}
    <ul class="guesses">${r.results.map(g => { const L = labelByName(g.label); const on = r.added.has(g.label);
      return `<li class="guess ${on ? 'added' : ''}"><span><b>${esc(cap(g.label))}</b><small>${esc(L[2])} · ${int(labelKcal(L))} kcal</small><span class="pct"><i style="width:${Math.max(3, Math.round(g.p * 100))}%"></i></span></span>
        <button type="button" class="btn ${on ? 'ghost' : 'primary'} sm" data-action="guess-add" data-label="${esc(g.label)}">${on ? 'Added' : 'Add'}</button></li>`; }).join('')}</ul></div>`;
}
function renderPlate(){
  const items = S.plate;
  $('#plate').hidden = !items.length;
  if (!items.length) return;
  $('#pitems').innerHTML = items.map(it => {
    const g = itemGrams(it), kcal = num(it.p[0]) * g / 100;
    const alts = it.src === 'usda' ? (it.alts ||= altsFor(it)) : [];
    return `<li class="pitem" data-id="${it.id}">
      <div class="pitem-top"><span><b>${esc(it.name)}</b><small>${esc(it.group ? it.group + ' · ' : '')}${esc(it.sub)}</small></span><span class="k tnum" data-kcal>${int(kcal)}</span>
        <button type="button" class="x" data-action="pitem-del" data-id="${it.id}" aria-label="Remove ${esc(it.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="qty"><button type="button" data-action="qty" data-id="${it.id}" data-d="-1" aria-label="Less">−</button>
        <input type="number" inputmode="decimal" step="any" min="0" value="${esc(it.qty)}" data-qty="${it.id}" aria-label="Amount">
        <button type="button" data-action="qty" data-id="${it.id}" data-d="1" aria-label="More">+</button>
        <select data-unit="${it.id}" aria-label="Unit">${it.opts.map((o, i) => `<option value="${i}" ${i === it.opt ? 'selected' : ''}>${esc(o.t)}${o.t === 'grams' || / g$/.test(o.t) ? '' : ` (${dec(o.g)} g)`}</option>`).join('')}</select></div>
      ${alts.length ? `<select class="alt" data-alt="${it.id}" aria-label="Change food"><option value="">Not quite right? Pick a closer match…</option>${alts.map(f => `<option value="${f[0]}">${esc(shortName(f[1]))} · ${int(f[3])} kcal/100 g</option>`).join('')}</select>` : ''}
    </li>`;
  }).join('');
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
  try {
    const r = await recognizer();
    await r.load((p, text) => { S.rec.progress = p; S.rec.text = text; const b = $('#rec-bar'), tx = $('#rec-text'); if (b) b.style.width = Math.round(p * 100) + '%'; if (tx) tx.textContent = text; });
    S.rec.state = 'ready'; renderPhoto(); if (S.tab === 'pantry') renderPantry(); if (S.tab === 'body') { renderBodyPhoto(); if (S.bf.photo && !S.bf.probs) setBodyPhotoAgain(); } toast('Recognizer ready. It now works offline.');
    if (S.photo && !S.rec.results) classifyPhoto();
  } catch (e) {
    console.error(e);
    S.rec.state = 'error'; S.rec.error = 'The download didn’t finish. Check your connection and try again.'; renderPhoto(); if (S.tab === 'pantry') renderPantry();
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
  } finally { S.rec.busy = false; renderPhoto(); if (S.rec.results) $('#rec-results').scrollIntoView({behavior: reduced() ? 'auto' : 'smooth', block:'nearest'}); }
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
  return {blob, thumb, url:URL.createObjectURL(blob)};
}
async function setPhoto(file){
  if (!file) return;
  try {
    const p = await prepPhoto(file);
    if (S.photo) URL.revokeObjectURL(S.photo.url);
    S.photo = p; S.rec.results = null; S.rec.added = new Set();
    renderPhoto();
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
function offP100(n){
  const g = k => { const v = Number(n[k]); return Number.isFinite(v) ? v : null; };
  const x = (k, m) => { const v = g(k); return v == null ? null : v * m; };
  const kcal = g('energy-kcal_100g') ?? (g('energy_100g') != null ? g('energy_100g') / 4.184 : null);
  const sodium = g('sodium_100g') != null ? g('sodium_100g') * 1000 : (g('salt_100g') != null ? g('salt_100g') * 400 : null);
  return [kcal, g('proteins_100g'), g('carbohydrates_100g'), g('fat_100g'), g('fiber_100g'), g('sugars_100g'), g('saturated-fat_100g'),
    x('cholesterol_100g', 1000), sodium, x('potassium_100g', 1000), x('calcium_100g', 1000), x('iron_100g', 1000), x('magnesium_100g', 1000), x('zinc_100g', 1000),
    x('vitamin-a_100g', 1e6), x('vitamin-c_100g', 1000), x('vitamin-d_100g', 1e6), x('vitamin-b12_100g', 1e6), x('vitamin-b9_100g', 1e6) ?? x('folates_100g', 1e6)];
}
async function lookupBarcode(code){
  code = String(code || '').replace(/\D/g, '');
  if (code.length < 8 || code.length > 14) { bcMsg('Barcodes are 8 to 14 digits. Check the number and try again.', true); return; }
  if (!navigator.onLine) { bcMsg('You’re offline. Barcode lookups need a connection; typing foods works offline.', true); return; }
  bcMsg('Looking up ' + code + '…');
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,nutriments,serving_quantity,serving_size`);
    const j = await res.json();
    const pr = j && j.product;
    if (!pr || j.status === 0 || !pr.nutriments) { bcMsg('That barcode isn’t in Open Food Facts yet. Search for the food under Type instead.', true); return; }
    const p = offP100(pr.nutriments);
    if (p[0] == null) { bcMsg('Found the product, but it has no nutrition data. Search for it under Type instead.', true); return; }
    const name = [pr.brands ? String(pr.brands).split(',')[0].trim() : '', pr.product_name || 'Packaged food'].filter(Boolean).join(' ');
    const sq = num(pr.serving_quantity);
    const opts = [];
    if (sq) opts.push({t: tidy(pr.serving_size) || `1 serving`, g: sq});
    opts.push({t:'1 oz', g:28.35}, {t:'100 g', g:100}, {t:'grams', g:1});
    if (S.bcTarget === 'pantry') {
      S.bcTarget = null; bcMsg('');
      addPantry({key:'off' + code, src:'off', code, name, p, unitG: sq || 0, unitD: sq ? (tidy(pr.serving_size) || '1 serving') : '', group:0});
      setTab('pantry'); toast(`Added ${name} to your pantry`); return;
    }
    addToPlate([{id:uid(), src:'off', code, name, sub:`Barcode ${code} · Open Food Facts`, p, opts, opt:0, qty: sq ? 1 : 1}]);
    bcMsg(`Added ${name}${sq ? '' : '. No serving size listed, so it’s set to 1 oz; adjust it on your plate.'}`);
  } catch { bcMsg('Couldn’t reach Open Food Facts. Check your connection and try again.', true); }
}

/* ---------- typing & search ---------- */
function typeAdd(){
  const text = $('#type-in').value.trim(); const msg = $('#type-msg');
  if (!text) { $('#type-in').focus(); return; }
  const parsed = parseMeal(text, INDEX, BYID);
  const items = [], missing = [];
  for (const r of parsed){
    if (r.missing) { missing.push(r.text); continue; }
    const single = r.items.length === 1;
    for (const i of r.items){
      const it = usdaItem(i.ndb, i.g, single ? (r.label ? cap(r.label) : shortName(r.name)) : null, single ? r.portion : `${dec(i.g)} g`);
      if (!it) continue;
      if (r.label) it.label = r.label;
      if (!single) it.group = r.label || r.name;
      items.push(it);
    }
  }
  msg.hidden = !missing.length; msg.textContent = missing.length ? `Couldn’t find: ${missing.join(', ')}. Try the search below.` : '';
  if (items.length) { addToPlate(items); $('#type-in').value = ''; }
}
let searchT = 0;
function runSearch(){
  const q = $('#search-in').value.trim(), out = $('#search-results');
  if (q.length < 2) { out.innerHTML = ''; return; }
  const qt = tokens(q);
  const labs = LABELS.filter(l => { const lt = tokens(l[0]); return qt.every(t => lt.some(w => w.startsWith(t))); }).slice(0, 4);
  const usda = search(INDEX, q, 12);
  out.innerHTML = labs.map(l => `<li><button type="button" data-action="add-label" data-label="${esc(l[0])}"><span><b><span class="tag">Quick</span>${esc(cap(l[0]))}</b><small>${esc(l[2])}</small></span><span class="k tnum">${int(labelKcal(l))} kcal</span></button></li>`).join('') +
    usda.map(f => { const n = f.length, sg = f[n-4], sd = f[n-3]; const g = sg || 100; return `<li><button type="button" data-action="add-usda" data-ndb="${f[0]}"><span><b>${esc(shortName(f[1]))}</b><small>${esc(sd ? tidy(sd) : '100 g')} · ${esc(f[1])}</small></span><span class="k tnum">${int(num(f[3]) * g / 100)} kcal</span></button></li>`; }).join('') ||
    `<li><p class="fine" style="padding:10px 0">No matches. Try fewer or simpler words, like “chicken thigh”.</p></li>`;
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
  syncSex();
}
function syncSex(){ $$('[data-action="sex"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sex === S.draft.sex))); $('#hip-field').hidden = S.draft.sex === 'male'; }
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
        <div class="mtargets tnum"><div style="--c:var(--protein)"><span>Protein</span><b>${c.protein} g</b></div><div style="--c:var(--carbs)"><span>Carbs</span><b>${c.carbs} g</b></div><div style="--c:var(--fat)"><span>Fat</span><b>${c.fat} g</b></div></div>
        <p class="fine">${c.floorHit ? 'The goal is held at a minimum so the deficit stays safe. ' : ''}Mifflin-St Jeor formula. Protein is 1.6 g per kg of body weight, fat 28% of calories, carbs fill the rest.</p></div>
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
  const data = JSON.stringify({app:'macro-lens', version:1, exported:new Date().toISOString(), profile:S.profile, days:S.days, pantry:S.pantry});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], {type:'application/json'}));
  a.download = `macro-lens-backup-${dayKey()}.json`;
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
    if (j.profile && typeof j.profile === 'object') { S.profile = j.profile; saveProfile(); fillBodyForm(); }
    if (Array.isArray(j.pantry)) { S.pantry = j.pantry; savePantry(); }
    renderToday(); renderBody(); toast(`Restored ${n} day${n === 1 ? '' : 's'} of meals`);
  } catch { toast('That file isn’t a Macro Lens backup.'); }
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
  $('#wk-title').textContent = start === cur ? 'This week' : start === addDays(cur, -7) ? 'Last week' : rangeText(start);
  $('#wk-sub').textContent = start === cur ? `${rangeText(start)} · so far` : rangeText(start);
  $('#wk-next').disabled = start >= cur;
  const body = $('#wk-body');
  if (wrappedOn() && !S.wk.report) {
    body.innerHTML = `<div class="wk-cover"><svg class="wr-deco" viewBox="0 0 200 200" aria-hidden="true" fill="none" stroke-width="2"><circle cx="100" cy="100" r="96"/><circle cx="100" cy="100" r="64"/><circle cx="100" cy="100" r="30"/></svg>
        <p class="eb">${start === cur ? 'So far this week' : 'Your week, wrapped'}</p>
        <h2>${esc(rangeText(start))}</h2>
        <div class="wk-quick tnum"><span><b>${s.loggedDays}</b>days logged</span><span><b>${s.loggedDays ? int(s.avg[0]) : '—'}</b>avg calories</span><span><b>${s.proteinDays}</b>protein days</span></div>
        <button type="button" class="play" data-action="wk-play" ${s.loggedDays ? '' : 'disabled'}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>${s.loggedDays ? 'Play your week' : 'Log meals to unlock'}</button></div>
      <p class="fine">Your recap plays as full-screen stories: each day, your averages, top foods and tips for next week. Prefer a plain report? <button type="button" class="linkbtn" data-action="wk-report">Show it here</button> or turn off Wrapped style in Body → Settings.</p>`;
    return;
  }
  if (!s.loggedDays) { body.innerHTML = `<div class="empty"><b>Nothing logged this week</b><p>Log meals on a few days and this page fills in with daily totals, averages, top foods and tips.</p></div>`; return; }
  const a = s.avg, row = (l, v, t, u) => `<li class="nrow"><span>${l}</span><span class="tnum">${u === 'mg' ? int(v) : dec(v)} ${u}${t ? ` <em>· ${Math.round(v / t * 100)}%</em>` : ''}</span><div class="bar"><i style="width:${t ? Math.min(100, v / t * 100) : 0}%"></i></div></li>`;
  body.innerHTML = `${S.wk.report && wrappedOn() ? `<button type="button" class="btn ghost sm" data-action="wk-cover">Back to Wrapped view</button>` : ''}
    <div class="card sec">
      <h3 class="h">Daily average</h3>
      <div class="stat-big"><b class="tnum">${int(a[0])}</b><span class="sub">calories · goal ${int(g.calories)}</span></div>
      <div class="kv tnum"><div><span>Days logged</span><b>${s.loggedDays} of 7</b></div><div><span>Protein goal hit</span><b>${s.proteinDays} days</b></div><div><span>Calories on target</span><b>${s.kcalDays} days</b></div><div><span>Longest streak</span><b>${s.streak} days</b></div></div>
    </div>
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
  return {key:'ndb' + ndb, ndb, name: name || friendly(ndb) || shortName(f[1]), role: role || null, group:f[2], p:p100Of(f), ...friendlyUnit(ndb, f), src:'usda'};
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
const planOpts = () => ({meals: 3, snack: true, lowSodium: false, highFiber: false, ...(S.profile.planOpts || {})});
function renderPantry(){
  const p = S.pan;
  const frame = $('#pframe'); frame.classList.toggle('has-photo', !!p.photo); frame.classList.toggle('scanning', p.busy);
  $('#pframe-img').hidden = !p.photo; if (p.photo && $('#pframe-img').src !== p.photo.url) $('#pframe-img').src = p.photo.url;
  $('#pframe-empty').hidden = !!p.photo;
  const r = S.rec; let st = '';
  if (r.state === 'missing' || r.state === 'error') st = `<div class="recbox"><span><b>Food recognizer</b><br><span class="sub">${r.state === 'error' ? esc(r.error) : 'Downloads once (about 150 MB, Wi-Fi recommended), then reads groceries offline. You can also add foods by name or barcode below.'}</span></span><button type="button" class="btn primary" data-action="rec-download">${r.state === 'error' ? 'Try again' : 'Download recognizer'}</button></div>`;
  else if (r.state === 'loading') st = `<div class="recbox"><span><span class="spin"></span> <b id="rec-text">${esc(r.text || 'Starting…')}</b></span><div class="progress"><i id="rec-bar" style="width:${Math.round(r.progress * 100)}%"></i></div></div>`;
  else if (p.busy) st = `<div class="recbox"><span><span class="spin"></span> <b id="pan-step">Looking at your groceries… ${p.step} of ${p.steps || 10}</b></span><div class="progress"><i id="pan-bar" style="width:${Math.round(p.step / (p.steps || 10) * 100)}%"></i></div></div>`;
  $('#pan-status').innerHTML = st;
  renderDetect();
  $('#pan-count').textContent = S.pantry.length ? `${S.pantry.length} item${S.pantry.length === 1 ? '' : 's'}` : '';
  $('#pan-clear').hidden = !S.pantry.length;
  const groups = {};
  for (const f of S.pantry) (groups[f.role || roleOf(f)] ||= []).push(f);
  $('#pan-list').innerHTML = S.pantry.length ? Object.keys(ROLE_LABEL).filter(k => groups[k]).map(k => `<div class="pgroup"><span class="lbl">${ROLE_LABEL[k]}</span><div class="chips">${groups[k].map(f => `<span class="pchip">${esc(f.name)}<button type="button" data-action="pan-del" data-key="${esc(f.key)}" aria-label="Remove ${esc(f.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></span>`).join('')}</div></div>`).join('')
    : `<div class="empty"><b>Your pantry is empty</b><p>Snap your cabinet or groceries, or add foods by name or barcode. Meal ideas use only what's here.</p></div>`;
  const g = planGoals(), o = planOpts();
  for (const [id, k] of [['g-kcal','calories'],['g-p','protein_g'],['g-c','carbs_g'],['g-f','fat_g']]) { const el = $('#' + id); if (document.activeElement !== el) el.value = Math.round(g[k]); }
  $$('[data-action="pan-meals"]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.n) === o.meals)));
  $$('[data-action="pan-opt"]').forEach(b => b.setAttribute('aria-pressed', String(!!o[b.dataset.opt])));
  renderIdeas();
}
function renderDetect(){
  const p = S.pan, el = $('#pan-detect');
  if (!p.detect || p.busy) { el.innerHTML = ''; return; }
  if (!p.detect.length) { el.innerHTML = `<p class="notice">Couldn't pick out any groceries. Try a closer photo with labels facing the camera, or add foods by name below.</p>`; return; }
  const n = p.sel.size;
  el.innerHTML = `<div class="card sec"><div class="sec-head"><h3 class="h">Spotted in your photo</h3><span class="sub">Uncheck anything wrong</span></div>
    <ul class="detect">${p.detect.map(d => `<li><label><input type="checkbox" data-det="${esc(d.name)}" ${p.sel.has(d.name) ? 'checked' : ''}><span>${esc(d.name)}</span><em>${d.p >= 0.5 ? 'sure' : d.p >= 0.25 ? 'likely' : 'maybe'}</em></label></li>`).join('')}</ul>
    <button type="button" class="btn primary" data-action="pan-add-detected" ${n ? '' : 'disabled'}>Add ${n} to pantry</button></div>`;
}
async function scanPantry(file){
  if (!file) return;
  try { const ph = await prepPhoto(file); if (S.pan.photo) URL.revokeObjectURL(S.pan.photo.url); S.pan.photo = ph; } catch { toast('Couldn’t open that photo. Try a JPEG or PNG.'); return; }
  S.pan.detect = null; renderPantry();
  if (S.rec.state !== 'ready') { if (S.rec.state === 'unknown') await checkRecognizer(); if (S.rec.state !== 'ready') { renderPantry(); toast('Download the recognizer first, or add foods by name'); return; } }
  S.pan.busy = true; S.pan.step = 0; S.pan.steps = 10; renderPantry();
  try {
    const r = await recognizer();
    const found = await r.classifyMany(S.pan.photo.blob, (i, n) => { S.pan.step = i; S.pan.steps = n; const t = $('#pan-step'), b = $('#pan-bar'); if (t) t.textContent = `Looking at your groceries… ${i} of ${n}`; if (b) b.style.width = Math.round(i / n * 100) + '%'; });
    S.pan.detect = found.filter(d => !S.pantry.some(x => x.name === d.name));
    S.pan.sel = new Set(S.pan.detect.filter(d => d.p >= 0.25).map(d => d.name));
  } catch (e) { console.error(e); toast('Couldn’t read that photo. Try again or add foods by name.'); }
  finally { S.pan.busy = false; renderPantry(); }
}
let panT = 0;
function runPanSearch(){
  const q = $('#pan-search').value.trim(), out = $('#pan-results');
  if (q.length < 2) { out.innerHTML = ''; return; }
  const qt = tokens(q);
  const quick = PANTRY.filter(p => { const lt = tokens(p[0]); return qt.every(t => lt.some(w => w.startsWith(t))); }).slice(0, 5);
  const usda = search(INDEX, q, 8).filter(f => !quick.some(p => p[2] === f[0]));
  out.innerHTML = quick.map(p => `<li><button type="button" data-action="pan-add" data-ndb="${p[2]}" data-name="${esc(p[0])}" data-role="${p[3]}"><span><b><span class="tag">Quick</span>${esc(p[0])}</b><small>${esc(ROLE_LABEL[p[3]] || '')}</small></span><span class="k">Add</span></button></li>`).join('') +
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
    const g = planGoals(), d = p.plan, t = d.totals;
    S.pan.logList = d.plan.map(x => x.idea);
    out.innerHTML = `<div class="sec-head"><h2 class="h">Your day</h2><span class="match ${d.match < 85 ? 'mid' : ''}">${Math.round(d.match)}% match</span></div>
      ${d.plan.map((x, i) => ideaHTML(x.idea, x.slot, i)).join('')}
      <div class="daytot tnum"><b>Day total:</b> ${int(t[0])} of ${int(g.calories)} kcal · P ${int(t[1])}/${int(g.protein_g)} g · C ${int(t[2])}/${int(g.carbs_g)} g · F ${int(t[3])}/${int(g.fat_g)} g</div>
      <p class="fine">Built only from your pantry, with portions solved to land on your numbers. Cook and season to taste.</p>`;
  } else if (p.mode === 'ideas' && p.ideas) {
    S.pan.logList = p.ideas;
    const o = planOpts(), share = o.snack ? 0.88 / o.meals : 1 / o.meals, mt = scaleT(planGoals(), share);
    out.innerHTML = p.ideas.length ? `<div class="sec-head"><h2 class="h">Meal ideas</h2><span class="sub tnum">target ${int(mt.calories)} kcal · ${int(mt.protein_g)} g protein</span></div>
      ${p.ideas.map((x, i) => ideaHTML(x, null, i)).join('')}
      <p class="fine">Each idea is sized to one of your ${o.meals} meals${o.snack ? ' (with a daily snack set aside)' : ''}. Built only from your pantry. Cook and season to taste.</p>`
      : `<p class="notice">Not enough to build meals yet. Add at least one protein (like eggs, chicken or Greek yogurt) and one carb (like rice, bread or oats).</p>`;
  } else out.innerHTML = '';
}
function makeIdeas(mode){
  const msg = $('#pan-msg'); msg.hidden = true;
  if (S.pantry.length < 2) { msg.textContent = 'Add a few foods to your pantry first.'; msg.hidden = false; return; }
  readGoals();
  const g = planGoals(), o = planOpts();
  if (!(g.calories > 300)) { msg.textContent = 'Set a daily calorie goal first.'; msg.hidden = false; return; }
  S.pan.mode = mode;
  const sodiumBudget = o.lowSodium ? 2300 / (o.meals + (o.snack ? 1 : 0)) : 0;
  if (mode === 'day') S.pan.plan = dayPlan(S.pantry, g, o);
  else S.pan.ideas = mealIdeas(S.pantry, scaleT(g, o.snack ? 0.88 / o.meals : 1 / o.meals), {...o, sodiumBudget, count: 8});
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

/* ---------- tabs, toast ---------- */
function setTab(t){
  S.tab = t;
  ['today','week','scan','pantry','body'].forEach(v => $('#view-' + v).hidden = v !== t);
  $$('.tabs [data-action="tab"]').forEach(b => b.dataset.tab === t ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
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
    case 'clear-photo': if (S.photo) URL.revokeObjectURL(S.photo.url); S.photo = null; S.rec.results = null; renderPhoto(); break;
    case 'rec-download': downloadRecognizer(); break;
    case 'guess-add': {
      const lab = b.dataset.label; if (S.rec.added.has(lab)) break;
      const items = labelItems(lab); S.rec.added.add(lab); addToPlate(items); renderPhoto(); break; }
    case 'bc-start': bcStart(); break;
    case 'bc-stop': bcStop(); bcMsg(''); break;
    case 'bc-lookup': lookupBarcode($('#bc-code').value); break;
    case 'type-add': typeAdd(); break;
    case 'add-label': addToPlate(labelItems(b.dataset.label)); $('#search-results').innerHTML = ''; $('#search-in').value = ''; break;
    case 'add-usda': { const f = BYID.get(Number(b.dataset.ndb)); if (f) { const n = f.length; const it = usdaItem(f[0], f[n-4] || 100, null, null); if (it) { addToPlate([it]); $('#search-results').innerHTML = ''; $('#search-in').value = ''; } } break; }
    case 'pitem-del': S.plate = S.plate.filter(x => x.id !== b.dataset.id); renderPlate(); break;
    case 'qty': {
      const it = S.plate.find(x => x.id === b.dataset.id); if (!it) break;
      const isG = it.opts[it.opt].t === 'grams';
      const down = Number(b.dataset.d) < 0, q = num(it.qty);
      const step = isG ? 10 : ((down ? q <= 1 : q < 1) ? 0.25 : 0.5);
      it.qty = Math.max(0, Math.round((num(it.qty) + step * Number(b.dataset.d)) * 100) / 100);
      renderPlate(); break; }
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
    case 'pan-take': $('#in-pcam').click(); break;
    case 'pan-pick': $('#in-pgal').click(); break;
    case 'pan-add-detected': {
      let n = 0; for (const d of S.pan.detect || []) { if (!S.pan.sel.has(d.name)) continue; const P = PANTRY.find(x => x[0] === d.name); if (P && addPantry(pantryFood(P[2], P[0], P[3]))) n++; }
      S.pan.detect = null; S.pan.sel = new Set(); renderPantry(); toast(`Added ${n} item${n === 1 ? '' : 's'} to your pantry`); break; }
    case 'pan-add': { const ok = addPantry(pantryFood(Number(b.dataset.ndb), b.dataset.name || null, b.dataset.role || null)); $('#pan-search').value = ''; $('#pan-results').innerHTML = ''; renderPantry(); toast(ok ? 'Added to your pantry' : 'Already in your pantry'); break; }
    case 'pan-del': S.pantry = S.pantry.filter(x => x.key !== b.dataset.key); savePantry(); S.pan.ideas = null; S.pan.plan = null; renderPantry(); break;
    case 'pan-clear': if (b.dataset.confirm) { S.pantry = []; savePantry(); S.pan.ideas = S.pan.plan = null; delete b.dataset.confirm; b.textContent = 'Clear all'; renderPantry(); } else { b.dataset.confirm = '1'; b.textContent = 'Tap again to clear'; setTimeout(() => { delete b.dataset.confirm; b.textContent = 'Clear all'; }, 4000); } break;
    case 'pan-barcode': S.bcTarget = 'pantry'; S.mode = 'barcode'; setTab('scan'); bcMsg('Scanning for your pantry. The item goes to your pantry, not your log.'); break;
    case 'pan-usebody': S.profile.planGoals = {}; saveProfile(); renderPantry(); toast(targets().set ? 'Using your Body targets' : 'Add your stats in Body for personal targets'); break;
    case 'pan-meals': (S.profile.planOpts ||= {}).meals = Number(b.dataset.n); saveProfile(); renderPantry(); if (S.pan.ideas || S.pan.plan) makeIdeas(S.pan.mode); break;
    case 'pan-opt': { const o = (S.profile.planOpts ||= {}); const k = b.dataset.opt; o[k] = !planOpts()[k]; saveProfile(); renderPantry(); if (S.pan.ideas || S.pan.plan) makeIdeas(S.pan.mode); break; }
    case 'pan-ideas': makeIdeas('ideas'); break;
    case 'pan-day': makeIdeas('day'); break;
    case 'idea-log': { const idea = (S.pan.logList || [])[Number(b.dataset.idx)]; if (idea) logIdea(idea, b.dataset.slot || null); break; }
    case 'import': $('#in-backup').click(); break;
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.qty) {
    const it = S.plate.find(x => x.id === t.dataset.qty); if (!it) return;
    it.qty = t.value === '' ? 0 : Math.max(0, Number(t.value) || 0);
    const li = t.closest('.pitem'); li.querySelector('[data-kcal]').textContent = int(num(it.p[0]) * itemGrams(it) / 100);
    renderPlateTotals();
  } else if (t.id === 'plate-name') S.plateName = t.value;
  else if (t.id === 'search-in') { clearTimeout(searchT); searchT = setTimeout(runSearch, 140); }
  else if (t.closest('#view-body') && t.id && t.id.startsWith('b-')) { readForm(); S.dirty = true; renderBody(); }
  else if (t.id === 'pan-search') { clearTimeout(searchT); searchT = setTimeout(runPanSearch, 140); }
  else if (t.id && t.id.startsWith('g-')) { readGoals(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.unit) {
    const it = S.plate.find(x => x.id === t.dataset.unit); if (!it) return;
    const g = itemGrams(it); it.opt = Number(t.value);
    const o = it.opts[it.opt]; it.qty = o.t === 'grams' ? Math.round(g) : Math.max(0.25, Math.round(g / o.g * 4) / 4);
    renderPlate();
  } else if (t.dataset.alt) {
    const it = S.plate.find(x => x.id === t.dataset.alt); const f = BYID.get(Number(t.value)); if (!it || !f) return;
    const g = itemGrams(it); const n = usdaItem(f[0], g, null, null);
    Object.assign(it, {ndb:n.ndb, name:n.name, sub:n.sub, p:n.p, opts:n.opts, opt:n.opt, qty:n.qty, alts:null, label:null});
    renderPlate();
  } else if (['b-act','b-goal','b-sport','b-days'].includes(t.id)) { readForm(); S.dirty = true; renderBody(); }
  else if (t.id === 'set-wrapped') { settings().wrapped = t.checked; saveProfile(); renderToday(); toast(t.checked ? 'Weekly recap plays as Wrapped stories' : 'Weekly recap shows as a simple report'); }
  else if (t.dataset.det) { const n = t.dataset.det; t.checked ? S.pan.sel.add(n) : S.pan.sel.delete(n); renderDetect(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'bc-code') { e.preventDefault(); lookupBarcode(e.target.value); } });
$('#in-cam').addEventListener('change', e => { setPhoto(e.target.files[0]); e.target.value = ''; });
$('#in-gal').addEventListener('change', e => { setPhoto(e.target.files[0]); e.target.value = ''; });
$('#in-bfcam').addEventListener('change', e => { setBodyPhoto(e.target.files[0]); e.target.value = ''; });
$('#in-bfgal').addEventListener('change', e => { setBodyPhoto(e.target.files[0]); e.target.value = ''; });
$('#in-pcam').addEventListener('change', e => { scanPantry(e.target.files[0]); e.target.value = ''; });
$('#in-pgal').addEventListener('change', e => { scanPantry(e.target.files[0]); e.target.value = ''; });
$('#in-backup').addEventListener('change', e => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; });
document.addEventListener('visibilitychange', () => { if (document.hidden) bcStop(); else if (S.tab === 'today') renderToday(); });

/* install & offline */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; $('#install-btn').hidden = false; });
$('#install-btn').addEventListener('click', async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice.catch(() => {}); deferredInstall = null; $('#install-btn').hidden = true; });
window.addEventListener('appinstalled', () => { $('#install-btn').hidden = true; toast('Macro Lens is on your home screen'); });
const syncOnline = () => { $('#offline-pill').hidden = navigator.onLine; };
window.addEventListener('online', syncOnline); window.addEventListener('offline', syncOnline);

/* ---------- boot ---------- */
async function boot(){
  syncOnline();
  const [db] = await Promise.all([fetch('data/foods.json').then(r => r.json()), loadAll()]);
  DB = db; INDEX = buildIndex(db); BYID = new Map(db.foods.map(f => [f[0], f]));
  fillBodyForm();
  const h = (location.hash || '').slice(1);
  $('#b-sport').innerHTML = Object.entries(SPORTS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
  fillBodyForm();
  setTab(['scan','body','week','pantry'].includes(h) ? h : 'today');
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot().catch(err => { console.error(err); document.querySelector('#meals').innerHTML = '<p class="err">Macro Lens couldn’t load its food data. Reload the page.</p>'; });
window.__ml = {S, parseMeal, labelItems, addToPlate, totalsOf, setTab, renderScan, addPantry, pantryFood, saveDay, playWeek, weekOf};
