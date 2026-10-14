// Sports: weigh-ins, practice load, check-in questions, weekly comparison and Bluetooth heart rate.
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const has = v => v != null && v !== '' && Number.isFinite(Number(v));

export const WEIGH_POINTS = {
  morning: {label: 'Morning', hint: 'after the bathroom, before eating or drinking'},
  pre: {label: 'Before practice', hint: 'right before you start'},
  post: {label: 'After practice', hint: 'towel off first'},
  night: {label: 'Before bed', hint: ''},
  weighin: {label: 'Official weigh-in', hint: 'match or meet day'},
};

// Check-in questions. type: scale (1-10), count, hours, color (urine 1-8), yesno
export const QUESTIONS = {
  energy:   {q: 'How is your energy?', type: 'scale', low: 'Drained', high: 'Charged', good: 'high', on: true},
  hunger:   {q: 'How hungry are you?', type: 'scale', low: 'Not at all', high: 'Starving', good: 'mid', on: true},
  mood:     {q: 'How is your mood?', type: 'scale', low: 'Low', high: 'Great', good: 'high', on: true},
  soreness: {q: 'How sore are you?', type: 'scale', low: 'Fresh', high: 'Wrecked', good: 'low', on: true},
  stress:   {q: 'How stressed are you?', type: 'scale', low: 'Calm', high: 'Maxed out', good: 'low', on: false},
  urine:    {q: 'What color is your pee?', type: 'color', good: 'low', on: true},
  pee:      {q: 'Times you’ve peed since your last check-in', type: 'count', on: true},
  poop:     {q: 'Times you’ve pooped since your last check-in', type: 'count', on: true},
  caffeine: {q: 'Caffeinated drinks since your last check-in', type: 'count', on: false},
  sleep:    {q: 'Hours you slept last night', type: 'hours', morning: true, on: true},
  sleepq:   {q: 'How well did you sleep?', type: 'scale', low: 'Awful', high: 'Perfect', good: 'high', morning: true, on: true},
  perf:     {q: 'How did practice go?', type: 'scale', low: 'Rough', high: 'Best ever', good: 'high', on: true, afterPractice: true},
  focus:    {q: 'How sharp is your focus?', type: 'scale', low: 'Foggy', high: 'Locked in', good: 'high', on: false},
  cramps:   {q: 'Any cramping?', type: 'yesno', good: 'low', on: false},
};
// pale straw to dark amber, the usual 8-step hydration chart
export const URINE = ['#F8F6DC', '#F4F0B4', '#EFE58A', '#E8D766', '#DCC24A', '#CDA736', '#B98B2A', '#9C6E22'];

export function sportDefaults(kind){
  const wrestling = kind === 'wrestling';
  return {points: wrestling ? ['morning', 'pre', 'post', 'night'] : ['morning', 'pre', 'post'],
    questions: Object.entries(QUESTIONS).filter(([, v]) => v.on).map(([k]) => k), custom: []};
}

// Heart-rate zones from age-predicted max (Tanaka: 208 - 0.7 x age); Edwards training load
export function hrMax(age){ return Math.round(208 - 0.7 * (num(age) || 20)); }
export function zoneOf(bpm, max){ const p = bpm / max; return p < 0.6 ? 1 : p < 0.7 ? 2 : p < 0.8 ? 3 : p < 0.9 ? 4 : 5; }
export function summarizeHR(samples, age){
  if (!samples.length) return null;
  const max = hrMax(age), zones = [0, 0, 0, 0, 0];
  let sum = 0, peak = 0;
  for (let i = 0; i < samples.length; i++){
    const s = samples[i], dt = i ? Math.min(10, (s.t - samples[i - 1].t) / 1000) : 1;
    zones[zoneOf(s.bpm, max) - 1] += dt; sum += s.bpm; if (s.bpm > peak) peak = s.bpm;
  }
  const min = zones.map(z => z / 60);
  return {avg: Math.round(sum / samples.length), max: peak, minutes: Math.round((samples[samples.length - 1].t - samples[0].t) / 60000),
    zones: min.map(z => Math.round(z * 10) / 10), load: Math.round(min.reduce((a, z, i) => a + z * (i + 1), 0)), hrMax: max};
}

// Bluetooth heart rate (standard Heart Rate service 0x180D / measurement 0x2A37)
export async function connectHR(onBpm, onDisconnect){
  if (!navigator.bluetooth) throw new Error('nobt');
  const dev = await navigator.bluetooth.requestDevice({filters: [{services: ['heart_rate']}], optionalServices: ['battery_service']});
  dev.addEventListener('gattserverdisconnected', () => onDisconnect && onDisconnect());
  const server = await dev.gatt.connect();
  const svc = await server.getPrimaryService('heart_rate');
  const ch = await svc.getCharacteristic('heart_rate_measurement');
  ch.addEventListener('characteristicvaluechanged', e => {
    const v = e.target.value, flags = v.getUint8(0);
    const bpm = flags & 1 ? v.getUint16(1, true) : v.getUint8(1);
    if (bpm > 25 && bpm < 240) onBpm(bpm);
  });
  await ch.startNotifications();
  return {name: dev.name || 'Heart-rate device', disconnect: () => { try { dev.gatt.disconnect(); } catch {} }};
}

