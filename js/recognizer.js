// On-device food recognizer: CLIP zero-shot image classification over the app's food labels.
// The model (Xenova/clip-vit-base-patch32, quantized) downloads once from Hugging Face,
// then runs fully on the phone and works offline.
import { LABELS } from './labels.js';

const MODEL = 'Xenova/clip-vit-base-patch32';
const PHOTO_LABELS = LABELS.filter(l => l[3] !== false).map(l => l[0]);
const EMB_KEY = 'clip-text-v1:' + PHOTO_LABELS.length + ':' + PHOTO_LABELS.join('|').length;
const prompt = l => `a photo of ${l}, a type of food.`;

let T = null, processor = null, vision = null, textEmb = null, loading = null;

async function lib(){
  if (T) return T;
  T = await import('../vendor/transformers.min.js');
  T.env.allowLocalModels = false;
  T.env.useBrowserCache = true;
  T.env.backends.onnx.wasm.wasmPaths = new URL('../vendor/', import.meta.url).href;
  T.env.backends.onnx.wasm.numThreads = 1;
  return T;
}

// tiny IndexedDB key-value for the label embeddings
function idb(){ return new Promise((res, rej) => { const r = indexedDB.open('macrolens-model', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function kvGet(k){ try { const d = await idb(); return await new Promise(res => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); } catch { return undefined; } }
async function kvSet(k, v){ try { const d = await idb(); await new Promise(res => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; }); } catch {} }

export async function isDownloaded(){
  const emb = await kvGet(EMB_KEY);
  return !!emb && localStorage.getItem('macrolens.model') === 'ready';
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
      if (p.status === 'progress' && p.total) { files[p.file] = [p.loaded, p.total]; }
      if (p.status === 'done' && files[p.file]) files[p.file][0] = files[p.file][1];
      const v = Object.values(files); const L = v.reduce((a, x) => a + x[0], 0), Tt = v.reduce((a, x) => a + x[1], 0);
      if (Tt) progress(Math.min(0.97, L / Tt), `Downloading recognizer… ${Math.round(L / 1e6)} of ${Math.round(Tt / 1e6)} MB`);
    };
    let emb = await kvGet(EMB_KEY);
    if (!emb) {
      progress(0.01, 'Downloading recognizer…');
      const tok = await t.AutoTokenizer.from_pretrained(MODEL, {progress_callback: cb});
      const text = await t.CLIPTextModelWithProjection.from_pretrained(MODEL, {dtype:'q8', device:'wasm', progress_callback: cb});
      progress(0.97, 'Learning the food list…');
      const parts = [];
      for (let i = 0; i < PHOTO_LABELS.length; i += 16){
        const batch = PHOTO_LABELS.slice(i, i + 16).map(prompt);
        const inputs = tok(batch, {padding:true, truncation:true});
        const {text_embeds} = await text(inputs);
        parts.push(normRows(text_embeds.data, batch.length, text_embeds.dims[1]));
      }
      const dim = parts[0].length / Math.min(16, PHOTO_LABELS.length);
      emb = new Float32Array(PHOTO_LABELS.length * dim); let o = 0; for (const p of parts) { emb.set(p, o); o += p.length; }
      await kvSet(EMB_KEY, emb);
      try { await text.dispose(); } catch {}
    }
    textEmb = emb;
    processor = await t.AutoProcessor.from_pretrained(MODEL, {progress_callback: cb});
    vision = await t.CLIPVisionModelWithProjection.from_pretrained(MODEL, {dtype:'q8', device:'wasm', progress_callback: cb});
    try { localStorage.setItem('macrolens.model', 'ready'); } catch {}
    progress(1, 'Recognizer ready');
    return true;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

// returns [{label, p}] best first
export async function classify(blob, top = 6){
  await load();
  const t = await lib();
  const image = await t.RawImage.fromBlob(blob);
  const inputs = await processor(image);
  const {image_embeds} = await vision(inputs);
  const dim = image_embeds.dims[1];
  const v = normRows(image_embeds.data, 1, dim);
  const n = PHOTO_LABELS.length, logits = new Float32Array(n);
  let mx = -Infinity;
  for (let r = 0; r < n; r++){ let s = 0; for (let i = 0; i < dim; i++) s += v[i] * textEmb[r*dim+i]; logits[r] = 100 * s; if (logits[r] > mx) mx = logits[r]; }
  let sum = 0; for (let r = 0; r < n; r++){ logits[r] = Math.exp(logits[r] - mx); sum += logits[r]; }
  return Array.from(logits, (x, i) => ({label: PHOTO_LABELS[i], p: x / sum})).sort((a, b) => b.p - a.p).slice(0, top);
}
