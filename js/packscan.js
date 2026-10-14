// Packaged-food scanner.
// 1. Find any barcodes in the photo (exact product match).
// 2. Read the words printed on each package (on-device OCR with Tesseract).
// 3. Group words into separate packages by where they sit in the photo.
// 4. Look at each package's shape (box, can, jar, bottle, bag…) with the on-device image model, if downloaded.
// 5. Search the Open Food Facts grocery database for the brand + product words,
//    then rank results by how well name, brand, package shape and category line up.
import { BRAND_PHRASES, JUNK, roleFromCategories } from './brands.js';
import { searchProducts, getProduct, displayName, waitFor } from './off.js';

const VENDOR = new URL('../vendor/tesseract/', import.meta.url).href.replace(/\/$/, '');

/* ---------- OCR worker ---------- */
let workerP = null, idleTimer = 0, progressCb = null;
function ocr(){
  clearTimeout(idleTimer);
  if (!workerP) {
    workerP = (async () => {
      const T = (await import('../vendor/tesseract/tesseract.esm.min.js')).default;
      const w = await T.createWorker('eng', 1, {
        workerPath: VENDOR + '/worker.min.js', corePath: VENDOR, langPath: VENDOR,
        logger: m => { if (progressCb && m && m.status) progressCb(m); },
      });
      await w.setParameters({tessedit_pageseg_mode: '11', preserve_interword_spaces: '0', user_defined_dpi: '300'});
      return w;
    })();
    workerP.catch(() => { workerP = null; });
  }
  return workerP;
}
function releaseSoon(){
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => { const p = workerP; workerP = null; try { (await p)?.terminate(); } catch {} }, 90000);
}

