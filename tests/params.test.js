// Unit tests for query-param parsing, focused on origin validation and the
// card contract. Runs on the built-in Node test runner: `npm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseWidgetParams } from '../lootbox/modules/params.js';

test('a valid origin is canonicalized', () => {
  const params = parseWidgetParams('?origin=https%3A%2F%2Fsite.com%2Fx&lang=fr');
  assert.equal(params.origin, 'https://site.com');
  assert.equal(params.lang, 'fr');
});

test('a missing or invalid origin becomes empty (permissive)', () => {
  assert.equal(parseWidgetParams('?origin=garbage').origin, '');
  assert.equal(parseWidgetParams('?origin=*').origin, '');
  assert.equal(parseWidgetParams('').origin, '');
});

test('lang defaults to en, debug parses the literal "true"', () => {
  const params = parseWidgetParams('');
  assert.equal(params.lang, 'en');
  assert.equal(params.debug, false);
  assert.equal(parseWidgetParams('?debug=true').debug, true);
  assert.equal(parseWidgetParams('?debug=1').debug, false);
});

test('cards are parsed from the c{i}_* contract', () => {
  const params = parseWidgetParams(
    '?c1_state=prize&c1_prize=cash&c1_active=true&c2_state=locked',
  );
  assert.equal(params.cards.length, 2);
  assert.deepEqual(
    params.cards.map((c) => ({ index: c.index, state: c.state })),
    [
      { index: 1, state: 'prize' },
      { index: 2, state: 'locked' },
    ],
  );
  assert.equal(params.cards[0].prizeType, 'cash');
  assert.equal(params.cards[0].active, true);
});

test('unknown card states fall back to locked', () => {
  const params = parseWidgetParams('?c1_state=bogus');
  assert.equal(params.cards[0].state, 'locked');
});
