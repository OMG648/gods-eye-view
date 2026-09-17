import { MOBILE_MEDIA_QUERY } from '../mobileProfile.js';
import { collapsePanelOnEscape } from './panelDisclosure.js';

/**
 * Which live panels each tab owns, in the order they stack inside the pane.
 *
 * These are the SAME elements the desktop rails use. The sheet moves them and
 * moves them back; it never clones. Every binding in the shell resolves its
 * nodes through `document.getElementById`, so element identity is the contract
 * that keeps CCTV, radio, context and the layer toggles working unchanged.
 */
export const SHEET_TABS = Object.freeze([
  { id: 'layers', label: 'LAYERS', panels: ['data-panel'] },
  {
    id: 'contacts',
    label: 'CONTACTS',
    panels: ['global-context-panel', 'cctv-panel', 'radio-panel'],
  },
  { id: 'styles', label: 'STYLES', panels: ['control-panel', 'scene-panel'] },
  { id: 'settings', label: 'SETTINGS', panels: ['pp-toggles'] },
]);

/** Remember where a panel came from so it can be put back exactly there. */
function recordHome(panel) {
  if (panel.dataset.sheetHomeParent) return;
  const parent = panel.parentElement;
  if (!parent?.id) return;
  const next = panel.nextElementSibling;
  panel.dataset.sheetHomeParent = parent.id;
  if (next?.id) panel.dataset.sheetHomeBefore = next.id;
}

/** Put a panel back in the rail it was authored into. */
function restoreHome(panel, document) {
  const parent = document.getElementById(panel.dataset.sheetHomeParent || '');
  if (!parent) return;
  const before = panel.dataset.sheetHomeBefore
    ? document.getElementById(panel.dataset.sheetHomeBefore)
    : null;
  if (before && before.parentElement === parent)
    parent.insertBefore(panel, before);
  else parent.appendChild(panel);
  delete panel.dataset.sheetHomeParent;
  delete panel.dataset.sheetHomeBefore;
  panel.classList.remove('in-mobile-sheet');
  if (panel.dataset.sheetRestoreCollapsed === 'true')
    panel.classList.add('collapsed');
  delete panel.dataset.sheetRestoreCollapsed;
}

/**
 * Own the narrow-viewport bottom sheet.
 *
 * The sheet is a `.panel-collapsible` so it inherits the disclosure lifecycle
 * the rest of the console uses — `collapsed` means closed, Escape closes the
 * open sheet through `collapsePanelOnEscape`, and the close button carries the
 * usual `data-collapse-target` so focus returns the way it does everywhere.
 */
export function createMobileBottomSheet({
  document = globalThis.document,
  windowRef = globalThis.window,
  onChange = null,
} = {}) {
  const sheet = document.getElementById('mobile-sheet');
  if (!sheet) return null;
  const surface = document.getElementById('mobile-sheet-surface');
  const titleEl = document.getElementById('mobile-sheet-title');
  const panes = new Map(
    [...sheet.querySelectorAll('[data-sheet-pane]')].map((pane) => [
      pane.dataset.sheetPane,
      pane,
    ]),
  );
  const tabs = new Map(
    [...sheet.querySelectorAll('[data-sheet-tab]')].map((tab) => [
      tab.dataset.sheetTab,
      tab,
    ]),
  );
  const closeBtn = document.getElementById('mobile-sheet-close');
  const query = windowRef.matchMedia(MOBILE_MEDIA_QUERY);
  const removers = [];
  const listen = (target, type, callback, options) => {
    if (!target) return;
    target.addEventListener(type, callback, options);
    removers.push(() => target.removeEventListener(type, callback, options));
  };

  let active = null;
  let adopted = false;

  const isOpen = () => !sheet.classList.contains('collapsed');

  /** Move every mapped panel into its pane, expanded and stripped of rail geometry. */
  function adopt() {
    if (adopted) return;
    for (const tab of SHEET_TABS) {
      const pane = panes.get(tab.id);
      if (!pane) continue;
      for (const id of tab.panels) {
        const panel = document.getElementById(id);
        if (!panel) continue;
        recordHome(panel);
        panel.dataset.sheetRestoreCollapsed = String(
          panel.classList.contains('collapsed'),
        );
        panel.classList.add('in-mobile-sheet');
        // Rail geometry is desktop-only; the sheet scrolls instead.
        panel.classList.remove('collapsed', 'layout-auto-collapsed');
        for (const property of [
          '--left-panel-allocated-height',
          '--right-panel-allocated-height',
          'top',
          'left',
          'right',
          'bottom',
          'width',
          'height',
          'transform',
        ])
          panel.style.removeProperty(property);
        panel.removeAttribute('aria-hidden');
        pane.appendChild(panel);
      }
    }
    adopted = true;
    sheet.hidden = false;
    document.body.classList.add('mobile-sheet-active');
  }

  /** Hand every panel back to its rail and stand the sheet down. */
  function release() {
    if (!adopted) return;
    close({ silent: true });
    for (const tab of SHEET_TABS) {
      for (const id of tab.panels) {
        const panel = document.getElementById(id);
        if (panel?.dataset.sheetHomeParent) restoreHome(panel, document);
      }
    }
    adopted = false;
    sheet.hidden = true;
    document.body.classList.remove('mobile-sheet-active');
  }

  function select(id) {
    if (!panes.has(id)) return;
    active = id;
    for (const [key, pane] of panes) pane.hidden = key !== id;
    for (const [key, tab] of tabs)
      tab.setAttribute('aria-selected', String(key === id));
    const entry = SHEET_TABS.find((tab) => tab.id === id);
    if (titleEl && entry) titleEl.textContent = entry.label;
  }

  function open(id = active || SHEET_TABS[0].id) {
    select(id);
    sheet.classList.remove('collapsed');
    surface?.scrollTo?.({ top: 0 });
    onChange?.({ open: true, tab: active });
  }

  function close({ silent = false } = {}) {
    if (!isOpen()) return;
    sheet.classList.add('collapsed');
    for (const tab of tabs.values()) tab.setAttribute('aria-selected', 'false');
    if (!silent) onChange?.({ open: false, tab: active });
  }

  for (const [id, tab] of tabs) {
    listen(tab, 'click', () => {
      // The active tab is also the close affordance, the way a bottom nav works.
      if (isOpen() && active === id) close();
      else open(id);
    });
  }
  listen(closeBtn, 'click', () => close());
  listen(sheet, 'keydown', (event) =>
    collapsePanelOnEscape(event, {
      panel: sheet,
      onChange: (collapsed) => (collapsed ? close() : open()),
    }),
  );

  const sync = () => (query.matches ? adopt() : release());
  if (query.addEventListener) listen(query, 'change', sync);
  else query.addListener?.(sync);
  sync();
  select(active || SHEET_TABS[0].id);

  return {
    open,
    close,
    select,
    isOpen,
    get activeTab() {
      return active;
    },
    get isAdopted() {
      return adopted;
    },
    destroy() {
      for (const remove of removers.splice(0)) remove();
      query.removeListener?.(sync);
      release();
    },
  };
}
