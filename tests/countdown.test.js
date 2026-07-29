// Unit tests for countdown formatting. The ticking side needs a DOM, so it is
// covered by the sandbox instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatCountdown } from '../core/countdown.js';

test('formats HH:MM:SS with zero padding', () => {
  assert.equal(formatCountdown(0), '00:00:00');
  assert.equal(formatCountdown(1000), '00:00:01');
  assert.equal(formatCountdown(61 * 1000), '00:01:01');
  assert.equal(formatCountdown((23 * 3600 + 59 * 60 + 59) * 1000), '23:59:59');
});

test('a passed deadline clamps to zero instead of going negative', () => {
  assert.equal(formatCountdown(-1), '00:00:00');
  assert.equal(formatCountdown(-90_000), '00:00:00');
});

test('hours are not wrapped at 24, so a multi-day deadline still reads correctly', () => {
  assert.equal(formatCountdown(25 * 3600 * 1000), '25:00:00');
});

test('sub-second remainders round down, so the badge never shows a second early', () => {
  assert.equal(formatCountdown(1999), '00:00:01');
});
