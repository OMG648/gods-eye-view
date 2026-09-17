import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerServiceWorker } from './pwa.js';

const read = (name) =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

const manifest = JSON.parse(read('../public/manifest.json'));
const worker = read('../public/sw.js');

// ── Manifest: the installability contract ───────────────────────────────────

test('the manifest carries everything an install prompt requires', () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.ok(manifest.name && manifest.short_name);
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
});

test('the manifest ships both icon sizes an installable PWA needs', () => {
  const sizes = new Set(manifest.icons.map((icon) => icon.sizes));
  assert.ok(sizes.has('192x192'), 'a 192px icon is required');
  assert.ok(sizes.has('512x512'), 'a 512px icon is required');
  assert.ok(
    manifest.icons.some((icon) => icon.purpose === 'maskable'),
    'Android crops a non-maskable icon into a plate',
  );
  for (const icon of manifest.icons) assert.equal(icon.type, 'image/png');
});

test('every icon the manifest names exists on disk', () => {
  for (const icon of manifest.icons) {
    const file = fileURLToPath(new URL(`../public${icon.src}`, import.meta.url));
    assert.ok(readFileSync(file).length > 0, `${icon.src} is missing or empty`);
  }
});

test('index.html links the manifest and a theme colour', () => {
  const html = read('../index.html');
  assert.match(html, /<link rel="manifest" href="\/manifest\.json"/);
  assert.match(html, /<meta name="theme-color" content="#060a0e"/);
  assert.match(html, /viewport-fit=cover/, 'the sheet uses safe-area insets');
});

// ── Service worker: the "never cache live data" guarantee ────────────────────

/** Run the worker's own source against a stub global to test its real rules. */
function loadWorker() {
  const listeners = new Map();
  const scope = {
    location: { origin: 'https://gev.test' },
    addEventListener: (type, fn) => listeners.set(type, fn),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  const caches = {
    open: () => Promise.resolve({ put: () => {}, add: () => Promise.resolve() }),
    keys: () => Promise.resolve([]),
    match: () => Promise.resolve(undefined),
    delete: () => Promise.resolve(true),
  };
  // Stubbed so the worker's own `fetch(request)` cannot reach the network —
  // the request objects here are plain stubs, not real Request instances.
  const fetchStub = () =>
    Promise.resolve({ ok: true, type: 'basic', clone: () => ({}) });
  const fn = new Function(
    'self',
    'caches',
    'Response',
    'URL',
    'fetch',
    worker,
  );
  fn(scope, caches, { error: () => ({}) }, URL, fetchStub);
  return listeners;
}

/** What the fetch handler decides for one request: 'handled' or 'passthrough'. */
function routeOf(url, { method = 'GET', mode = 'no-cors' } = {}) {
  const listeners = loadWorker();
  let handled = false;
  listeners.get('fetch')({
    request: { url, method, mode },
    respondWith: (promise) => {
      handled = true;
      // Settle it here; an unobserved rejection would surface as a stray
      // unhandledRejection attributed to whichever test ran next.
      Promise.resolve(promise).catch(() => {});
    },
  });
  return handled ? 'handled' : 'passthrough';
}

test('live API responses are never served or stored by the worker', () => {
  // Every feed in this app is under /api/. A cached position for a moving
  // aircraft is worse than none: it cannot be told apart from a current one.
  for (const path of [
    '/api/adsblol/mil',
    '/api/ais-live',
    '/api/celestrak/active',
    '/api/cctv/frame/12',
    '/api/firms/status',
    '/api/opensky?bbox=1,2,3,4',
  ]) {
    assert.equal(
      routeOf(`https://gev.test${path}`),
      'passthrough',
      `${path} must reach the network untouched`,
    );
  }
});

test('the shell and hashed build assets are handled', () => {
  assert.equal(routeOf('https://gev.test/assets/index-a1b2c3.js'), 'handled');
  assert.equal(routeOf('https://gev.test/assets/index-a1b2c3.css'), 'handled');
  assert.equal(routeOf('https://gev.test/icons/icon-192.png'), 'handled');
  assert.equal(
    routeOf('https://gev.test/', { mode: 'navigate' }),
    'handled',
    'the document needs an offline fallback',
  );
});

test('cross-origin and non-GET requests are left alone', () => {
  assert.equal(routeOf('https://tile.googleapis.com/v1/3dtiles'), 'passthrough');
  assert.equal(routeOf('https://fonts.gstatic.com/s/font.woff2'), 'passthrough');
  assert.equal(
    routeOf('https://gev.test/assets/index.js', { method: 'POST' }),
    'passthrough',
  );
});

// ── Registration ────────────────────────────────────────────────────────────

test('registration is skipped and cleaned up outside production', async () => {
  let registered = false;
  let unregistered = 0;
  const result = await registerServiceWorker({
    isProduction: false,
    navigatorRef: {
      serviceWorker: {
        register: () => {
          registered = true;
          return Promise.resolve({});
        },
        getRegistrations: () =>
          Promise.resolve([
            { unregister: () => ((unregistered += 1), Promise.resolve(true)) },
          ]),
      },
    },
  });
  assert.equal(registered, false, 'a dev worker would shadow Vite HMR');
  assert.equal(unregistered, 1, 'a leftover production worker is torn down');
  assert.equal(result, null);
});

test('a failed registration resolves null instead of breaking startup', async () => {
  const result = await registerServiceWorker({
    isProduction: true,
    navigatorRef: {
      serviceWorker: { register: () => Promise.reject(new Error('denied')) },
    },
  });
  assert.equal(result, null);
});

test('a browser without service workers is handled', async () => {
  assert.equal(await registerServiceWorker({ navigatorRef: {} }), null);
});
