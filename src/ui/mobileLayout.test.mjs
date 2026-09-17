import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MOBILE_BREAKPOINT_PX, MOBILE_MEDIA_QUERY } from './mobileLayout.js';

const read = (name) =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

test('the rails gate on the same width the shared constant declares', () => {
  // The rails spell the query out because creditAttribution.test.mjs reads
  // their source for it. That makes this the only thing holding the two
  // spellings together — without it the sheet could adopt panels at a width
  // where the rails are still allocating desktop heights for them.
  for (const file of ['./leftPanelRail.js', './rightPanelRail.js']) {
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
    fileURLToPath(new URL('./styles/mobile-sheet.css', import.meta.url)),
    'utf8',
  );
  assert.match(css, new RegExp(`@media \\(max-width: ${MOBILE_BREAKPOINT_PX}px\\)`));
  assert.equal(MOBILE_MEDIA_QUERY, `(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
});
