# Third-party notices

Munchmark is built on the open-source software and open data below. Each keeps its own license; the full texts ship with the app in the files named here.

## Software bundled with the app

| Component | Use | License | License file |
| --- | --- | --- | --- |
| [Transformers.js](https://github.com/huggingface/transformers.js) 3.8.1 (Hugging Face) | Runs the on-device food recognizer | Apache License 2.0 | `vendor/LICENSE-transformers.txt` |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (Microsoft) | Model runtime used by Transformers.js | MIT | `vendor/LICENSE-onnxruntime.txt` |
| [Tesseract.js](https://github.com/naptha/tesseract.js) 7.0.0 and the English LSTM model | Reads labels, recipe cards and scale displays | Apache License 2.0 | `vendor/tesseract/LICENSE-tesseract.txt` |
| `ssd_int` seven-segment model from [tessdata_ssd](https://github.com/Shreeshrii/tessdata_ssd) | Reads digital scale displays | Apache License 2.0 | `vendor/tesseract/LICENSE-ssd.txt` |
| [Archivo](https://github.com/Omnibus-Type/Archivo) font | Headings | SIL Open Font License 1.1 | `fonts/LICENSE-archivo.txt` |
| [Figtree](https://github.com/erikdkennedy/figtree) font | Body text | SIL Open Font License 1.1 | `fonts/LICENSE-figtree.txt` |

## Downloaded on first use

| Component | Use | License |
| --- | --- | --- |
| [Xenova/clip-vit-base-patch32](https://huggingface.co/Xenova/clip-vit-base-patch32), a conversion of [OpenAI CLIP](https://github.com/openai/CLIP) | On-device food, package and container recognition | MIT |

## Data

| Source | Use | License and attribution |
| --- | --- | --- |
| USDA National Nutrient Database for Standard Reference, Release 28 | Built-in food table | Public domain (U.S. government work) |
| [USDA FoodData Central](https://fdc.nal.usda.gov) | Online branded labels and typical dishes | Public domain (CC0) |
| [Open Food Facts](https://world.openfoodfacts.org) | Barcode and product lookups | Database: [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/); contents: Database Contents License 1.0; product photos: CC BY-SA 3.0. Data © Open Food Facts contributors. Open Food Facts data is provided as is and must not be used for medical purposes. |

## Online services (optional)

| Service | Use | Terms |
| --- | --- | --- |
| Google Gemini API | AI photo, menu and typed-food recognition on Munchmark Plus (or with the person’s own key), only after they agree | [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms) |

## Names and trademarks

Restaurant, brand and product names (for example McDonald's, Barebells) appear only to identify foods and their nutrition. They are trademarks of their owners. Munchmark is not affiliated with, sponsored by or endorsed by any of them.
