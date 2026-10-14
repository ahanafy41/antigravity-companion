'use strict';
const CACHE_NAME = 'antigravity-static-d24405da3e0cbe52971df14b';
const STATIC_PATHS = new Set(['/', '/styles.css', '/api.js', '/history.js', '/state.js', '/native.js', '/ui.js', '/panels.js', '/app.js', '/manifest.json', '/icon.svg', '/vendor/alpine-csp.min.js', '/vendor/marked.umd.js', '/vendor/purify.min.js', '/vendor/tailwind.min.css']);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([...STATIC_PATHS])).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('antigravity-static-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search || !STATIC_PATHS.has(url.pathname)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request,response.clone());
    return response;
  }));
});
