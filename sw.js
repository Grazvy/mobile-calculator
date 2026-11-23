// Offline support: precache the whole app, then serve it cache-first.
// Bump VERSION whenever any file changes so phones pick up the new build.
// assets/mlg/ clips and pictures are left out on purpose: they are optional, and one missing file
// would fail the whole install. The fetch handler caches them on first play instead.
const VERSION = 'fx85-v18';

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/calculator.js',
  'js/display.js',
  'js/easter.js',
  'js/font.js',
  'js/keys.js',
  'js/layout.js',
  'js/engine/evaluate.js',
  'js/engine/format.js',
  'js/engine/fraction.js',
  'js/engine/lexer.js',
  'js/engine/parser.js',
  'js/engine/stats.js',
  'js/engine/tokens.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()));
    }),
  );
});
