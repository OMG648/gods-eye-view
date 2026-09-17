import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LayerLifecycle } from './lifecycle.js';

/**
 * The refresh multiplier is the one knob that can silently stop every live
 * feed in the app: `setInterval(fn, 0)` still fires, but `setInterval(fn, NaN)`
 * is treated as 0 and a negative interval is clamped to it — either way the
 * console would look alive while hammering or starving its sources. The
 * constructor clamps, and these pin that it does.
 */
const scaleOf = (value) =>
  new LayerLifecycle({}, { refreshIntervalScale: value })._refreshIntervalScale;

test('a phone-class multiplier is taken as given', () => {
  assert.equal(scaleOf(2), 2);
  assert.equal(scaleOf(1.5), 1.5);
});

test('the desktop default is exactly 1', () => {
  assert.equal(new LayerLifecycle({})._refreshIntervalScale, 1);
  assert.equal(scaleOf(1), 1);
});

test('a value that would disarm or invert the loop falls back to 1', () => {
  for (const bad of [0, -1, NaN, Infinity, -Infinity, null, undefined, 'fast']) {
    assert.equal(scaleOf(bad), 1, `${String(bad)} must not reach setInterval`);
  }
});

test('the armed interval is the layer cadence times the scale', () => {
  const lifecycle = new LayerLifecycle({}, { refreshIntervalScale: 2 });
  const armed = [];
  const originalSetInterval = globalThis.setInterval;
  globalThis.setInterval = (_fn, ms) => (armed.push(ms), 1);
  try {
    lifecycle._armUpdateLoop('flights', {
      module: { refreshInterval: 15000 },
      enabled: true,
    });
    lifecycle._armUpdateLoop('vessels', {
      module: { updateInterval: 4000 },
      enabled: true,
    });
  } finally {
    globalThis.setInterval = originalSetInterval;
  }
  assert.deepEqual(armed, [30000, 8000]);
});

test('a layer with no cadence is not given one', () => {
  const lifecycle = new LayerLifecycle({}, { refreshIntervalScale: 2 });
  const armed = [];
  const originalSetInterval = globalThis.setInterval;
  globalThis.setInterval = (_fn, ms) => (armed.push(ms), 1);
  try {
    // updateInterval 0 is the "stats only" lane; it must keep its own cadence
    // rather than inherit the feed multiplier.
    lifecycle._armUpdateLoop('static', {
      module: { updateInterval: 0, statsRefreshInterval: 1000 },
      enabled: true,
    });
  } finally {
    globalThis.setInterval = originalSetInterval;
  }
  assert.deepEqual(armed, [1000]);
});
