// Vegas brand vocabulary: the values both render.js and brand.config.js need.
//
// Kept in its own module so those two do not import each other — a cycle there
// would put these consts in the temporal dead zone at module-eval time, which is
// exactly the class of bug that once blanked the widget (commit c786f31).

import { CARD_STATE } from '../core/protocol.js';

/** States whose object is a disco ball hanging on a chain (available / the
 * prediction ball / missed). Their content is top-aligned so the chain meets
 * the top edge of the card; prize/locked objects stay vertically centered. */
export const CHAIN_STATES = Object.freeze([
  CARD_STATE.AVAILABLE,
  CARD_STATE.PREDICTION,
  CARD_STATE.MISSED,
])

/** Prize art vocabulary. The six values are the contract's (§11) and are the
 * same in every brand — each brand draws its own art for them, none adds or
 * drops a value, so one payload feeds all of them unchanged.
 *
 * The coin is `coins`, plural: that is the name the host's own bonus dictionary
 * uses, and carrying two spellings is what made the two sides read each other's
 * payloads wrong. `aliases.coin` keeps the singular the contract published
 * earlier working, so a live integration still resolves. */
export const PRIZE = Object.freeze({
  valid: Object.freeze(['cash', 'cashback', 'coins', 'free-spins', 'free-chips', 'bonus-money']),
  default: 'coins',
  aliases: Object.freeze({ coin: 'coins' }),
})

export const DEFAULT_TITLES = Object.freeze({
  [CARD_STATE.AVAILABLE]: "Click & see\nwhat's inside",
  [CARD_STATE.LOCKED]: 'Locked',
  [CARD_STATE.PREDICTION]: 'Something is waiting for you in the future',
})
