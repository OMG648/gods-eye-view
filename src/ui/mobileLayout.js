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
 * `mobileLayout.test.mjs` pins the two spellings together instead.
 */
export const MOBILE_BREAKPOINT_PX = 720;

/** The media query every narrow-viewport branch shares. */
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;

/** Whether the viewport is currently composing with the narrow-screen layout. */
export function prefersMobileLayout(windowRef = globalThis.window) {
  return windowRef?.matchMedia?.(MOBILE_MEDIA_QUERY)?.matches === true;
}

/** Coarse pointer with no hover — a touch screen rather than a narrow window. */
export function prefersTouchInteraction(windowRef = globalThis.window) {
  return (
    windowRef?.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches ===
    true
  );
}
