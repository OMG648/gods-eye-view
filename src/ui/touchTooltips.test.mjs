import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTouchTooltips } from './touchTooltips.js';

/** A DOM stub with just the surface this module touches. */
function harness({ coarse = true } = {}) {
  const listeners = new Map();
  const card = {
    id: '',
    hidden: true,
    style: {},
    textContent: '',
    setAttribute() {},
    remove() {},
    getBoundingClientRect: () => ({ width: 200, height: 40 }),
  };
  const body = { appendChild: () => {} };
  const document = {
    body,
    createElement: () => card,
    addEventListener: (type, fn, opts) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ fn, opts });
    },
    removeEventListener: (type, fn) => {
      const list = listeners.get(type) || [];
      const index = list.findIndex((entry) => entry.fn === fn);
      if (index >= 0) list.splice(index, 1);
    },
  };
  const windowRef = {
    innerWidth: 390,
    innerHeight: 844,
    addEventListener: document.addEventListener,
    removeEventListener: document.removeEventListener,
    matchMedia: (query) => ({
      matches: coarse && query.includes('pointer: coarse'),
    }),
  };
  const fire = (type, event) => {
    for (const { fn } of listeners.get(type) || []) fn(event);
  };
  return { document, windowRef, card, fire, listeners };
}

/** An element stub that answers `closest('[title]')` with itself. */
function titled(title) {
  const element = {
    getAttribute: (name) => (name === 'title' ? title : null),
  };
  element.closest = (selector) => (selector === '[title]' ? element : null);
  return element;
}

const press = (fire, target, x = 100, y = 400) =>
  fire('pointerdown', {
    pointerType: 'touch',
    isPrimary: true,
    clientX: x,
    clientY: y,
    target,
  });

test('a device with a fine pointer gets no controller at all', () => {
  const env = harness({ coarse: false });
  assert.equal(createTouchTooltips({ ...env, pressMs: 1 }), null);
  assert.equal(
    env.listeners.size,
    0,
    'native hover tooltips must be left alone',
  );
});

test('a long press reveals the title text', async () => {
  const env = harness();
  const tips = createTouchTooltips({ ...env, pressMs: 1 });
  press(env.fire, titled('Collapse panel'));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(tips.visible, true);
  assert.equal(env.card.textContent, 'Collapse panel');
});

test('the card is placed above the finger and clamped to the viewport', async () => {
  const env = harness();
  createTouchTooltips({ ...env, pressMs: 1 });
  press(env.fire, titled('Anywhere'), 380, 400);
  await new Promise((resolve) => setTimeout(resolve, 10));
  // 200px card at x=380 would overflow 390px of viewport; clamp to 8px margin.
  assert.equal(env.card.style.left, '182px');
  assert.equal(env.card.style.top, `${400 - 40 - 16}px`);
});

test('a press near the top edge flips the card below the finger', async () => {
  const env = harness();
  createTouchTooltips({ ...env, pressMs: 1 });
  press(env.fire, titled('Near the top'), 100, 20);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(env.card.style.top, '44px', 'above would be off-screen');
});

test('a quick tap shows nothing and is not swallowed', async () => {
  const env = harness();
  const tips = createTouchTooltips({ ...env, pressMs: 50 });
  press(env.fire, titled('Collapse panel'));
  env.fire('pointerup', {});
  let defaultPrevented = false;
  env.fire('click', {
    preventDefault: () => (defaultPrevented = true),
    stopPropagation: () => {},
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(tips.visible, false);
  assert.equal(defaultPrevented, false, 'an ordinary tap must still act');
});

test('a completed long press swallows the click it would have been', async () => {
  const env = harness();
  createTouchTooltips({ ...env, pressMs: 1 });
  press(env.fire, titled('Collapse panel'));
  await new Promise((resolve) => setTimeout(resolve, 10));
  let defaultPrevented = false;
  env.fire('click', {
    preventDefault: () => (defaultPrevented = true),
    stopPropagation: () => {},
  });
  assert.equal(defaultPrevented, true, 'the press was a reveal, not a tap');
});

test('a drag past the tolerance cancels the press', async () => {
  const env = harness();
  const tips = createTouchTooltips({ ...env, pressMs: 20 });
  press(env.fire, titled('Collapse panel'), 100, 400);
  env.fire('pointermove', { clientX: 100, clientY: 440 });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(tips.visible, false, 'a scroll is not a press');
});

test('a small wobble within tolerance still reveals', async () => {
  const env = harness();
  const tips = createTouchTooltips({ ...env, pressMs: 20 });
  press(env.fire, titled('Collapse panel'), 100, 400);
  env.fire('pointermove', { clientX: 104, clientY: 403 });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(tips.visible, true, 'a finger is never perfectly still');
});

test('an element without a title is ignored', async () => {
  const env = harness();
  const tips = createTouchTooltips({ ...env, pressMs: 1 });
  press(env.fire, { closest: () => null });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(tips.visible, false);
});

test('a mouse pointer on a touch device is left to native hover', async () => {
  const env = harness();
  const tips = createTouchTooltips({ ...env, pressMs: 1 });
  env.fire('pointerdown', {
    pointerType: 'mouse',
    isPrimary: true,
    clientX: 10,
    clientY: 10,
    target: titled('Collapse panel'),
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(tips.visible, false);
});

test('destroy removes every listener it added', () => {
  const env = harness();
  const tips = createTouchTooltips({ ...env, pressMs: 1 });
  assert.ok(env.listeners.size > 0);
  tips.destroy();
  const remaining = [...env.listeners.values()].flat();
  assert.deepEqual(remaining, []);
});
