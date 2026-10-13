import { buildIndex, search, tokens } from './search.js';
import { LABELS } from './labels.js';
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
  S.days = {};
  for (const [k, v] of Object.entries(all)) if (k.startsWith('day-') && v && v.date) S.days[v.date] = v;
}
function saveDay(date){ const d = S.days[date]; store.put('day-' + date, d && d.entries.length ? d : null); }
function saveProfile(){ store.put('profile', S.profile); }

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
  renderPhoto();
}
async function downloadRecognizer(){
  if (!navigator.onLine) { S.rec.state = 'error'; S.rec.error = 'You’re offline. Connect to Wi-Fi to download the recognizer.'; renderPhoto(); return; }
  Object.assign(S.rec, {state:'loading', progress:0, text:'Starting download…'}); renderPhoto();
  try {
    const r = await recognizer();
    await r.load((p, text) => { S.rec.progress = p; S.rec.text = text; const b = $('#rec-bar'), tx = $('#rec-text'); if (b) b.style.width = Math.round(p * 100) + '%'; if (tx) tx.textContent = text; });
    S.rec.state = 'ready'; renderPhoto(); toast('Recognizer ready. It now works offline.');
    if (S.photo && !S.rec.results) classifyPhoto();
  } catch (e) {
    console.error(e);
    S.rec.state = 'error'; S.rec.error = 'The download didn’t finish. Check your connection and try again.'; renderPhoto();
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
  S.draft = {sex:p.sex || '', age:p.age || '', ft:p.ft || '', inch:p.inch ?? '', weightLb:p.weightLb || '', activity:p.activity || 'light', goal:p.goal || 'maintain', customKcal:p.customKcal || '', neck:p.neck || '', waist:p.waist || '', hip:p.hip || ''};
  const d = S.draft;
  $('#b-age').value = d.age; $('#b-ft').value = d.ft; $('#b-in').value = d.inch; $('#b-wt').value = d.weightLb;
  $('#b-act').value = d.activity; $('#b-goal').value = d.goal; $('#b-kcal').value = d.customKcal;
  $('#b-neck').value = d.neck; $('#b-waist').value = d.waist; $('#b-hip').value = d.hip;
  syncSex();
}
function syncSex(){ $$('[data-action="sex"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sex === S.draft.sex))); $('#hip-field').hidden = S.draft.sex === 'male'; }
function readForm(){
  const d = S.draft;
  d.age = $('#b-age').value; d.ft = $('#b-ft').value; d.inch = $('#b-in').value; d.weightLb = $('#b-wt').value;
  d.activity = $('#b-act').value; d.goal = $('#b-goal').value; d.customKcal = $('#b-kcal').value;
  d.neck = $('#b-neck').value; d.waist = $('#b-waist').value; d.hip = $('#b-hip').value;
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
      ${navy ? `<div class="card sec"><h3 class="h">Body fat (tape measure)</h3>
        <div class="stat-big"><b class="tnum">${navy.toFixed(1)}%</b><span class="pill">${bfCat(d.sex, navy)}</span></div>
        ${scaleBar(B.min, B.max, B.bands, ['color-mix(in oklab,var(--carbs) 70%,var(--surface-2))','var(--good)','color-mix(in oklab,var(--good) 55%,var(--surface-2))','color-mix(in oklab,var(--muted) 45%,var(--surface-2))','color-mix(in oklab,var(--warn) 75%,var(--surface-2))'], navy, B.bands.map(x => x[2]))}
        ${w ? `<div class="kv tnum"><div><span>Lean mass</span><b>${int(w * (1 - navy / 100))} lb</b></div><div><span>Fat mass</span><b>${int(w * navy / 100)} lb</b></div></div>` : ''}
        <p class="fine">U.S. Navy circumference formula. Usually within a few percentage points of a DEXA scan when measured carefully.</p></div>`
      : `<div class="card sec"><h3 class="h">Body fat</h3><p class="fine" style="font-size:13.5px">Add your neck and waist${d.sex === 'female' ? ' and hips' : ''} under Tape measurements to get a body-fat estimate.</p></div>`}`;
  }
  const list = (S.profile.checkins || []).slice().sort((a, b) => b.date < a.date ? -1 : 1).slice(0, 12);
  $('#hist-sec').hidden = !list.length;
  $('#hist').innerHTML = `<thead><tr><th>Date</th><th>Weight</th><th>BMI</th><th>Body fat</th></tr></thead><tbody>${list.map(c => `<tr><td>${esc(shortDay(c.date))}</td><td>${c.weightLb ? dec(num(c.weightLb)) + ' lb' : '—'}</td><td>${c.bmi ? num(c.bmi).toFixed(1) : '—'}</td><td>${c.bfp ? num(c.bfp).toFixed(1) + '%' : '—'}</td></tr>`).join('')}</tbody>`;
}
function saveStats(){
  readForm();
  const d = S.draft, c = calcBody(d), navy = navyBF(d);
  const p = Object.assign({}, S.profile, {sex:d.sex, age:num(d.age) || '', ft:num(d.ft) || '', inch:d.inch === '' ? '' : Number(d.inch) || 0, weightLb:num(d.weightLb) || '',
    activity:d.activity, goal:d.goal, customKcal:num(d.customKcal) || '', neck:num(d.neck) || '', waist:num(d.waist) || '', hip:num(d.hip) || ''});
  if (c) {
    const today = dayKey(), list = (p.checkins || []).filter(x => x.date !== today);
    list.push({date:today, weightLb:num(d.weightLb), bmi:Math.round(c.bmi * 10) / 10, bfp: navy ? Math.round(navy * 10) / 10 : 0});
    p.checkins = list.sort((a, b) => a.date < b.date ? -1 : 1).slice(-120);
  }
  S.profile = p; S.dirty = false; saveProfile(); renderBody(); renderToday();
}

/* ---------- backup ---------- */
function exportBackup(){
  const data = JSON.stringify({app:'macro-lens', version:1, exported:new Date().toISOString(), profile:S.profile, days:S.days});
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
    renderToday(); renderBody(); toast(`Restored ${n} day${n === 1 ? '' : 's'} of meals`);
  } catch { toast('That file isn’t a Macro Lens backup.'); }
}

/* ---------- tabs, toast ---------- */
function setTab(t){
  S.tab = t;
  ['today','scan','body'].forEach(v => $('#view-' + v).hidden = v !== t);
  $$('.tabs [data-action="tab"]').forEach(b => b.dataset.tab === t ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  if (t !== 'scan') bcStop();
  if (t === 'today') renderToday();
  if (t === 'scan') { renderScan(); if (S.rec.state === 'unknown') checkRecognizer(); }
  if (t === 'body') renderBody();
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
    case 'sex': S.draft.sex = b.dataset.sex; S.dirty = true; syncSex(); renderBody(); break;
    case 'body-save': saveStats(); toast('Stats saved'); break;
    case 'export': exportBackup(); break;
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
  } else if (t.id === 'b-act' || t.id === 'b-goal') { readForm(); S.dirty = true; renderBody(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'bc-code') { e.preventDefault(); lookupBarcode(e.target.value); } });
$('#in-cam').addEventListener('change', e => { setPhoto(e.target.files[0]); e.target.value = ''; });
$('#in-gal').addEventListener('change', e => { setPhoto(e.target.files[0]); e.target.value = ''; });
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
  setTab(['scan','body'].includes(h) ? h : 'today');
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot().catch(err => { console.error(err); document.querySelector('#meals').innerHTML = '<p class="err">Macro Lens couldn’t load its food data. Reload the page.</p>'; });
window.__ml = {S, parseMeal, labelItems, addToPlate, totalsOf, setTab, renderScan};
