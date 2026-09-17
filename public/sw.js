/*
 * App-shell service worker.
 *
 * SCOPE, deliberately narrow: this caches the static shell — the document, the
 * hashed build assets, the icons — and NOTHING else. Every live feed in this
 * app (aircraft, vessels, satellites, fires, quakes, CCTV frames, radio) is
 * served under /api/, and a cached reading of a moving aircraft is worse than
 * no reading at all: it is indistinguishable from a current one. So /api/ is
 * refused before any other rule can match it, and only GET requests to this
 * origin are ever stored.
 *
 * Staleness is handled by shape rather than by a version bump:
 *   - navigations are network-first, so an online phone always gets the current
 *     document and the cache is only a fallback when the network is gone;
 *   - /assets/ filenames carry a content hash, so cache-first is safe for them
 *     forever — a rebuild produces new names rather than new contents.
 */

const CACHE = 'gev-shell-v1';

/** The minimum that has to be present for the app to start offline. */
const SHELL = ['/', '/index.html', '/manifest.json', '/logo.svg'];

/** Static file types that belong to the shell. */
const STATIC = /\.(?:js|mjs|css|woff2?|png|svg|jpg|jpeg|webp|ico)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // addAll is atomic: one 404 would reject the whole install and leave the
      // app with no worker at all, so each entry is allowed to fail on its own.
      .then((cache) =>
        Promise.allSettled(SHELL.map((url) => cache.add(url))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Whether a request may be served or stored by this worker at all. */
function isCacheable(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  // Live data. Never cached, never served from cache.
  if (url.pathname.startsWith('/api/')) return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!isCacheable(request)) return;

  // The document: network first, cache only as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() =>
          caches
            .match('/index.html')
            .then((cached) => cached || Response.error()),
        ),
    );
    return;
  }

  const url = new URL(request.url);
  const hashedAsset = url.pathname.startsWith('/assets/');
  if (!hashedAsset && !STATIC.test(url.pathname)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // An opaque or failed response tells us nothing about validity.
        if (!response.ok || response.type === 'opaque') return response;
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      });
    }),
  );
});
