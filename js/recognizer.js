// On-device food recognizer: CLIP zero-shot image classification over the app's food lists.
// The model (Xenova/clip-vit-base-patch32, quantized) downloads once from Hugging Face,
// then runs fully on the phone and works offline.
import { LABELS, PANTRY } from './labels.js';

const MODEL = 'Xenova/clip-vit-base-patch32';
// body-fat photo check: one prompt per level, lean to high
export const BODY_LEVELS = {
  male: [8, 12, 15, 20, 25, 30, 36],
  female: [15, 20, 25, 30, 35, 40, 46],
};
const BODY_PROMPTS = {
  male: ['a very lean muscular man with a clearly visible six-pack and veins', 'a lean fit man with visible abs', 'an athletic man with a flat stomach and faint abs', 'a man with an average build and a slightly soft stomach', 'a man with a soft belly and love handles', 'an overweight man with a round belly', 'an obese man with a large belly'],
  female: ['a very lean muscular woman with visible abs', 'a fit athletic woman with toned arms and a flat stomach', 'a woman with a slim build and a soft flat stomach', 'a woman with an average build and soft curves', 'a woman with a rounder stomach and fuller hips', 'an overweight woman with a round stomach', 'an obese woman with a large stomach'],
};
// package shapes, matched against Open Food Facts packaging data
const PACK_PROMPTS = [
  ['box', 'a cardboard box of food'], ['can', 'a metal can of food'], ['jar', 'a glass jar of food'], ['bottle', 'a plastic or glass bottle'],
  ['bag', 'a plastic bag or pouch of food'], ['carton', 'a paper carton of milk or juice'], ['tub', 'a plastic tub or cup of food'],
  ['wrap', 'a plastic-wrapped tray of meat or cheese'], ['produce', 'loose fresh fruit or vegetables'],
];
const SETS = {
  body_male: {labels: BODY_PROMPTS.male, prompt: l => `a photo of ${l}.`},
  body_female: {labels: BODY_PROMPTS.female, prompt: l => `a photo of ${l}.`},
  food: {labels: LABELS.filter(l => l[3] !== false).map(l => l[0]), prompt: l => `a photo of ${l}, a type of food.`},
  pantry: {labels: PANTRY.map(p => p[1]), names: PANTRY.map(p => p[0]), prompt: l => `a photo of ${l}.`},
  pack: {labels: PACK_PROMPTS.map(x => x[1]), names: PACK_PROMPTS.map(x => x[0]), prompt: l => `a photo of ${l}.`},
};
const keyOf = s => `clip-text-v1:${s}:${SETS[s].labels.length}:${SETS[s].labels.join('|').length}`;

let T = null, processor = null, vision = null, loading = null;
const emb = {};

async function lib(){
  if (T) return T;
  T = await import('../vendor/transformers.min.js');
  T.env.allowLocalModels = false;
  T.env.useBrowserCache = true;
  T.env.backends.onnx.wasm.wasmPaths = new URL('../vendor/', import.meta.url).href;
  T.env.backends.onnx.wasm.numThreads = 1;
  return T;
}

