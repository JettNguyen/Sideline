const CACHE = 'sideline-shell-v1';

// Precache the app entry point on install
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.add('index.html'))
      .then(() => self.skipWaiting())
  );
});

// Clean up old caches and take control immediately
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Skip cross-origin requests (AWS S3, Google Fonts, CDN, etc.)
  if (url.origin !== self.location.origin) return;

  // Skip API calls — always need fresh data
  if (url.pathname.includes('/api/')) return;

  // Navigation requests: network-first, fall back to cached index.html for offline
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('index.html'))
    );
    return;
  }

  // Static assets (JS/CSS/images): cache-first, cache on first fetch
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
        return res;
      });
    })
  );
});
