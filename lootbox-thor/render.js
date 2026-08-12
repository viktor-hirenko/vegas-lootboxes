// Thor card composition: portal background, one object, a centred text block and
// the badge row. Sizing and positioning live in theme.css via per-state
// --lb-obj-w / --lb-obj-shift knobs; this file only decides which art goes where.

import { CARD_STATE, OPENED_RESULT_STATES } from '../core/protocol.js';
import {
  escapeHtml,
  isActive,
  hasCta,
  prizeTypeOf,
  renderBadges,
} from '../core/card-model.js';
import { formatCountdown } from '../core/countdown.js';
import { BACKGROUNDS, BG_SIZES, OBJECTS_LG, OBJECTS_SM, MISSED_ART } from './icons.js';
import { PRIZE, DEFAULT_TITLES, DEFAULT_MISSED_SUBTITLE } from './vocabulary.js';
import { observeBgAnim } from './bg-anim.js';

/**
 * @param {object} card
 * @param {boolean} active
 * @param {boolean} pinnedActive the card is a history card that is still being
 *   held at the active 208x320 box — true only for the missed-day burn, where
 *   the collapse into 208x288 has not run yet. Picks the missed portal drawn
 *   for that taller box so the rim is not stretched (see icons.js).
 * @param {boolean} spotlight this is the "next up" locked day — the only closed
 *   card that animates. The core works out which one that is
 *   (`findSpotlightLockedIndex`); every other locked day gets the same portal as a
 *   single frame, because a month is up to 26 of them and 26 running loops is
 *   decode work nobody asked for.
 */
function backgroundFor(card, active, pinnedActive, spotlight) {
  switch (card.state) {
    case CARD_STATE.AVAILABLE:
      return BACKGROUNDS.available;
    case CARD_STATE.LOCKED:
      return spotlight ? BACKGROUNDS.locked : BACKGROUNDS.lockedStatic;
    case CARD_STATE.MISSED:
      return pinnedActive ? BACKGROUNDS.missedActive : BACKGROUNDS.missed;
    default:
      // A result keeps the live portal on the day it was opened and drops to the
      // dimmed one once it is history.
      return active ? BACKGROUNDS.available : BACKGROUNDS.previous;
  }
}

/** Central object art src. Today's card uses the 128px set, a past day the
 * 112px one; sizing itself lives in CSS (--lb-obj-w per card state).
 * @returns {string} */
function objectFor(card, active) {
  switch (card.state) {
    case CARD_STATE.AVAILABLE:
      // The prize is still unknown, so the card shows a question mark.
      return OBJECTS_LG.question;
    case CARD_STATE.LOCKED:
      return OBJECTS_SM.lock;
    case CARD_STATE.MISSED:
      return MISSED_ART[prizeTypeOf(card, PRIZE)];
    case CARD_STATE.PREDICTION:
      // Fortune cookie — the same object in both sizes.
      return active ? OBJECTS_LG.cookies : OBJECTS_SM.cookies;
    default: // prize
      return (active ? OBJECTS_LG : OBJECTS_SM)[prizeTypeOf(card, PRIZE)];
  }
}

/**
 * The unlock deadline this card should count down to, or 0 for no countdown.
 *
 * Only a locked day counts down: once a card is available/opened/missed there is
 * nothing left to wait for, and a stale `timerTo` on such a card would otherwise
 * keep a badge ticking.
 */
function deadlineFor(card) {
  if (card.state !== CARD_STATE.LOCKED) return 0;
  const to = Number(card.timerTo);
  return Number.isFinite(to) && to > 0 ? to : 0;
}

/**
 * Status pill text — the outline badge to the right of the date.
 *
 * Thor only fills it on two states: a locked day counts down to its unlock, and
 * a missed day reads "Not opened". An opened result keeps a bare date pill
 * whether it is today's card or history, so `card.tag` is deliberately ignored
 * there — Vegas is the brand that spells out "Opened" once a result is past.
 */
export function statusTextFor(card) {
  if (card.state === CARD_STATE.LOCKED) {
    const deadline = deadlineFor(card);
    if (deadline) return formatCountdown(deadline - Date.now());
    // A parent that formats the countdown itself can send a literal string.
    return card.timer ? String(card.timer) : '';
  }
  if (card.state === CARD_STATE.MISSED) return card.tag || 'Not opened';
  return '';
}

/** Title (+ optional second line) as one block, so theme.css can centre the
 * pair on the fixed vertical band the design uses for every state. */
function renderText(card) {
  const title = escapeHtml(card.title || DEFAULT_TITLES[card.state] || '');
  const subtitleSource =
    card.state === CARD_STATE.MISSED ? card.subtitle || DEFAULT_MISSED_SUBTITLE : card.subtitle;
  const subtitle = escapeHtml(subtitleSource || '');

  if (!title && !subtitle) return '';

  const titleHtml = title ? `<p class="lb-card__title">${title}</p>` : '';
  const subtitleHtml = subtitle ? `<p class="lb-card__subtitle">${subtitle}</p>` : '';
  return `<div class="lb-card__text">${titleHtml}${subtitleHtml}</div>`;
}