function idb(){ return new Promise((res, rej) => { const r = indexedDB.open('macrolens-model', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function kvGet(k){ try { const d = await idb(); return await new Promise(res => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); } catch { return undefined; } }
async function kvSet(k, v){ try { const d = await idb(); await new Promise(res => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; }); } catch {} }

export async function isDownloaded(){
  return !!(await kvGet(keyOf('food'))) && localStorage.getItem('macrolens.model') === 'ready';
}

function normRows(data, rows, dim){
  const out = new Float32Array(rows * dim);
  for (let r = 0; r < rows; r++){
    let s = 0; for (let i = 0; i < dim; i++) s += data[r*dim+i] ** 2;
    s = Math.sqrt(s) || 1; for (let i = 0; i < dim; i++) out[r*dim+i] = data[r*dim+i] / s;
  }
  return out;
}

// progress(fraction 0..1, text)
export function load(progress = () => {}){
  if (loading) return loading;
  loading = (async () => {
    const t = await lib();
    const files = {};
    const cb = p => {
      if (p.status === 'progress' && p.total) files[p.file] = [p.loaded, p.total];
      if (p.status === 'done' && files[p.file]) files[p.file][0] = files[p.file][1];
      const v = Object.values(files); const L = v.reduce((a, x) => a + x[0], 0), Tt = v.reduce((a, x) => a + x[1], 0);
      if (Tt) progress(Math.min(0.97, L / Tt), `Downloading recognizer… ${Math.round(L / 1e6)} of ${Math.round(Tt / 1e6)} MB`);
    };
    const missing = [];
    for (const s of Object.keys(SETS)) { const e = await kvGet(keyOf(s)); if (e) emb[s] = e; else missing.push(s); }
    if (missing.length) {
      progress(0.01, 'Preparing recognizer…');
      const tok = await t.AutoTokenizer.from_pretrained(MODEL, {progress_callback: cb});
      const text = await t.CLIPTextModelWithProjection.from_pretrained(MODEL, {dtype:'q8', device:'wasm', progress_callback: cb});
      for (const s of missing){
        progress(0.97, 'Learning the food list…');
        const labels = SETS[s].labels, parts = []; let dim = 512;
        for (let i = 0; i < labels.length; i += 16){
          const batch = labels.slice(i, i + 16).map(SETS[s].prompt);
          const {text_embeds} = await text(tok(batch, {padding:true, truncation:true}));
          dim = text_embeds.dims[1];
          parts.push(normRows(text_embeds.data, batch.length, dim));
        }
        const e = new Float32Array(labels.length * dim); let o = 0; for (const p of parts) { e.set(p, o); o += p.length; }
        emb[s] = e; await kvSet(keyOf(s), e);
      }
      try { await text.dispose(); } catch {}
    }
    processor = await t.AutoProcessor.from_pretrained(MODEL, {progress_callback: cb});
    vision = await t.CLIPVisionModelWithProjection.from_pretrained(MODEL, {dtype:'q8', device:'wasm', progress_callback: cb});
    try { localStorage.setItem('macrolens.model', 'ready'); } catch {}
    progress(1, 'Recognizer ready');
    return true;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

async function embedImage(blob){
  const t = await lib();
  const image = await t.RawImage.fromBlob(blob);
  const {image_embeds} = await vision(await processor(image));
  return normRows(image_embeds.data, 1, image_embeds.dims[1]);
}
function scores(v, set){
  const e = emb[set], dim = v.length, n = e.length / dim, logits = new Float32Array(n);
  let mx = -Infinity;
  for (let r = 0; r < n; r++){ let s = 0; for (let i = 0; i < dim; i++) s += v[i] * e[r*dim+i]; logits[r] = 100 * s; if (logits[r] > mx) mx = logits[r]; }
  let sum = 0; for (let r = 0; r < n; r++){ logits[r] = Math.exp(logits[r] - mx); sum += logits[r]; }
  for (let r = 0; r < n; r++) logits[r] /= sum;
  return logits;
}

// one dish: returns [{label, p}] best first
export async function classify(blob, top = 6){
  await load();
  const s = scores(await embedImage(blob), 'food'), L = SETS.food.labels;
  return Array.from(s, (p, i) => ({label: L[i], p})).sort((a, b) => b.p - a.p).slice(0, top);
}

// a cabinet, fridge or grocery haul: looks at the whole photo plus overlapping crops,
// returns [{name, p}] for every grocery item it's reasonably confident about.
export async function classifyMany(blob, onProgress = () => {}){
  await load();
  const bmp = await createImageBitmap(blob);
  const W = bmp.width, H = bmp.height, cw = W / 2, ch = H / 2;
  const boxes = [[0, 0, W, H]];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) boxes.push([c * W / 4, r * H / 4, cw, ch]);
  const best = new Float32Array(PANTRY.length);
  for (let b = 0; b < boxes.length; b++){
    onProgress(b, boxes.length);
    const [x, y, w, h] = boxes[b];
    const cv = document.createElement('canvas'); const sc = Math.min(1, 448 / Math.max(w, h));
    cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
    cv.getContext('2d').drawImage(bmp, x, y, w, h, 0, 0, cv.width, cv.height);
    const part = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.9));
    const s = scores(await embedImage(part), 'pantry');
    for (let i = 0; i < s.length; i++) if (s[i] > best[i]) best[i] = s[i];
  }
  onProgress(boxes.length, boxes.length);
  if (bmp.close) bmp.close();
  return Array.from(best, (p, i) => ({name: SETS.pantry.names[i], p})).filter(x => x.p >= 0.12).sort((a, b) => b.p - a.p).slice(0, 16);
}

// body-fat photo check: returns probabilities over BODY_LEVELS[sex]
export async function classifyBody(blob, sex){
  await load();
  const set = sex === 'female' ? 'body_female' : 'body_male';
  return Array.from(scores(await embedImage(blob), set));
}

// one package crop: its shape and what kind of food it looks like
export async function classifyCrop(blob){
  await load();
  const v = await embedImage(blob);
  const sh = scores(v, 'pack'), pa = scores(v, 'pantry');
  let si = 0; for (let i = 1; i < sh.length; i++) if (sh[i] > sh[si]) si = i;
  let pi = 0; for (let i = 1; i < pa.length; i++) if (pa[i] > pa[pi]) pi = i;
  return {shape: sh[si] >= 0.3 ? SETS.pack.names[si] : null, shapeP: sh[si], role: pa[pi] >= 0.2 ? PANTRY[pi][3] : null, food: SETS.pantry.names[pi], foodP: pa[pi]};
}
export function isReady(){ return !!vision; }

// Image fingerprints for matching your own things (bottles, containers): the whole photo and its center.
// Two photos of the same object score close to 1; different objects score lower.
export async function embedViews(blob){
  await load();
  const bmp = await createImageBitmap(blob);
  const W = bmp.width, H = bmp.height, s = Math.min(W, H) * 0.62;
  const cv = document.createElement('canvas'); const k = Math.min(1, 336 / s);
  cv.width = cv.height = Math.max(1, Math.round(s * k));
  cv.getContext('2d').drawImage(bmp, (W - s) / 2, (H - s) / 2, s, s, 0, 0, cv.width, cv.height);
  const crop = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.9));
  if (bmp.close) bmp.close();
  return [Array.from(await embedImage(blob)), Array.from(await embedImage(crop))];
}
