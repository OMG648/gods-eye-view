/**
 * One source of truth for the narrow-viewport switch.
 *
 * 720px is not a new scale: `responsive.css` already re-composes the rails at
 * this width, and both rail engines bail out of their desktop lane maths at
 * exactly this query. The bottom sheet adopts the panels the rails release, so
 * the two have to agree to the pixel — a sheet that opened at a wider query
 * would leave a band where the rails still allocate heights for panels that no
 * longer live in them.
 *
 * `leftPanelRail.js` and `rightPanelRail.js` keep the query written out as a
 * literal rather than importing this constant: `creditAttribution.test.mjs`
 * reads their source to prove a CSS height exemption is only safe because the
 * rail stands down at this exact width, and it cannot see through an import.
 * `mobileProfile.test.mjs` pins the two spellings together instead.
 */
export const MOBILE_BREAKPOINT_PX = 720;

/** The media query every narrow-viewport branch shares. */
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;

/** Whether the viewport is currently composing with the narrow-screen layout. */
export function prefersMobileLayout(windowRef = globalThis.window) {
  return windowRef?.matchMedia?.(MOBILE_MEDIA_QUERY)?.matches === true;
}

/**
 * Performance ceilings for a phone-class device.
 *
 * Keyed on the VIEWPORT, like the layout, because that is what the console's
 * own breakpoint means here. A tablet in landscape gets the desktop profile,
 * which is the right call: it has the screen and usually the GPU for it.
 */
export function mobilePerformanceProfile(windowRef = globalThis.window) {
  const mobile = prefersMobileLayout(windowRef);
  return Object.freeze({
    mobile,
    // 4x MSAA is the single most expensive default on a phone GPU.
    msaaSamples: mobile ? 1 : 4,
    // Never render above one device-independent pixel per CSS pixel. Cesium
    // already defaults here; pinning it stops a preset or share link raising
    // it on hardware that cannot afford it.
    resolutionScale: 1,
    // Fewer labels to place, lay out and occlusion-test each frame. The
    // desktop value is GLOBAL_POST_DEFAULTS.detectionDensity — the Dense
    // military preset — and mobile steps one stop down the same five-stop
    // scale the slider offers, halving the label budget.
    detectionDensityPct: mobile ? 50 : 75,
    // Every polled feed waits this much longer between refreshes. Radio silence
    // costs less on a phone than a flat battery and a saturated LTE link.
    refreshIntervalMultiplier: mobile ? 2 : 1,
    // The photorealistic 3D basemap is the heaviest thing the app can draw.
    preferLightweightBasemap: mobile,
    // 3D aircraft models are opt-in on a phone; the billboards still show.
    aircraftModels3d: !mobile,
  });
}

/**
 * The map stack an unqualified first load should open with.
 *
 * Kept as a pure function because it is the one mobile default that cannot be
 * observed reliably at runtime: if the Esri tiles fail to load, the controller
 * falls back to OSM, so what the globe ENDS UP showing does not tell you what
 * was asked for. This is the decision itself, and mobileProfile.test.mjs pins
 * it directly.
 *
 * @param {object} options
 * @param {boolean} options.hasPhotorealTileset Whether Google 3D tiles loaded.
 * @param {boolean} options.preferLightweightBasemap From the performance profile.
 * @returns {string} A map stack id from the catalog.
 */
export function initialMapStackFor({
  hasPhotorealTileset = false,
  preferLightweightBasemap = false,
} = {}) {
  if (preferLightweightBasemap) return 'esri-imagery';
  return hasPhotorealTileset ? 'photoreal' : 'esri-imagery';
}

/** Coarse pointer with no hover — a touch screen rather than a narrow window. */
export function prefersTouchInteraction(windowRef = globalThis.window) {
  return (
    windowRef?.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches ===
    true
  );
}
