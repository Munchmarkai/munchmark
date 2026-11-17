// Small hand-drawn pictures used around the app: timeline markers, the restaurant front, the cooking pot.
// All share one look: dark ink outline, flat bright fills (colors come from the CSS tokens), a 48 x 48 box.

const INK = 'stroke="#16201A" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';
const svg = (body, cls = '') => `<svg class="art ${cls}" viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;
const f = c => `fill="var(--${c})"`;

const PICS = {
  // breakfast: a bed, because it's the meal you get out of one for
  bed: `<path ${INK} ${f('purple')} d="M6 14v24M6 30h36v8M42 30v-5a5 5 0 0 0-5-5H20v10"/><rect ${INK} ${f('paper')} x="9" y="21" width="9" height="7" rx="3"/><path ${INK} ${f('blue')} d="M20 24h17a5 5 0 0 1 5 5v1H20z"/>`,
  apple: `<path ${INK} ${f('red')} d="M24 16c-5-4-14-2-14 9 0 9 6 16 10 16 2 0 2-1 4-1s2 1 4 1c4 0 10-7 10-16 0-11-9-13-14-9z"/><path ${INK} fill="none" d="M24 16c0-4 1-7 4-9"/><path ${INK} ${f('green')} d="M28 10c3-4 8-3 9-2-1 3-5 6-9 2z"/>`,
  silverware: `<path ${INK} fill="none" d="M14 6v12M10 6v9a4 4 0 0 0 8 0V6M14 19v23"/><path ${INK} ${f('paper')} d="M32 42V6c6 2 8 12 6 20h-6"/>`,
  candy: `<path ${INK} ${f('orange')} d="M5 20l5 4-5 4zM43 20l-5 4 5 4z"/><rect ${INK} ${f('red')} x="10" y="15" width="28" height="18" rx="3"/><path ${INK} fill="none" d="M19 15v18M29 15v18"/>`,
  popcorn: `<path ${INK} ${f('yellow')} d="M12 20a5 5 0 0 1 7-6 6 6 0 0 1 10 0 5 5 0 0 1 7 6z"/><path ${INK} ${f('paper')} d="M11 20h26l-3 22H14z"/><path ${INK} ${f('red')} d="M17 20l1.5 22h5l-.5-22zM28 20l-.5 22h5l1.5-22z"/>`,
  pretzel: `<path ${INK} fill="none" stroke-width="9" stroke="#16201A" d="M14 38c-9-10-6-26 4-26 7 0 9 8 6 16M34 38c9-10 6-26-4-26-7 0-9 8-6 16"/><path fill="none" stroke="var(--orange)" stroke-width="4.5" stroke-linecap="round" d="M14 38c-9-10-6-26 4-26 7 0 9 8 6 16M34 38c9-10 6-26-4-26-7 0-9 8-6 16"/>`,
  chip: `<path ${INK} ${f('yellow')} d="M8 12c10-5 24-4 34 2-3 12-10 22-20 28C13 34 8 23 8 12z"/><circle cx="20" cy="19" r="1.6" fill="#16201A"/><circle cx="29" cy="23" r="1.6" fill="#16201A"/><circle cx="21" cy="29" r="1.6" fill="#16201A"/>`,
  banana: `<path ${INK} ${f('yellow')} d="M9 12c1 16 12 27 30 26 2 0 3-3 1-4-12-4-20-11-25-23-1-2-6-2-6 1z"/><path ${INK} fill="none" d="M10 12l-2-5"/>`,
  // weigh-ins
  sun: `<circle ${INK} ${f('yellow')} cx="24" cy="24" r="9"/><path ${INK} fill="none" d="M24 5v5M24 38v5M5 24h5M38 24h5M10.5 10.5l3.5 3.5M34 34l3.5 3.5M37.500 10.500l-3.500 3.500M14 34l-3.500 3.500"/>`,
  bottle: `<rect ${INK} ${f('paper')} x="19" y="5" width="10" height="6" rx="2"/><path ${INK} ${f('blue')} d="M17 11h14l3 8v20a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V19z"/><path ${INK} fill="none" d="M14 25h20"/>`,
  drop: `<path ${INK} ${f('blue')} d="M24 5c8 11 13 17 13 24a13 13 0 0 1-26 0c0-7 5-13 13-24z"/><path ${INK} fill="none" stroke="#fff" d="M18 30a6 6 0 0 0 5 6"/>`,
  moon: `<path ${INK} ${f('purple')} d="M32 6a18 18 0 1 0 10 26A15 15 0 0 1 32 6z"/><path ${INK} ${f('yellow')} d="M36 12l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/>`,
  medal: `<path ${INK} ${f('red')} d="M15 5h7l4 14h-7zM33 5h-7l-4 14h7z"/><circle ${INK} ${f('yellow')} cx="24" cy="31" r="11"/><path ${INK} fill="none" d="M24 26v10M21 28l3-2"/>`,
  // practice kinds
  whistle: `<path ${INK} ${f('orange')} d="M6 18h22a11 11 0 1 1-11 11V24H6z"/><circle ${INK} ${f('paper')} cx="28" cy="29" r="4"/><path ${INK} fill="none" d="M32 10l3-5M38 14l5-3"/>`,
  dumbbell: `<rect ${INK} ${f('purple')} x="5" y="15" width="8" height="18" rx="2"/><rect ${INK} ${f('purple')} x="35" y="15" width="8" height="18" rx="2"/><path ${INK} fill="none" stroke-width="5" d="M13 24h22"/>`,
  trophy: `<path ${INK} ${f('yellow')} d="M14 6h20v10a10 10 0 0 1-20 0z"/><path ${INK} fill="none" d="M14 10H7v2a6 6 0 0 0 7 6M34 10h7v2a6 6 0 0 1-7 6M24 26v8"/><path ${INK} ${f('orange')} d="M15 42l2-8h14l2 8z"/>`,
  shoe: `<path ${INK} ${f('green')} d="M5 30V16h9l5 8 15 4c5 1 9 4 9 8v2H5z"/><path ${INK} fill="none" d="M5 34h38M20 25l-3 3M25 27l-3 3"/>`,
};
export const pic = (name, cls) => svg(PICS[name] || PICS.apple, cls);

