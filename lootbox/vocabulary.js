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

/** Prize art vocabulary. `aliases` covers the contract values Vegas has no
 * artwork of its own for — `cashback` lands on the cash object — so one Smartico
 * payload feeds every brand without the backend branching per brand. */
export const PRIZE = Object.freeze({
  valid: Object.freeze(['bonus-money', 'cash', 'coin', 'free-spins']),
  default: 'coin',
  aliases: Object.freeze({ cashback: 'cash', coins: 'coin' }),
})

export const DEFAULT_TITLES = Object.freeze({
  [CARD_STATE.AVAILABLE]: "Click & see\nwhat's inside",
  [CARD_STATE.LOCKED]: 'Locked',
  [CARD_STATE.PREDICTION]: 'Something is waiting for you in the future',
})
