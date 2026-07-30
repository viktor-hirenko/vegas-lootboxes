// Thor brand vocabulary: the values both render.js and brand.config.js need.
//
// Kept in its own module so those two do not import each other — see the same
// note in lootbox/vocabulary.js for why that cycle is worth avoiding.

import { CARD_STATE } from '../core/protocol.js';

/**
 * Prize art vocabulary. The names are the ones in the integration contract
 * (§11), shared with every other brand — one Smartico payload feeds all of them.
 *
 * `aliases` covers the values Thor has no artwork of its own for: `cash` is a
 * separate prize in the contract, but Thor only draws cashback, so a cash payload
 * lands on the nearest object instead of the default. `coins` is the plural this
 * brand shipped before the vocabularies were aligned — kept so an integration
 * already sending it keeps working.
 */
export const PRIZE = Object.freeze({
  valid: Object.freeze(['bonus-money', 'cashback', 'coin', 'free-spins']),
  default: 'coin',
  aliases: Object.freeze({ cash: 'cashback', coins: 'coin' }),
});

export const DEFAULT_TITLES = Object.freeze({
  [CARD_STATE.AVAILABLE]: 'Flip to claim\nyour perk',
  [CARD_STATE.LOCKED]: 'Locked',
  [CARD_STATE.PREDICTION]: 'Your greatest dreams are about to come true',
});

/** Second line on a missed day, under the lost prize's name. */
export const DEFAULT_MISSED_SUBTITLE = 'One day slipped away';