/* ---------- text helpers ---------- */
const norm = s => String(s).toLowerCase().replace(/[’']/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9%]+/g, ' ').trim();
const tok = s => norm(s).split(' ').filter(Boolean);
function lev(a, b, max){
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++){
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++){
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

let VOCAB = null, VOCAB_BY = null;
const BRAND_WORDS = new Set(BRAND_PHRASES.flat());
const EXTRA = ('cereal oats oatmeal granola honey nut nuts whole grain grains wheat multigrain toasted frosted flakes crunch crunchy original classic chocolate vanilla strawberry blueberry banana apple cinnamon peanut butter creamy chunky smooth natural ' +
  'black beans pinto kidney refried garbanzo chickpeas lentils corn sweet peas green cut diced tomatoes tomato crushed paste sauce marinara alfredo pesto broth stock chicken beef vegetable noodle noodles soup chili ' +
  'pasta spaghetti penne rotini elbows macaroni shells linguine fettuccine lasagna rice white brown jasmine basmati long instant quick rolled steel cut ' +
  'cheese cheddar mild sharp shredded mozzarella parmesan string slices american colby jack pepper swiss provolone cream cottage greek yogurt nonfat lowfat plain milk reduced fat skim almond unsweetened oat soy coconut ' +
  'tuna chunk light solid albacore salmon sardines water oil olive extra virgin canola avocado spray jelly grape jam preserves syrup maple pancake mix waffles waffle frozen pizza pepperoni sausage supreme crust rising thin ' +
  'burritos burrito nuggets breaded tenders strips patties fries crinkle hash browns tots bread sourdough bagels bagel english muffins tortillas tortilla flour taco shells sugar powdered baking soda powder eggs large ' +
  'bacon thick sliced smoked ham turkey breast deli salami bologna hot dogs franks links ground lean thighs boneless skinless drumsticks wings pork chops steak sirloin fillets shrimp cooked raw peeled ' +
  'spinach lettuce romaine salad kit coleslaw carrots baby celery broccoli florets cauliflower mixed vegetables stir fry blend berries raspberries bananas apples oranges grapes avocados lemons limes ' +
  'chips potato tortilla salted unsalted kettle sea salt vinegar sour onion ranch bbq barbecue salsa medium hot queso guacamole hummus crackers cookies cookie sandwich bars bar protein shake powder whey ' +
  'juice orange lemonade tea iced coffee ground roast dark medium decaf cola soda zero sugar diet energy drink sports water sparkling seltzer popcorn butter kettle pretzels twists trail mix almonds cashews pistachios walnuts pecans ' +
  'ketchup mustard mayonnaise mayo dressing italian caesar honey mustard relish pickles dill spears chips gummies candy fruit snacks applesauce cups pudding gelatin ice cream frozen yogurt').split(' ');
export function setVocab(words){
  VOCAB = new Set([...BRAND_WORDS, ...EXTRA, ...words.filter(w => w.length >= 3 && /^[a-z]+$/.test(w))]);
  VOCAB_BY = new Map();
  for (const w of VOCAB){ const k = w[0] + w.length; (VOCAB_BY.get(k) || VOCAB_BY.set(k, []).get(k)).push(w); }
}
function snap(w){
  if (!VOCAB) setVocab([]);
  if (VOCAB.has(w) || w.length < 4 || /\d/.test(w)) return {w, ok: VOCAB.has(w)};
  const max = w.length >= 8 ? 2 : 1;
  let best = null, bd = max + 1;
  const firsts = new Set([w[0], {'0':'o','1':'l','5':'s','8':'b'}[w[0]] || w[0]]);
  for (const f of firsts) for (let L = w.length - max; L <= w.length + max; L++){
    for (const v of VOCAB_BY.get(f + L) || []){ const d = lev(w, v, max); if (d < bd || (d === bd && BRAND_WORDS.has(v) && !BRAND_WORDS.has(best))) { bd = d; best = v; if (d === 0) break; } }
  }
  return best ? {w: best, ok: true, fixed: best !== w} : {w, ok: false};
}

/* ---------- image helpers ---------- */
async function bitmap(blob){ return await createImageBitmap(blob, {imageOrientation: 'from-image'}).catch(() => createImageBitmap(blob)); }
function canvasOf(src, maxSide, rotate = 0){
  const W = src.width, H = src.height, s = Math.min(1, maxSide / Math.max(W, H));
  const w = Math.round(W * s), h = Math.round(H * s);
  const cv = document.createElement('canvas');
  const rot = rotate % 360;
  cv.width = rot === 90 || rot === 270 ? h : w; cv.height = rot === 90 || rot === 270 ? w : h;
  const g = cv.getContext('2d');
  g.translate(cv.width / 2, cv.height / 2); g.rotate(rot * Math.PI / 180); g.drawImage(src, -w / 2, -h / 2, w, h);
  // mild contrast boost helps OCR on glossy packaging
  try {
    const id = g.getImageData(0, 0, cv.width, cv.height), d = id.data;
    let lo = 255, hi = 0;
    for (let i = 0; i < d.length; i += 16){ const y = (d[i] * 3 + d[i+1] * 6 + d[i+2]) / 10; if (y < lo) lo = y; if (y > hi) hi = y; }
    if (hi - lo > 40 && hi - lo < 230) { const k = 255 / (hi - lo); for (let i = 0; i < d.length; i += 4){ d[i] = (d[i] - lo) * k; d[i+1] = (d[i+1] - lo) * k; d[i+2] = (d[i+2] - lo) * k; } g.putImageData(id, 0, 0); }
  } catch {}
  return {cv, scale: s};
}
function cropBlob(src, box, scale, size = 448, textH = 0){
  const [x, y, w, h] = box.map(v => v / scale);
  // pad around the text so the crop shows the package, not just the words
  const px = Math.max(w * 0.35, textH * 2.2), py = Math.max(h * 0.35, textH * 2.2);
  const X = Math.max(0, x - px), Y = Math.max(0, y - py), X2 = Math.min(src.width, x + w + px), Y2 = Math.min(src.height, y + h + py);
  const cw = X2 - X, ch = Y2 - Y, k = Math.min(1, size / Math.max(cw, ch));
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(cw * k)); cv.height = Math.max(1, Math.round(ch * k));
  cv.getContext('2d').drawImage(src, X, Y, cw, ch, 0, 0, cv.width, cv.height);
  const t = document.createElement('canvas'); const s2 = Math.min(1, 112 / Math.max(cv.width, cv.height)); t.width = Math.round(cv.width * s2); t.height = Math.round(cv.height * s2);
  t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height);
  return {blobP: new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9)), thumb: t.toDataURL('image/jpeg', 0.7)};
}

