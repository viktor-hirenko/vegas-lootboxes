// Thor brand vocabulary: the values both render.js and brand.config.js need.
//
// Kept in its own module so those two do not import each other — see the same
// note in lootbox/vocabulary.js for why that cycle is worth avoiding.

import { CARD_STATE } from '../core/protocol.js';

/**
 * Prize art vocabulary. The six values are the contract's (§11) and are the
 * same in every brand — each brand draws its own art for them, none adds or
 * drops a value, so one payload feeds all of them unchanged.
 * `aliases.coins` keeps the older plural name working.
 */
export const PRIZE = Object.freeze({
  valid: Object.freeze(['cash', 'cashback', 'coin', 'free-spins', 'free-chips', 'bonus-money']),
  default: 'coin',
  aliases: Object.freeze({ coins: 'coin' }),
});

export const DEFAULT_TITLES = Object.freeze({
  [CARD_STATE.AVAILABLE]: 'Flip to claim\nyour perk',
  [CARD_STATE.LOCKED]: 'Locked',
  [CARD_STATE.PREDICTION]: 'Your greatest dreams are about to come true',
});

/** Second line on a missed day, under the lost prize's name. */
export const DEFAULT_MISSED_SUBTITLE = 'One day slipped away';
