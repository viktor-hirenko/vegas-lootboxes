// Unit tests for the shared card semantics: which card is today's, which is
// clickable, and how a prize type resolves against a brand vocabulary.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isActive, isClickable, hasCta, prizeTypeOf, statusTextFor } from '../core/card-model.js';
import { PRIZE as VEGAS_PRIZE } from '../lootbox/vocabulary.js';
import { PRIZE as THOR_PRIZE } from '../lootbox-2/vocabulary.js';
import { statusTextFor as thorStatusTextFor } from '../lootbox-2/render.js';
import { PRIZE_ART, MISSED_ART as VEGAS_MISSED_ART } from '../lootbox/icons.js';
import {
  OBJECTS_LG,
  OBJECTS_SM,
  MISSED_ART as THOR_MISSED_ART,
} from '../lootbox-2/icons.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  assert.equal(prizeTypeOf({}, THOR_PRIZE), 'coin');
});

test('the shared contract values resolve on both brands', () => {
  for (const prizeType of ['coin', 'bonus-money', 'free-spins']) {
    assert.equal(prizeTypeOf({ prizeType }, VEGAS_PRIZE), prizeType);
    assert.equal(prizeTypeOf({ prizeType }, THOR_PRIZE), prizeType);
  }
});

test('a value a brand has no art for lands on its nearest object', () => {
  // Vegas draws no cashback, Thor draws no cash — each stands in with its own.
  assert.equal(prizeTypeOf({ prizeType: 'cashback' }, VEGAS_PRIZE), 'cash');
  assert.equal(prizeTypeOf({ prizeType: 'cash' }, THOR_PRIZE), 'cashback');
  // `coins` is the plural Thor shipped before the vocabularies were aligned;
  // both brands keep accepting it so a live integration does not break.
  assert.equal(prizeTypeOf({ prizeType: 'coins' }, VEGAS_PRIZE), 'coin');
  assert.equal(prizeTypeOf({ prizeType: 'coins' }, THOR_PRIZE), 'coin');
});

/** A prize type is a contract value, and the art map keyed by it is a brand's
 * private business — but a key missing from that map renders a broken <img>, and
 * only in one state. These two checks keep vocabulary, art maps and the files on
 * disk from drifting apart (the kind of gap a renamed asset leaves behind). */
const ART_SETS = [
  { brand: 'lootbox', prize: VEGAS_PRIZE, maps: { PRIZE_ART, MISSED_ART: VEGAS_MISSED_ART } },
  {
    brand: 'lootbox-2',
    prize: THOR_PRIZE,
    maps: { OBJECTS_LG, OBJECTS_SM, MISSED_ART: THOR_MISSED_ART },
  },
];

test('every prize in a brand vocabulary is keyed in all of its art maps', () => {
  for (const { brand, prize, maps } of ART_SETS) {
    for (const [mapName, map] of Object.entries(maps)) {
      for (const prizeType of prize.valid) {
        assert.ok(map[prizeType], `${brand}: ${mapName} has no art for "${prizeType}"`);
      }
    }
  }
});

test('every art path in a brand resolves to a file that exists', () => {
  for (const { brand, maps } of ART_SETS) {
    for (const [mapName, map] of Object.entries(maps)) {
      for (const [key, src] of Object.entries(map)) {
        const file = path.join(root, brand, src.replace(/^\.\//, ''));
        assert.ok(fs.existsSync(file), `${brand}: ${mapName}.${key} points at missing ${src}`);
      }
    }
  }
});

test('status badge text: Not opened on missed, Opened on history, empty on today', () => {
  assert.equal(statusTextFor({ state: 'missed' }, false), 'Not opened');
  assert.equal(statusTextFor({ state: 'prize' }, false), 'Opened');
  assert.equal(statusTextFor({ state: 'prize' }, true), '');
  assert.equal(statusTextFor({ state: 'locked' }, false), '');
  // the parent can override the wording
  assert.equal(statusTextFor({ state: 'missed', tag: 'Expired' }, false), 'Expired');
});

test('Thor leaves an opened result to a bare date pill, today or in history', () => {
  assert.equal(thorStatusTextFor({ state: 'missed' }), 'Not opened');
  assert.equal(thorStatusTextFor({ state: 'missed', tag: 'Expired' }), 'Expired');
  assert.equal(thorStatusTextFor({ state: 'prize', active: true }), '');
  assert.equal(thorStatusTextFor({ state: 'prize', active: false }), '');
  assert.equal(thorStatusTextFor({ state: 'prediction', active: true }), '');
  // a parent that still sends the Vegas wording gets it dropped, not rendered
  assert.equal(thorStatusTextFor({ state: 'prize', active: false, tag: 'Opened' }), '');
});
