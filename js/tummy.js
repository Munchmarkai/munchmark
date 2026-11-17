// The hand-drawn stomach on the Today tab and the page behind each of its colors.
// The stomach fills by area as calories are eaten, and the fill is split into protein, carbs and fat
// by the calories each one brought. This file only draws; app.js hands it the day's numbers.

export const MACROS = [
  {id:'protein', k:'protein_g', label:'Protein', kcal:4},
  {id:'carbs', k:'carbs_g', label:'Carbs', kcal:4},
  {id:'fat', k:'fat_g', label:'Fat', kcal:9},
];
export const MACRO_BY = Object.fromEntries(MACROS.map(m => [m.id, m]));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const int = n => Math.round(n).toLocaleString();
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

// Outline in a 200 x 200 box: food pipe at the top, the bag, and the exit on the left.
const SHAPE = 'M78 12 L78 50 C78 84 64 104 38 108 L16 108 L16 138 L34 138 C48 138 56 150 66 164 C80 184 108 192 136 180 C170 166 186 128 182 92 C178 56 160 34 136 34 C118 34 104 42 98 54 L98 12 Z';
// Height of the surface for every 2% of the shape's area, measured from the outline above, so half the
// calories covers half the stomach, not half its height.
const LEVEL = [185.5,177,172,168,164,160.5,157,154,151,148,145,142.5,139.5,137,135,133,131,129,126.5,124.5,122.5,120.5,118.5,116.5,114.5,112,110,108,105.5,103,100.5,97.5,95,92,89,86,83,79.5,76.5,73,70,66.5,63,59.5,55.5,52,48,44,39,29,12];
const EMPTY_Y = 196;
function levelY(frac){
  const f = Math.max(0, Math.min(1, frac));
  if (f <= 0) return EMPTY_Y;
  const x = f * 50, i = Math.min(49, Math.floor(x));
  return LEVEL[i] + (LEVEL[i + 1] - LEVEL[i]) * (x - i);
}
// one wobbly surface line, wide enough to slide sideways without showing its ends
const wave = amp => { let d = `M-80 0`; for (let x = -80; x < 280; x += 20) d += ` q5 ${-amp} 10 0 t10 0`; return d + ' V260 H-80 Z'; };
const MOUTH = {
  hungry: 'M134 74 q6 -4 12 0',
  eating: 'M132 71 q8 7 16 0',
  full: 'M130 70 q10 12 20 0 z',
  over: 'M130 74 q3.3 -5 6.6 0 t6.6 0 t6.6 0',
};
const BOTTOM = 186, FACE = [48, 80];   // lowest point of the bag; rows the face needs to itself
// left and right edge of the shape on every row, for placing labels
let EDGES = null;
function edges(){
  if (EDGES) return EDGES;
  EDGES = [];
  try {
    const c = document.createElement('canvas'); c.width = 200; c.height = 200;
    const x = c.getContext('2d'); x.fill(new Path2D(SHAPE));
    const d = x.getImageData(0, 0, 200, 200).data;
    for (let y = 0; y < 200; y++) { let l = -1, r = -1; for (let i = 58; i < 200; i++) if (d[(y * 200 + i) * 4 + 3] > 127) { if (l < 0) l = i; r = i; } EDGES.push(l < 0 ? null : [l, r]); }
  } catch { EDGES = []; }
  return EDGES;
}
const edgeAt = y => edges()[Math.round(y)] || [70, 176];

let uidN = 0;
export function stomachHTML(){
  const u = 'tm' + (++uidN);
  return `<svg class="tummy" viewBox="0 0 258 200" role="group" aria-label="Calories eaten today">
    <defs>
      <clipPath id="${u}-clip"><path d="${SHAPE}"/></clipPath>
      <filter id="${u}-wob" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="4"/></filter>
    </defs>
    <path class="tm-sticker" d="${SHAPE}"/>
    <g clip-path="url(#${u}-clip)">
      <g class="tm-lvl" data-band="other"><path class="tm-band tm-other" d="${wave(3)}"/></g>
      ${[...MACROS].reverse().map((m, i) => `<g class="tm-lvl" data-band="${m.id}"><path class="tm-band tm-${m.id}" data-action="macro" data-macro="${m.id}" style="animation-delay:${-1.7 * (i + 1)}s" d="${wave(3.5)}"/></g>`).join('')}
    </g>
    <path class="tm-shine" d="M173 106 C173 124 167 141 157 153"/>
    <path class="tm-line" d="${SHAPE}" filter="url(#${u}-wob)"/>
    <g class="tm-face">
      <ellipse class="tm-cheek" cx="121" cy="69" rx="6" ry="4"/><ellipse class="tm-cheek" cx="159" cy="69" rx="6" ry="4"/>
      <circle cx="129" cy="59" r="4.2"/><circle cx="151" cy="59" r="4.2"/>
      <circle class="tm-glint" cx="130.4" cy="57.6" r="1.4"/><circle class="tm-glint" cx="152.4" cy="57.6" r="1.4"/>
      <path class="tm-mouth" d="${MOUTH.hungry}"/>
    </g>
    ${MACROS.map(m => `<g class="tm-tag m-${m.id}" data-tag="${m.id}" data-action="macro" data-macro="${m.id}" role="button" tabindex="0">
      <rect class="tm-hit" rx="5"/><path class="tm-lead" d=""/><circle class="tm-pin" r="3.2"/><circle class="tm-key" r="5"/>
      <text class="tm-t1"></text><text class="tm-t2"></text></g>`).join('')}
  </svg>`;
}

