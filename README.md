# Munchmark

Calories without the markup. (Formerly called Macro Lens; renamed because other calorie apps already use that name.)

A calorie and nutrition tracker that runs on your phone. No account and no ads. Free users get the on-device recognizer; Munchmark Plus ($1.99 a month or $12 a year) adds Google Gemini.

- **Photo:** packaged foods are identified from the label: the app finds barcodes in the photo, reads the printed words on the phone (Tesseract OCR), groups them by package, checks each package's shape, and matches brand + product name against the Open Food Facts grocery database. Meals without a label use an on-device food recognizer (OpenAI CLIP via Transformers.js).
- **Two ways to recognize food:** free users pick, once, between the free on-device recognizer and Google Gemini with **Munchmark Plus**. With Plus (a Lemon Squeezy license key pasted in Body → Settings), photos, menu photos, restaurant names and typed foods the app can't find go to Gemini, which reads brands, flavors, restaurant items and portions (your photo details ride along). Packaged items are cross-checked against Open Food Facts / USDA label data, which wins by default. Offline, or on the free plan, everything works on-device. Settings → Advanced also takes a person's own Gemini key instead of Plus. Keys stay on the phone and are left out of backups.
- **Photo + details:** add a description on top of any photo ("6 oz", "with ranch", "salty peanut", "large fries from McDonald's"). Amounts change the portion, flavors and brand words steer the label search, extra foods are added, and it also works with no photo.
- **Brands:** the label reader tries sideways and light-on-dark text, and when it can read the brand but not the flavor it asks you to pick instead of guessing.
- **Restaurants:** McDonald's, Burger King, Wendy's, Taco Bell, KFC, Popeyes, Subway, Chick-fil-A, the big pizza chains and several sit-down chains are recognized from printed words on the packaging (or the image model, if downloaded) and their USDA-analyzed menu items are offered, ranked for the photo. Other chains get typical dishes for that kind of restaurant.
- **Eat out (Meals tab):** type a restaurant or snap its menu board (chains print calories) and get picks sized to what's left of your calories and protein today: best fits, most protein for the calories, and lighter options.
- **Online search:** Type mode searches Open Food Facts and USDA FoodData Central branded labels (free; add your own api.data.gov key in Body → Settings for more than ~30 searches an hour), plus a link to search the web.
- **Nutrition label scan:** read the Nutrition Facts on a package, or a screenshot of a website's nutrition info, check the numbers and save it to My foods.
- **Pantry tag:** write "(pantry)" after a food anywhere you type (Type, photo details, recipe lists) to use the exact item from your pantry, e.g. `Chobani yogurt 200 g (pantry)`.
- **Barcode:** scan packaged food for nutrition from Open Food Facts.
- **Type:** write meals like `2 eggs, 2 slices toast, 1 tbsp butter` or search 8,400 USDA foods.
- Tracks calories, protein, carbs, fat, fiber, sugar, saturated fat, cholesterol, sodium, potassium, calcium, iron, magnesium, zinc and vitamins A, C, D, B12 and folate.
- Pantry: snap your cabinet, fridge or groceries (each labeled product is read and matched to the exact brand item; fresh food is spotted by the image model) or add by name/barcode, and get meal ideas or a full-day plan sized to your calorie and macro goals. Describe your diet in your own words (meals and snacks a day, vegetarian/vegan/keto/low carb/halal, allergies, foods to skip or use up, sodium or sugar limits, exact numbers) and the planner follows it.
- Weekly recap: each day, averages, top foods and sport-aware tips, as story-style recaps or a plain report (switch in Settings).
- Body stats: BMI, daily calorie target (Mifflin-St Jeor) with protein at 1 g per pound of body weight (±10% counts as on target), fat at 28% of calories and carbs filling the rest, and body fat blended from a photo check, the U.S. Navy tape formula and BMI.
- **Meals you cook:** snap the ingredient list from a recipe card, cookbook or screen (or type it), weigh the finished pot once, then weigh each bowl (photo of the scale display or type it). The app works out your share of the batch, assuming it's evenly mixed. Packaged ingredients can be added from a photo of the package.
- **Containers:** save your water bottles (capacity, optional empty weight, a few photos) and Tupperware/bowls (empty weight). Snap a bottle and the app recognizes which one and logs its water; a saved container in a scale photo is subtracted automatically.
- **Water and water weight:** water goal from body weight plus practice sweat, quick-add buttons and one-tap bottles. A rough "water weight" (bloat) estimate for the morning from yesterday's sodium, carbs, food still in the gut, bathroom trips, pee color, sweat, sleep, alcohol, creatine and cycle, compared with your normal week. After 10+ morning weigh-ins it learns how strongly your own scale reacts to each factor.
- **Sports:** weigh-ins (morning, before and after practice, bed, official weigh-in) with sweat loss and how much to drink back, practice minutes and effort, weight-class pace capped at 1.5% of body weight a week (never water cutting), Bluetooth heart-rate recording with time in zones, and step/workout/sleep import from a Samsung Health data export.
- **Check-ins:** a 20-second quiz you can take several times a day (energy, hunger, mood, soreness, pee color and count, poops, sleep, practice rating, your own questions). Weeks are compared side by side with a feel score, you can pin weeks you felt great, and it lists what to change to get back to a pinned week.
- Your log is stored only on your device. Use Export backup in the Body tab to keep a copy.

## Munchmark Plus server

