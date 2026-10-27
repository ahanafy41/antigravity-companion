'use strict';
const CACHE_NAME = 'antigravity-static-a32e877e8e410f7deaf3f6cd';
const STATIC_PATHS = new Set([
  '/',
  '/start',
  '/main-ui.css',
  '/main-ui.js',
  '/start-ui.css',
  '/start-ui.js',
  '/main-v1-adapter.js',
  '/api.js',
  '/native.js',
  '/history.js',
  '/manifest.json',
  '/icon.svg',
  '/vendor/marked.umd.js',
  '/vendor/purify.min.js'
]);

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll([...STATIC_PATHS])).catch(() => {})
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('antigravity-static-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!STATIC_PATHS.has(url.pathname)) return;

  // Network-First: Always attempt network fetch first for real-time updates on local server
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw new Error('Offline and not cached: ' + url.pathname);
      })
  );
});