// t: the day's totals {calories, protein_g, carbs_g, fat_g}; goal: calories for the day
export function updateStomach(svg, t, goal){
  if (!svg) return;
  const cal = num(t.calories), g = num(goal) || 1, frac = cal / g;
  const parts = MACROS.map(m => num(t[m.k]) * m.kcal), macroKcal = parts.reduce((a, b) => a + b, 0);
  // calories the three macros don't explain (alcohol, rounding on labels) sit on top in a neutral color
  const base = Math.max(cal, macroKcal) || 1;
  let cum = 0;
  const tops = {};
  MACROS.forEach((m, i) => { cum += parts[i]; tops[m.id] = levelY(Math.min(1, frac) * cum / base); });
  tops.other = levelY(Math.min(1, frac));
  svg.querySelectorAll('.tm-lvl').forEach(el => { el.style.transform = `translateY(${tops[el.dataset.band]}px)`; });
  const mood = frac > 1.05 ? 'over' : frac >= 0.9 ? 'full' : frac >= 0.04 ? 'eating' : 'hungry';
  svg.dataset.mood = mood;
  svg.querySelector('.tm-mouth').setAttribute('d', MOUTH[mood]);
  svg.setAttribute('aria-label', `${int(cal)} of ${int(g)} calories eaten`);

  // Grams go inside each color when its band is tall and wide enough; otherwise they branch off to the side.
  let floor = BOTTOM; const out = [];
  MACROS.forEach(m => {
    const v = num(t[m.k]), top = Math.min(tops[m.id], BOTTOM), bot = floor; floor = top;
    const text = `${m.label} ${int(v)} g`, need = text.length * 5.8 + 8;
    const tag = svg.querySelector(`[data-tag="${m.id}"]`);
    tag.setAttribute('aria-label', `${text}. See what added to it`);
    let y = (top + bot) / 2, inside = v >= 0.5 && bot - top >= 16;
    if (inside && y > FACE[0] && y < FACE[1]) { if (bot - FACE[1] >= 13) y = (FACE[1] + bot) / 2; else if (FACE[0] - top >= 13) y = (top + FACE[0]) / 2; else inside = false; }
    // the label has to clear the outline along its whole height, not just its middle
    const span = yy => { const rows = [edgeAt(yy - 7), edgeAt(yy), edgeAt(yy + 5)]; return [Math.max(...rows.map(e => e[0])) + 4, Math.min(...rows.map(e => e[1])) - 4]; };
    let [l, r] = span(y);
    // the bag narrows at the bottom: if the middle of the band is too tight, try just under its surface
    if (inside && r - l < need) { const y2 = top + 11; const [l2, r2] = span(y2); if (r2 - l2 >= need && !(y2 > FACE[0] && y2 < FACE[1] + 4)) { y = y2; l = l2; r = r2; } else inside = false; }
    const t1 = tag.querySelector('.tm-t1'), t2 = tag.querySelector('.tm-t2'), hit = tag.querySelector('.tm-hit');
    const box = (x, y, w, h) => { hit.setAttribute('x', x); hit.setAttribute('y', y); hit.setAttribute('width', w); hit.setAttribute('height', h); };
    tag.classList.toggle('in', inside);
    if (inside) {
      t1.textContent = text; t2.textContent = '';
      t1.setAttribute('x', (l + r) / 2); t1.setAttribute('y', y + 4); box((l + r - need) / 2, y - 9, need, 18);
    } else out.push({m, v, tag, t1, t2, box, has: v >= 0.5 && bot - top > 0.5, ay: (top + bot) / 2});
  });
  // side labels: keep the order of the bands (protein lowest) and at least a label's height apart
  out.reverse(); const GAP = 27, LO = 30, HI = 182;
  out.forEach((o, i) => { o.y = Math.max(o.has ? o.ay : HI, i ? out[i - 1].y + GAP : LO); });
  for (let i = out.length - 1; i >= 0; i--) o_fix(out, i, GAP, HI);
  // lines that start close together fan out without crossing: the higher label takes the pin further left
  out.forEach(o => { o.ax = edgeAt(o.ay)[1] - 6; });
  for (let i = out.length - 2; i >= 0; i--) if (out[i].has && out[i + 1].has && Math.abs(out[i].ay - out[i + 1].ay) < 12) out[i].ax = Math.min(out[i].ax, out[i + 1].ax - 11);
  out.forEach(o => {
    const ax = o.ax;
    o.tag.querySelector('.tm-lead').setAttribute('d', o.has ? `M${ax} ${o.ay} L196 ${o.y - 4} H203` : '');
    const pin = o.tag.querySelector('.tm-pin'); pin.setAttribute('cx', ax); pin.setAttribute('cy', o.ay); pin.style.display = o.has ? '' : 'none';
    const key = o.tag.querySelector('.tm-key'); key.setAttribute('cx', 211); key.setAttribute('cy', o.y - 8);
    o.t1.textContent = o.m.label; o.t1.setAttribute('x', 220); o.t1.setAttribute('y', o.y - 4);
    o.box(203, o.y - 17, 55, 30);
    o.t2.textContent = `${int(o.v)} g`; o.t2.setAttribute('x', 220); o.t2.setAttribute('y', o.y + 9);
  });
}
function o_fix(out, i, gap, hi){ const max = i === out.length - 1 ? hi : out[i + 1].y - gap; if (out[i].y > max) out[i].y = max; }