Plus members' Gemini requests go through the small server in `worker/gemini-proxy.js` (a free Cloudflare Worker). It checks each phone's license key with Lemon Squeezy, keeps the Gemini key secret and passes the request to Google. Free users never touch it.

1. Make a Gemini key at aistudio.google.com/apikey. Before the first sale, turn billing on for its Google project (Plus promises the paid tier, where Google doesn't use requests to improve its products) and set a budget alert in Google Cloud. Flash-Lite costs about $0.002 a photo.
2. Sign up free at dash.cloudflare.com. Open **Workers & Pages → Create**, start from the **Hello World** worker, name it (for example `macro-lens-gemini`) and **Deploy**.
3. Open the worker, choose **Edit code**, replace everything with the contents of `worker/gemini-proxy.js`, and **Deploy**.
4. In the worker's **Settings → Variables and Secrets**, add:
   - `GEMINI_KEY` (Secret): the Gemini key.
   - `LS_STORE_ID` (Text): your Lemon Squeezy store ID, so only licenses from your store work.
   - `LS_PRODUCT_IDS` (Text, optional): the Plus product IDs, comma-separated, if the store sells anything else.
   - `ADMIN_KEY` (Secret): a long password of your own (12+ characters) for the free-codes page.
   - `FREE_TIER` (Text): `no` once billing is on. While it's unset, the server refuses the EU, EEA, UK and Switzerland, as Google requires for free-tier keys.
   - `DAILY_LIMIT` (Text, optional): Gemini answers per license per day, default 15.
   Then **Deploy**.
   For free codes, also open **Storage & Databases → KV → Create**, name it `munchmark-codes`, then in the worker's **Settings → Bindings → Add → KV namespace** use the variable name `CODES` and pick that namespace. **Deploy** again.
5. In Lemon Squeezy, make the Plus product (monthly, yearly and the founding lifetime variant) and turn on **License keys** for it. Buyers get the key in their receipt email.
6. On GitHub, edit `js/config.js`: `GEMINI_PROXY` is the worker's address, `PLUS_CHECKOUT_URL` is the Lemon Squeezy checkout link (empty shows "coming soon"), `PLUS_PRICE` is the price line and `PLUS_DAILY_LIMIT` matches `DAILY_LIMIT`. Commit.
7. Open the app twice so it picks up the change. In Body → Settings choose **Google Gemini**, paste a free code or a test license key and tap **Activate**.

### Free codes for people you choose

Open `https://<your worker address>/admin` (for example `https://api.munchmarkai.app/admin`) and sign in with `ADMIN_KEY`. Type who a code is for and tap **Make code**; **Copy message** copies a ready-to-send text with the code and where to paste it. Each code is permanent and has no daily limit: it works until you flip its switch off (or delete it), and flipping it back on restores it. Changes reach every phone within a minute or two. The page shows when each code was last used. Ten wrong passwords from one connection lock the page for an hour.

How it's protected: the server only answers your app's site (`ALLOWED_ORIGINS`, default `https://munchmarkai.app` and `https://www.munchmarkai.app`), only with a working license or free code, only allows the cheap Flash-Lite models, limits each internet connection to `HOURLY_LIMIT` requests an hour (default 40) and each paid license to `DAILY_LIMIT` answers a day (free codes have no daily limit). A license check is remembered for 6 hours. A canceled subscription's key stops working when the paid period ends. Google's Gemini API terms require users to be 18 or older, so activating Plus confirms that.

Update order: upload the new app first, then the new worker code, so phones on the old app version aren't cut off mid-update.

## Install on Android

Open the site in Chrome, tap the ⋮ menu, then **Add to home screen → Install**. It opens full screen like any app and works offline (barcode lookups need a connection).

## Data and credits

- Nutrition: USDA National Nutrient Database for Standard Reference, Release 28 (public domain).
- Barcodes: [Open Food Facts](https://world.openfoodfacts.org), Open Database License.
- Recognizer: [Xenova/clip-vit-base-patch32](https://huggingface.co/Xenova/clip-vit-base-patch32), downloaded once from Hugging Face on first use.
- Runtime: [Transformers.js](https://github.com/huggingface/transformers.js) 3.8.1 (Apache-2.0), bundled in `vendor/`.
- Label reading: [Tesseract.js](https://github.com/naptha/tesseract.js) 7.0.0 with the English LSTM model (Apache-2.0), bundled in `vendor/tesseract/`.
- Branded labels and typical dishes online: [USDA FoodData Central](https://fdc.nal.usda.gov) (CC0, public domain).
- Restaurant items: USDA's analyses of chain restaurant food in SR28 (2010s); chains change recipes, so treat them as close estimates.
- Scale displays: the seven-segment model `ssd_int` from [tessdata_ssd](https://github.com/Shreeshrii/tessdata_ssd) (Apache-2.0), bundled in `vendor/tesseract/`.
- Plus recognition: [Google Gemini API](https://ai.google.dev) ([terms](https://ai.google.dev/gemini-api/terms)). Search suggestions from Google are shown with grounded answers.
- Privacy policy, terms and full license texts: `privacy.html`, `terms.html`, `notices.html` (from `THIRD_PARTY_NOTICES.md`). Support: munchmarksupport@gmail.com.
- Product search: Open Food Facts [Search-a-licious](https://search.openfoodfacts.org) API, falling back to the classic search API and then to USDA FoodData Central branded labels when Open Food Facts search is unavailable; requests are rate-limited and cached on the phone.

Estimates are for tracking, not medical advice. Web apps can't read Samsung Health, Health Connect or Apple Health directly; that needs an app-store version.
