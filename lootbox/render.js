// Vegas card composition: a layered raster stack (background, glow, object,
// title, badges). Sizing and positioning live in theme.css via per-state
// --lb-obj-w / --lb-obj-shift knobs; this file only decides which art goes where.

import { CARD_STATE, OPENED_RESULT_STATES } from '../core/protocol.js';
import {
  escapeHtml,
  isActive,
  hasCta,
  prizeTypeOf,
  statusTextFor,
  renderBadges,
} from '../core/card-model.js';
import { BACKGROUNDS, LIGHTS, OBJECTS, PRIZE_ART, MISSED_ART, ANIMATIONS } from './icons.js';
import { CHAIN_STATES, PRIZE, DEFAULT_TITLES } from './vocabulary.js';

function backgroundFor(card, active) {
  switch (card.state) {
    case CARD_STATE.AVAILABLE:
      return BACKGROUNDS.available;
    case CARD_STATE.LOCKED:
      return BACKGROUNDS.locked;
    case CARD_STATE.MISSED:
      return BACKGROUNDS.missed;
    case CARD_STATE.PRIZE:
      return active ? BACKGROUNDS.prizeActive : BACKGROUNDS.prizePrevious;
    default: // prediction
      return active ? BACKGROUNDS.predictionActive : BACKGROUNDS.predictionPrevious;
  }
}

/** Central object art src. Sizing lives in CSS (--lb-obj-w per card state).
 * @returns {string} */
function objectFor(card, active) {
  switch (card.state) {
    case CARD_STATE.AVAILABLE:
      return OBJECTS.available;
    case CARD_STATE.LOCKED:
      return OBJECTS.locked;
    case CARD_STATE.PRIZE:
      return PRIZE_ART[prizeTypeOf(card, PRIZE)];
    case CARD_STATE.MISSED:
      return MISSED_ART[prizeTypeOf(card, PRIZE)];
    default: // prediction
      // Active (today's) prediction loops the animated ball SVG; a previous-day
      // prediction in history freezes to the static poster PNG.
      return active ? ANIMATIONS.predictionBall : OBJECTS.prediction;
  }
}

/**
 * Chooses the glow layer. Available / today's prize get the animated rotating
 * rays; a LOCKED card gets the rotating rays ONLY when it is the "next up" card
 * (the one immediately following the active/opened/missed card, flagged via
 * `spotlight`). Every other locked card — and all history results — get the
 * static PNG glow (no rotation).
 * @param {boolean} [spotlight] this locked card is the next-to-open one
 * @returns {{ src: string, className: string }}
 */
function lightFor(card, active, spotlight = false) {
  const isAvailable = card.state === CARD_STATE.AVAILABLE;
  // Today's opened result (prize OR prediction) stays "alive" with the animated
  // rotating rays, like the available card; history results freeze to the static
  // PNG. The active result reuses the same ready rays for visual consistency
  // ("today = alive").
  const isActiveResult = OPENED_RESULT_STATES.includes(card.state) && active;

  if (isAvailable || isActiveResult) {
    return {
      src: ANIMATIONS.glowReady,
      className: 'lb-card__light lb-card__light--ready',
    };
  }
  if (card.state === CARD_STATE.LOCKED && spotlight) {
    return {
      src: ANIMATIONS.glowLocked,
      className: 'lb-card__light lb-card__light--locked',
    };
  }
  return {
    src: LIGHTS.other,
    className: 'lb-card__light',
  };
}

/** Available card: the spinning disco ball (animated AVIF/WebP) layered over
 * its static PNG poster for progressive loading (poster shows instantly, the
 * animation crossfades in once decoded). */
function renderDiscoObject() {
  const d = ANIMATIONS.discoBall;
  return `
    <span class="lb-card__object lb-card__object--disco" data-lb-disco>
      <img class="lb-card__poster" src="${d.poster}" alt="" aria-hidden="true" decoding="async" />
      <picture class="lb-card__anim">
        <source type="image/avif" srcset="${d.avif} 1x, ${d.avif2x} 2x" />
        <source type="image/webp" srcset="${d.webp} 1x, ${d.webp2x} 2x" />
        <img src="${d.webp}" alt="" aria-hidden="true" decoding="async" loading="lazy" data-lb-anim-img />
      </picture>
    </span>`;
}

