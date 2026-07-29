// Unit tests for the shared card semantics: which card is today's, which is
// clickable, and how a prize type resolves against a brand vocabulary.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isActive, isClickable, hasCta, prizeTypeOf, statusTextFor } from '../core/card-model.js';
import { PRIZE as VEGAS_PRIZE } from '../lootbox/vocabulary.js';
import { PRIZE as THOR_PRIZE } from '../lootbox-thor/vocabulary.js';

test('available is always today; results are today only when flagged', () => {
  assert.equal(isActive({ state: 'available' }), true);
  assert.equal(isActive({ state: 'prize', active: true }), true);
  assert.equal(isActive({ state: 'prize', active: false }), false);
  assert.equal(isActive({ state: 'prediction' }), false);
  assert.equal(isActive({ state: 'locked' }), false);
  assert.equal(isActive({ state: 'missed' }), false);
});

test('available is clickable; a result needs to be today AND carry a CTA', () => {
  assert.equal(isClickable({ state: 'available' }), true);
  assert.equal(isClickable({ state: 'prize', active: true, cta: 'Go to Bonuses' }), true);
  assert.equal(isClickable({ state: 'prize', active: true, cta: '' }), false);
  assert.equal(isClickable({ state: 'prize', active: false, cta: 'Go to Bonuses' }), false);
  assert.equal(isClickable({ state: 'locked' }), false);
  assert.equal(isClickable({ state: 'missed', cta: 'x' }), false);
});

test('hasCta matches the clickability rule for results only', () => {
  assert.equal(hasCta({ state: 'prediction', active: true, cta: 'See details' }), true);
  // available is clickable but never renders a CTA
  assert.equal(hasCta({ state: 'available', cta: 'x' }), false);
});

test('an unknown prize type falls back to the brand default', () => {
  assert.equal(prizeTypeOf({ prizeType: 'nonsense' }, VEGAS_PRIZE), 'coin');
  assert.equal(prizeTypeOf({}, THOR_PRIZE), 'coins');
});

test('aliases let one Smartico payload feed both brands', () => {
  // Thor names resolved on Vegas
  assert.equal(prizeTypeOf({ prizeType: 'cashback' }, VEGAS_PRIZE), 'cash');
  assert.equal(prizeTypeOf({ prizeType: 'coins' }, VEGAS_PRIZE), 'coin');
  // Vegas names resolved on Thor
  assert.equal(prizeTypeOf({ prizeType: 'cash' }, THOR_PRIZE), 'cashback');
  assert.equal(prizeTypeOf({ prizeType: 'coin' }, THOR_PRIZE), 'coins');
  // names shared by both brands pass through untouched
  assert.equal(prizeTypeOf({ prizeType: 'free-spins' }, VEGAS_PRIZE), 'free-spins');
  assert.equal(prizeTypeOf({ prizeType: 'bonus-money' }, THOR_PRIZE), 'bonus-money');
});

test('status badge text: Not opened on missed, Opened on history, empty on today', () => {
  assert.equal(statusTextFor({ state: 'missed' }, false), 'Not opened');
  assert.equal(statusTextFor({ state: 'prize' }, false), 'Opened');
  assert.equal(statusTextFor({ state: 'prize' }, true), '');
  assert.equal(statusTextFor({ state: 'locked' }, false), '');
  // the parent can override the wording
  assert.equal(statusTextFor({ state: 'missed', tag: 'Expired' }, false), 'Expired');
});