/* ---------- OCR -> words ---------- */
function wordsFrom(data, rot, cvW, cvH){
  const out = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []){
    const raw = String(w.text || '').trim(); if (!raw) continue;
    let {x0, y0, x1, y1} = w.bbox;
    if (rot === 90) [x0, y0, x1, y1] = [y0, cvW - x1, y1, cvW - x0];          // back to the unrotated frame
    else if (rot === 270) [x0, y0, x1, y1] = [cvH - y1, x0, cvH - y0, x1];
    out.push({raw, conf: w.confidence, x0, y0, x1, y1, h: Math.min(x1 - x0, y1 - y0) > 0 ? (rot ? x1 - x0 : y1 - y0) : 1});
  }
  return out;
}
function iou(a, b){
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const I = ix * iy, U = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - I;
  return U > 0 ? I / U : 0;
}
function mergeWords(a, b){
  const out = a.slice();
  for (const w of b){
    const k = out.findIndex(o => iou(o, w) > 0.3);
    if (k < 0) out.push(w);
    else { const o = out[k]; if ((w.known && !o.known) || (w.known === o.known && w.conf > o.conf)) out[k] = w; }
  }
  return out;
}
const DIGIT_FIX = {'0': 'o', '1': 'l', '5': 's', '8': 'b', '6': 'g'};
function cleanWords(words){
  const out = [];
  for (const w of words){
    for (let piece of tok(w.raw)){
      if (/[a-z]/.test(piece) && /\d/.test(piece) && piece.length <= 4) piece = piece.replace(/\d/g, d => DIGIT_FIX[d] || d);
      if (piece.length === 2 && !(VOCAB || new Set()).has(piece) && !BRAND_WORDS.has(piece)) continue;
      if (piece.length < 2 && !/\d/.test(piece)) continue;
      if (/^\d+$/.test(piece)) continue;                         // bare numbers (weights, codes)
      if (/^\d+(g|mg|oz|lb|ml|l|ct|kcal|cal)$/.test(piece)) continue;
      if (!/[aeiouy%]/.test(piece) && piece.length > 3) continue; // consonant soup = OCR noise
      if (JUNK.has(piece)) continue;
      const s = snap(piece);
      if (!s.ok && w.conf < 72) continue;
      if (w.conf < 38) continue;
      if (JUNK.has(s.w)) continue;
      out.push({...w, t: s.w, known: s.ok});
    }
  }
  return out;
}
function cluster(words){
  const n = words.length, parent = words.map((_, i) => i);
  const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++){
    const a = words[i], b = words[j], H = Math.max(a.h, b.h), h = Math.min(a.h, b.h);
    const gx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)), gy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
    // closer in size => allow a wider gap; tiny fine print doesn't glue to big headlines from far away
    const k = h / H > 0.45 ? 1 : 0.6;
    if (gx <= 1.6 * H * k && gy <= 1.9 * H * k) parent[find(i)] = find(j);
  }
  const groups = new Map();
  words.forEach((w, i) => { const r = find(i); (groups.get(r) || groups.set(r, []).get(r)).push(w); });
  return [...groups.values()];
}

/* ---------- query building ---------- */
// single brand words that are also everyday words: only trust them as a brand when printed big
const AMBIGUOUS = new Set('life post kind one simply club crunch chewy minute success carolina wonder crush prime boost core ghost built reign mission giant target polar naked ripple hope david emerald diamond wise lance austin think simple truth original best value select chef sun nature natural fresh family market essential always food clover smart open signature lucerne bold balance boom dove trolli nerds take five ritz club whole our more free organic premium premier thomas kemps hood daisy silk ensure vital happy egg big red crisp mug'.split(' '));
function brandIn(seq, heights, maxH){
  for (const phrase of BRAND_PHRASES){
    for (let i = 0; i + phrase.length <= seq.length; i++){
      let ok = true; for (let k = 0; k < phrase.length; k++) if (seq[i + k] !== phrase[k]) { ok = false; break; }
      if (!ok) continue;
      const big = heights[i] >= 0.72 * maxH;
      if (phrase.length === 1 && (phrase[0].length < 4 || AMBIGUOUS.has(phrase[0])) && !big) continue;
      return {phrase: phrase.join(' '), at: i, len: phrase.length, weak: phrase.length === 1 && AMBIGUOUS.has(phrase[0])};
    }
  }
  return null;
}
function describe(group){
  const ordered = group.slice().sort((a, b) => { const ya = (a.y0 + a.y1) / 2, yb = (b.y0 + b.y1) / 2; return Math.abs(ya - yb) < Math.min(a.h, b.h) * 0.6 ? a.x0 - b.x0 : ya - yb; });
  const seq = ordered.map(w => w.t);
  const maxH = Math.max(...group.map(w => w.h));
  const brand = brandIn(seq, ordered.map(w => w.h), maxH);
  const seen = new Set(), weighted = [];
  ordered.forEach((w, i) => {
    if (seen.has(w.t)) return; seen.add(w.t);
    const inBrand = brand && i >= brand.at && i < brand.at + brand.len;
    weighted.push({t: w.t, w: Math.pow(w.h / maxH, 1.5) * (w.known ? 1 : 0.6) * (inBrand ? 1.4 : 1), brand: !!inBrand, order: i});
  });
  const product = weighted.filter(x => !x.brand).sort((a, b) => b.w - a.w).slice(0, 5).sort((a, b) => a.order - b.order).map(x => x.t);
  const query = [...(brand ? [brand.phrase] : []), ...product].join(' ').trim();
  const box = [Math.min(...group.map(w => w.x0)), Math.min(...group.map(w => w.y0))];
  box.push(Math.max(...group.map(w => w.x1)) - box[0], Math.max(...group.map(w => w.y1)) - box[1]);
  const letters = weighted.reduce((a, x) => a + x.t.length, 0);
  return {seq, read: ordered.map(w => w.raw).join(' ').replace(/\s+/g, ' ').slice(0, 90), brand: brand ? brand.phrase : '', brandWeak: !!(brand && brand.weak), query, weighted, box, letters, maxH, known: weighted.filter(x => x.t.length >= 3 && VOCAB.has(x.t)).length};
}

