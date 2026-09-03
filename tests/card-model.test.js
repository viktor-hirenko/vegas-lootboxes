// Unit tests for the shared card semantics: which card is today's, which is
// clickable, and how a prize type resolves against a brand vocabulary.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isActive, isClickable, hasCta, prizeTypeOf, isNoPrizeType, statusTextFor } from '../core/card-model.js';
import { PRIZE as VEGAS_PRIZE } from '../lootbox/vocabulary.js';
import { PRIZE as THOR_PRIZE } from '../lootbox-2/vocabulary.js';
import { statusTextFor as thorStatusTextFor, renderInner as renderThor } from '../lootbox-2/render.js';
import { renderInner as renderVegas } from '../lootbox/render.js';
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
  assert.equal(prizeTypeOf({ prizeType: 'nonsense' }, VEGAS_PRIZE), 'coins');
  assert.equal(prizeTypeOf({}, THOR_PRIZE), 'coins');
  // `"prediction"` is a no-prize marker, not a seventh prize. Resolving it
  // through the vocabulary must keep the default — otherwise empty and
  // `"prediction"` would collapse into the same art.
  assert.equal(prizeTypeOf({ prizeType: 'prediction' }, VEGAS_PRIZE), 'coins');
  assert.equal(prizeTypeOf({ prizeType: 'prediction' }, THOR_PRIZE), 'coins');
});

test('only the literal prizeType "prediction" is the no-prize marker', () => {
  assert.equal(isNoPrizeType({ prizeType: 'prediction' }), true);
  assert.equal(isNoPrizeType({ prizeType: '' }), false);
  assert.equal(isNoPrizeType({}), false);
  assert.equal(isNoPrizeType({ prizeType: 'coins' }), false);
  assert.ok(!VEGAS_PRIZE.valid.includes('prediction'));
  assert.ok(!THOR_PRIZE.valid.includes('prediction'));
});

test('the shared contract values resolve on both brands', () => {
  for (const prizeType of [
    'cash',
    'cashback',
    'coins',
    'free-spins',
    'free-chips',
    'bonus-money',
  ]) {
    assert.equal(prizeTypeOf({ prizeType }, VEGAS_PRIZE), prizeType);
    assert.equal(prizeTypeOf({ prizeType }, THOR_PRIZE), prizeType);
  }
});

test('the prize vocabulary is the same in every brand', () => {
  // The whole point of the contract's §11: a brand draws its own art for the
  // six values but never adds, drops or renames one. A brand-local value would
  // put the backend back to branching per brand.
  assert.deepEqual([...VEGAS_PRIZE.valid], [...THOR_PRIZE.valid]);
  assert.equal(VEGAS_PRIZE.default, THOR_PRIZE.default);
  assert.deepEqual({ ...VEGAS_PRIZE.aliases }, { ...THOR_PRIZE.aliases });
});

test('names the contract published earlier still resolve', () => {
  // The coin went `coins` -> `coin` -> `coins`: the host's own bonus dictionary
  // says `coins`, so that is the contract value, and the singular the contract
  // published in between stays accepted so a live integration does not break.
  assert.equal(prizeTypeOf({ prizeType: 'coin' }, VEGAS_PRIZE), 'coins');
  assert.equal(prizeTypeOf({ prizeType: 'coin' }, THOR_PRIZE), 'coins');
  // And the current name is the canonical one on both brands, not an alias.
  assert.ok(VEGAS_PRIZE.valid.includes('coins'));
  assert.ok(THOR_PRIZE.valid.includes('coins'));
  assert.ok(!VEGAS_PRIZE.valid.includes('coin'));
  assert.ok(!THOR_PRIZE.valid.includes('coin'));
});

test('bonus-money is a prize of its own, no longer an alias for cash', () => {
  // It used to alias `cash`, on the assumption that bonus money and banknotes
  // were one prize under two names. They are not, and the alias is what made a
  // real `bonus-money` payload render as cash — the regression this pins down.
  assert.equal(prizeTypeOf({ prizeType: 'bonus-money' }, VEGAS_PRIZE), 'bonus-money');
  assert.equal(prizeTypeOf({ prizeType: 'bonus-money' }, THOR_PRIZE), 'bonus-money');
  assert.ok(!('bonus-money' in VEGAS_PRIZE.aliases));
  assert.ok(!('bonus-money' in THOR_PRIZE.aliases));
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

function objectSrc(html) {
  const match = html.match(/class="lb-card__object"[^>]*src="([^"]+)"/);
  assert.ok(match, 'renderInner did not emit .lb-card__object');
  return match[1];
}

test('missed + prizeType prediction picks brand no-prize art, empty does not', () => {
  assert.equal(
    objectSrc(renderThor({ state: 'missed', prizeType: 'prediction' })),
    THOR_MISSED_ART.cookies,
  );
  assert.equal(
    objectSrc(renderThor({ state: 'missed', prizeType: '' })),
    THOR_MISSED_ART.coins,
  );
  assert.equal(
    objectSrc(renderThor({ state: 'missed', prizeType: 'cash' })),
    THOR_MISSED_ART.cash,
  );
  // Vegas has no missed-prediction ball yet; the marker still must not ride
  // the unknown→coin path for any other reason than this explicit branch.
  assert.equal(
    objectSrc(renderVegas({ state: 'missed', prizeType: 'prediction' })),
    VEGAS_MISSED_ART.coins,
  );
  assert.equal(
    objectSrc(renderVegas({ state: 'missed', prizeType: '' })),
    VEGAS_MISSED_ART.coins,
  );
  assert.equal(
    objectSrc(renderVegas({ state: 'missed', prizeType: 'cash' })),
    VEGAS_MISSED_ART.cash,
  );
});

test('opened prediction art ignores prizeType', () => {
  const thorOpened = objectSrc(renderThor({ state: 'prediction' }, { active: false }));
  assert.equal(thorOpened, OBJECTS_SM.cookies);
  assert.equal(
    objectSrc(renderThor({ state: 'prediction', prizeType: 'prediction' }, { active: false })),
    thorOpened,
  );
  assert.equal(
    objectSrc(renderThor({ state: 'prediction', prizeType: '' }, { active: false })),
    thorOpened,
  );
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
