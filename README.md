# Macro Lens

A free calorie and nutrition tracker that runs entirely on your phone. No account, no API key, no subscription.

- **Photo:** an on-device food recognizer (OpenAI CLIP via Transformers.js) suggests what's on your plate. You confirm it and set the portion.
- **Barcode:** scan packaged food for nutrition from Open Food Facts.
- **Type:** write meals like `2 eggs, 2 slices toast, 1 tbsp butter` or search 8,400 USDA foods.
- Tracks calories, protein, carbs, fat, fiber, sugar, saturated fat, cholesterol, sodium, potassium, calcium, iron, magnesium, zinc and vitamins A, C, D, B12 and folate.
- Body stats: BMI, daily calorie and macro targets (Mifflin-St Jeor), and body fat from the U.S. Navy tape formula.
- Your log is stored only on your device. Use Export backup in the Body tab to keep a copy.

## Install on Android

Open the site in Chrome, tap the ⋮ menu, then **Add to home screen → Install**. It opens full screen like any app and works offline (barcode lookups need a connection).

## Data and credits

- Nutrition: USDA National Nutrient Database for Standard Reference, Release 28 (public domain).
- Barcodes: [Open Food Facts](https://world.openfoodfacts.org), Open Database License.
- Recognizer: [Xenova/clip-vit-base-patch32](https://huggingface.co/Xenova/clip-vit-base-patch32), downloaded once from Hugging Face on first use.
- Runtime: [Transformers.js](https://github.com/huggingface/transformers.js) 3.8.1 (Apache-2.0), bundled in `vendor/`.

Estimates are for tracking, not medical advice.
