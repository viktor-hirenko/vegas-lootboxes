// Brand-agnostic card semantics: which card is "today", which is clickable, how
// a prize type is resolved against a brand vocabulary, and the badge markup.
//
// Everything here is derived from the contract in protocol.js, so both brands
// answer these questions identically. Only the artwork and the CSS differ.

import { CARD_STATE, OPENED_RESULT_STATES } from './protocol.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Available is always the active/today card; opened results are active only
 * when the parent explicitly flags them as the current day. */
export function isActive(card) {
  if (card.state === CARD_STATE.AVAILABLE) return true;
  return OPENED_RESULT_STATES.includes(card.state) && card.active === true;
}

/** `available` always; today's opened result (prize OR prediction) only while
 * the parent still sends a CTA (re-click reopens the win/prediction popup). */
export function isClickable(card) {
  if (card.state === CARD_STATE.AVAILABLE) return true;
  return OPENED_RESULT_STATES.includes(card.state) && isActive(card) && Boolean(card.cta);
}

/** CTA is shown on today's opened result while the parent sends non-empty `cta`. */
export function hasCta(card) {
  return OPENED_RESULT_STATES.includes(card.state) && isActive(card) && Boolean(card.cta);
}

/**
 * Resolves `card.prizeType` against a brand's vocabulary.
 *
 * The contract has one prize vocabulary for every brand (INTEGRATION.md §11) and
 * every brand draws all of it, so this resolves to the same value everywhere.
 * `aliases` maps names the contract published earlier onto their current ones,
 * which keeps an older integration working; anything else falls back to the
 * brand's default rather than rendering an empty slot.
 *
 * @param {{ prizeType?: string }} card
 * @param {{ valid: readonly string[], default: string, aliases?: Record<string, string> }} prize
 * @returns {string}
 */
export function prizeTypeOf(card, prize) {
  const raw = card.prizeType;
  if (prize.valid.includes(raw)) return raw;
  const aliased = prize.aliases?.[raw];
  if (aliased && prize.valid.includes(aliased)) return aliased;
  return prize.default;
}

/** Status badge text: "Not opened" on a missed day, "Opened" on a past result. */
export function statusTextFor(card, active) {
  if (card.state === CARD_STATE.MISSED) return card.tag || 'Not opened';
  if (!active && OPENED_RESULT_STATES.includes(card.state)) return card.tag || 'Opened';
  return '';
}

/** Status badges (Opened / Not opened / countdown) share the outline style; the
 * date badge stays filled. */
function badgeClassFor(kind) {
  return kind === 'status'
    ? 'lb-card__badge lb-card__badge--outline'
    : 'lb-card__badge lb-card__badge--filled';
}

/**
 * Top badge row: filled date pill on the left, outline status pill on the right.
 * When only the date is present the row collapses to the left (--single).
 *
 * `statusText` is passed in rather than derived so a brand can put something
 * else there — Thor shows a countdown on the next locked day where Vegas shows
 * nothing.
 *
 * @param {object} card
 * @param {string} [statusText]
 * @param {object} [options]
 * @param {string} [options.statusModifier] extra class on the status pill
 * @param {number} [options.timerTo] absolute deadline in epoch ms; tags the
 *   status pill for `startCountdowns` so its text is rewritten every second
 */
export function renderBadges(card, statusText = '', options = {}) {
  const dateText = card.date ? escapeHtml(card.date) : '';
  const status = escapeHtml(statusText);

  if (!dateText && !status) return '';

  const dateBadge = dateText ? `<span class="${badgeClassFor('date')}">${dateText}</span>` : '';

  const ticking = Number.isFinite(options.timerTo) && options.timerTo > 0;
  const statusClasses = [badgeClassFor('status')];
  if (options.statusModifier) statusClasses.push(options.statusModifier);
  if (ticking) statusClasses.push('lb-card__badge--timer');
  const timerAttr = ticking ? ` data-lb-timer-to="${options.timerTo}"` : '';

  const statusBadge = status
    ? `<span class="${statusClasses.join(' ')}"${timerAttr}>${status}</span>`
    : '';
  const single = status ? '' : ' lb-card__badges--single';

  return `<div class="lb-card__badges${single}">${dateBadge}${statusBadge}</div>`;
}
