// Offline support: the app shell, food data and recognizer runtime are cached on install.
// The recognizer's model files are cached separately by Transformers.js after the first download.
const VERSION = 'macrolens-v14';
const SHELL = [
  './', 'index.html', 'privacy.html', 'terms.html', 'notices.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/search.js', 'js/labels.js', 'js/parse.js', 'js/store.js', 'js/recognizer.js', 'js/planner.js', 'js/week.js', 'js/wrapped.js', 'js/off.js', 'js/packscan.js', 'js/brands.js', 'js/diet.js', 'js/water.js', 'js/sports.js', 'js/healthimport.js', 'js/restaurants.js', 'js/online.js', 'js/label.js', 'js/gemini.js', 'js/config.js',
  'data/foods.json', 'fonts/archivo.woff2', 'fonts/figtree.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/mark.svg', 'icons/favicon-32.png', 'icons/apple-touch-icon.png',
  'vendor/tesseract/tesseract.esm.min.js', 'vendor/tesseract/worker.min.js', 'vendor/tesseract/eng.traineddata.gz', 'vendor/tesseract/ssd_int.traineddata.gz', 'vendor/tesseract/tesseract-core-relaxedsimd-lstm.wasm.js', 'vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
  'vendor/transformers.min.js', 'vendor/ort-wasm-simd-threaded.jsep.mjs', 'vendor/ort-wasm-simd-threaded.jsep.wasm',
];
self.addEventListener('install', e => {
  // straight from the server, so a new version never mixes with old files from the browser's own cache
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, {cache: 'reload'})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('macrolens-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// App code (pages, scripts, styles, settings like js/config.js) comes fresh from the server when online, so an update
// shows up the next time the app opens; the saved copy is used offline or if the server is slow.
// Big files (food data, recognizer, label reader, fonts) come from the saved copy first.
const CODE = /(\/|\.html|\.js|\.mjs|\.css|\.webmanifest)$/;
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // model + barcode lookups go straight to the network
  const saved = () => caches.match(e.request, {ignoreSearch: true});
  const store = res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); } return res; };
  if (CODE.test(url.pathname) && !url.pathname.includes('/vendor/')) {
    e.respondWith(new Promise(resolve => {
      let done = false;
      const finish = r => { if (!done && r) { done = true; resolve(r); } };
      const slow = setTimeout(() => saved().then(finish), 3500);
      fetch(url.href, {cache: 'no-cache'}).then(store).then(r => { clearTimeout(slow); finish(r); })
        .catch(() => { clearTimeout(slow); saved().then(hit => finish(hit || caches.match('index.html'))); });
    }));
    return;
  }
  e.respondWith(saved().then(hit => hit || fetch(e.request).then(store).catch(() => caches.match('index.html'))));
});
