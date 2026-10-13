// On-device storage: one IndexedDB record per logged day plus a profile record.
// Falls back to localStorage if IndexedDB is unavailable.
const DB = 'macrolens', STORE = 'kv';
let dbp = null;
function open(){
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
const LS = k => 'macrolens.' + k;

export async function getAll(){
  try {
    const d = await open();
    return await new Promise((res, rej) => {
      const out = {}; const t = d.transaction(STORE); const s = t.objectStore(STORE);
      const c = s.openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(out); };
      c.onerror = () => rej(c.error);
    });
  } catch {
    const out = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('macrolens.') && k !== 'macrolens.model') out[k.slice(10)] = JSON.parse(localStorage.getItem(k)); } } catch {}
    return out;
  }
}
export async function put(key, value){
  try {
    const d = await open();
    await new Promise((res, rej) => { const t = d.transaction(STORE, 'readwrite'); value == null ? t.objectStore(STORE).delete(key) : t.objectStore(STORE).put(value, key); t.oncomplete = res; t.onerror = () => rej(t.error); });
  } catch {
    try { value == null ? localStorage.removeItem(LS(key)) : localStorage.setItem(LS(key), JSON.stringify(value)); } catch {}
  }
}
export async function persist(){ try { return await navigator.storage?.persist?.(); } catch { return false; } }
