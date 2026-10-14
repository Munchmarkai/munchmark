// Read a Nutrition Facts panel (US) or a nutrition table (EU "per 100 g") from OCR text.
// Works on photos of the package and on screenshots of a website's nutrition info.
const NUM = '(<\\s*)?(\\d{1,3}(?:,\\d{3})+|\\d+(?:[.,]\\d+)?)';
function find(flat, re){
  const m = flat.match(re);
  if (!m) return null;
  const lt = !!m[1], raw = m[2], unit = (m[3] || '').toLowerCase();
  let v = /^\d{1,3}(,\d{3})+$/.test(raw) ? Number(raw.replace(/,/g, '')) : parseFloat(raw.replace(',', '.'));
  if (lt) v = Math.min(v, 1) / 2;                        // "<1g"
  // OCR often reads "8g" as "89": keep the other reading for the calorie check below
  const alt = !unit && /9$/.test(raw) && raw.length >= 2 && !raw.includes('.') ? parseFloat(raw.slice(0, -1)) : null;
  return {v, alt, unit};
}
export function parseLabel(text){
  const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const flat = ' ' + lines.join(' \n ') + ' ';
  const out = {per100:/per\s*100\s*(g|ml)|100\s*g\b.*per (bar|serving|portion)/i.test(flat)};
  const sm = flat.match(/serving\s*size\s*[:\-]?\s*([^\n]{1,60})/i);
  if (sm) {
    out.servingText = sm[1].replace(/\s+/g, ' ').replace(/^[:\-\s]+/, '').trim();
    const g = out.servingText.match(/\(?\s*(\d+(?:\.\d+)?)\s*(g|ml)\b/i);
    if (g) out.servingG = Number(g[1]);
  }
  if (!out.servingG) { const m = flat.match(/amount\s*per\s*(1\s+[a-z ]{2,20}?)\s*\(\s*(\d+(?:\.\d+)?)\s*(g|ml)\s*\)/i); if (m) { out.servingG = Number(m[2]); out.servingText = `${m[1].trim()} (${m[2]} ${m[3]})`; } }
  if (!out.servingG) { const m = flat.match(/per\s+(bar|serving|portion|pack|bottle)\s*\(?\s*(\d+(?:\.\d+)?)\s*(g|ml)/i); if (m) { out.servingG = Number(m[2]); out.servingText ||= `1 ${m[1].toLowerCase()} (${m[2]} ${m[3]})`; } }
  const kcal = flat.match(/(\d{1,2},\d{3}|\d{2,4})\s*kcal/i) || flat.match(/calories(?!\s*from)\s*[:\-]?\s*(?:\n\s*)?(\d{1,2},\d{3}|\d{1,4})\b/i);
  if (kcal) out.kcal = Number(kcal[1].replace(',', ''));
  const G = '\\s*[:\\-]?\\s*' + NUM + '\\s*(m?g|mcg|µg|ug)?';
  const get = (name, re) => { const r = find(flat, re); if (r) out[name] = r; };
  get('fat', new RegExp('(?:total\\s*fat|\\bfat\\b)' + G, 'i'));
  get('satFat', new RegExp('(?:saturated\\s*fat|saturates|sat\\.?\\s*fat)' + G, 'i'));
  get('chol', new RegExp('cholesterol' + G, 'i'));
  get('sodium', new RegExp('sodium' + G, 'i'));
  get('salt', new RegExp('\\bsalt\\b' + G, 'i'));
  get('carbs', new RegExp('(?:total\\s*carb(?:ohydrate)?s?\\.?|carbohydrates?)' + G, 'i'));
  get('fiber', new RegExp('(?:dietary\\s*fib(?:er|re)|\\bfib(?:er|re)\\b)' + G, 'i'));
  get('sugar', new RegExp('(?:total\\s*sugars?|of which sugars|(?<!added\\s)\\bsugars?\\b)(?!\\s*alcohol)' + G, 'i'));
  get('protein', new RegExp('protein' + G, 'i'));
  get('potassium', new RegExp('potassium' + G, 'i'));
  get('calcium', new RegExp('calcium' + G, 'i'));
  get('iron', new RegExp('\\biron\\b' + G, 'i'));
  get('vitD', new RegExp('vit(?:amin)?\\.?\\s*d' + G, 'i'));
  // pick the readings of fat / carbs / protein that agree best with the calories
  const fix = ['fat', 'carbs', 'protein'];
  if (out.kcal) {
    const opts = fix.map(k => out[k] ? [out[k].v, ...(out[k].alt != null ? [out[k].alt] : [])] : [0]);
    let best = null, bd = Infinity;
    for (const f of opts[0]) for (const c of opts[1]) for (const p of opts[2]){ const d = Math.abs(9 * f + 4 * c + 4 * p - out.kcal); if (d < bd) { bd = d; best = [f, c, p]; } }
    fix.forEach((k, i) => { if (out[k]) out[k] = {v:best[i]}; });
    const est = 9 * best[0] + 4 * best[1] + 4 * best[2];
    out.check = est ? Math.abs(est - out.kcal) / out.kcal : 1;
  }
  const val = k => out[k] ? out[k].v : null;
  // mg-based fields that came out in grams ("Sodium 0.19 g") and EU salt -> sodium
  let sodium = val('sodium');
  if (sodium != null && out.sodium.unit === 'g') sodium *= 1000;
  if (sodium == null && val('salt') != null) sodium = val('salt') * (out.salt.unit === 'mg' ? 0.4 : 400);
  const mg = k => { const v = val(k); return v == null ? null : out[k].unit === 'g' ? v * 1000 : v; };
  const res = {servingText:out.servingText || '', servingG:out.servingG || null, per100:out.per100, kcal:out.kcal ?? null,
    fat:val('fat'), satFat:val('satFat'), chol:mg('chol'), sodium, carbs:val('carbs'), fiber:val('fiber'), sugar:val('sugar'), protein:val('protein'),
    potassium:mg('potassium'), calcium:mg('calcium'), iron:mg('iron'), vitD:val('vitD'), check:out.check ?? null};
  res.found = ['kcal', 'fat', 'carbs', 'protein', 'sodium', 'fiber', 'sugar'].filter(k => res[k] != null).length;
  return res;
}
// per-serving label numbers -> the app's per-100 g nutrient array
export function labelToP100(L, grams){
  const k = L.per100 ? 1 : 100 / (grams || 100);
  const v = x => (Number(x) || 0) * k;
  return [v(L.kcal), v(L.protein), v(L.carbs), v(L.fat), v(L.fiber), v(L.sugar), v(L.satFat), v(L.chol), v(L.sodium), v(L.potassium), v(L.calcium), v(L.iron), 0, 0, 0, 0, v(L.vitD), 0, 0, 0];
}
