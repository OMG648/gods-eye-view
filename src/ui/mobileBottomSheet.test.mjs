import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMobileBottomSheet,
  SHEET_TABS,
} from './mobileBottomSheet.js';

/**
 * A DOM small enough to read and complete enough to exercise adoption.
 *
 * The contract under test is element IDENTITY: the sheet must move the very
 * nodes the rails use and hand the same nodes back, because every binding in
 * the shell resolved its element through `getElementById` at construction.
 */
function createElement(tag, id = '') {
  const element = {
    tagName: tag,
    id,
    hidden: false,
    dataset: {},
    children: [],
    parentElement: null,
    attributes: new Map(),
    style: {
      removeProperty(name) {
        this[name] = undefined;
      },
    },
    classList: {
      _set: new Set(),
      add(...names) {
        for (const name of names) this._set.add(name);
      },
      remove(...names) {
        for (const name of names) this._set.delete(name);
      },
      contains(name) {
        return this._set.has(name);
      },
    },
    listeners: new Map(),
    addEventListener(type, callback) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) {
      this.listeners.get(type)?.delete(callback);
    },
    click() {
      for (const callback of this.listeners.get('click') || []) callback({});
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    },
    removeAttribute(name) {
      this.attributes.delete(name);
    },
    appendChild(child) {
      child.parentElement?.removeChild?.(child);
      child.parentElement = element;
      element.children.push(child);
      return child;
    },
    insertBefore(child, before) {
      child.parentElement?.removeChild?.(child);
      child.parentElement = element;
      const index = element.children.indexOf(before);
      element.children.splice(index < 0 ? element.children.length : index, 0, child);
      return child;
    },
    removeChild(child) {
      const index = element.children.indexOf(child);
      if (index >= 0) element.children.splice(index, 1);
      child.parentElement = null;
      return child;
    },
    get nextElementSibling() {
      const siblings = element.parentElement?.children || [];
      return siblings[siblings.indexOf(element) + 1] || null;
    },
  };
  element.classList._set = new Set();
  return element;
}

function createHarness({ mobile = true } = {}) {
  const byId = new Map();
  const register = (element) => {
    if (element.id) byId.set(element.id, element);
    return element;
  };

  const sheet = register(createElement('div', 'mobile-sheet'));
  sheet.classList.add('collapsed');
  sheet.hidden = true;
  register(createElement('div', 'mobile-sheet-surface'));
  const title = register(createElement('span', 'mobile-sheet-title'));
  const close = register(createElement('button', 'mobile-sheet-close'));

  const panes = SHEET_TABS.map((tab) => {
    const pane = createElement('div', `pane-${tab.id}`);
    pane.dataset.sheetPane = tab.id;
    return register(pane);
  });
  const tabButtons = SHEET_TABS.map((tab) => {
    const button = createElement('button', `mobile-tab-${tab.id}`);
    button.dataset.sheetTab = tab.id;
    return register(button);
  });

  // The two rails the panels are authored into.
  const leftRail = register(createElement('div', 'left-panel-stack'));
  const dock = register(createElement('div', 'command-dock'));
  const rightRail = register(createElement('div', 'right-context-rail'));
  const homes = {
    'data-panel': leftRail,
    'global-context-panel': rightRail,
    'cctv-panel': leftRail,
    'radio-panel': rightRail,
    'control-panel': dock,
    'scene-panel': leftRail,
    'pp-toggles': rightRail,
  };
  for (const [id, home] of Object.entries(homes)) {
    const panel = register(createElement('div', id));
    panel.classList.add('panel-collapsible', 'collapsed');
    home.appendChild(panel);
  }

  const listeners = new Set();
  const query = {
    matches: mobile,
    addEventListener: (_type, callback) => listeners.add(callback),
    removeEventListener: (_type, callback) => listeners.delete(callback),
  };
  const body = createElement('body');

  const document = {
    body,
    getElementById: (id) => byId.get(id) || null,
    querySelectorAll: (selector) =>
      selector === '[data-sheet-pane]' ? panes : tabButtons,
  };
  sheet.querySelectorAll = document.querySelectorAll;

  return {
    document,
    windowRef: { matchMedia: () => query },
    byId,
    homes,
    title,
    close,
    tabButtons,
    resize(matches) {
      query.matches = matches;
      for (const callback of listeners) callback(query);
    },
  };
}