// ---- per-day and per-week numbers ----
export function dayMetrics(day, foodT){
  const w = day?.weights || {}, pr = day?.practice || {}, ch = day?.checkins || [];
  const avg = k => { const v = ch.map(c => c.answers?.[k]).filter(has).map(Number); return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null; };
  const sum = k => { const v = ch.map(c => c.answers?.[k]).filter(has).map(Number); return v.length ? v.reduce((a, x) => a + x, 0) : null; };
  const first = k => { const c = ch.find(c => has(c.answers?.[k])); return c ? Number(c.answers[k]) : null; };
  const drank = (day?.water || []).reduce((a, x) => a + num(x.oz), 0);
  const sweat = has(w.pre) && has(w.post) ? num(w.pre) - num(w.post) + num(pr.fluidsOz) / 16 : null;
  const load = num(pr.load) || (num(pr.rpe) * num(pr.minutes)) || null;
  const custom = {};
  for (const c of ch) for (const [k, v] of Object.entries(c.answers || {})) if (k.startsWith('c_') && has(v)) (custom[k] ||= []).push(Number(v));
  return {
    logged: (day?.entries || []).length > 0, kcal: foodT?.calories ?? null, protein: foodT?.protein_g ?? null, carbs: foodT?.carbs_g ?? null, fat: foodT?.fat_g ?? null,
    sodium: foodT?.sodium_mg ?? null, fiber: foodT?.fiber_g ?? null, water: drank || null, foodWater: foodT?.water_g ?? null,
    morning: has(w.morning) ? num(w.morning) : null, pre: has(w.pre) ? num(w.pre) : null, post: has(w.post) ? num(w.post) : null, night: has(w.night) ? num(w.night) : null, weighin: has(w.weighin) ? num(w.weighin) : null,
    sweat, sweatRate: sweat != null && num(pr.minutes) ? sweat / (num(pr.minutes) / 60) : null, practiceMin: num(pr.minutes) || null, rpe: has(pr.rpe) ? num(pr.rpe) : null, load,
    hrAvg: pr.hr?.avg ?? null, steps: has(day?.activity?.steps) ? num(day.activity.steps) : null,
    energy: avg('energy'), hunger: avg('hunger'), mood: avg('mood'), soreness: avg('soreness'), stress: avg('stress'), urine: avg('urine'), focus: avg('focus'),
    pee: sum('pee'), poop: sum('poop'), caffeine: sum('caffeine'), sleep: first('sleep') ?? (has(day?.activity?.sleepH) && num(day.activity.sleepH) ? num(day.activity.sleepH) : null), sleepq: first('sleepq'), perf: avg('perf'),
    checkins: ch.length, custom: Object.fromEntries(Object.entries(custom).map(([k, v]) => [k, v.reduce((a, x) => a + x, 0) / v.length])),
  };
}
// How good the person felt: average of the "good" signals on a 1-10 scale
export function feelScore(m){
  const parts = [];
  if (m.energy != null) parts.push(m.energy);
  if (m.mood != null) parts.push(m.mood);
  if (m.sleepq != null) parts.push(m.sleepq);
  if (m.perf != null) parts.push(m.perf, m.perf);        // performance counts double for athletes
  if (m.focus != null) parts.push(m.focus);
  if (m.soreness != null) parts.push(11 - m.soreness);
  if (m.stress != null) parts.push(11 - m.stress);
  if (m.hunger != null) parts.push(10 - Math.abs(m.hunger - 5) * 1.5);
  return parts.length ? parts.reduce((a, x) => a + x, 0) / parts.length : null;
}
const FIELDS = ['kcal', 'protein', 'carbs', 'fat', 'sodium', 'fiber', 'water', 'foodWater', 'morning', 'sweat', 'sweatRate', 'practiceMin', 'rpe', 'load', 'hrAvg', 'steps',
  'energy', 'hunger', 'mood', 'soreness', 'stress', 'urine', 'focus', 'pee', 'poop', 'caffeine', 'sleep', 'sleepq', 'perf'];
export function weekStats(dayList){
  // dayList: [{date, m}] for 7 days
  const out = {days: dayList.length, logged: dayList.filter(d => d.m.logged).length, checkins: dayList.reduce((a, d) => a + d.m.checkins, 0)};
  for (const f of FIELDS){
    const src = ['kcal', 'protein', 'carbs', 'fat', 'sodium', 'fiber', 'foodWater'].includes(f) ? dayList.filter(d => d.m.logged) : dayList;
    const v = src.map(d => d.m[f]).filter(x => x != null && Number.isFinite(x));
    out[f] = v.length ? v.reduce((a, x) => a + x, 0) / v.length : null;
  }
  const mw = dayList.map(d => d.m.morning).filter(x => x != null);
  out.weightChange = mw.length >= 2 ? mw[mw.length - 1] - mw[0] : null;
  const feels = dayList.map(d => feelScore(d.m)).filter(x => x != null);
  out.feel = feels.length ? feels.reduce((a, x) => a + x, 0) / feels.length : null;
  return out;
}

