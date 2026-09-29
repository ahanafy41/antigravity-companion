// Service Worker for Termux Accessible Web (Offline-first & Standalone PWA Support)
const CACHE_NAME = 'termux-accessible-v3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Pass dynamic API and websocket requests through directly without caching
  if (event.request.url.includes('/api/') || event.request.url.includes('/ws') || event.request.url.includes('/termux')) {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
