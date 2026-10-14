// Offline support: the app shell, food data and recognizer runtime are cached on install.
// The recognizer's model files are cached separately by Transformers.js after the first download.
const VERSION = 'macrolens-v5';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/search.js', 'js/labels.js', 'js/parse.js', 'js/store.js', 'js/recognizer.js', 'js/planner.js', 'js/week.js', 'js/wrapped.js', 'js/off.js', 'js/packscan.js', 'js/brands.js', 'js/diet.js', 'js/water.js', 'js/sports.js', 'js/healthimport.js',
  'data/foods.json', 'fonts/archivo.woff2', 'fonts/figtree.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
  'vendor/tesseract/tesseract.esm.min.js', 'vendor/tesseract/worker.min.js', 'vendor/tesseract/eng.traineddata.gz', 'vendor/tesseract/ssd_int.traineddata.gz', 'vendor/tesseract/tesseract-core-relaxedsimd-lstm.wasm.js', 'vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
  'vendor/transformers.min.js', 'vendor/ort-wasm-simd-threaded.jsep.mjs', 'vendor/ort-wasm-simd-threaded.jsep.wasm',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('macrolens-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // model + barcode lookups go straight to the network
  e.respondWith(
    caches.match(e.request, {ignoreSearch: true}).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
        return res;
      }).catch(() => hit || caches.match('index.html'));
      return hit || net;
    })
  );
});