export const MEAL_PIC = {breakfast:'bed', lunch:'apple', dinner:'silverware'};
const SNACKS = ['candy', 'popcorn', 'pretzel', 'chip', 'banana'];
// a snack keeps the same picture every time it's drawn: the roll comes from its own id
export function snackPic(seed){
  let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SNACKS[h % SNACKS.length];
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// A restaurant front with the name on its sign. The awning color follows the name so each place looks like itself.
export function venueSVG(name){
  const label = String(name || '').trim().slice(0, 22) || 'Restaurant';
  let h = 0; for (const c of label.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const col = ['red', 'orange', 'blue', 'green', 'purple', 'yellow'][h % 6];
  const size = label.length > 16 ? 11 : label.length > 11 ? 13.5 : 17;
  const stripes = Array.from({length: 8}, (_, i) => `<path ${INK} fill="var(--${i % 2 ? 'paper' : col})" d="M${30 + i * 25} 62h25l4 26a12.500 12.500 0 0 1-25 0z" transform="translate(${-2 + i * 0.5 - 2} 0)"/>`).join('');
  return `<svg class="venue" viewBox="0 0 260 190" role="img" aria-label="${esc(label)}">
    <path ${INK} ${f('paper')} d="M24 60h212v118H24z"/>
    <rect ${INK} fill="var(--${col})" x="46" y="14" width="168" height="40" rx="9"/>
    <text x="130" y="${34 + size / 3}" text-anchor="middle" font-size="${size}" class="venue-name">${esc(label)}</text>
    <path ${INK} fill="none" d="M70 54v8M190 54v8"/>
    ${stripes}
    <rect ${INK} ${f('blue')} x="40" y="112" width="70" height="42" rx="4"/><path ${INK} fill="none" d="M75 112v42M40 133h70"/>
    <rect ${INK} ${f('blue')} x="150" y="112" width="70" height="42" rx="4"/><path ${INK} fill="none" d="M185 112v42M150 133h70"/>
    <rect ${INK} fill="var(--${col})" x="114" y="116" width="32" height="62" rx="3"/><circle cx="139" cy="149" r="2.2" fill="#16201A"/>
    <path ${INK} fill="none" d="M10 178h240"/>
  </svg>`;
}

// A pot on the boil, for the meal builder.
export function potSVG(){
  return `<svg class="pot" viewBox="0 0 200 120" aria-hidden="true">
    <path ${INK} fill="none" d="M74 30c-6-8 6-12 0-20M100 30c-6-8 6-12 0-20M126 30c-6-8 6-12 0-20"/>
    <path ${INK} ${f('paper')} d="M40 44h120v10H40z"/>
    <path ${INK} ${f('orange')} d="M46 54h108v38a16 16 0 0 1-16 16H62a16 16 0 0 1-16-16z"/>
    <path ${INK} ${f('paper')} d="M30 62h16v12H34a4 4 0 0 1-4-4zM154 62h16v8a4 4 0 0 1-4 4h-12z"/>
    <circle ${INK} ${f('green')} cx="78" cy="46" r="6"/><circle ${INK} ${f('red')} cx="104" cy="45" r="7"/><circle ${INK} ${f('yellow')} cx="128" cy="46" r="5"/>
  </svg>`;
}
