// Free-text diet preferences for the meal planner.
// "3 meals and a snack, vegetarian, no mushrooms, keep sodium low, 2000 calories"
// -> meals, snacks, foods to leave out, foods to favor, macro changes, and a plain-English summary.

const NUMS = {one:1, two:2, three:3, four:4, five:5, six:6, a:1, an:1, single:1};
const n = s => NUMS[s] ?? Number(s);

// food families people name when they leave something out
const FAMILIES = {
  meat:     {label:'meat', re:/\b(chicken|beef|pork|turkey|bacon|ham|sausages?|steaks?|lamb|veal|venison|bison|meat|meatloaf|jerky|pepperoni|salami|bologna|hot ?dogs?|franks?|ribs|chops?|burgers?|hamburgers?|cheeseburgers?|nuggets|wings|deli|chili con carne|brisket)\b/, groups:[5, 7, 10, 13, 17]},
  redmeat:  {label:'red meat', re:/\b(beef|steaks?|burgers?|hamburgers?|cheeseburgers?|veal|lamb|bison|venison|brisket|meatloaf|pork|ribs|chops?)\b/, groups:[10, 13, 17]},
  pork:     {label:'pork', re:/\b(pork|bacon|ham|sausages?|pepperoni|salami|chorizo|prosciutto|hot ?dogs?|spareribs)\b/, groups:[10]},
  beef:     {label:'beef', re:/\b(beef|steaks?|burgers?|hamburgers?|cheeseburgers?|brisket|meatloaf|roast beef)\b/, groups:[13]},
  poultry:  {label:'chicken and turkey', re:/\b(chicken|turkey|poultry|nuggets|wings)\b/, groups:[5]},
  fish:     {label:'fish and seafood', re:/\b(fish|salmon|tuna|cod|tilapia|trout|sardines?|anchov\w*|mackerel|halibut|catfish|pollock|shrimp|crab|lobster|scallops?|clams?|oysters?|mussels?|seafood|sushi)\b/, groups:[15]},
  shellfish:{label:'shellfish', re:/\b(shrimp|crab|lobster|scallops?|clams?|oysters?|mussels?|shellfish|crustaceans?)\b/},
  dairy:    {label:'dairy', re:/\b(milk|cheese|cheeses|cheddar|mozzarella|parmesan|ricotta|yogurt|yoghurt|butter|cream|cottage|whey|ice cream|kefir|latte|queso|dairy|pizza|macaroni and cheese|mac and cheese)\b/, unless:/\b(almond|oat|soy|coconut|rice|cashew|plant|peanut|nut|sunflower|seed|apple|cocoa) (milk|butter|cream|cheese)\b/, free:/dairy[- ]free|non[- ]dairy/},
  eggs:     {label:'eggs', re:/\b(eggs?|omelet\w*|scrambled|french toast|mayonnaise|mayo)\b/, free:/egg[- ]free/},
  gluten:   {label:'gluten', re:/\b(bread|bagels?|pasta|spaghetti|penne|macaroni|noodles?|ramen|lo mein|flour tortillas?|crackers?|cereals?|cheerios|granola|waffles?|pancakes?|english muffins?|muffins?|pizza|cookies?|cakes?|brownies?|biscuits?|croissants?|croutons?|wheat|barley|rye|couscous|pretzels?|sandwich\w*|subs?|burritos?|hamburgers?|cheeseburgers?|hot ?dogs?|corn ?dogs?|donuts?|doughnuts?|pies?|beer|toast|tortillas?|breaded|nuggets)\b/, unless:/\bcorn tortillas?\b|\btortillas?\b(?=.*\bcorn\b)/, free:/gluten[- ]free/},
  nuts:     {label:'nuts', re:/\b(nuts?|almonds?|walnuts?|pecans?|cashews?|pistachios?|hazelnuts?|macadamias?|peanuts?|peanut butter|almond butter|nut butter|trail mix|almond milk|granola|nutella)\b/, free:/nut[- ]free/},
  peanuts:  {label:'peanuts', re:/\b(peanuts?|peanut butter|pb&j|reese'?s)\b/},
  soy:      {label:'soy', re:/\b(soy|tofu|edamame|tempeh|soybeans?|miso)\b/},
  sweets:   {label:'sweets and sugary drinks', re:/\b(soda|cola|candy|candies|chocolate|cookies?|cakes?|brownies?|donuts?|doughnuts?|ice cream|syrups?|jelly|jams?|preserves|honey|frosted|pop-?tarts|cupcakes?|pies?|energy drinks?|sweetened|sports drinks?)\b/, roles:['snack']},
  fried:    {label:'fried and fast food', re:/\b(fried|fries|nuggets|onion rings|chips|corn ?dogs?|fast food|tenders)\b/, groups:[21]},
  processed:{label:'processed and ready-made food', re:/\b(frozen pizza|ramen|instant|nuggets|hot ?dogs?|chips|canned soup|mac and cheese|macaroni and cheese)\b/, roles:['meal', 'snack']},
  grains:   {label:'grains', re:/\b(bread|bagels?|pasta|spaghetti|rice|oats?|oatmeal|cereals?|granola|tortillas?|crackers?|quinoa|wheat|barley|corn|waffles?|pancakes?|muffins?|noodles?|couscous)\b/},
  legumes:  {label:'beans and lentils', re:/\b(beans?|lentils?|chickpeas?|garbanzo|hummus|peanuts?|peanut butter|soy|tofu|edamame|peas)\b/},
  caffeine: {label:'caffeine', re:/\b(coffee|espresso|latte|energy drinks?|cola|tea|red bull|monster|celsius)\b/, free:/decaf/},
  alcohol:  {label:'alcohol', re:/\b(beer|wine|vodka|whiskey|liquor|alcohol\w*)\b/},
};
// words people use for those families
const FAMILY_WORDS = [
  [/^(red meats?)$/, 'redmeat'], [/^(meats?|animal meat)$/, 'meat'], [/^(pork|pig|bacon|ham)$/, 'pork'], [/^(beef|steak|cow)$/, 'beef'],
  [/^(poultry|chicken|turkey|birds?)$/, 'poultry'], [/^(fish|seafood|sea food)$/, 'fish'], [/^(shellfish|shrimp|crustaceans?)$/, 'shellfish'],
  [/^(dairy|milk|lactose|cheese|cows? milk|milk products)$/, 'dairy'], [/^(eggs?)$/, 'eggs'], [/^(gluten|wheat)$/, 'gluten'],
  [/^((tree )?nuts?)$/, 'nuts'], [/^(peanuts?|peanut butter)$/, 'peanuts'], [/^(soy|soya|tofu)$/, 'soy'],
  [/^(sugar|sweets|candy|desserts?|sugary (stuff|food|foods|drinks)|added sugars?|soda|pop)$/, 'sweets'],
  [/^(fried (food|foods)|fast food|junk food|junk)$/, 'fried'], [/^(processed (food|foods)|ultra[- ]processed (food|foods)?)$/, 'processed'],
  [/^(grains?|bread|carbs?|starch(es)?)$/, 'grains'], [/^(beans|legumes|lentils)$/, 'legumes'], [/^(caffeine|coffee)$/, 'caffeine'], [/^(alcohol|beer|booze)$/, 'alcohol'],
];
const STOP = new Set('a an the any some of my me i to too much more less really very please and or but also just foods food stuff things eat eating'.split(' '));

function familyFor(phrase){
  for (const [re, k] of FAMILY_WORDS) if (re.test(phrase)) return k;
  return null;
}
function foodText(f){
  return `${f.name || ''} ${f.full || ''} ${(f.cats || []).join(' ')}`.toLowerCase().replace(/[’']/g, "'").replace(/&/g, ' and ').replace(/[-_]/g, ' ');
}
function inFamily(f, k){
  const F = FAMILIES[k], full = foodText(f);
  if (F.free && F.free.test(full)) return false;                       // "gluten-free bread" is fine for "no gluten"
  const t = F.unless ? full.replace(new RegExp(F.unless.source, 'g'), ' ') : full;   // "almond milk" isn't dairy
  if (F.re.test(t)) return true;
  if (F.groups && f.src === 'usda' && F.groups.includes(f.group)) return !(k === 'dairy' && /\beggs?\b/.test(t)) && !(F.unless && F.unless.test(full));
  if (F.roles && F.roles.includes(f.role)) return true;
  return false;
}
const stem = w => w.length > 3 ? w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '') : w;
function wordMatcher(phrase){
  const ws = phrase.split(/\s+/).filter(w => w && !STOP.has(w)).map(stem);
  if (!ws.length) return null;
  return f => { const t = foodText(f).split(/[^a-z]+/).map(stem); return ws.every(w => t.some(x => x === w || (w.length >= 5 && x.startsWith(w)))); };
}
function splitList(s){
  return s.replace(/\b(please|thanks?|thank you)\b/g, '').split(/\s*(?:,|\bor\b|\band\b|\/|&|\bnor\b)\s*/).map(x => x.trim().replace(/^(any|all|the|some|eating|eat)\s+/, '').trim()).filter(Boolean);
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// Returns {meals, snacks, noBreakfast, exclude:[{label,test}], prefer:[{label,test}], flags:{...}, macros:{...}, calMult, understood:[], unknown:[]}
export function parseDiet(text){
  const out = {meals:null, snacks:null, noBreakfast:false, exclude:[], prefer:[], flags:{}, macros:{}, pct:{}, calMult:1, understood:[], unknown:[]};
  const raw = String(text || '').toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  if (!raw) return out;
  const addEx = (label, test, note) => { if (!out.exclude.some(e => e.label === label)) { out.exclude.push({label, test}); if (note !== false) out.understood.push(note || `No ${label}`); } };
  const addFam = (k, note) => addEx(FAMILIES[k].label, f => inFamily(f, k), note);
  const segments = raw.split(/\s*(?:[.;\n!]|,(?![^(]*\)))\s*/).map(s => s.trim()).filter(Boolean);
  for (let seg of segments){
    let hit = false;
    const H = () => { hit = true; };
    let m;
    // meals and snacks
    if ((m = seg.match(/\b(\d|one|two|three|four|five|six)\s+(?:big |small |main |full |square |solid )?meals?\b/))) { out.meals = Math.max(1, Math.min(4, n(m[1]))); out.understood.push(`${out.meals} meal${out.meals > 1 ? 's' : ''} a day${n(m[1]) > 4 ? ' (4 is the most the planner splits into)' : ''}`); H(); }
    if (/\bomad\b|one meal a day/.test(seg)) { out.meals = 1; out.understood.push('1 meal a day'); H(); }
    if (/\bno snacks?\b|\bwithout (a )?snacks?\b|\bskip (the )?snacks?\b|\bdon'?t snack\b/.test(seg)) { out.snacks = 0; out.understood.push('No snacks'); H(); }
    else if ((m = seg.match(/\b(\d|one|two|three|a|an)\s+snacks?\b|\bsnacks?\b/))) { const k = m[1] ? Math.min(2, n(m[1])) : 1; out.snacks = k; out.understood.push(`${k} snack${k > 1 ? 's' : ''} a day${m[1] && n(m[1]) > 2 ? ' (2 at most)' : ''}`); H(); }
    if (/\b(skip|no|don'?t eat|never eat)\s+breakfast\b|intermittent fasting|\b16[:/ ]8\b/.test(seg)) { out.noBreakfast = true; out.understood.push('No breakfast'); H(); }
    // diet styles
    if (/\bvegan\b|\bplant[- ]based\b/.test(seg)) { ['meat', 'fish', 'dairy', 'eggs'].forEach(k => addFam(k, false)); addEx('honey and whey', f => /\b(honey|whey)\b/.test(foodText(f)), false); out.understood.push('Vegan: no meat, fish, dairy, eggs or honey'); H(); }
    else if (/\bvegetarian\b|\bveggie\b|\bmeatless\b|\bno meat\b/.test(seg)) { ['meat', 'fish'].forEach(k => addFam(k, false)); out.understood.push('Vegetarian: no meat or fish'); H(); }
    if (/\bpesc[ae]tarian\b/.test(seg)) { addFam('meat', false); out.understood.push('Pescatarian: fish, no other meat'); H(); }
    if (/\bketo(genic)?\b/.test(seg)) { out.flags.keto = true; out.understood.push('Keto: about 30 g of carbs a day'); H(); }
    else if (/\blow[- ]carbs?\b|\bno carbs\b|\bfewer carbs\b|\bless carbs\b|\bcut(ting)? carbs\b/.test(seg)) { out.flags.lowCarb = true; out.understood.push('Low carb: about 100 g a day'); H(); }
    if (/\bpaleo\b/.test(seg)) { ['grains', 'legumes', 'dairy', 'processed', 'sweets'].forEach(k => addFam(k, false)); out.understood.push('Paleo: no grains, beans, dairy, sweets or processed food'); H(); }
    if (/\bhalal\b/.test(seg)) { addFam('pork', false); addFam('alcohol', false); out.understood.push('Halal: no pork or alcohol (check labels for certification)'); H(); }
    if (/\bkosher\b/.test(seg)) { addFam('pork', false); addFam('shellfish', false); out.understood.push('Kosher: no pork or shellfish (check labels for certification)'); H(); }
    if (/\bmediterranean\b/.test(seg)) { out.prefer.push({label:'fish, beans, vegetables and olive oil', test: f => /\b(salmon|tuna|fish|shrimp|beans?|lentils?|chickpeas?|hummus|olive|spinach|tomato|peppers?|broccoli|zucchini|quinoa|almonds|walnuts|mixed nuts)\b/.test(foodText(f))}); out.understood.push('Mediterranean: favors fish, beans, vegetables and olive oil'); H(); }
    // nutrition styles
    if (/\bhigh[- ]protein\b|\bmore protein\b|\blots of protein\b|\bprotein[- ]heavy\b/.test(seg)) { out.flags.highProtein = true; out.understood.push('High protein: top of your protein range'); H(); }
    if (/\blow[- ]fat\b|\bless fat\b/.test(seg)) { out.flags.lowFat = true; out.understood.push('Low fat: 20% of calories'); H(); }
    if (/\blow[- ](sodium|salt)\b|\b(less|no|little|watch(ing)?|limit|reduce|cut) (the )?(sodium|salt)\b|\bsodium low\b|\bheart[- ]healthy\b|\bblood pressure\b/.test(seg)) { out.flags.lowSodium = true; H(); }
    if (/\bhigh[- ]fiber\b|\bmore fiber\b|\blots of fiber\b|\bfiber\b/.test(seg) && !/low[- ]fiber/.test(seg)) { out.flags.highFiber = true; out.understood.push('Favor high-fiber meals'); H(); }
    if (/\blow[- ]sugar\b|\bno (added )?sugar\b|\bless sugar\b|\bsugar[- ]free\b|\bcut(ting)? sugar\b|\bdiabet/.test(seg)) { out.flags.lowSugar = true; addFam('sweets', false); out.understood.push('Low sugar: no sweets or sugary drinks'); H(); }
    if (/\bbulk(ing)?\b|\bgain (weight|muscle|mass)\b/.test(seg)) { out.calMult = 1.1; out.understood.push('Bulking: 10% more calories'); H(); }
    else if (/\bcut(ting)?\b(?! (carbs|sugar|salt|sodium))|\blose (weight|fat)\b|\bweight loss\b|\bdeficit\b/.test(seg)) { out.calMult = 0.85; out.understood.push('Cutting: 15% fewer calories'); H(); }
    // typed numbers
    const num = (re) => { const x = seg.match(re); return x ? Number(x[1] || x[2]) : null; };
    let v;
    if ((v = num(/(\d{3,4})\s*(?:k?cals?|calories|kcal)\b|(?:calories|kcal|cals)\D{0,14}(\d{3,4})\b/)) && v >= 800 && v <= 6000) { out.macros.calories = v; out.understood.push(`${v.toLocaleString()} calories a day`); H(); }
    if ((v = num(/(\d{2,3})\s*(?:g|grams?)?\s*(?:of\s+)?protein\b|protein\D{0,14}(\d{2,3})\s*(?:g|grams?)?\b/)) && v >= 20 && v <= 400) { out.macros.protein_g = v; out.understood.push(`${v} g protein`); H(); }
    if ((v = num(/(\d{1,3})\s*(?:g|grams?)?\s*(?:of\s+)?(?:carbs?|carbohydrates?)\b|(?:carbs?|carbohydrates?)\D{0,14}(\d{1,3})\s*(?:g|grams?)?\b/)) && v >= 10 && v <= 900) { out.macros.carbs_g = v; out.understood.push(`${v} g carbs`); H(); }
    if ((v = num(/(\d{1,3})\s*(?:g|grams?)?\s*(?:of\s+)?fats?\b|\bfats?\D{0,14}(\d{1,3})\s*(?:g|grams?)?\b/)) && v >= 10 && v <= 400 && !/low[- ]fat/.test(seg)) { out.macros.fat_g = v; out.understood.push(`${v} g fat`); H(); }
    if ((v = num(/(\d{3,4})\s*mg\s*(?:of\s+)?(?:sodium|salt)|(?:sodium|salt)\D{0,16}(\d{3,4})\s*(?:mg)?/)) && v >= 300 && v <= 6000) { out.flags.lowSodium = true; out.flags.sodiumMax = v; H(); }
    for (const [re, k] of [[/(\d{1,2})\s*%\s*(?:of calories\s*)?(?:from\s+)?carbs?/, 'carbs'], [/(\d{1,2})\s*%\s*(?:of calories\s*)?(?:from\s+)?protein/, 'protein'], [/(\d{1,2})\s*%\s*(?:of calories\s*)?(?:from\s+)?fats?/, 'fat']]) {
      const x = seg.match(re); if (x) { out.pct[k] = Number(x[1]); out.understood.push(`${x[1]}% of calories from ${k}`); H(); }
    }
    // "X-free", "X allergy"
    for (const x of seg.matchAll(/\b([a-z]+(?: [a-z]+)?)[- ]free\b/g)) { const k = familyFor(x[1]); if (k && !(k === 'sweets' && out.flags.lowSugar)) { addFam(k, `No ${FAMILIES[k].label}`); H(); } }
    for (const x of seg.matchAll(/\b([a-z]+(?: [a-z]+)?) (?:allergy|allergies|intolerance|intolerant|sensitivity)\b/g)) { const k = familyFor(x[1].replace(/^(a|an|my)\s+/, '')); if (k) { addFam(k, `No ${FAMILIES[k].label} (allergy)`); H(); } }
    if (/\blactose\b/.test(seg)) { addFam('dairy', 'No dairy (lactose)'); H(); }
    if (/\bceliac\b/.test(seg)) { addFam('gluten', 'No gluten (celiac)'); H(); }
    // "no X", "without X", "allergic to X", "hate X"
    const exRe = /\b(?:no|not|without|avoid(?:ing)?|exclude|excluding|hate|hates|dislike|don'?t like|do not like|don'?t eat|do not eat|can'?t eat|cannot eat|can'?t have|cannot have|allergic to|allergy to|intolerant (?:to|of)|stay away from|nothing with|skip|leave out)\s+([a-z' &,/-]+?)(?=$|\b(?:but|because|since|though|unless|except)\b)/g;
    for (const x of seg.matchAll(exRe)){
      for (const item of splitList(x[1])){
        if (!item || /^(breakfast|snacks?|meat|carbs?|sugar|added sugars?|salt|sodium|cooking|more than.*|\d.*)$/.test(item)) { if (/^(carbs?|meat|sugar|salt|sodium)$/.test(item)) H(); continue; }
        const k = familyFor(item);
        if (k) { addFam(k, `No ${FAMILIES[k].label}`); H(); continue; }
        const test = wordMatcher(item);
        if (test) { addEx(item, test, `No ${item}`); H(); }
      }
    }
    // "more X", "prefer X"
    const preRe = /\b(?:more|lots of|plenty of|prefer|include|including|love|i like|use up|focus on|extra|favor|favour|emphasize|add)\s+([a-z' &,/-]+?)(?=$|\b(?:but|because|since|though|unless)\b)/g;
    for (const x of seg.matchAll(preRe)){
      for (const item of splitList(x[1])){
        if (!item || /^(protein|fiber|meals?|snacks?|calories|variety|food|vegetables? and fruits?)$/.test(item)) { if (/^(protein|fiber)$/.test(item)) H(); continue; }
        const fam = familyFor(item), famOK = ['fish', 'poultry', 'beef', 'pork', 'redmeat', 'meat', 'dairy', 'eggs', 'shellfish'].includes(fam);
        const test = famOK ? (f => inFamily(f, fam)) : /^(veg(gie|etable)s?|greens)$/.test(item) ? (f => f.role === 'veg') : /^fruits?$/.test(item) ? (f => f.role === 'fruit') : wordMatcher(item);
        if (test && !out.prefer.some(p => p.label === item)) { out.prefer.push({label:item, test}); out.understood.push(`More ${item}`); H(); }
      }
    }
    if (!hit) out.unknown.push(seg);
  }
  if (out.flags.lowSodium) out.understood.push(`Low sodium: under ${(out.flags.sodiumMax || 1500).toLocaleString()} mg a day`);
  out.understood = [...new Set(out.understood)];
  return out;
}

// Daily targets after the typed preferences. base: {calories, protein_g, carbs_g, fat_g}; weightLb optional.
export function applyDiet(base, d, weightLb = 0){
  let cal = d.macros.calories || Math.round(base.calories * d.calMult / 10) * 10;
  let p = base.protein_g, c = base.carbs_g, f = base.fat_g;
  const fatShare = base.calories > 0 ? (base.fat_g * 9) / base.calories : 0.28;
  f = cal * (d.flags.lowFat ? 0.2 : fatShare) / 9;
  if (d.flags.highProtein) p = weightLb ? weightLb * 1.1 : p * 1.15;
  if (d.pct.protein) p = cal * d.pct.protein / 100 / 4;
  if (d.pct.fat) f = cal * d.pct.fat / 100 / 9;
  if (d.macros.protein_g) p = d.macros.protein_g;
  if (d.macros.fat_g) f = d.macros.fat_g;
  let carbsFixed = false;
  if (d.flags.keto) { c = 30; carbsFixed = true; }
  else if (d.flags.lowCarb) { c = 100; carbsFixed = true; }
  if (d.pct.carbs) { c = cal * d.pct.carbs / 100 / 4; carbsFixed = true; }
  if (d.macros.carbs_g) { c = d.macros.carbs_g; carbsFixed = true; }
  if (carbsFixed && !d.macros.fat_g && !d.pct.fat) f = Math.max(20, (cal - p * 4 - c * 4) / 9);   // fat fills the rest
  else if (!carbsFixed) c = Math.max(0, (cal - p * 4 - f * 9) / 4);                                     // carbs fill the rest
  if (d.macros.calories == null && carbsFixed && (d.macros.fat_g || d.pct.fat)) cal = p * 4 + c * 4 + f * 9;
  return {calories: Math.round(cal), protein_g: Math.round(p), carbs_g: Math.round(c), fat_g: Math.round(f)};
}
export { cap as capFirst };
