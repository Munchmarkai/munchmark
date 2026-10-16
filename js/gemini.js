// Google Gemini for photo, menu and typed-food recognition, with the person's own free AI Studio key.
// The key stays on the phone; requests go straight from the phone to Google.
// Free tier: Google may use what is sent to improve its products, so the app only sends what the person asks it to.
const API = 'https://generativelanguage.googleapis.com/v1beta/models/';

// Tried in order until one works for this key; the one that works is remembered.
// 2.5 Flash-Lite has free Google Search, but Google only serves 2.5 to accounts that used it before.
// Gemini 3 models only search with billing on, so a new free key usually lands on 3.5 Flash-Lite without search.
export const PLAN = [
  {model:'gemini-2.5-flash-lite', search:true},
  {model:'gemini-3.5-flash-lite', search:true},
  {model:'gemini-3.5-flash-lite', search:false},
  {model:'gemini-3.1-flash-lite', search:false},
  {model:'gemini-flash-lite-latest', search:false},
  {model:'gemini-flash-latest', search:false},
];
export const modelName = m => 'Gemini ' + String(m || '').replace(/^gemini-/, '').split('-').map(w => w === 'latest' ? '(latest)' : /^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ').replace('Flash Lite', 'Flash-Lite');

export class GeminiError extends Error {
  constructor(kind, message, extra = {}){ super(message); this.kind = kind; Object.assign(this, extra); }
}

const CAP = 'macrolens.gemini.cap.v1', USE = 'macrolens.gemini.use.v1';
const tail = who => String(who || '').slice(-24);
function capGet(key){ try { const c = JSON.parse(localStorage.getItem(CAP) || 'null'); return c && c.k === tail(key) && Date.now() - c.t < 3 * 864e5 && PLAN[c.i] ? c : null; } catch { return null; } }
function capSet(key, i){ try { localStorage.setItem(CAP, JSON.stringify({k:tail(key), i, t:Date.now()})); } catch {} }
export function forget(){ try { localStorage.removeItem(CAP); } catch {} }
const today = () => new Date().toLocaleDateString('en-CA');
function countUse(){ try { const u = JSON.parse(localStorage.getItem(USE) || 'null'); const n = u && u.d === today() ? u.n + 1 : 1; localStorage.setItem(USE, JSON.stringify({d:today(), n})); } catch {} }
export function usedToday(){ try { const u = JSON.parse(localStorage.getItem(USE) || 'null'); return u && u.d === today() ? u.n : 0; } catch { return 0; } }


// what kind of failure a response is
export function classify(status, body){
  const e = (body && body.error) || {}, msg = String(e.message || ''), all = msg + ' ' + JSON.stringify(e.details || []) + ' ' + String(e.status || '');
  if (e.macrolens) return e.macrolens;   // the shared server's own answers
  if (status === 429) return /limit:\s*0\b/.test(all) ? 'model' : 'rate';
  if (/API key not valid|API_KEY_INVALID|API key expired|reported as leaked|API_KEY_SERVICE_BLOCKED|API_KEY_HTTP_REFERRER_BLOCKED|referer|SERVICE_DISABLED|has not been used in project|API has not been enabled|is disabled/i.test(all)) return 'key';
  if (/location is not supported|not available in your (country|region)/i.test(all)) return 'region';
  if (status === 404 || status === 400 || status === 403) return 'model';
  if (status >= 500) return 'server';
  return 'bad';
}
const retryDelay = body => { const r = ((body && body.error && body.error.details) || []).find(d => /RetryInfo/.test(d['@type'] || '')); const s = r ? parseFloat(r.retryDelay) : NaN; return Number.isFinite(s) ? s : null; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// with a personal key the phone talks to Google; otherwise it goes through the app's shared server, which adds the key
async function post(key, proxy, model, body, timeoutMs){
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  const url = key ? `${API}${model}:generateContent` : `${String(proxy).replace(/\/+$/, '')}/v1beta/models/${model}:generateContent`;
  const headers = key ? {'Content-Type':'application/json', 'x-goog-api-key':key} : {'Content-Type':'application/json'};
  try {
    const r = await fetch(url, {method:'POST', headers, body:JSON.stringify(body), signal:ctl.signal});
    let j = null; try { j = await r.json(); } catch {}
    return {status:r.status, ok:r.ok, j};
  } catch (e) {
    throw new GeminiError('net', e && e.name === 'AbortError' ? 'Gemini took too long to answer.' : 'Couldn’t reach Gemini.', {shared:!key});
  } finally { clearTimeout(t); }
}

// One request: walks the plan from the remembered model, falls back when a model or Search isn't available to this key.
export async function ask({key = '', proxy = '', limit = 0, system, parts, fresh = false, timeoutMs = 60000}){
  if (!key && !proxy) throw new GeminiError('key', 'No Gemini key.');
  if (!key && limit && usedToday() >= limit) throw new GeminiError('rate', `This phone has used its ${limit} shared Gemini requests for today. More tomorrow.`, {own:true, daily:true});
  const who = key || 'shared:' + proxy;
  if (fresh) forget();
  const cap = capGet(who);
  let last = null;
  for (let i = cap ? cap.i : 0; i < PLAN.length; i++){
    const p = PLAN[i];
    const body = {contents:[{role:'user', parts}], systemInstruction:{parts:[{text:system + (p.search ? SEARCH_LINE : '')}]}, generationConfig:{}};
    if (p.search) body.tools = [{google_search:{}}];
    else body.generationConfig.responseMimeType = 'application/json';
    let res = null;
    for (let attempt = 0; attempt < 2; attempt++){
      res = await post(key, proxy, p.model, body, timeoutMs);
      countUse();
      if (res.ok) break;
      const kind = classify(res.status, res.j), wait = retryDelay(res.j);
      if (attempt === 0 && ((kind === 'rate' && wait != null && wait <= 12) || kind === 'server')) { await sleep(((kind === 'rate' ? wait : 1.5) + 0.5) * 1000); continue; }
      break;
    }
    if (res.ok) {
      const c = res.j && res.j.candidates && res.j.candidates[0];
      if (!c) {
        if (res.j && res.j.promptFeedback && res.j.promptFeedback.blockReason) throw new GeminiError('blocked', 'Gemini wouldn’t look at this one.');
        throw new GeminiError('bad', 'Gemini sent an empty answer.');
      }
      const text = ((c.content && c.content.parts) || []).filter(x => !x.thought && typeof x.text === 'string').map(x => x.text).join('');
      if (!text && /SAFETY|BLOCKLIST|PROHIBITED|RECITATION/.test(c.finishReason || '')) throw new GeminiError('blocked', 'Gemini wouldn’t look at this one.');
      if (!cap || cap.i !== i) capSet(who, i);
      const gm = c.groundingMetadata;
      const grounding = gm && ((gm.webSearchQueries || []).length || (gm.groundingChunks || []).length) ? {
        queries:gm.webSearchQueries || [],
        sources:(gm.groundingChunks || []).map(x => x.web).filter(Boolean).map(w => ({uri:w.uri, title:w.title || w.domain || 'source'})).slice(0, 6),
        entry:(gm.searchEntryPoint && gm.searchEntryPoint.renderedContent) || ''} : null;
      return {text, model:p.model, search:p.search, grounding, finish:c.finishReason || ''};
    }
    const kind = classify(res.status, res.j), message = (res.j && res.j.error && res.j.error.message) || `HTTP ${res.status}`;
    last = new GeminiError(kind, message, {status:res.status, own:!!(res.j && res.j.error && res.j.error.macrolens), shared:!key, daily:/per.?day|PerDay|_day\b/i.test(JSON.stringify(res.j || {}))});
    // try the next model, or the same one without Search (any Search refusal falls back rather than failing)
    if (kind === 'model' || kind === 'server' || (p.search && kind !== 'key' && kind !== 'region')) continue;
    throw last;
  }
  forget();
  throw last || new GeminiError('model', 'No Gemini model is available to this key.');
}

// JSON out of a reply that may be wrapped in a code fence or followed by text
export function parseJSON(text){
  const s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try { return JSON.parse(s); } catch {}
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch {} }
  // a cut-off list: keep the complete items
  const m = s.match(/"items"\s*:\s*\[/);
  if (m) {
    const body = s.slice(m.index + m[0].length), out = [];
    let depth = 0, start = -1, str = false, esc = false;
    for (let i = 0; i < body.length; i++){
      const ch = body[i];
      if (str) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') str = false; continue; }
      if (ch === '"') str = true;
      else if (ch === '{') { if (depth++ === 0) start = i; }
      else if (ch === '}') { if (--depth === 0 && start >= 0) { try { out.push(JSON.parse(body.slice(start, i + 1))); } catch {} start = -1; } }
      else if (ch === ']' && depth === 0) break;
    }
    if (out.length) return {items:out, cut:true};
  }
  return null;
}

/* ---------- nutrition items ---------- */
const N = (x, ...keys) => { for (const k of keys){ const v = x[k]; if (v == null || v === '') continue; const n = Number(String(v).replace(/,/g, '').replace(/[^0-9.]/g, '')); if (Number.isFinite(n) && n >= 0) return n; } return 0; };
const str = (v, n = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const KINDS = new Set(['packaged', 'restaurant', 'homemade', 'drink', 'other']);
const ROLES = new Set(['main', 'side', 'drink', 'dessert', 'sauce', 'breakfast']);
// one item -> totals for its portion plus the app's per-100 g nutrient array
export function normItem(x){
  if (!x || typeof x !== 'object') return null;
  const name = str(x.name || x.item || x.food); if (!name) return null;
  const portion = str(x.portion || x.serving || x.size, 60);
  let grams = N(x, 'grams', 'weight_g', 'g', 'ml');
  if (!grams) { const m = portion.match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i); if (m) grams = Number(m[1]); }
  const t = {kcal:N(x, 'kcal', 'calories', 'energy_kcal'), protein:N(x, 'protein_g', 'protein'), carbs:N(x, 'carbs_g', 'carbohydrates_g', 'carbs'), fat:N(x, 'fat_g', 'fat'),
    fiber:N(x, 'fiber_g', 'fiber'), sugar:N(x, 'sugar_g', 'sugars_g', 'sugar'), sat:N(x, 'sat_fat_g', 'saturated_fat_g'), chol:N(x, 'cholesterol_mg'),
    sodium:N(x, 'sodium_mg', 'sodium'), potassium:N(x, 'potassium_mg'), calcium:N(x, 'calcium_mg'), iron:N(x, 'iron_mg')};
  if (!t.kcal && (t.protein || t.carbs || t.fat)) t.kcal = Math.round(4 * t.protein + 4 * t.carbs + 9 * t.fat);
  if (t.kcal > 5000 || grams > 5000) return null;
  const g = grams || 100, k = 100 / g;
  const p = [t.kcal, t.protein, t.carbs, t.fat, t.fiber, t.sugar, t.sat, t.chol, t.sodium, t.potassium, t.calcium, t.iron, 0, 0, 0, 0, 0, 0, 0, 0].map(v => Math.round(v * k * 1000) / 1000);
  const kind = KINDS.has(x.kind) ? x.kind : 'other', role = ROLES.has(x.role) ? x.role : '';
  const src = /label/i.test(x.source) ? 'label' : /menu/i.test(x.source) ? 'menu' : /official|publish|restaurant|brand|search/i.test(x.source) ? 'official' : 'estimate';
  return {name, brand:str(x.brand, 40), restaurant:str(x.restaurant, 40), kind, role, portion:portion || (grams ? `${Math.round(grams)} ${kind === 'drink' ? 'ml' : 'g'}` : '1 serving'),
    grams:g, gramsKnown:!!grams, ...t, kcalHi:N(x, 'kcal_high', 'kcal_max'), p, conf:/low/i.test(x.confidence) ? 'low' : /med/i.test(x.confidence) ? 'medium' : 'high', source:src};
}
const items = j => (Array.isArray(j) ? j : (j && (j.items || j.foods || j.menu)) || []).map(normItem).filter(Boolean);

/* ---------- prompts ---------- */
const SEARCH_LINE = '\nUse Google Search to check the published nutrition of branded and restaurant items before answering.';
const SHAPE = `Reply with only a JSON object, no markdown, in exactly this shape:
{"items":[{"name":"Big Mac","brand":"","restaurant":"McDonald's","kind":"restaurant","portion":"1 sandwich","grams":219,"kcal":590,"protein_g":25,"carbs_g":46,"fat_g":34,"fiber_g":3,"sugar_g":9,"sat_fat_g":11,"sodium_mg":1050,"cholesterol_mg":85,"potassium_mg":400,"confidence":"high","source":"official"}],"notes":""}
- kind: packaged, restaurant, homemade, drink or other.
- source: label (you read the numbers on the package), official (the brand's or restaurant's published nutrition), estimate (your own estimate).
- grams: weight of the portion in grams (milliliters for drinks). Every nutrition number is for that whole portion, not per 100 g.
- confidence: high, medium or low. notes: empty, or one short sentence about something the person should check.`;
const RULES = `- Packaged products: read the brand, product name and flavor exactly as printed (for example "Barebells Protein Bar, Salty Peanut") and give the nutrition for one package or one labeled serving, from the label when you can read it.
- Restaurant and fast food: name the restaurant and the exact menu item and size (for example "McDonald's Medium French Fries", "Chick-fil-A 8-count Nuggets") and use the restaurant's published nutrition for it.
- Anything else: name the food plainly (for example "grilled chicken breast", "white rice") and estimate a realistic portion.
- Separate foods are separate items (burger and fries are 2 items); a sandwich, salad or bowl is 1 item unless the person lists its parts.`;
const PHOTO_SYSTEM = `You identify food and drinks for a calorie-tracking app. List everything in the photo the person is about to eat or drink.
${RULES}
- Estimate portions from what is visible: plate and bowl size, utensils, hands, packaging, how full a cup is.
- The person's note, if there is one, is more reliable than the photo: use its amounts, sizes, brands and extras ("6 oz", "2 bars", "half", "with ranch"), and include items it mentions that the photo doesn't show.
- If the photo shows no food or drink, return an empty items list and say so in notes.
${SHAPE}`;
const TEXT_SYSTEM = `You turn what a person typed about their meal into foods for a calorie-tracking app.
${RULES}
- Use the amounts typed ("6 oz", "2 slices", "a large", "half"). When no amount is given, use one normal serving.
- Ignore words that are not food. If nothing typed is a food, return an empty items list.
${SHAPE}`;
const MENU_SHAPE = `Reply with only a JSON object, no markdown, in exactly this shape:
{"restaurant":"","items":[{"name":"Quarter Pounder with Cheese","portion":"1 sandwich","grams":200,"kcal":520,"kcal_high":0,"protein_g":30,"carbs_g":42,"fat_g":26,"fiber_g":2,"sodium_mg":1140,"role":"main","source":"menu"}]}
- restaurant: the restaurant's name if you can tell, else empty.
- role: main, side, drink, dessert, sauce or breakfast.
- source: menu (calories printed on this menu), official (the restaurant's published nutrition) or estimate.
- kcal_high: the top of a printed calorie range like "450-620 cal", else 0. Every number is for the whole portion.`;
const MENU_PHOTO_SYSTEM = `The photo shows a restaurant menu, menu board, or a screenshot of a restaurant's menu or ordering app. List the orderable items you can read, up to 40, each in its usual size.
Use the calories printed on the menu when they are shown. Otherwise use the restaurant's published nutrition, or estimate. Give protein, carbs, fat, fiber and sodium for each item too.
${MENU_SHAPE}`;
const MENU_NAME_SYSTEM = `List popular items on the current US menu of the restaurant the person names, up to 30, with that restaurant's published nutrition for each item's standard size. Include mains, sides and drinks, and a few lighter and high-protein choices. If you don't know the restaurant, list typical dishes for its kind of place and mark them estimate.
${MENU_SHAPE}`;

/* ---------- tasks ---------- */
export async function foodFromPhoto({key, proxy, limit, image, mime = 'image/jpeg', note = ''}){
  const parts = [{inline_data:{mime_type:mime, data:image}}, {text:note ? `The person's note: ${note}` : 'No note from the person.'}];
  const r = await ask({key, proxy, limit, system:PHOTO_SYSTEM, parts});
  const j = parseJSON(r.text);
  if (!j) throw new GeminiError('bad', 'Gemini’s answer couldn’t be read.');
  return {...r, items:items(j), notes:str(j.notes, 200), cut:!!j.cut};
}
export async function foodFromText({key, proxy, limit, text}){
  const r = await ask({key, proxy, limit, system:TEXT_SYSTEM, parts:[{text:`What I ate: ${text}`}]});
  const j = parseJSON(r.text);
  if (!j) throw new GeminiError('bad', 'Gemini’s answer couldn’t be read.');
  return {...r, items:items(j), notes:str(j.notes, 200), cut:!!j.cut};
}
export async function menuFromPhoto({key, proxy, limit, image, mime = 'image/jpeg', restaurant = ''}){
  const parts = [{inline_data:{mime_type:mime, data:image}}, {text:restaurant ? `The restaurant is ${restaurant}.` : 'Read this menu.'}];
  const r = await ask({key, proxy, limit, system:MENU_PHOTO_SYSTEM, parts, timeoutMs:90000});
  const j = parseJSON(r.text);
  if (!j) throw new GeminiError('bad', 'Gemini’s answer couldn’t be read.');
  return {...r, restaurant:str(j.restaurant, 40), items:items(j), cut:!!j.cut};
}
export async function menuForName({key, proxy, limit, name}){
  const r = await ask({key, proxy, limit, system:MENU_NAME_SYSTEM, parts:[{text:`Restaurant: ${name}`}], timeoutMs:90000});
  const j = parseJSON(r.text);
  if (!j) throw new GeminiError('bad', 'Gemini’s answer couldn’t be read.');
  return {...r, restaurant:str(j.restaurant, 40) || name, items:items(j), cut:!!j.cut};
}
// Settings check: a tiny question that shows which model answers and whether Google Search is on
export async function testKey(auth){
  const {key = '', proxy = ''} = typeof auth === 'string' ? {key:auth} : auth;
  const r = await ask({key, proxy, fresh:true, timeoutMs:30000, system:'Answer with only a JSON object like {"kcal":0}.', parts:[{text:'How many calories are in a McDonald\'s Big Mac in the US?'}]});
  const j = parseJSON(r.text);
  return {model:r.model, search:r.search, kcal:j && Number(j.kcal) > 0 ? Math.round(Number(j.kcal)) : null};
}
