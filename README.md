# Macro Lens

A free calorie and nutrition tracker that runs entirely on your phone. No account, no API key, no subscription.

- **Photo:** packaged foods are identified from the label: the app finds barcodes in the photo, reads the printed words on the phone (Tesseract OCR), groups them by package, checks each package's shape, and matches brand + product name against the Open Food Facts grocery database. Meals without a label use an on-device food recognizer (OpenAI CLIP via Transformers.js).
- **Barcode:** scan packaged food for nutrition from Open Food Facts.
- **Type:** write meals like `2 eggs, 2 slices toast, 1 tbsp butter` or search 8,400 USDA foods.
- Tracks calories, protein, carbs, fat, fiber, sugar, saturated fat, cholesterol, sodium, potassium, calcium, iron, magnesium, zinc and vitamins A, C, D, B12 and folate.
- Pantry: snap your cabinet, fridge or groceries (each labeled product is read and matched to the exact brand item; fresh food is spotted by the image model) or add by name/barcode, and get meal ideas or a full-day plan sized to your calorie and macro goals.
- Weekly recap: each day, averages, top foods and sport-aware tips, as Wrapped-style stories or a plain report (switch in Settings).
- Body stats: BMI, daily calorie and macro targets (Mifflin-St Jeor), and body fat blended from a photo check, the U.S. Navy tape formula and BMI.
- Your log is stored only on your device. Use Export backup in the Body tab to keep a copy.

## Install on Android

Open the site in Chrome, tap the ⋮ menu, then **Add to home screen → Install**. It opens full screen like any app and works offline (barcode lookups need a connection).

## Data and credits

- Nutrition: USDA National Nutrient Database for Standard Reference, Release 28 (public domain).
- Barcodes: [Open Food Facts](https://world.openfoodfacts.org), Open Database License.
- Recognizer: [Xenova/clip-vit-base-patch32](https://huggingface.co/Xenova/clip-vit-base-patch32), downloaded once from Hugging Face on first use.
- Runtime: [Transformers.js](https://github.com/huggingface/transformers.js) 3.8.1 (Apache-2.0), bundled in `vendor/`.
- Label reading: [Tesseract.js](https://github.com/naptha/tesseract.js) 7.0.0 with the English LSTM model (Apache-2.0), bundled in `vendor/tesseract/`.
- Product search: Open Food Facts [Search-a-licious](https://search.openfoodfacts.org) API, falling back to the classic search API; requests are rate-limited and cached on the phone.

Estimates are for tracking, not medical advice.
