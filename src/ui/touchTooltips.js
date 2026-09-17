import { prefersTouchInteraction } from './mobileLayout.js';

/**
 * Long-press cards standing in for `title` tooltips on touch screens.
 *
 * The console explains itself through ~120 `title` attributes, and a touch
 * screen never fires the hover that reveals them: on a phone that help simply
 * does not exist. This surfaces the same text on a long press — the idiom
 * phones already use for "what is this" — while leaving an ordinary tap to do
 * what it always did.
 *
 * `title` is deliberately left on the element rather than moved to a data
 * attribute: it is what assistive technology and any later pointer read, and
 * this module is the only thing that needs to know it is also a tap card.
 */
const PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 10;

export function createTouchTooltips({
  document = globalThis.document,
  windowRef = globalThis.window,
  pressMs = PRESS_MS,
} = {}) {
  // A device with a fine pointer already has hover; this would only get in
  // its way. Keyed on the POINTER, not the viewport, so a narrow desktop
  // window keeps its native tooltips.
  if (!prefersTouchInteraction(windowRef)) return null;

  let card = null;
  let timer = null;
  let origin = null;
  let suppressNextClick = false;

  const removers = [];
  const listen = (target, type, callback, options) => {
    target.addEventListener(type, callback, options);
    removers.push(() => target.removeEventListener(type, callback, options));
  };

  function ensureCard() {
    if (card) return card;
    card = document.createElement('div');
    card.id = 'touch-tip';
    card.setAttribute('role', 'tooltip');
    card.hidden = true;
    document.body.appendChild(card);
    return card;
  }

  function hide() {
    if (card) card.hidden = true;
  }

  function show(text, x, y) {
    const element = ensureCard();
    element.textContent = text;
    element.hidden = false;
    // Measure after the text lands so the clamp uses the real box.
    const rect = element.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(
      Math.max(margin, x - rect.width / 2),
      Math.max(margin, windowRef.innerWidth - rect.width - margin),
    );
    // Prefer above the finger, which is what the finger is not covering.
    const above = y - rect.height - 16;
    const top = above > margin ? above : y + 24;
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
  }

  function cancel() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    origin = null;
  }

  listen(
    document,
    'pointerdown',
    (event) => {
      hide();
      if (event.pointerType === 'mouse' || !event.isPrimary) return;
      const target = event.target?.closest?.('[title]');
      const text = target?.getAttribute('title')?.trim();
      if (!text) return;
      origin = { x: event.clientX, y: event.clientY };
      timer = setTimeout(() => {
        timer = null;
        show(text, origin.x, origin.y);
        // The press has become a reveal, so the tap it would otherwise have
        // been must not also fire.
        suppressNextClick = true;
      }, pressMs);
    },
    { passive: true },
  );

  listen(
    document,
    'pointermove',
    (event) => {
      if (timer === null || !origin) return;
      const moved =
        Math.abs(event.clientX - origin.x) > MOVE_TOLERANCE_PX ||
        Math.abs(event.clientY - origin.y) > MOVE_TOLERANCE_PX;
      // A drag or a scroll is not a press.
      if (moved) cancel();
    },
    { passive: true },
  );

  for (const type of ['pointerup', 'pointercancel']) {
    listen(document, type, () => cancel(), { passive: true });
  }
  listen(windowRef, 'scroll', () => (cancel(), hide()), { passive: true });

  listen(
    document,
    'click',
    (event) => {
      if (!suppressNextClick) return;
      suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );

  // Android shows its own long-press menu over the card otherwise.
  listen(document, 'contextmenu', (event) => {
    if (card && !card.hidden) event.preventDefault();
  });

  return {
    hide,
    get visible() {
      return Boolean(card && !card.hidden);
    },
    destroy() {
      cancel();
      for (const remove of removers.splice(0)) remove();
      card?.remove();
      card = null;
    },
  };
}
