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
  hungry: 'M120 121 q7 -5 14 0',
  eating: 'M117 118 q10 9 20 0',
  full: 'M114 116 q13 15 26 0 z',
  over: 'M114 121 q4 -6 8 0 t8 0 t8 0',
};

let uidN = 0;
export function stomachHTML(){
  const u = 'tm' + (++uidN);
  return `<svg class="tummy" viewBox="0 0 200 200" role="img" aria-label="Calories eaten today">
    <defs>
      <clipPath id="${u}-clip"><path d="${SHAPE}"/></clipPath>
      <filter id="${u}-wob" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="4"/></filter>
    </defs>
    <path class="tm-sticker" d="${SHAPE}"/>
    <g clip-path="url(#${u}-clip)">
      <g class="tm-lvl" data-band="other"><path class="tm-band tm-other" d="${wave(3)}"/></g>
      ${[...MACROS].reverse().map((m, i) => `<g class="tm-lvl" data-band="${m.id}"><path class="tm-band tm-${m.id}" data-action="macro" data-macro="${m.id}" style="animation-delay:${-1.7 * (i + 1)}s" d="${wave(3.5)}"><title>${m.label}</title></path></g>`).join('')}
    </g>
    <path class="tm-shine" d="M150 58 C162 66 169 80 170 96"/>
    <path class="tm-line" d="${SHAPE}" filter="url(#${u}-wob)"/>
    <g class="tm-face">
      <ellipse class="tm-cheek" cx="103" cy="112" rx="7" ry="4.5"/><ellipse class="tm-cheek" cx="151" cy="112" rx="7" ry="4.5"/>
      <circle cx="112" cy="100" r="4.6"/><circle cx="142" cy="100" r="4.6"/>
      <circle class="tm-glint" cx="113.6" cy="98.4" r="1.5"/><circle class="tm-glint" cx="143.6" cy="98.4" r="1.5"/>
      <path class="tm-mouth" d="${MOUTH.hungry}"/>
    </g>
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
  svg.setAttribute('aria-label', `${int(cal)} of ${int(g)} calories eaten. ${MACROS.map(m => `${m.label} ${int(num(t[m.k]))} grams`).join(', ')}.`);
}

// The three tappable rows beside the stomach. g: targets() from app.js (protein is a range).
export function macroRowsHTML(t, g){
  return MACROS.map(m => {
    const v = num(t[m.k]);
    let goalTxt, pct, tag = '', range = '';
    if (m.id === 'protein') {
      const lo = num(g.protein_lo), hi = num(g.protein_hi) || 1;
      goalTxt = `${int(lo)}–${int(hi)} g`; pct = v / hi * 100;
      tag = v > hi ? ' <em class="hi">above range</em>' : v >= lo ? ' <em class="ok">in range</em>' : '';
      range = ` range" style="--lo:${lo / hi * 100}%`;
    } else { goalTxt = `${int(num(g[m.k]))} g`; pct = v / (num(g[m.k]) || 1) * 100; }
    return `<button type="button" class="mrow m-${m.id}" data-action="macro" data-macro="${m.id}" aria-label="${m.label}: ${int(v)} of ${goalTxt}. See what added to it">
      <span class="mrow-top tnum"><b><i class="mdot"></i>${m.label}${tag}</b><span>${int(v)} / ${goalTxt}</span></span>
      <span class="bar${range}"><i style="width:${Math.min(100, pct)}%"></i></span>
    </button>`;
  }).join('');
}

// The page behind a color. rows: [{entryId, name, sub, grams}] for the chosen macro, any order.
export function macroPageHTML({macro, t, g, rows, dayLabel}){
  const m = MACRO_BY[macro] || MACROS[0];
  const total = num(t[m.k]), kcal = total * m.kcal, cal = num(t.calories);
  const share = cal ? Math.round(Math.min(1, kcal / cal) * 100) : 0;
  const goalTxt = m.id === 'protein' ? `${int(num(g.protein_lo))}–${int(num(g.protein_hi))} g` : `${int(num(g[m.k]))} g`;
  const list = rows.filter(r => r.grams >= 0.5).sort((a, b) => b.grams - a.grams);
  const none = rows.length - list.length, top = list[0]?.grams || 1;
  const fmt = v => v >= 10 ? int(v) : (Math.round(v * 10) / 10).toString();
  return `<div class="mp m-${m.id}">
    <div class="mp-hero">
      <button type="button" class="mp-back" data-action="macro-back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg>Back</button>
      <p class="mp-day">${esc(dayLabel)}</p>
      <h1 class="mp-title">${m.label}</h1>
      <p class="mp-big tnum"><b>${int(total)}</b><span>g of ${goalTxt}</span></p>
      <p class="mp-note tnum">${total ? `That’s ${int(kcal)} kcal, ${share}% of what you ate. ` : ''}Every gram of ${m.label.toLowerCase()} is ${m.kcal} kcal.</p>
    </div>
    <div class="mp-tabs" role="group" aria-label="Macro">${MACROS.map(x => `<button type="button" class="mp-tab m-${x.id}" data-action="macro" data-macro="${x.id}" aria-pressed="${x.id === m.id}"><i class="mdot"></i>${x.label}</button>`).join('')}</div>
    <div class="sec">
      <h2 class="h">What added to it</h2>
      ${list.length ? `<ul class="mp-list">${list.map(r => `<li><button type="button" class="mp-row" data-action="macro-entry" data-id="${esc(r.entryId)}">
          <span class="mp-name"><b>${esc(r.name)}</b><small>${esc(r.sub || '')}</small></span>
          <span class="mp-amt tnum"><b>+${fmt(r.grams)} g</b><small>${Math.round(r.grams / (total || 1) * 100)}%</small></span>
          <span class="mp-bar"><i style="width:${Math.max(3, r.grams / top * 100)}%"></i></span>
        </button></li>`).join('')}</ul>` : `<div class="empty"><b>No ${m.label.toLowerCase()} yet</b><p>${rows.length ? `Nothing logged ${esc(dayLabel.toLowerCase())} had any.` : 'Log a meal and it shows up here, food by food.'}</p><button type="button" class="btn primary" data-action="tab" data-tab="scan">Add food</button></div>`}
      ${list.length && none ? `<p class="fine">${none} other food${none === 1 ? '' : 's'} added less than half a gram.</p>` : ''}
    </div>
  </div>`;
}