/* ---------- matching ---------- */
const SHAPE_OF = {box: ['box','case','carton-box','sleeve'], can: ['can','tin'], jar: ['jar','pot'], bottle: ['bottle','jug','flask'], bag: ['bag','pouch','sachet','wrapper','packet','film'], carton: ['carton','brick','gable-top-carton'], tub: ['tub','pot','container','cup','tray','clamshell'], wrap: ['film','wrapper','tray','bag']};
function shapeMatch(shape, shapes){
  if (!shape || !shapes.length) return 0;
  const want = SHAPE_OF[shape] || [shape];
  return shapes.some(s => want.some(x => s.includes(x))) ? 1 : -0.5;
}
function rank(desc, list, hints){
  const W = desc.weighted, totalW = W.reduce((a, x) => a + x.w, 0) || 1;
  return list.map(p => {
    const text = tok(`${p.name} ${p.brands}`), set = new Set(text);
    const extra = new Set(tok(`${p.categories.join(' ').replace(/[a-z]{2}:/g, ' ')} ${p.quantity}`));
    const fuzzyHas = t => set.has(t) || (t.length >= 5 && text.some(x => x.length >= 4 && lev(t, x, 1) <= 1));
    const stemHas = t => extra.has(t) || extra.has(t + 's') || extra.has(t.replace(/s$/, ''));
    const found = W.reduce((a, x) => a + (fuzzyHas(x.t) ? x.w : stemHas(x.t) ? x.w * 0.5 : 0), 0) / totalW;
    const nameT = tok(p.name).filter(t => t.length >= 3 && !JUNK.has(t));
    const ocr = new Set(desc.seq);
    const prec = nameT.length ? nameT.filter(t => ocr.has(t) || [...ocr].some(o => o.length >= 5 && lev(o, t, 1) <= 1)).length / nameT.length : 0;
    let s = 0.62 * found + 0.22 * prec;
    const pb = norm(p.brands);
    if (desc.brand) s += pb.includes(desc.brand) || norm(p.name).includes(desc.brand) ? 0.16 : (desc.brandWeak ? -0.04 : -0.12);
    s += 0.06 * shapeMatch(hints.shape, p.shapes);
    if (hints.role) { const r = roleFromCategories(p.categories, p.name); if (r) s += r === hints.role ? 0.05 : -0.03; }
    if (p.countries.some(c => /united.states|^us$|en:us\b/i.test(c))) s += 0.05;
    s += Math.min(0.05, Math.log10(p.scans + 1) * 0.015);
    if (!(Number(p.nutriments['energy-kcal_100g']) >= 0 || Number(p.nutriments['energy_100g']) >= 0)) s -= 0.25;
    return {product: p, score: s};
  }).sort((a, b) => b.score - a.score);
}
const confOf = s => s >= 0.78 ? 'sure' : s >= 0.55 ? 'likely' : 'maybe';

