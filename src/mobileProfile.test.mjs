import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MOBILE_BREAKPOINT_PX,
  MOBILE_MEDIA_QUERY,
  initialMapStackFor,
  mobilePerformanceProfile,
} from './mobileProfile.js';

const read = (name) =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

test('the rails gate on the same width the shared constant declares', () => {
  // The rails spell the query out because creditAttribution.test.mjs reads
  // their source for it. That makes this the only thing holding the two
  // spellings together — without it the sheet could adopt panels at a width
  // where the rails are still allocating desktop heights for them.
  for (const file of ['./ui/leftPanelRail.js', './ui/rightPanelRail.js']) {
    assert.match(
      read(file),
      new RegExp(
        `matchMedia\\('\\(max-width: ${MOBILE_BREAKPOINT_PX}px\\)'\\)`,
      ),
      `${file} no longer gates at ${MOBILE_BREAKPOINT_PX}px`,
    );
  }
});

test('the stylesheet composes the sheet at that same width', () => {
  const css = readFileSync(
    fileURLToPath(new URL('./ui/styles/mobile-sheet.css', import.meta.url)),
    'utf8',
  );
  assert.match(css, new RegExp(`@media \\(max-width: ${MOBILE_BREAKPOINT_PX}px\\)`));
  assert.equal(MOBILE_MEDIA_QUERY, `(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
});

// ── Performance profile ─────────────────────────────────────────────────────

const at = (width) => ({
  matchMedia: (query) => ({
    matches:
      query.includes('max-width') &&
      width <= Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? 0),
  }),
});

test('a phone-width viewport takes every performance ceiling', () => {
  const profile = mobilePerformanceProfile(at(390));
  assert.equal(profile.mobile, true);
  assert.equal(profile.msaaSamples, 1, '4x MSAA is the costliest phone default');
  assert.equal(profile.detectionDensityPct, 50);
  assert.equal(profile.refreshIntervalMultiplier, 2);
  assert.equal(profile.preferLightweightBasemap, true);
  assert.equal(profile.aircraftModels3d, false);
});

test('a desktop viewport is left exactly as it was', () => {
  const profile = mobilePerformanceProfile(at(1440));
  assert.equal(profile.mobile, false);
  assert.equal(profile.msaaSamples, 4);
  // GLOBAL_POST_DEFAULTS.detectionDensity — the Dense military preset.
  assert.equal(profile.detectionDensityPct, 75);
  assert.equal(profile.refreshIntervalMultiplier, 1);
  assert.equal(profile.preferLightweightBasemap, false);
  assert.equal(profile.aircraftModels3d, true);
});

test('the resolution scale is capped at 1 on both', () => {
  // Cesium's own default, pinned so a preset or share link cannot raise it.
  assert.equal(mobilePerformanceProfile(at(390)).resolutionScale, 1);
  assert.equal(mobilePerformanceProfile(at(1440)).resolutionScale, 1);
});

test('the breakpoint is the boundary, inclusive', () => {
  assert.equal(mobilePerformanceProfile(at(MOBILE_BREAKPOINT_PX)).mobile, true);
  assert.equal(
    mobilePerformanceProfile(at(MOBILE_BREAKPOINT_PX + 1)).mobile,
    false,
  );
});

test('the detection stop stays on the slider’s own scale', () => {
  // The control is `step="25"` from 0 to 100; an off-scale default would be
  // snapped somewhere else the moment anything touched the slider.
  for (const width of [390, 1440]) {
    const pct = mobilePerformanceProfile(at(width)).detectionDensityPct;
    assert.equal(pct % 25, 0, `${pct} is not a stop on the density scale`);
    assert.ok(pct >= 0 && pct <= 100);
  }
});

test('the profile cannot be mutated by a caller', () => {
  const profile = mobilePerformanceProfile(at(390));
  assert.throws(() => {
    'use strict';
    profile.msaaSamples = 4;
  });
});

// ── Initial basemap ─────────────────────────────────────────────────────────

test('a phone opens on the 2D basemap even when photoreal tiles are available', () => {
  // Verified as the DECISION, not as what the globe ends up showing: if Esri's
  // tiles fail the controller falls back to OSM, so observing the live map
  // cannot distinguish "asked for Esri" from "asked for photoreal and lost it".
  assert.equal(
    initialMapStackFor({
      hasPhotorealTileset: true,
      preferLightweightBasemap: true,
    }),
    'esri-imagery',
  );
});

test('a desktop with photoreal tiles still opens on photoreal', () => {
  assert.equal(
    initialMapStackFor({
      hasPhotorealTileset: true,
      preferLightweightBasemap: false,
    }),
    'photoreal',
  );
});

test('a keyless load opens on the 2D basemap on either device', () => {
  for (const preferLightweightBasemap of [true, false]) {
    assert.equal(
      initialMapStackFor({
        hasPhotorealTileset: false,
        preferLightweightBasemap,
      }),
      'esri-imagery',
    );
  }
});

test('the default with no arguments is the keyless 2D basemap', () => {
  assert.equal(initialMapStackFor(), 'esri-imagery');
});

test('every stack this can return exists in the map catalog', async () => {
  const { MAP_STACKS } = await import('./maps/catalog.js');
  const ids = new Set(MAP_STACKS.map((stack) => stack.id));
  for (const flags of [
    { hasPhotorealTileset: true, preferLightweightBasemap: true },
    { hasPhotorealTileset: true, preferLightweightBasemap: false },
    { hasPhotorealTileset: false, preferLightweightBasemap: true },
  ]) {
    const id = initialMapStackFor(flags);
    assert.ok(ids.has(id), `${id} is not a stack the controller can resolve`);
  }
});