// The page behind a color, or behind any nutrient. rows: [{entryId, name, sub, grams}] in the nutrient's own unit, any order.
// For a macro pass macro:'protein' and g (the targets). For anything else pass nutrient:{k, label, unit, dv, limit, color}.
export function macroPageHTML({macro, nutrient, t, g, rows, dayLabel}){
  const m = nutrient ? null : MACRO_BY[macro] || MACROS[0], n = nutrient || {k:m.k, label:m.label, unit:'g'};
  const total = num(t[n.k]), small = m || n.unit === 'mg' ? 0.5 : 0.05;
  const fmt = v => v >= 10 ? int(v) : (Math.round(v * 10) / 10).toString();
  let goalTxt, note;
  if (m) {
    const kcal = total * m.kcal, cal = num(t.calories), share = cal ? Math.round(Math.min(1, kcal / cal) * 100) : 0;
    goalTxt = 'of ' + (m.id === 'protein' ? `${int(num(g.protein_lo))}–${int(num(g.protein_hi))} g` : `${int(num(g[m.k]))} g`);
    note = `${total ? `That’s ${int(kcal)} kcal, ${share}% of what you ate. ` : ''}Every gram of ${m.label.toLowerCase()} is ${m.kcal} kcal.`;
  } else if (n.dv) {
    const pct = Math.round(total / n.dv * 100);
    goalTxt = `of ${fmt(n.dv)} ${n.unit}${n.limit ? ' max' : ''}`;
    note = n.limit ? (pct > 100 ? `That’s ${pct - 100}% over the daily limit.` : `That’s ${pct}% of the daily limit. Staying under is the goal.`) : `That’s ${pct}% of the daily value.`;
  } else { goalTxt = ''; note = 'There’s no daily value for this one.'; }
  const list = rows.filter(r => r.grams >= small).sort((a, b) => b.grams - a.grams);
  const none = rows.length - list.length, top = list[0]?.grams || 1;
  return `<div class="mp ${m ? 'm-' + m.id : ''}"${m ? '' : ` style="--c:var(--${esc(n.color || 'green')})"`}>
    <div class="mp-hero">
      <button type="button" class="mp-back" data-action="macro-back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg>Back</button>
      <p class="mp-day">${esc(dayLabel)}</p>
      <h1 class="mp-title">${esc(n.label)}</h1>
      <p class="mp-big tnum"><b>${m ? int(total) : fmt(total)}</b><span>${esc(n.unit)} ${goalTxt}</span></p>
      <p class="mp-note tnum">${note}</p>
    </div>
    ${m ? `<div class="mp-tabs" role="group" aria-label="Macro">${MACROS.map(x => `<button type="button" class="mp-tab m-${x.id}" data-action="macro" data-macro="${x.id}" aria-pressed="${x.id === m.id}"><i class="mdot"></i>${x.label}</button>`).join('')}</div>` : ''}
    <div class="sec">
      <h2 class="h">What added to it</h2>
      ${list.length ? `<ul class="mp-list">${list.map(r => `<li><button type="button" class="mp-row" data-action="macro-entry" data-id="${esc(r.entryId)}">
          <span class="mp-name"><b>${esc(r.name)}</b><small>${esc(r.sub || '')}</small></span>
          <span class="mp-amt tnum"><b>+${fmt(r.grams)} ${esc(n.unit)}</b><small>${Math.round(r.grams / (total || 1) * 100)}%</small></span>
          <span class="mp-bar"><i style="width:${Math.max(3, r.grams / top * 100)}%"></i></span>
        </button></li>`).join('')}</ul>` : `<div class="empty"><b>No ${esc(n.label.toLowerCase())} yet</b><p>${rows.length ? `Nothing logged ${esc(dayLabel.toLowerCase())} had any.` : 'Log a meal and it shows up here, food by food.'}</p><button type="button" class="btn primary" data-action="tab" data-tab="scan">Add food</button></div>`}
      ${list.length && none ? `<p class="fine">${none} other food${none === 1 ? '' : 's'} added next to none.</p>` : ''}
    </div>
  </div>`;
}