/* ---------- main ---------- */
// ctx: {clip: recognizer module (optional, only if downloaded), local(query) -> [{name, ndb, kcal}], onStep(text, frac), single: bool}
export async function scan(blob, ctx = {}){
  const step = (t, f) => ctx.onStep && ctx.onStep(t, f);
  const src = await bitmap(blob);
  const items = [], seenCodes = new Set();
  let offline = !navigator.onLine, netErr = false;

  // 1. barcodes
  step('Looking for barcodes…', 0.03);
  if ('BarcodeDetector' in window) {
    try {
      const det = new BarcodeDetector({formats: ['ean_13','ean_8','upc_a','upc_e']});
      const {cv} = canvasOf(src, 2400);
      for (const c of await det.detect(cv)){
        const code = String(c.rawValue).replace(/\D/g, ''); if (code.length < 8 || seenCodes.has(code)) continue; seenCodes.add(code);
        const bb = c.boundingBox, s = cv.width / src.width;
        const cr = cropBlob(src, [bb.x, bb.y, bb.width, bb.height], s, 300);
        items.push({id: 'b' + code, via: 'barcode', code, read: `Barcode ${code}`, brand: '', query: '', thumb: cr.thumb, box: [bb.x / s, bb.y / s, bb.width / s, bb.height / s], matches: [], best: 0, conf: 'sure'});
      }
    } catch {}
  }

  // 2. OCR (straight, then sideways if little text was found)
  step('Reading the labels…', 0.08);
  let words = [];
  try {
    progressCb = m => { if (m.status === 'recognizing text') step('Reading the labels…', 0.08 + 0.42 * (m.progress || 0)); else if (/loading|initializ/.test(m.status)) step('Getting the text reader ready…', 0.06); };
    const w = await ocr();
    // two passes with different binarization: colored text on colored packaging
    // reads best with one or the other (adaptive Otsu vs. Sauvola)
    const passes = [[1300, '1', 0.08, 0.3], [1000, '2', 0.3, 0.5]];
    let good = [];
    for (const [size, th, f0, f1] of passes){
      progressCb = m => { if (m.status === 'recognizing text') step('Reading the labels…', f0 + (f1 - f0) * (m.progress || 0)); else if (/loading|initializ/.test(m.status)) step('Getting the text reader ready…', 0.06); };
      const {cv, scale} = canvasOf(src, size);
      const {data} = await w.recognize(cv, {thresholding_method: th}, {blocks: true, text: false});
      const ws = wordsFrom(data, 0).map(x => ({...x, x0: x.x0 / scale, y0: x.y0 / scale, x1: x.x1 / scale, y1: x.y1 / scale, h: x.h / scale}));
      if (ctx.debug) (ctx.debugPasses ||= []).push(ws.map(x => x.raw + ':' + Math.round(x.conf)).join(' '));
      good = mergeWords(good, cleanWords(ws));
    }
    if (good.length < 6 && !ctx.single) {
      for (const rot of [90, 270]){
        step('Reading sideways labels…', 0.5);
        const r = canvasOf(src, 1800, rot);
        const {data: d2} = await w.recognize(r.cv, {thresholding_method: '1'}, {blocks: true, text: false});
        const ws = wordsFrom(d2, rot, r.cv.width, r.cv.height).map(x => ({...x, x0: x.x0 / r.scale, y0: x.y0 / r.scale, x1: x.x1 / r.scale, y1: x.y1 / r.scale, h: x.h / r.scale}));
        const cw = cleanWords(ws).filter(x => x.conf >= 60);
        if (cw.length > good.length / 2) good = mergeWords(good, cw);
      }
    }
    words = good;
  } catch (e) { console.error('OCR failed', e); words = []; }
  finally { progressCb = null; releaseSoon(); }

  // 3. group into packages; a cluster that is only a brand name joins the nearest product text
  let raw = cluster(words);
  const D = raw.map(describe);
  const brandOnly = D.map(d => d.brand && d.weighted.every(x => x.brand));
  const merged = new Set(), taken = new Set(D.map((e, j) => e.brand && !e.brandWeak ? j : -1).filter(j => j >= 0));
  const pairs = [];
  D.forEach((d, i) => {
    if (!brandOnly[i]) return;
    D.forEach((e, j) => {
      if (j === i || brandOnly[j]) return;
      const [x, y, w, h] = d.box, [X, Y, W, H] = e.box;
      const gx = Math.max(0, Math.max(x, X) - Math.min(x + w, X + W)), gy = Math.max(0, Math.max(y, Y) - Math.min(y + h, Y + H));
      const lim = 3.5 * Math.max(d.maxH, e.maxH);
      // brands sit above or below the product name far more often than beside it
      const dist = gx > 0 ? Math.hypot(gx * 2, gy) : gy;
      if (dist < lim) pairs.push([dist, i, j]);
    });
  });
  pairs.sort((a, b) => a[0] - b[0]);
  for (const [, i, j] of pairs){
    if (merged.has(i) || taken.has(j)) continue;
    raw[j] = raw[j].concat(raw[i]); merged.add(i); taken.add(j);
  }
  raw = raw.filter((_, i) => !merged.has(i));
  let groups = raw.map(describe).filter(d => d.letters >= 4 && (d.known >= 1 || d.brand));
  groups.sort((a, b) => (b.maxH * b.letters) - (a.maxH * a.letters));
  if (ctx.single) groups = groups.slice(0, 2); else groups = groups.slice(0, 10);
  for (const [i, g] of groups.entries()){
    const cr = cropBlob(src, g.box, 1, 448, g.maxH);
    items.push({id: 't' + i, via: 'text', ...g, thumb: cr.thumb, cropP: cr.blobP, matches: [], best: 0, conf: 'maybe'});
  }

  // 4. shape & category from the image model (optional)
  if (ctx.clip) {
    step('Checking package shapes…', 0.55);
    for (const it of items.filter(x => x.via === 'text')){
      try { const b = await it.cropP; const r = await ctx.clip.classifyCrop(b); it.shape = r.shape; it.shapeP = r.shapeP; it.role = r.role; } catch {}
    }
  }

  // 5. database matching
  const n = items.length;
  for (const [i, it] of items.entries()){
    step(n > 1 ? `Matching ${i + 1} of ${n} in the grocery database…` : 'Matching in the grocery database…', 0.6 + 0.38 * (i / Math.max(1, n)));
    if (it.via === 'barcode') {
      if (!offline) try { const p = await getProduct(it.code); if (p) { it.matches = [{product: p, score: 1}]; it.read = displayName(p); } else it.missing = true; }
      catch { netErr = true; offline = true; it.missing = true; }
      continue;
    }
    let list = [];
    if (!offline) {
      const wait = waitFor('search');
      if (wait) step(`The grocery database allows about 10 searches a minute. Continuing in ${wait} s…`, 0.6 + 0.38 * (i / Math.max(1, n)));
      try { list = await searchProducts(it.query); }
      catch { netErr = true; offline = true; }
      if (list.length < 3 && it.brand && it.query !== it.brand) {
        // retry without the weakest words
        const shorter = [it.brand, ...it.query.replace(it.brand, '').trim().split(' ').slice(0, 2)].join(' ');
        if (!offline) try { const more = await searchProducts(shorter); list = list.concat(more.filter(m => !list.some(x => x.code === m.code))); } catch { netErr = true; offline = true; }
      }
    }
    const ranked = rank(it, list, {shape: it.shape, role: it.role}).filter(r => r.score > 0.25).slice(0, 6);
    if (ranked.length) { it.matches = ranked; it.conf = confOf(ranked[0].score); }
    if (ctx.local && (!ranked.length || ranked[0].score < 0.55)) {
      it.local = ctx.local(it.query).slice(0, 4);
      if (!ranked.length && it.local.length) it.conf = 'maybe';
    }
    // full details (all nutrients, photo) for the top pick
    const top = it.matches[0];
    if (top && top.score >= 0.45 && !offline) { try { const full = await getProduct(top.product.code); if (full) top.product = {...top.product, ...full, nutriments: {...top.product.nutriments, ...full.nutriments}}; } catch { netErr = true; } }
  }
  // drop text items that found the same product a barcode already found, and duplicates
  const codes = new Set(items.filter(x => x.via === 'barcode' && x.matches.length).map(x => x.matches[0].product.code));
  const final = [];
  for (const it of items){
    const c = it.matches[0]?.product.code;
    if (it.via === 'text' && c && codes.has(c)) continue;
    if (c) codes.add(c);
    if (!it.matches.length && !(it.local && it.local.length) && it.via === 'text') continue;
    delete it.cropP; final.push(it);
  }
  step('Done', 1);
  if (src.close) src.close();
  return {debug: ctx.debug ? {passes: ctx.debugPasses, kept: words.map(w => w.t).join(' ')} : undefined, items: final, words: words.length, offline: offline || (netErr && !final.some(x => x.matches.length))};
}

export async function fetchDetails(code){ return getProduct(code); }
export function preloadOCR(){ ocr().then(releaseSoon).catch(() => {}); }
