// Thor brand vocabulary: the values both render.js and brand.config.js need.
//
// Kept in its own module so those two do not import each other — see the same
// note in lootbox/vocabulary.js for why that cycle is worth avoiding.

import { CARD_STATE } from '../core/protocol.js';

/**
 * Prize art vocabulary. The six values are the contract's (§11) and are the
 * same in every brand — each brand draws its own art for them, none adds or
 * drops a value, so one payload feeds all of them unchanged.
 *
 * The coin is `coins`, plural: that is the name the host's own bonus dictionary
 * uses, and carrying two spellings is what made the two sides read each other's
 * payloads wrong. `aliases.coin` keeps the singular the contract published
 * earlier working, so a live integration still resolves.
 */
export const PRIZE = Object.freeze({
  valid: Object.freeze(['cash', 'cashback', 'coins', 'free-spins', 'free-chips', 'bonus-money']),
  default: 'coins',
  aliases: Object.freeze({ coin: 'coins' }),
});

/**
 * Card copy the widget supplies itself.
 *
 * These three states carry no prize name, so the host sends no `title` for them
 * — the agreed payload for a day without a prize is `{ state, prizeType }` and
 * nothing more (see .project-context/missed-prediction-2026-09-03.md). What is
 * written here is therefore what the player actually reads, which is why the
 * line breaks are baked in rather than left to the box width: the design breaks
 * both two-line titles at a specific word, and `.lb-card__title` is
 * `white-space: pre-line` in theme.css so a `\n` survives to the screen.
 */
export const DEFAULT_TITLES = Object.freeze({
  [CARD_STATE.AVAILABLE]: "See what's\ninside",
  [CARD_STATE.LOCKED]: 'Opens soon',
  [CARD_STATE.PREDICTION]: 'Your lucky sign\nis near',
});

/** The one locked day that is next up says when it opens; every other locked day
 * keeps the vaguer `DEFAULT_TITLES[LOCKED]`. Which card that is comes from the
 * core's `findSpotlightLockedIndex`, the same flag that decides which locked day
 * animates. */
export const NEXT_LOCKED_TITLE = 'Opens tomorrow';

/**
 * Status chip labels — the pill under the title on a card whose day is over.
 *
 * Only two tones exist in the design: a missed day is amber, a day that was
 * opened (prize or prediction) is green. The host can override either text
 * through `card.tag`; these are the fallbacks.
 */
export const STATUS_LABELS = Object.freeze({
  missed: 'Missed',
  revealed: 'Revealed',
});
