// Restaurant menus and eating-out suggestions.
// Menus come from the USDA chain items in the food table (McDonald's, Burger King, Wendy's, KFC, Popeyes,
// Taco Bell, Subway, the big pizza chains and a few sit-down chains). Chains without USDA data fall back to
// typical dishes for that kind of restaurant, clearly marked, and to reading calories off a photo of the menu.

// key, display name, words that identify it (in printed text or typed), USDA name prefix, kind of food,
// image-model prompt for its packaging, best sellers (boost when guessing from a photo)
export const CHAINS = [
  {key:'mcdonalds', name:"McDonald's", re:/\bmc ?donald'?s?\b|\bmcd'?s\b|i'?m lovin|big mac|mc ?nuggets?|mc ?chicken|mc ?flurry|mc ?muffin|mc ?griddles?|quarter ?pounder|filet-?o-?fish|happy meal/i, usda:/^McDONALD'S/, kind:'burger',
    clip:"a McDonald's bag, burger box or red french fries carton with the yellow golden arches logo", pop:['BIG MAC','QUARTER POUNDER with Cheese','McCHICKEN Sandwich','Chicken McNUGGETS','french fries','Egg McMUFFIN','Cheeseburger','Double Cheeseburger','FILET-O-FISH','Sausage McMUFFIN with Egg','Hash Brown','McFLURRY with OREO cookies']},
  {key:'burgerking', name:'Burger King', re:/burger ?king|\bwhopper\b/i, usda:/^BURGER KING/, kind:'burger', clip:'a Burger King bag or burger wrapper with the Burger King logo', pop:['WHOPPER, with cheese','WHOPPER, no cheese','Original Chicken Sandwich','french fries','Chicken Strips','Double Cheeseburger','Onion Rings']},
  {key:'wendys', name:"Wendy's", re:/wend'?y'?s|\bfrosty\b|baconator|dave'?s (single|double)/i, usda:/^WEND'?Y'?S/, kind:'burger', clip:"a Wendy's bag or cup with the red-haired girl logo", pop:["DAVE'S Hot 'N Juicy 1/4 LB, single",'Chicken Nuggets','Homestyle Chicken Fillet Sandwich','french fries','Frosty Dairy Dessert','Double Stack, with cheese']},
  {key:'tacobell', name:'Taco Bell', re:/taco ?bell|crunchwrap|chalupa|gordita|baja blast/i, usda:/^TACO BELL/, kind:'mexican', clip:'a Taco Bell bag or wrapper with the purple bell logo', pop:['Original Taco with beef, cheese and lettuce','BURRITO SUPREME with beef','Soft Taco with chicken, cheese and lettuce','Bean Burrito','Nachos Supreme']},
  {key:'kfc', name:'KFC', re:/\bkfc\b|kentucky fried/i, usda:/^KFC/, kind:'chicken', clip:'a KFC bucket or box with the red and white Colonel Sanders logo', pop:['Fried Chicken, ORIGINAL RECIPE, Breast, meat and skin with breading','Crispy Chicken Strips','Popcorn Chicken','Fried Chicken, EXTRA CRISPY, Thigh, meat and skin with breading','biscuit','Coleslaw']},
  {key:'popeyes', name:'Popeyes', re:/popeyes/i, usda:/^POPEYES/, kind:'chicken', clip:'a Popeyes box or bag with the orange Popeyes logo', pop:['Mild Chicken Strips, analyzed 2006','Fried Chicken, Mild, Breast, meat and skin with breading','biscuit','Coleslaw']},
  {key:'subway', name:'Subway', re:/\bsubway\b|eat fresh/i, usda:/^SUBWAY/, kind:'sandwich', clip:'a Subway sandwich wrapped in paper with the green and yellow Subway logo', pop:['oven roasted chicken sub','turkey breast sub','SUBWAY CLUB sub','sweet onion chicken teriyaki sub','steak & cheese sub','meatball marinara sub']},
  {key:'chickfila', name:'Chick-fil-A', re:/chick[- ]?fil[- ]?a|chickfila/i, usda:/^CHICK-FIL-A/, kind:'chicken', clip:'a Chick-fil-A bag or box with the red Chick-fil-A logo', pop:['chicken sandwich','Chick-n-Strips','hash browns']},
  {key:'pizzahut', name:'Pizza Hut', re:/pizza ?hut/i, usda:/^PIZZA HUT/, kind:'pizza', clip:'a Pizza Hut pizza box with the red roof logo', pop:['14" Pepperoni Pizza, Hand-Tossed Crust','14" Cheese Pizza, Hand-Tossed Crust','14" Pepperoni Pizza, Pan Crust']},
  {key:'dominos', name:"Domino's", re:/domino'?s/i, usda:/^DOMINO'S/, kind:'pizza', clip:"a Domino's pizza box with the red and blue domino logo", pop:['14" Pepperoni Pizza, Classic Hand-Tossed Crust','14" Cheese Pizza, Classic Hand-Tossed Crust']},
  {key:'papajohns', name:"Papa John's", re:/papa ?john'?s/i, usda:/^PAPA JOHN'S/, kind:'pizza', clip:"a Papa John's pizza box", pop:['14" Pepperoni Pizza, Original Crust','14" Cheese Pizza, Original Crust']},
  {key:'littlecaesars', name:'Little Caesars', re:/little ?caesar'?s/i, usda:/^LITTLE CAESARS/, kind:'pizza', clip:'a Little Caesars orange pizza box', pop:['14" Original Round Pepperoni Pizza, Regular Crust','14" Original Round Cheese Pizza, Regular Crust']},
  {key:'arbys', name:"Arby's", re:/arby'?s/i, usda:/^ARBY'S/, kind:'sandwich', pop:[]},
  {key:'applebees', name:"Applebee's", re:/applebee'?s/i, usda:/APPLEBEE'S/, kind:'family', pop:[]},
  {key:'dennys', name:"Denny's", re:/denny'?s/i, usda:/DENNY'S/, kind:'family', pop:[]},
  {key:'crackerbarrel', name:'Cracker Barrel', re:/cracker ?barrel/i, usda:/CRACKER BARREL/, kind:'family', pop:[]},
  {key:'tgifridays', name:'TGI Fridays', re:/t\.?\s?g\.?\s?i\.?\s?friday'?s/i, usda:/T\.G\.I\. FRIDAY'S/, kind:'family', pop:[]},
  {key:'olivegarden', name:'Olive Garden', re:/olive ?garden/i, usda:/OLIVE GARDEN/, kind:'italian', pop:[]},
  {key:'carrabbas', name:"Carrabba's", re:/carrabba'?s/i, usda:/CARRABBA'S/, kind:'italian', pop:[]},
  {key:'ontheborder', name:'On The Border', re:/on the border/i, usda:/ON THE BORDER/, kind:'mexican', pop:[]},
  // no USDA data: typical dishes plus the menu photo
  {key:'chipotle', name:'Chipotle', re:/chipotle mexican grill|^\s*chipotle\s*$/i, kind:'mexican', clip:'a Chipotle burrito bowl in a foil bowl with the Chipotle logo'},
  {key:'qdoba', name:'Qdoba', re:/qdoba/i, kind:'mexican'},
  {key:'moes', name:"Moe's Southwest Grill", re:/moe'?s southwest/i, kind:'mexican'},
  {key:'pandaexpress', name:'Panda Express', re:/panda ?express/i, kind:'asian', clip:'a Panda Express takeout box with the red panda logo'},
  {key:'raisingcanes', name:"Raising Cane's", re:/raising ?cane'?s/i, kind:'chicken', clip:"a Raising Cane's box with chicken fingers"},
  {key:'zaxbys', name:"Zaxby's", re:/zaxby'?s/i, kind:'chicken'},
  {key:'wingstop', name:'Wingstop', re:/wingstop/i, kind:'wings'},
  {key:'bww', name:'Buffalo Wild Wings', re:/buffalo wild wings|\bbww\b|\bb-dubs\b/i, kind:'wings'},
  {key:'bojangles', name:'Bojangles', re:/bojangles/i, kind:'chicken'},
  {key:'starbucks', name:'Starbucks', re:/starbucks/i, kind:'coffee', clip:'a Starbucks cup with the green mermaid logo'},
  {key:'dunkin', name:"Dunkin'", re:/dunkin/i, kind:'coffee', clip:"a Dunkin' cup or donut box with the pink and orange logo"},
  {key:'sonic', name:'Sonic', re:/sonic drive|\bsonic\b/i, kind:'burger'},
  {key:'dairyqueen', name:'Dairy Queen', re:/dairy queen|\bblizzard\b/i, kind:'burger'},
  {key:'culvers', name:"Culver's", re:/culver'?s|butterburger/i, kind:'burger'},
  {key:'whataburger', name:'Whataburger', re:/whataburger/i, kind:'burger'},
  {key:'fiveguys', name:'Five Guys', re:/five guys/i, kind:'burger'},
  {key:'innout', name:'In-N-Out', re:/in-?n-?out/i, kind:'burger'},
  {key:'shakeshack', name:'Shake Shack', re:/shake ?shack/i, kind:'burger'},
  {key:'jackinthebox', name:'Jack in the Box', re:/jack in the box/i, kind:'burger'},
  {key:'hardees', name:"Hardee's / Carl's Jr.", re:/hardee'?s|carl'?s jr/i, kind:'burger'},
  {key:'jimmyjohns', name:"Jimmy John's", re:/jimmy john'?s/i, kind:'sandwich'},
  {key:'jerseymikes', name:"Jersey Mike's", re:/jersey mike'?s/i, kind:'sandwich'},
  {key:'firehouse', name:'Firehouse Subs', re:/firehouse subs/i, kind:'sandwich'},
  {key:'panera', name:'Panera Bread', re:/panera/i, kind:'sandwich'},
];
export const CHAIN_BY = Object.fromEntries(CHAINS.map(c => [c.key, c]));
// remove the restaurant's own name ("from McDonald's") but keep item names ("big mac")
function nameRe(c){
  if (!c._nre) {
    const core = c.name.toLowerCase().replace(/[’']s\b/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = [...new Set([core.replace(/ /g, ' ?'), core.replace(/ /g, '')])];
    c._nre = new RegExp(`\\b(from|at|the)\\b|\\b(${parts.map(x => x + "'?s?").join('|')})\\b`, 'gi');
  }
  return c._nre;
}
export const stripChainName = (text, c) => String(text || '').replace(/[’]/g, "'").replace(nameRe(c), ' ').replace(/\s+/g, ' ').trim();
// typical dishes when a chain has no USDA data (names are matched against the food table)
const GENERIC = {
  burger: /^(Fast foods?), (hamburger|cheeseburger|french fries|onion rings|chicken fillet sandwich|chicken tenders|milkshake|side salad)|^Restaurant, family style, (french fries|onion rings|chicken tenders)/i,
  chicken: /^(Fast foods?), (chicken tenders|chicken, breaded and fried|fried chicken|chicken fillet sandwich|biscuit$|coleslaw|french fries|potatoes, mashed)|^Restaurant, family style, (chicken tenders|chicken fingers|coleslaw|french fries)|^Bread, (white|french or vienna), toasted/i,
  wings: /chicken wings|^Fast foods?, (french fries|onion rings)|celery, raw|blue cheese/i,
  mexican: /^(Fast foods?|Restaurant, Mexican), .*(burrito|taco|quesadilla|nachos|enchilada|tostada|chimichanga|spanish rice|refried beans|tamale|guacamole)/i,
  asian: /^Restaurant, Chinese/i,
  pizza: /^Fast foods?, pizza/i,
  sandwich: /^Fast foods?, (submarine sandwich|sandwich|chicken fillet sandwich|roast beef sandwich|wrap)/i,
  italian: /^Restaurant, Italian/i,
  coffee: /^Fast foods?, (croissant|english muffin), with egg|^Beverages, coffee, brewed, prepared with tap water$|^Beverages, coffee, brewed, espresso, restaurant-prepared$|^Fast foods?, (danish|muffin)|^Bagels, plain, enriched|^Doughnuts, (cake-type|yeast-leavened, glazed)|^Croissants, butter|^Milk, (lowfat|reduced fat), fluid, (1|2)%/i,
  family: /^Restaurant, family style/i,
};
export const KIND_LABEL = {burger:'burger place', chicken:'chicken place', wings:'wing place', mexican:'Mexican place', asian:'Chinese/Asian place', pizza:'pizza place', sandwich:'sandwich shop', italian:'Italian restaurant', coffee:'coffee shop', family:'sit-down restaurant'};

const cap1 = w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
export function prettyName(full, chain){
  let s = String(full);
  if (chain && chain.usda) s = s.replace(/^(Fast foods?, |Restaurant, |Beverages, )?/, '').replace(chain.usda, '').replace(/^[,\s]+/, '');
  else s = s.replace(/^(Fast foods?|Restaurant|Beverages),\s*/i, '').replace(/^Pizza chain,\s*/i, '');
  s = s.replace(/, analyzed \d{4}/i, '').replace(/\s+/g, ' ').trim();
  // "BIG MAC" -> "Big Mac", "McNUGGETS" -> "McNuggets"
  s = s.replace(/\b(Mc)?([A-Z][A-Z'&-]{2,})\b/g, (m, mc, w) => (mc || '') + (/[&]/.test(w) ? w : w.split('-').map(cap1).join('-')));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// role of an item, from its name without the chain prefix
function roleOf(name){
  const n = String(name).toLowerCase();
  if (/skin and breading/.test(n)) return 'part';
  const dish = /\b(sub|sandwich|burger|wrap|pizza|burrito|taco|salad with|mcmuffin|mcgriddles|biscuit with|nuggets?|big mac|whopper|cheeseburger|hamburger|quarter pounder|filet|enchilada|quesadilla)\b/.test(n);
  if (!dish && /(sauce|dressing|ketchup|syrup|margarine|peanuts \(for sundaes\))\s*$/.test(n)) return 'sauce';
  if (/\b(sundae|mcflurry|cone|ice cream|pie|frosty|shake|cookie|parfait|blizzard|brownie|churro|dessert|cake|pudding|doughnut|danish)\b/.test(n)) return 'dessert';
  if (/^(coffee|tea|soda|cola|lemonade|juice|beverages?)\b|\b(latte|cappuccino|espresso)\b/.test(n)) return 'drink';
  if (/\b(mcmuffin|mcgriddles|hotcakes|pancakes?|big breakfast|deluxe breakfast|croissan'?wich|french toast|sausage burrito|breakfast|biscuit,? with egg|egg,? (and |& )?cheese biscuit|sausage biscuit|with egg)\b/.test(n)) return 'breakfast';
  if (/^(bread,|toast|french fries|fries|hash browns?|hash brown rounds|onion rings|coleslaw|side salad|breadsticks?|apple slices|biscuit|mashed|corn|refried beans|spanish rice|egg rolls?|fried rice|chips|mozzarella sticks|chinese, (egg rolls|fried rice)|family style, (french fries|onion rings|coleslaw|hash browns))/.test(n)) return 'side';
  return 'main';
}
export const menuRole = roleOf;
// items the chain has since dropped (USDA analyzed them around 2010-2016); kept in the full menu, left out of suggestions
const RETIRED = {mcdonalds:/Premium (Grilled|Crispy)|Bacon Ranch Salad|Side Salad|Fruit 'n Yogurt Parfait|NEWMAN'S OWN|Peanuts \(for Sundaes\)/i};
const COUNT_UNIT = /\b(piece|pieces|strip|strips|slice|wing|drumstick|thigh|breast|stick|breadstick|taco|nugget|round|each)\b/i;

let FOODS = null, BYID = null, SEARCH = null;
const MENU = new Map();
export function initRestaurants({foods, byId, search}){ FOODS = foods; BYID = byId; SEARCH = search; MENU.clear(); }

function itemFromFood(f, chain, generic){
  const n = f.length, s1g = f[n-4], s1d = String(f[n-3] || ''), s2g = f[n-2], s2d = String(f[n-1] || '');
  const name = prettyName(f[1], generic ? null : chain);
  const sizes = [];
  if (s1g && s1d) sizes.push({t:s1d.replace(/,\s*serving$/i, '').replace(/, sub$/i, ' sub').trim(), g:s1g});
  if (s2g && s2d && !/1 pizza/i.test(s2d)) sizes.push({t:s2d.replace(/,\s*serving$/i, '').replace(/, sub$/i, ' sub').trim(), g:s2g});
  if (/french fries/i.test(f[1]) && sizes.length === 2 && /medium/i.test(sizes[1].t)) sizes.push({t:'1 large (estimated)', g:Math.round(sizes[1].g * 1.32)});
  if (!sizes.length) sizes.push({t:'1 serving', g:150});
  // counted items ("4 pieces", "1 strip", "1 slice") get count choices
  let counts = null;
  const base = sizes[0], m = base.t.match(/^(\d+)\s/), per = base.g / (m ? Number(m[1]) : 1);
  if (COUNT_UNIT.test(base.t)) {
    const each = base.t.match(/each,\s*([a-z]+)/i);
    const word = each ? each[1].toLowerCase() : (base.t.match(COUNT_UNIT) || [''])[0].toLowerCase().replace(/s$/, '');
    const choices = per < 25 ? [4, 6, 10, 20] : /slice|taco/.test(word) ? [1, 2, 3] : /strip|stick|wing/.test(word) ? [2, 3, 4, 6] : [1, 2, 3];
    counts = {per, word, choices};
  }
  const retired = !!(chain && RETIRED[chain.key] && RETIRED[chain.key].test(f[1]));
  return {id:'u' + f[0], ndb:f[0], name, full:f[1], chain:chain ? chain.key : null, generic:!!generic, role:roleOf(name), retired, p:f.slice(3, 23), sizes, counts};
}
export function menuFor(key){
  if (MENU.has(key)) return MENU.get(key);
  const chain = CHAIN_BY[key];
  let items = [];
  if (chain && chain.usda) items = FOODS.filter(f => chain.usda.test(f[1]) && !/^Beverages,/.test(f[1])).map(f => itemFromFood(f, chain, false));
  if (chain && !items.length) items = genericMenu(chain.kind);
  if (chain && chain.pop) {
    const rank = full => {
      const rest = full.replace(chain.usda, '').replace(/^[,\s]+/, '').toLowerCase();
      const e = chain.pop.findIndex(p => rest === p.toLowerCase()); if (e >= 0) return e;
      const s = chain.pop.findIndex(p => rest.startsWith(p.toLowerCase())); return s < 0 ? 99 : s + 0.5;
    };
    items.forEach(it => { it.pop = rank(it.full); });
    items.sort((a, b) => a.pop - b.pop);
  }
  MENU.set(key, items);
  return items;
}
export function genericMenu(kind){
  const k = 'kind:' + kind;
  if (MENU.has(k)) return MENU.get(k);
  const re = GENERIC[kind];
  const items = re ? FOODS.filter(f => re.test(f[1]) && !/(McDONALD|BURGER KING|WEND|TACO BELL|KFC|POPEYES|SUBWAY|PIZZA HUT|DOMINO|PAPA JOHN|LITTLE CAESARS|CHICK-FIL-A|ARBY|APPLEBEE|DENNY|CRACKER BARREL|FRIDAY|OLIVE GARDEN|CARRABBA|ON THE BORDER)/.test(f[1])).slice(0, 60).map(f => itemFromFood(f, null, true)) : [];
  MENU.set(k, items);
  return items;
}

// find a chain in printed or typed text
export function detectChain(text){
  const t = ` ${String(text || '').replace(/[’]/g, "'")} `;
  for (const c of CHAINS) if (c.re.test(t)) return c;
  return null;
}
export function chainByName(q){
  const s = String(q || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim();
  if (!s) return null;
  const direct = detectChain(q); if (direct) return direct;
  let best = null, bs = 0;
  for (const c of CHAINS){
    const n = c.name.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim();
    const sc = n === s ? 1 : n.startsWith(s) && s.length >= 3 ? 0.8 : n.includes(s) && s.length >= 4 ? 0.6 : 0;
    if (sc > bs) { bs = sc; best = c; }
  }
  return best;
}
// a typed restaurant that isn't a known chain: guess the kind of place
export function kindFromName(q){
  const s = String(q || '').toLowerCase();
  if (/pizz/.test(s)) return 'pizza';
  if (/taco|taqueria|mexic|cantina|burrito|grill.*mex|tex-?mex/.test(s)) return 'mexican';
  if (/chin|wok|panda|asian|thai|pho|sushi|ramen|hibachi|teriyaki|japan|korea|viet/.test(s)) return 'asian';
  if (/wing/.test(s)) return 'wings';
  if (/chicken|cluck|fried/.test(s)) return 'chicken';
  if (/burger|drive|diner/.test(s)) return 'burger';
  if (/sub|deli|sandwich|hoagie/.test(s)) return 'sandwich';
  if (/coffee|cafe|café|espresso|donut|bakery/.test(s)) return 'coffee';
  if (/italian|pasta|trattoria|ristorante/.test(s)) return 'italian';
  return 'family';
}

// rank a chain's menu for a photo: printed or typed words ("big mac" on the box) and what the image model saw
const FOOD_KIND = [['burger', /burger|big mac|quarter pounder|whopper|single|double|stack|patty/i], ['fries', /fries|french fr/i], ['nuggets', /nugget|strips?|tenders|fingers|popcorn chicken|chick-n/i],
  ['chicken sandwich', /chicken.*sandwich|mcchicken|chicken fillet|crispy chicken|grilled chicken/i], ['fish', /fish/i], ['breakfast', /mcmuffin|mcgriddles|biscuit|croissan|hotcakes|pancake|breakfast|egg/i],
  ['dessert', /mcflurry|sundae|cone|shake|frosty|pie|ice cream/i], ['salad', /salad/i], ['pizza', /pizza/i], ['taco', /taco/i], ['burrito', /burrito/i], ['nachos', /nachos/i], ['sub', /\bsub\b|sandwich/i],
  ['fried chicken', /fried chicken|breast|thigh|drumstick|wing/i]];
const kindsOf = s => FOOD_KIND.filter(([, re]) => re.test(s)).map(([k]) => k);
export function rankMenu(items, {words = '', guesses = []} = {}){
  const W = new Set(String(words).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length >= 3));
  const gk = {};
  for (const g of guesses) for (const k of kindsOf(g.label)) gk[k] = Math.max(gk[k] || 0, g.p);
  return items.map(it => {
    const nameW = it.full.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !/^(mcdonalds|burger|king|wendys|with|and|the)$/.test(w));
    const hit = nameW.filter(w => W.has(w) || [...W].some(x => x.length >= 4 && (w.includes(x) || x.includes(w)))).length;
    let s = nameW.length ? hit / nameW.length * 2 : 0;
    for (const k of kindsOf(it.full)) s += (gk[k] || 0) * 1.5;
    s += it.pop != null && it.pop < 99 ? (12 - Math.min(12, it.pop)) * 0.03 : 0;
    if (it.role === 'sauce') s -= 0.5;
    return {it, s};
  }).sort((a, b) => b.s - a.s).map(x => ({...x.it, score:x.s}));
}

// nutrients for one choice of an item (size or count)
export function portionsOf(it){
  const out = [];
  if (it.counts) for (const n of it.counts.choices) out.push({t:`${n} ${it.counts.word}${n > 1 && !/s$/.test(it.counts.word) ? 's' : ''}`, g:Math.round(it.counts.per * n * 10) / 10});
  else for (const s of it.sizes) out.push(s);
  return out;
}
export const nutOf = (it, g) => { const k = g / 100; return {kcal:it.p[0] * k, p:it.p[1] * k, c:it.p[2] * k, f:it.p[3] * k, fiber:it.p[4] * k, na:it.p[8] * k, g}; };

// combos that fit a meal target: {kcal, protein, carbs, fat}
export function suggest(items, T, {limit = 5, hour = new Date().getHours()} = {}){
  const vars = [];
  const breakfastTime = hour < 11;
  for (const it of items){
    if (['sauce', 'drink', 'part', 'dessert'].includes(it.role) || it.retired || /\(without /i.test(it.full)) continue;
    if (!breakfastTime && /hash browns?/i.test(it.full) && !it.printed) continue;
    if (it.role === 'breakfast' && !breakfastTime && !it.printed) continue;
    if (it.role !== 'breakfast' && breakfastTime && it.chain === 'mcdonalds' && !/fries|nugget/i.test(it.full) && !it.printed) continue;
    for (const po of portionsOf(it)) vars.push({it, po, n:nutOf(it, po.g)});
  }
  const mains = vars.filter(v => v.it.role === 'main' || v.it.role === 'breakfast');
  const sides = vars.filter(v => v.it.role === 'side').sort((a, b) => (a.it.pop ?? 99) - (b.it.pop ?? 99)).slice(0, 12);
  const add = (a, b) => ({kcal:a.kcal + b.kcal, p:a.p + b.p, c:a.c + b.c, f:a.f + b.f, fiber:a.fiber + b.fiber, na:a.na + b.na});
  const combos = [];
  for (const m of (mains.length ? mains : vars)){
    combos.push({parts:[m], n:m.n});
    for (const s of sides) if (s.it.id !== m.it.id) combos.push({parts:[m, s], n:add(m.n, s.n)});
  }
  const kT = Math.max(200, T.kcal || 700);
  const score = n => {
    const over = Math.max(0, n.kcal - kT) / kT, under = Math.max(0, kT - n.kcal) / kT;
    let s = over * 3 + under * 1.2;
    if (T.protein) s += Math.max(0, T.protein - n.p) / T.protein * 1.5;
    if (T.carbs) s += Math.abs(n.c - T.carbs) / T.carbs * 0.3;
    if (T.fat) s += Math.max(0, n.f - T.fat) / T.fat * 0.6;
    if (n.na > 1800) s += 0.15;
    return s;
  };
  for (const c of combos) c.score = score(c.n);
  const pick = (list, n) => { const seen = new Set(), out = []; for (const c of list){ const k = c.parts[0].it.id; if (seen.has(k)) continue; seen.add(k); out.push(c); if (out.length >= n) break; } return out; };
  const best = pick(combos.slice().sort((a, b) => a.score - b.score), limit);
  const used = new Set(best.map(c => c.parts.map(p => p.it.id + p.po.t).join('+')));
  const fresh = c => !used.has(c.parts.map(p => p.it.id + p.po.t).join('+'));
  const protein = pick(combos.filter(c => c.n.kcal <= kT * 1.1 && c.n.kcal > 150 && fresh(c)).sort((a, b) => b.n.p / b.n.kcal - a.n.p / a.n.kcal), 3);
  for (const c of protein) used.add(c.parts.map(p => p.it.id + p.po.t).join('+'));
  const light = pick(combos.filter(c => c.n.kcal <= kT * 0.75 && c.n.kcal > 150 && fresh(c)).sort((a, b) => b.n.p - a.n.p), 3);
  return {best, protein, light};
}

const CAL_RE = /(\d{2,4})\s*(?:[-–\/]|to)\s*(\d{2,4})\s*(?:cal(?:ories)?|kcal)\b|(\d{2,4})\s*(?:cal(?:ories)?|kcal)\b/i;
const cleanName = s => String(s).replace(/\$\s?\d+(\.\d{2})?|\b\d+\.\d{2}\b/g, ' ').replace(/[^A-Za-z0-9'&,\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
// menu words with positions (from OCR): split lines into columns so side-by-side items stay separate
export function parseMenuWords(words){
  const W = (words || []).filter(w => w.conf >= 40 && String(w.text).trim());
  if (!W.length) return [];
  const hs = W.map(w => w.y1 - w.y0).sort((a, b) => a - b), mh = hs[Math.floor(hs.length / 2)] || 20;
  const lines = [];
  for (const w of W.slice().sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1))){
    const yc = (w.y0 + w.y1) / 2, h = w.y1 - w.y0;
    const L = lines.find(l => Math.abs(l.yc - yc) < Math.max(l.h, h) * 0.5);
    if (L) { L.words.push(w); L.yc = (L.yc * L.n + yc) / (L.n + 1); L.n++; L.h = Math.max(L.h, h); }
    else lines.push({yc, h, n:1, words:[w]});
  }
  const cells = [];
  for (const l of lines){
    l.words.sort((a, b) => a.x0 - b.x0);
    let cur = null;
    for (const w of l.words){
      if (cur && w.x0 - cur.x1 < Math.max(mh, l.h) * 1.6) { cur.text += ' ' + w.text; cur.x1 = w.x1; }
      else { cur = {text:String(w.text), x0:w.x0, x1:w.x1, yc:l.yc, h:l.h}; cells.push(cur); }
    }
  }
  const out = [];
  for (const c of cells){
    const m = c.text.match(CAL_RE); if (!m) continue;
    const lo = Number(m[1] || m[3]), hi = Number(m[2] || m[3]);
    let name = cleanName(c.text.slice(0, m.index));
    if (!/[a-z]{3}/i.test(name)) {
      const above = cells.filter(o => o !== c && o.yc < c.yc && c.yc - o.yc < 3.2 * Math.max(o.h, c.h) && !CAL_RE.test(o.text)
        && Math.min(o.x1, c.x1) - Math.max(o.x0, c.x0) > 0.25 * Math.min(o.x1 - o.x0, c.x1 - c.x0)).sort((a, b) => b.yc - a.yc)[0];
      if (above) name = cleanName(above.text);
    }
    if (name && /[a-z]{3}/i.test(name) && lo >= 20 && lo <= 3000 && hi >= lo && hi <= 4000) out.push({name:name.slice(0, 60), kcal:lo, kcalHi:hi});
  }
  const seen = new Set();
  return out.filter(x => { const k = x.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}
// a photo of a menu: "Grilled Chicken Sandwich 380 Cal $7.49" -> {name, kcal}
export function parseMenuText(text){
  const lines = String(text).split('\n').map(l => l.replace(/[|•·]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = []; let pending = '';
  const CAL = /(\d{2,4})\s*(?:[-–\/]|to)\s*(\d{2,4})\s*(?:cal(?:ories)?|kcal)\b|(\d{2,4})\s*(?:cal(?:ories)?|kcal)\b/i;
  for (const raw of lines){
    const line = raw.replace(/\$\s?\d+(\.\d{2})?|\b\d+\.\d{2}\b/g, ' ').replace(/\s+/g, ' ').trim();
    const m = line.match(CAL);
    if (m) {
      const lo = Number(m[1] || m[3]), hi = Number(m[2] || m[3]);
      let name = line.slice(0, m.index).replace(/[^A-Za-z0-9'&,\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (name.split(' ').filter(w => /[a-z]{2}/i.test(w)).length < 1) name = pending;
      if (name && lo >= 20 && lo <= 3000 && hi >= lo && hi <= 4000) out.push({name:name.slice(0, 60), kcal:lo, kcalHi:hi});
      pending = '';
    } else if (/[A-Za-z]{3}/.test(line) && line.length <= 50 && !/^(menu|combos?|sides?|drinks?|beverages|desserts|breakfast|lunch|dinner|entrees?|add|choose|served|includes|price)/i.test(line)) pending = line.replace(/[^A-Za-z0-9'&,\- ]+/g, ' ').trim();
  }
  const seen = new Set();
  return out.filter(x => { const k = x.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}
// macros for a menu line: the chain's own item if it matches, otherwise a similar USDA dish scaled to the printed calories
export function estimateMenuItem(entry, chainItems = []){
  const words = entry.name.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length >= 3);
  let best = null, bs = 0;
  const STOP = /^(with|and|the|mcdonalds|burger|king|wendys|subway|sub|white|bread|lettuce|tomato)$/;
  for (const it of chainItems){
    if (it.role === 'part') continue;
    const nw = it.name.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !STOP.test(w));
    let hit = 0;
    for (const w of words) hit += nw.includes(w) ? 1 : nw.some(x => w.length >= 5 && x.length >= 5 && (x.includes(w) || w.includes(x))) ? 0.5 : 0;
    const sc = words.length && nw.length ? 0.7 * hit / words.length + 0.3 * Math.min(1, hit / nw.length) - (it.retired ? 0.1 : 0) : 0;
    if (sc > bs) { bs = sc; best = it; }
  }
  let base = bs >= 0.5 ? best : null, estimated = !base;
  if (!base) {
    const hits = SEARCH(entry.name, 8);
    const f = hits.find(h => h[2] === 21 || h[2] === 36 || h[2] === 22) || hits[0];
    if (!f) return null;
    base = itemFromFood(f, null, true);
  }
  const kcal100 = base.p[0] || 200;
  const kcal = entry.kcal ? (entry.kcal + (entry.kcalHi || entry.kcal)) / 2 : null;
  const g = kcal ? Math.round(kcal / kcal100 * 100) : (base.sizes[0]?.g || 150);
  return {id:'m' + Math.random().toString(36).slice(2, 8), ndb:base.ndb, name:entry.name, full:entry.name, chain:base.chain, generic:true, estimated, basedOn:base.name,
    role:roleOf(entry.name) === 'main' && base.role !== 'part' ? base.role : roleOf(entry.name), p:base.p, sizes:[{t:kcal ? `as listed (${Math.round(kcal)} cal)` : (base.sizes[0]?.t || '1 serving'), g}], counts:null, printed:kcal};
}
