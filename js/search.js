// Food search over the USDA SR28 table. Shared by the app and the build scripts.

const COOK = ['cooked','roasted','grilled','boiled','baked','broiled','fried','prepared','steamed','braised','scrambled','toasted','microwaved','stewed','poached','sauteed','pan','brewed'];
const MEAT_GROUPS = new Set([5, 7, 10, 13, 15, 17]);
const RAW_OK_GROUPS = new Set([9, 11, 12]); // fruits, vegetables, nuts

export function stem(w){
  if (w.length <= 3) return w;
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (/(ches|shes|sses|xes|zes|oes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1);
  return w;
}
export function tokens(s){
  return String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9%]+/g, ' ').trim().split(' ').filter(Boolean).map(stem);
}

export function buildIndex(db){
  const c = db.cols;
  return db.foods.map(f => {
    const name = f[1];
    const first = name.split(',')[0];
    return {f, name, group:f[2], tok:new Set(tokens(name)), first:new Set(tokens(first)), len:tokens(name).length, lower:name.toLowerCase()};
  });
}

export function search(index, query, limit = 30){
  const q = tokens(query).filter(t => !['a','an','the','of','with','and','some','my','plate','bowl'].includes(t) || false);
  if (!q.length) return [];
  const wantsCook = q.some(t => COOK.includes(t));
  const wantsRaw = q.includes('raw');
  const out = [];
  for (const it of index){
    let s = 0, hit = 0;
    for (const t of q){
      if (it.tok.has(t)) { s += 10; hit++; if (it.first.has(t)) s += 4; }
      else if (t.length >= 3) {
        let pre = false;
        for (const w of it.tok) { if (w.startsWith(t)) { pre = true; break; } }
        if (pre) { s += 5; hit++; }
      }
    }
    if (!hit) continue;
    s -= (q.length - hit) * 9;
    s -= it.len * 0.35;
    const g = it.group, L = it.lower;
    if (g === 35) s -= 8;
    if (!wantsRaw && !wantsCook) {
      if (/\braw\b/.test(L) && (MEAT_GROUPS.has(g) || g === 20 || g === 16)) s -= 7;
      if (/\b(dry|uncooked|unprepared|unenriched|dehydrated)\b/.test(L) && !q.includes('dry')) s -= 4;
      if (COOK.some(w => L.includes(w))) s += 1.5;
    }
    if (wantsRaw && /\braw\b/.test(L)) s += 3;
    if (/\b(powder|concentrate|frozen|canned|imitation|formulated|low sodium|reduced sodium|without salt)\b/.test(L)) {
      const m = L.match(/\b(powder|concentrate|frozen|canned|imitation|formulated|sodium|salt)\b/);
      if (!m || !q.includes(stem(m[1]))) s -= 2;
    }
    if (RAW_OK_GROUPS.has(g) && /\braw\b/.test(L)) s += 1;
    out.push([s, it]);
  }
  out.sort((a, b) => b[0] - a[0]);
  return out.slice(0, limit).map(x => x[1].f);
}
