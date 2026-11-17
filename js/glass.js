// The hand-drawn water glass on the Today tab. It fills by area toward the day's goal, one layer per drink,
// and each layer carries its ounces: inside the layer when there's room, branched off to the side when not.
// A full glass is the goal; anything past it spills over the rim. This file only draws.

const int = n => Math.round(n).toLocaleString();
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const oz = v => (v >= 10 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toString()) + ' oz';

// A tumbler in the same 258 x 200 box as the stomach, leaving the right side for labels.
const SHAPE = 'M38 24 L55 176 Q56 187 68 187 L140 187 Q152 187 153 176 L170 24 Z';
const RIM = 24, BOTTOM = 187, EMPTY_Y = 198;
const wave = amp => { let d = `M-80 0`; for (let x = -80; x < 280; x += 20) d += ` q5 ${-amp} 10 0 t10 0`; return d + ' V260 H-80 Z'; };

// measured once from the outline: the shape's edges on every row, and the surface height for any share of its area
let GEO = null;
function geo(){
  if (GEO) return GEO;
  const edges = [], rows = [];
  try {
    const c = document.createElement('canvas'); c.width = 200; c.height = 200;
    const x = c.getContext('2d'); x.fill(new Path2D(SHAPE));
    const d = x.getImageData(0, 0, 200, 200).data;
    for (let y = 0; y < 200; y++) { let l = -1, r = -1, n = 0; for (let i = 0; i < 200; i++) if (d[(y * 200 + i) * 4 + 3] > 127) { if (l < 0) l = i; r = i; n++; } edges.push(l < 0 ? null : [l, r]); rows.push(n); }
  } catch {}
  const total = rows.reduce((a, b) => a + b, 0);
  GEO = {edges, rows, total};
  return GEO;
}
function levelY(frac){
  const f = Math.max(0, Math.min(1, frac)), g = geo();
  if (f <= 0) return EMPTY_Y;
  if (!g.total) return BOTTOM - (BOTTOM - RIM) * f;
  let acc = 0; const want = g.total * f;
  for (let y = 199; y >= 0; y--) { if (!g.rows[y]) continue; if (acc + g.rows[y] >= want) return y + 1 - (want - acc) / g.rows[y]; acc += g.rows[y]; }
  return RIM;
}
const edgeAt = y => geo().edges[Math.round(y)] || [50, 158];

let uidN = 0;
export function glassHTML(){
  const u = 'gl' + (++uidN);
  return `<svg class="tummy glass" viewBox="0 0 258 200" role="group" aria-label="Water drunk today">
    <defs>
      <clipPath id="${u}-clip"><path d="${SHAPE}"/></clipPath>
      <filter id="${u}-wob" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.5"/></filter>
    </defs>
    <path class="gl-straw" d="M186 2 L148 60"/>
    <path class="gl-over" d="M40 25 Q46 9 64 14 Q80 2 100 11 Q122 1 140 12 Q160 8 168 25 Z M168 30 q9 14 4 30 q-2 9 -8 4 q-3 -4 0 -18 Z"/>
    <path class="tm-sticker" d="${SHAPE}"/>
    <g class="gl-bands" clip-path="url(#${u}-clip)"></g>
    <path class="tm-shine" d="M54 44 L64 138"/>
    <path class="tm-line" d="${SHAPE}" filter="url(#${u}-wob)"/>
    <g class="gl-tags"></g>
  </svg>`;
}