// what's different between a week you liked and the current one, phrased as things you can repeat
const REP = [
  ['water', 'oz of water a day', 8, v => `${v > 0 ? 'Drink' : 'You can drink'} about ${Math.abs(Math.round(v))} oz ${v > 0 ? 'more' : 'less'} water a day`],
  ['protein', 'g protein', 10, v => `Eat about ${Math.abs(Math.round(v))} g ${v > 0 ? 'more' : 'less'} protein a day`],
  ['carbs', 'g carbs', 25, v => `Eat about ${Math.abs(Math.round(v))} g ${v > 0 ? 'more' : 'fewer'} carbs a day`],
  ['kcal', 'calories', 150, v => `Eat about ${Math.abs(Math.round(v / 10) * 10)} ${v > 0 ? 'more' : 'fewer'} calories a day`],
  ['fat', 'g fat', 12, v => `Eat about ${Math.abs(Math.round(v))} g ${v > 0 ? 'more' : 'less'} fat a day`],
  ['sodium', 'mg sodium', 500, v => `${v > 0 ? 'Allow' : 'Cut'} about ${Math.abs(Math.round(v / 100) * 100).toLocaleString()} mg ${v > 0 ? 'more' : 'less'} sodium a day`],
  ['fiber', 'g fiber', 5, v => `Get about ${Math.abs(Math.round(v))} g ${v > 0 ? 'more' : 'less'} fiber a day`],
  ['sleep', 'hours of sleep', 0.5, v => `Sleep about ${Math.abs(v).toFixed(1)} hours ${v > 0 ? 'more' : 'less'} a night`],
  ['caffeine', 'caffeinated drinks', 0.8, v => `Have about ${Math.abs(v).toFixed(1)} ${v > 0 ? 'more' : 'fewer'} caffeinated drinks a day`],
  ['load', 'training load', 120, v => `Train ${v > 0 ? 'harder or longer' : 'a bit lighter'} (load ${v > 0 ? '+' : '−'}${Math.abs(Math.round(v))} a day)`],
  ['steps', 'steps', 1500, v => `Walk about ${Math.abs(Math.round(v / 100) * 100).toLocaleString()} ${v > 0 ? 'more' : 'fewer'} steps a day`],
];
export function replicate(target, current){
  const out = [];
  for (const [k, , thr, say] of REP){
    if (target[k] == null || current[k] == null) continue;
    const d = target[k] - current[k];
    if (Math.abs(d) >= thr) out.push({k, d, size: Math.abs(d) / thr, text: say(d)});
  }
  return out.sort((a, b) => b.size - a.size).slice(0, 6);
}
export const COMPARE_ROWS = [
  ['feel', 'Feel score', v => v.toFixed(1), 'high'], ['energy', 'Energy', v => v.toFixed(1), 'high'], ['mood', 'Mood', v => v.toFixed(1), 'high'], ['perf', 'Practice rating', v => v.toFixed(1), 'high'],
  ['soreness', 'Soreness', v => v.toFixed(1), 'low'], ['hunger', 'Hunger', v => v.toFixed(1), 'mid'], ['sleep', 'Sleep (h)', v => v.toFixed(1), 'high'], ['sleepq', 'Sleep quality', v => v.toFixed(1), 'high'],
  ['kcal', 'Calories', v => Math.round(v).toLocaleString()], ['protein', 'Protein (g)', v => Math.round(v)], ['carbs', 'Carbs (g)', v => Math.round(v)], ['fat', 'Fat (g)', v => Math.round(v)],
  ['sodium', 'Sodium (mg)', v => Math.round(v).toLocaleString()], ['fiber', 'Fiber (g)', v => Math.round(v)], ['water', 'Water (oz)', v => Math.round(v)], ['urine', 'Pee color (1–8)', v => v.toFixed(1), 'low'],
  ['pee', 'Pees / day', v => v.toFixed(1)], ['poop', 'Poops / day', v => v.toFixed(1)], ['caffeine', 'Caffeine / day', v => v.toFixed(1)],
  ['morning', 'Morning weight (lb)', v => v.toFixed(1)], ['weightChange', 'Weight change (lb)', v => (v > 0 ? '+' : '') + v.toFixed(1)], ['sweat', 'Sweat loss (lb)', v => v.toFixed(1)],
  ['practiceMin', 'Practice (min)', v => Math.round(v)], ['load', 'Training load', v => Math.round(v)], ['steps', 'Steps', v => Math.round(v).toLocaleString()],
];