test('the sheet adopts the live panel nodes, it never clones them', () => {
  const harness = createHarness({ mobile: true });
  const before = harness.byId.get('data-panel');
  const sheet = createMobileBottomSheet(harness);

  assert.equal(sheet.isAdopted, true);
  const after = harness.document.getElementById('data-panel');
  assert.equal(after, before, 'getElementById must resolve the same node');
  assert.equal(after.parentElement.dataset.sheetPane, 'layers');
  assert.equal(
    after.classList.contains('collapsed'),
    false,
    'an adopted panel is expanded — the sheet owns disclosure',
  );
});

test('every mapped panel lands in its tab and nothing is orphaned', () => {
  const harness = createHarness({ mobile: true });
  createMobileBottomSheet(harness);
  for (const tab of SHEET_TABS) {
    for (const id of tab.panels) {
      assert.equal(
        harness.document.getElementById(id).parentElement.dataset.sheetPane,
        tab.id,
        `${id} should sit in the ${tab.id} pane`,
      );
    }
  }
});

test('widening the viewport returns every panel to the rail it came from', () => {
  const harness = createHarness({ mobile: true });
  const sheet = createMobileBottomSheet(harness);
  assert.equal(sheet.isAdopted, true);

  harness.resize(false);

  assert.equal(sheet.isAdopted, false);
  for (const [id, home] of Object.entries(harness.homes)) {
    assert.equal(
      harness.document.getElementById(id).parentElement,
      home,
      `${id} must go back to #${home.id}`,
    );
  }
  assert.equal(
    harness.document.getElementById('data-panel').classList.contains('collapsed'),
    true,
    'the pre-adoption collapsed state is restored, not invented',
  );
});

test('a desktop-width start never touches the rails', () => {
  const harness = createHarness({ mobile: false });
  const sheet = createMobileBottomSheet(harness);
  assert.equal(sheet.isAdopted, false);
  for (const [id, home] of Object.entries(harness.homes)) {
    assert.equal(harness.document.getElementById(id).parentElement, home);
  }
});

test('tapping a tab opens it and tapping it again closes the sheet', () => {
  const harness = createHarness({ mobile: true });
  const sheet = createMobileBottomSheet(harness);
  const [layers, contacts] = harness.tabButtons;

  assert.equal(sheet.isOpen(), false, 'the sheet starts closed');

  layers.click();
  assert.equal(sheet.isOpen(), true);
  assert.equal(sheet.activeTab, 'layers');
  assert.equal(layers.getAttribute('aria-selected'), 'true');
  assert.equal(harness.title.textContent, 'LAYERS');

  contacts.click();
  assert.equal(sheet.isOpen(), true, 'switching tabs keeps the sheet open');
  assert.equal(sheet.activeTab, 'contacts');
  assert.equal(layers.getAttribute('aria-selected'), 'false');

  contacts.click();
  assert.equal(sheet.isOpen(), false, 'the active tab is also the close control');
});

test('only the selected pane is visible', () => {
  const harness = createHarness({ mobile: true });
  const sheet = createMobileBottomSheet(harness);
  sheet.open('styles');
  for (const tab of SHEET_TABS) {
    assert.equal(
      harness.document.getElementById(`pane-${tab.id}`).hidden,
      tab.id !== 'styles',
      `pane ${tab.id} visibility`,
    );
  }
});

test('the close button collapses the sheet without releasing the panels', () => {
  const harness = createHarness({ mobile: true });
  const sheet = createMobileBottomSheet(harness);
  sheet.open('layers');
  harness.close.click();
  assert.equal(sheet.isOpen(), false);
  assert.equal(sheet.isAdopted, true, 'closing is not the same as widening');
});

test('destroy hands the panels back', () => {
  const harness = createHarness({ mobile: true });
  const sheet = createMobileBottomSheet(harness);
  sheet.destroy();
  for (const [id, home] of Object.entries(harness.homes)) {
    assert.equal(harness.document.getElementById(id).parentElement, home);
  }
});

test('a document without the sheet markup yields no controller', () => {
  assert.equal(
    createMobileBottomSheet({
      document: { getElementById: () => null },
      windowRef: { matchMedia: () => ({ matches: false }) },
    }),
    null,
  );
});