function renderLightImg(light) {
  return `<img class="${light.className}" src="${light.src}" alt="" aria-hidden="true" decoding="async" />`;
}

function isStaticHistoryGlow(light) {
  return light.className === 'lb-card__light';
}

/** The static history glow (other.webp) is card-anchored (separate .lb-card__glow)
 * ONLY for chain cards: their object-wrap is a variable-height ball-box, so
 * centering the glow on it would misalign cards. Non-chain cards render the glow
 * INSIDE the wrap so it rides along with any vertical --lb-obj-shift on the object. */
function isDecoupledGlow(card, light) {
  return isStaticHistoryGlow(light) && CHAIN_STATES.includes(card.state);
}

function renderStaticGlow(card, light) {
  if (!isDecoupledGlow(card, light)) return '';
  return `<span class="lb-card__glow" aria-hidden="true">${renderLightImg(light)}</span>`;
}

function renderObjectWrap(card, active, light) {
  const lightImg = renderLightImg(light);
  const inlineGlow = isDecoupledGlow(card, light) ? '' : lightImg;

  if (card.state === CARD_STATE.AVAILABLE) {
    return `<span class="lb-card__object-wrap">${inlineGlow}${renderDiscoObject()}</span>`;
  }

  const objectSrc = objectFor(card, active);
  return `
    <span class="lb-card__object-wrap">
      ${inlineGlow}
      <img class="lb-card__object" src="${objectSrc}" alt="" aria-hidden="true" decoding="async" />
    </span>`;
}

/**
 * @param {object} card
 * @param {{ active?: boolean, spotlight?: boolean }} [ctx]
 * @returns {string}
 */
export function renderInner(card, { active = isActive(card), spotlight = false } = {}) {
  const light = lightFor(card, active, spotlight);
  const background = backgroundFor(card, active);
  const title = escapeHtml(card.title || DEFAULT_TITLES[card.state] || '');
  const titleHtml = title ? `<p class="lb-card__title">${title}</p>` : '';
  // CTA on today's opened result (prize OR prediction, `active`), only while the
  // parent sends non-empty `cta`. Full-width button pinned to the card bottom.
  const cta = hasCta(card) ? `<span class="lb-card__cta">${escapeHtml(card.cta)}</span>` : '';
  // Click hint (tapping hand) only on the available card, as an idle nudge.
  const hand =
    card.state === CARD_STATE.AVAILABLE
      ? `<img class="lb-card__hand" src="${ANIMATIONS.hand}" alt="" aria-hidden="true" decoding="async" data-lb-hand />`
      : '';

  return `
    <img class="lb-card__bg" src="${background}" alt="" aria-hidden="true" decoding="async" />
    <div class="lb-card__content">
      ${renderStaticGlow(card, light)}
      ${renderObjectWrap(card, active, light)}
      ${titleHtml}
      ${cta}
    </div>
    ${hand}
    ${renderBadges(card, statusTextFor(card, active))}
  `;
}

/** Extra state class: cards whose object is a hanging disco ball on a chain need
 * top-aligned content so the chain reaches the top edge. */
export function cardClasses(card) {
  return CHAIN_STATES.includes(card.state) ? ['lb-card--chain'] : [];
}

export function onCardMounted(el, card) {
  if (card.state === CARD_STATE.AVAILABLE) activateDiscoBall(el);
}

/** Progressive loading: reveal the animated disco ball once it has decoded,
 * crossfading it over the static poster. */
export function activateDiscoBall(el) {
  const disco = el.querySelector('[data-lb-disco]');
  const animImg = disco?.querySelector('[data-lb-anim-img]');
  if (!disco || !animImg) return;

  const reveal = () => disco.classList.add('is-anim-loaded');
  if (animImg.complete && animImg.naturalWidth > 0) {
    reveal();
  } else {
    animImg.addEventListener('load', reveal, { once: true });
  }
}
