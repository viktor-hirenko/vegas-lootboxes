// Unit tests for the rule that decides which measured sizes reach the parent as
// `resize`. Runs on the built-in Node test runner (no dependencies): `npm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shouldReport, MIN_WIDTH_DRIVEN_SHRINK } from '../core/resize.js';

/** Feeds observed sizes through the rule the way observeResize does and returns
 * the heights that would have been posted. */
function reported(observations) {
  let last = null;
  const sent = [];
  for (const next of observations) {
    if (!shouldReport(last, next)) continue;
    last = next;
    sent.push(next.height);
  }
  return sent;
}

test('the first measurement is always reported', () => {
  assert.equal(shouldReport(null, { width: 358, height: 376 }), true);
});

test('an unchanged height is not reported again', () => {
  assert.equal(shouldReport({ width: 358, height: 376 }, { width: 358, height: 376 }), false);
  assert.equal(shouldReport({ width: 358, height: 376 }, { width: 340, height: 376 }), false);
});

test('growth is always reported, however small — a short iframe clips the cards', () => {
  assert.equal(shouldReport({ width: 358, height: 376 }, { width: 358, height: 377 }), true);
  assert.equal(shouldReport({ width: 1183, height: 480 }, { width: 1200, height: 486 }), true);
});

test('content that gets shorter at the same width is reported exactly', () => {
  // Today's card stops being the big one: 320 -> 288 plus the glow room.
  assert.equal(shouldReport({ width: 358, height: 376 }, { width: 358, height: 344 }), true);
  assert.equal(shouldReport({ width: 358, height: 376 }, { width: 358, height: 375 }), true);
});

test('the iframe comes back down after the host was wide for a moment', () => {
  // The bug: a desktop-width moment left a 626px iframe around 376px of cards.
  assert.deepEqual(
    reported([
      { width: 358, height: 376 },
      { width: 1568, height: 614 },
      { width: 358, height: 376 },
    ]),
    [376, 614, 376],
  );
});

test('a host scrollbar that comes and goes cannot make the height bounce', () => {
  // On desktop the card scales with the width, so the ~17px a classic scrollbar
  // takes is ~6px of widget height: shrink -> no scrollbar -> wider -> taller ->
  // scrollbar again -> narrower -> shorter ... Started from either side, the
  // rule settles after at most one change instead of alternating forever.
  const wide = { width: 1200, height: 486 };
  const narrow = { width: 1183, height: 480 };
  assert.deepEqual(reported([wide, narrow, wide, narrow, wide, narrow]), [486]);
  assert.deepEqual(reported([narrow, wide, narrow, wide, narrow, wide]), [480, 486]);
});

test('small width-driven shrinks add up until they are worth reporting', () => {
  // A window dragged narrower a few px at a time: the iframe trails the cards by
  // less than MIN_WIDTH_DRIVEN_SHRINK, never by more.
  const sent = reported([
    { width: 1200, height: 486 },
    { width: 1190, height: 482 },
    { width: 1180, height: 479 },
    { width: 1160, height: 472 },
    { width: 1150, height: 468 },
  ]);
  assert.deepEqual(sent, [486, 468]);
  assert.ok(486 - 472 < MIN_WIDTH_DRIVEN_SHRINK);
  assert.ok(486 - 468 >= MIN_WIDTH_DRIVEN_SHRINK);
});