/**
 * The background: a first-frame poster that is always painted, plus — on the two
 * states whose art is an animated loop — the loop itself, layered over it.
 *
 * Three things here are load-bearing and easy to "clean up" by mistake:
 *
 * 1. The poster stays EAGER while the loop is `loading="lazy"`. `whenImagesReady`
 *    in core/runtime.js gates the skeleton -> content swap on every non-lazy
 *    `<img>`, so an eager loop would hold the skeleton for as long as it takes to
 *    download (or the full 4s timeout). It also filters on the ATTRIBUTE, which is
 *    why the loop keeps `loading="lazy"` even though it has no source yet: an
 *    `<img>` with no `src` reports `complete` with `naturalWidth === 0` and fires
 *    neither `load` nor `error`, so without the attribute it would sit in the
 *    pending set until the timeout expired.
 * 2. The loop's candidates live in `data-srcset`, never `srcset`. Nothing is
 *    requested until bg-anim.js promotes them, which is what keeps ~26 locked
 *    cards from all decoding at once and what makes the reduced-motion path a
 *    genuine "never requested" rather than "loaded then hidden".
 * 3. `sizes` is on every `<source>` AND on the `<img>`. A `<source>` with width
 *    descriptors and no `sizes` falls back to `100vw`, which on a 208px card
 *    would select the 624-wide candidate on every phone.
 *
 * A legacy state renders the exact `<img>` markup it always has — no wrapper, no
 * srcset — because `stageFace` in open.js stages only `missed` faces and blocks on
 * that element specifically.
 */
function renderBackground(background) {
  const { poster, anim } = background;

  if (!poster.avif) {
    return `<img class="lb-card__bg" src="${poster.fallback}" alt="" aria-hidden="true" decoding="async" />`;
  }

  // The wrapper is not decoration: core/base.css rounds .lb-card__bg with
  // `border-radius: inherit`, and inherit takes the PARENT's value — so wrapping the
  // poster in a bare <picture> would silently resolve that to 0. The card hides
  // square corners on every state except the active one, which is `overflow: visible`
  // to let its halo out, so there the poster corners poke out past the rounded rim.
  // .lb-card__bg-frame carries the radius on, and clips as well.
  const posterImg = `<picture class="lb-card__bg-frame">
        <source type="image/avif" srcset="${poster.avif}" sizes="${BG_SIZES}" />
        <source type="image/webp" srcset="${poster.webp}" sizes="${BG_SIZES}" />
        <img class="lb-card__bg" src="${poster.fallback}" alt="" aria-hidden="true" decoding="async" />
      </picture>`;

  if (!anim) return posterImg;

  return `${posterImg}
      <span class="lb-card__bg-anim" data-lb-bg-anim aria-hidden="true">
        <picture class="lb-card__anim">
          <source type="image/avif" data-srcset="${anim.avif}" sizes="${BG_SIZES}" />
          <source type="image/webp" data-srcset="${anim.webp}" sizes="${BG_SIZES}" />
          <img class="lb-card__anim-img" data-srcset="${anim.webp}" data-src="${anim.fallback}"
               sizes="${BG_SIZES}" alt="" aria-hidden="true" decoding="async" loading="lazy" />
        </picture>
      </span>`;
}

/**
 * @param {object} card
 * @param {{ active?: boolean, pinnedActive?: boolean, spotlight?: boolean }} [ctx]
 *   `spotlight` comes from the core (see `backgroundFor`). It defaults to false,
 *   which is right for the two callers in open.js: the reveal renders a
 *   prize/prediction and the burn renders a missed day, so neither is ever the
 *   next-up locked card.
 * @returns {string}
 */
export function renderInner(
  card,
  { active = isActive(card), pinnedActive = false, spotlight = false } = {},
) {
  const background = backgroundFor(card, active, pinnedActive, spotlight);
  const object = objectFor(card, active);
  // CTA on today's opened result, only while the parent sends non-empty `cta`.
  const cta = hasCta(card) ? `<span class="lb-card__cta">${escapeHtml(card.cta)}</span>` : '';

  return `
    ${renderBackground(background)}
    <div class="lb-card__content">
      <span class="lb-card__object-wrap">
        <img class="lb-card__object" src="${object}" alt="" aria-hidden="true" decoding="async" />
      </span>
      ${renderText(card)}
      ${cta}
    </div>
    ${renderBadges(card, statusTextFor(card), { timerTo: deadlineFor(card) })}
  `;
}

/** Extra state class: a past result draws its object at the smaller history size,
 * and `lb-card--prize`/`--prediction` alone cannot say "this one is history" in
 * CSS — the same two classes also cover today's opened card. */
export function cardClasses(card, { active } = {}) {
  return OPENED_RESULT_STATES.includes(card.state) && !active ? ['lb-card--history'] : [];
}

/** Hands the card to the animation gate, which decides whether its portal loop is
 * allowed to load at all (see bg-anim.js). Cards without a loop are ignored there. */
export function onCardMounted(el) {
  observeBgAnim(el);
}
