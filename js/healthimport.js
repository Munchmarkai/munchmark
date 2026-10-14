// Import activity from a Samsung Health data export (the ZIP Samsung emails you, or the CSV/JSON files inside it).
// The export format isn't documented in detail, so columns are matched by name and anything unrecognized is skipped.
// Result: {date: {steps, activeMin, exercise:[{type, minutes, avgHR, maxHR, kcal}], sleepH, weightLb}}

async function unzip(buf){
  const dv = new DataView(buf), u8 = new Uint8Array(buf), files = [];
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip');
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++){
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!/\.(csv|json)$/i.test(name) || !/(step|pedometer|activity|exercise|sleep|weight|body_composition|heart_rate)/i.test(name)) continue;
    const lnl = dv.getUint16(off + 26, true), lxl = dv.getUint16(off + 28, true), start = off + 30 + lnl + lxl;
    const data = u8.subarray(start, start + csize);
    let text;
    if (method === 0) text = dec.decode(data);
    else if (method === 8) text = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    else continue;
    files.push({name, text});
  }
  return files;
}

function parseCSV(text){
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++){
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  // Samsung CSVs often start with a one-line file description before the header
  let h = 0;
  while (h < Math.min(3, rows.length - 1) && !rows[h].some(c => /time|date|count|duration|weight/i.test(c))) h++;
  const head = rows[h].map(c => c.trim().split('.').pop().toLowerCase());
  return rows.slice(h + 1).filter(r => r.length >= 2).map(r => Object.fromEntries(head.map((k, i) => [k, r[i]])));
}
function parseJSON(text){
  try { const j = JSON.parse(text); const arr = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : Array.isArray(j.records) ? j.records : [];
    return arr.map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.split('.').pop().toLowerCase(), v]))); } catch { return []; }
}
const pick = (o, ...keys) => { for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]; return null; };
function toDate(v, offset){
  if (v == null) return null;
  let d;
  if (/^\d{12,13}$/.test(String(v))) d = new Date(Number(v));
  else d = new Date(String(v).replace(' ', 'T').replace(/\.\d+$/, ''));
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const EXERCISE = {1001: 'Walking', 1002: 'Running', 11007: 'Cycling', 14001: 'Swimming', 10007: 'Weight training', 0: 'Workout', 15002: 'Treadmill', 1000: 'Workout'};

export async function importSamsung(fileList){
  let files = [];
  for (const f of fileList){
    if (/\.zip$/i.test(f.name)) files = files.concat(await unzip(await f.arrayBuffer()));
    else files.push({name: f.name, text: await f.text()});
  }
  const out = {}, D = k => (out[k] ||= {steps: 0, activeMin: 0, exercise: []});
  const stats = {steps: 0, exercise: 0, sleep: 0, weight: 0, files: files.length};
  for (const f of files){
    const rows = /\.json$/i.test(f.name) ? parseJSON(f.text) : parseCSV(f.text);
    const n = f.name.toLowerCase();
    if (/step|pedometer|activity/.test(n) && !/exercise/.test(n)) {
      // daily trend files hold one row per day; detailed files hold many rows per day, which add up
      const daily = /day|trend|daily/.test(n);
      for (const r of rows){
        const k = toDate(pick(r, 'day_time', 'date', 'start_time', 'create_time', 'timestamp')); const c = Number(pick(r, 'count', 'step_count', 'steps'));
        if (!k || !Number.isFinite(c)) continue;
        const d = D(k);
        if (daily) d.steps = Math.max(d.steps, c); else d._stepSum = (d._stepSum || 0) + c;
        const am = Number(pick(r, 'active_minutes', 'active_time')); if (Number.isFinite(am)) d.activeMin = Math.max(d.activeMin, am > 1440 ? Math.round(am / 60000) : am);
        stats.steps++;
      }
    } else if (/exercise/.test(n)) {
      for (const r of rows){
        const k = toDate(pick(r, 'start_time', 'date', 'timestamp')); if (!k) continue;
        let dur = Number(pick(r, 'duration', 'exercise_time', 'active_time'));
        if (!Number.isFinite(dur)) { const s = new Date(pick(r, 'start_time')), e = new Date(pick(r, 'end_time')); dur = (e - s); }
        const minutes = dur > 1440 ? Math.round(dur / 60000) : Math.round(dur);   // ms or minutes
        if (!(minutes > 0)) continue;
        D(k).exercise.push({type: EXERCISE[Number(pick(r, 'exercise_type'))] || pick(r, 'exercise_custom_type', 'name', 'type') || 'Workout', minutes,
          avgHR: Number(pick(r, 'mean_heart_rate', 'avg_heart_rate', 'heart_rate')) || null, maxHR: Number(pick(r, 'max_heart_rate')) || null, kcal: Number(pick(r, 'calorie', 'calories')) || null});
        stats.exercise++;
      }
    } else if (/sleep/.test(n)) {
      for (const r of rows){
        const s = new Date(String(pick(r, 'start_time') || '').replace(' ', 'T')), e = new Date(String(pick(r, 'end_time') || '').replace(' ', 'T'));
        const h = (e - s) / 36e5; if (!(h > 0.5 && h < 16)) continue;
        const k = toDate(pick(r, 'end_time')); if (!k) continue;
        D(k).sleepH = Math.round(((D(k).sleepH || 0) + h) * 10) / 10; stats.sleep++;
      }
    } else if (/weight|body_composition/.test(n)) {
      for (const r of rows){
        const k = toDate(pick(r, 'start_time', 'create_time', 'timestamp', 'date')); const kg = Number(pick(r, 'weight'));
        if (!k || !(kg > 20 && kg < 350)) continue;
        if (!D(k).weightLb) { D(k).weightLb = Math.round(kg * 2.20462 * 10) / 10; stats.weight++; }
      }
    }
  }
  for (const d of Object.values(out)) { if (d._stepSum && d._stepSum > d.steps) d.steps = d._stepSum; delete d._stepSum; }
  return {days: out, stats};
}