// entries: [{oz, time, sel}] oldest first (time is already formatted); goal: ounces for the day
export function updateGlass(svg, entries, goal){
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg', g = num(goal) || 1;
  const bands = svg.querySelector('.gl-bands'), tags = svg.querySelector('.gl-tags');
  const total = entries.reduce((a, e) => a + num(e.oz), 0);
  svg.classList.toggle('over', total > g + 0.05);
  svg.setAttribute('aria-label', `${oz(total)} of ${int(g)} oz of water`);
  // one layer per drink; each layer's surface is where the glass stood after it
  let cum = 0; const tops = entries.map(e => { cum += num(e.oz); return levelY(cum / g); });
  const redraw = bands.children.length > entries.length;   // a drink was removed: redraw in place, no pouring
  if (redraw) bands.textContent = '';
  const had = bands.children.length;
  for (let i = had; i < entries.length; i++) {
    const lvl = document.createElementNS(NS, 'g'); lvl.setAttribute('class', 'tm-lvl');
    lvl.style.transform = `translateY(${redraw ? tops[i] : i ? tops[i - 1] : EMPTY_Y}px)`;   // pours in from the old surface
    const p = document.createElementNS(NS, 'path'); p.setAttribute('class', 'tm-band gl-w' + (i % 2)); p.setAttribute('d', wave(3)); p.style.animationDelay = `${-1.3 * i}s`;
    lvl.append(p); bands.prepend(lvl);   // later drinks sit behind earlier ones, so each shows only its own slice
  }
  const place = () => entries.forEach((e, i) => { const el = bands.children[entries.length - 1 - i]; if (!el || bands.children.length !== entries.length) return; el.style.transform = `translateY(${tops[i]}px)`; el.firstChild.dataset.action = 'water-entry'; el.firstChild.dataset.i = i; });
  if (had < entries.length && !redraw && typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(place)); else place();

  // labels
  let floor = BOTTOM; const out = []; let html = '';
  const tag = (i, e, inner, label) => `<g class="tm-tag gl-tag${e.sel ? ' sel' : ''}" data-action="water-entry" data-i="${i}" role="button" tabindex="0" aria-label="${label}">${inner}</g>`;
  entries.forEach((e, i) => {
    const top = Math.min(tops[i], BOTTOM), bot = floor; floor = Math.max(RIM, top);
    const amount = e.sel ? 'Remove?' : oz(num(e.oz)), label = `${oz(num(e.oz))}${e.time ? ' at ' + e.time : ''}. ${e.sel ? 'Tap again to remove' : 'Tap to remove'}`;
    const h = bot - top, y = (top + bot) / 2;
    const rows = [edgeAt(y - 6), edgeAt(y + 4)], l = Math.max(...rows.map(x => x[0])) + 6, r = Math.min(...rows.map(x => x[1])) - 6;
    const long = e.time && !e.sel ? `${amount} · ${e.time}` : amount, w = s => s.length * 5.6 + 6;
    if (h >= 12 && r - l >= w(amount)) {
      const text = r - l >= w(long) ? long : amount;
      html += tag(i, e, `<rect class="tm-hit" x="${l}" y="${y - Math.min(h, 18) / 2}" width="${r - l}" height="${Math.min(h, 18)}" rx="5"/><text class="gl-in" x="${(l + r) / 2}" y="${y + 3.8}">${text}</text>`, label);
    } else out.push({i, e, amount, label, has: h > 0.5, ay: h > 0.5 ? y : RIM - 8, ax: h > 0.5 ? edgeAt(y)[1] - 5 : 150, spill: h <= 0.5});
  });
  // side labels, top of the glass first; they squeeze closer when there are many
  out.reverse();
  const LO = 16, HI = 190, GAP = Math.max(10.5, Math.min(24, (HI - LO) / Math.max(1, out.length - 1 || 1)));
  out.forEach((o, k) => { o.y = Math.max(o.ay, k ? out[k - 1].y + GAP : LO); });
  for (let k = out.length - 1; k >= 0; k--) { const max = k === out.length - 1 ? HI : out[k + 1].y - GAP; if (out[k].y > max) out[k].y = max; }
  for (let k = out.length - 2; k >= 0; k--) if (Math.abs(out[k].ay - out[k + 1].ay) < 8) out[k].ax = Math.min(out[k].ax, out[k + 1].ax - 9);
  const two = GAP >= 22;
  out.forEach(o => {
    html += tag(o.i, o.e, `<rect class="tm-hit" x="200" y="${o.y - (two ? 16 : 9)}" width="58" height="${two ? 28 : Math.min(18, GAP)}" rx="5"/>
      <path class="tm-lead" d="M${o.ax} ${o.ay} L196 ${o.y - 3} H203"/><circle class="tm-pin" cx="${o.ax}" cy="${o.ay}" r="2.8"/>
      <text class="tm-t2" x="207" y="${o.y + (two ? -1 : 1)}">${o.amount}</text>${two && o.e.time && !o.e.sel ? `<text class="tm-t1" x="207" y="${o.y + 10}">${o.e.time}</text>` : ''}`, o.label);
  });
  tags.innerHTML = html;
}
