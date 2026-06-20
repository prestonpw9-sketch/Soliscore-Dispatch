// Minimal service worker — enables "Add to Home Screen" / installable PWA.
// Network-first pass-through so users always get the latest deployed app
// (no stale caching of the SPA bundle).

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Let the browser handle everything normally (network).
  // Having a fetch handler is required for installability.
  return;
});
