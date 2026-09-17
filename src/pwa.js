/**
 * Service worker registration.
 *
 * Production only. In dev the worker would sit in front of Vite's module
 * graph and serve stale transforms against HMR, so the registration is skipped
 * and any worker left over from a production build on the same origin (the
 * usual localhost:4173 / localhost:5173 overlap) is torn down instead.
 */
export function registerServiceWorker({
  navigatorRef = globalThis.navigator,
  isProduction = true,
  scriptUrl = '/sw.js',
} = {}) {
  const container = navigatorRef?.serviceWorker;
  if (!container) return Promise.resolve(null);

  if (!isProduction) {
    return container
      .getRegistrations?.()
      .then((registrations) =>
        Promise.all(registrations.map((item) => item.unregister())),
      )
      .then(() => null)
      .catch(() => null);
  }

  return container
    .register(scriptUrl)
    .then((registration) => registration || null)
    .catch((error) => {
      // A failed registration costs offline support, never the session.
      console.warn('Service worker registration failed:', error);
      return null;
    });
}
