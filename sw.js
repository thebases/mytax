// sw.js
const CACHE_NAME = "tax-landing-v2";
const ROOT = "";

const CORE_ASSETS = [
  `${ROOT}/`,
  `${ROOT}/index.html`,
  `${ROOT}/manifest.webmanifest`,
  `${ROOT}/icons/icon-192x192.png`,
  `${ROOT}/icons/icon-512x512.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Add one-by-one so a single failure doesn't break install
      await Promise.all(
        CORE_ASSETS.map(async (url) => {
          try {
            await cache.add(url);
          } catch (e) {
            /* ignore missing */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k)))
      );
      await self.clients.claim();
    })()
  );
});

// Network-first for navigation; cache-first for others
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(`${ROOT}/index.html`, net.clone());
          return net;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match(`${ROOT}/index.html`)) || Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const net = await fetch(req);
        // cache successful same-origin responses
        const url = new URL(req.url);
        if (url.origin === location.origin) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, net.clone());
        }
        return net;
      } catch {
        return caches.match(req); // maybe we cached it earlier
      }
    })()
  );
});
