// Renders a single card as a layered raster composition (background, glow,
// object, title, badges) and plays the draft open transition before
// ANIMATION_COMPLETE is sent.

import {
  CARD_STATE,
  OPENED_RESULT_STATES,
  CHAIN_STATES,
  VALID_PRIZE_TYPES,
  DEFAULT_PRIZE_TYPE,
  OPEN_ANIMATION,
} from './constants.js';
import { BACKGROUNDS, LIGHTS, OBJECTS, PRIZE_ART, MISSED_ART, ANIMATIONS, ANIMATION_SIZES } from './icons.js';
import {
  warmOpenRevealAssets,
  ensurePreloaded,
  waitForImageElement,
} from './asset-preload.js';

const DEFAULT_TITLES = {
  [CARD_STATE.AVAILABLE]: "Click & see\nwhat's inside",
  [CARD_STATE.LOCKED]: 'Locked',
  [CARD_STATE.PREDICTION]: 'Something is waiting for you in the future',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Available is always the active/today card; opened results are active only
 * when the parent explicitly flags them as the current day. */
function isActive(card) {
  if (card.state === CARD_STATE.AVAILABLE) return true;
  return OPENED_RESULT_STATES.includes(card.state) && card.active === true;
}

/** `available` always; today's opened result (prize OR prediction) only while
 * the parent still sends a CTA (re-click reopens the win/prediction popup). */
function isClickable(card) {
  if (card.state === CARD_STATE.AVAILABLE) return true;
  return (
    OPENED_RESULT_STATES.includes(card.state) && isActive(card) && Boolean(card.cta)
  );
}

function prizeTypeOf(card) {
  return VALID_PRIZE_TYPES.includes(card.prizeType)
    ? card.prizeType
    : DEFAULT_PRIZE_TYPE;
}

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
      return PRIZE_ART[prizeTypeOf(card)];
    case CARD_STATE.MISSED:
      return MISSED_ART[prizeTypeOf(card)];
    default: // prediction
      // Active (today's) prediction loops the animated ball SVG; a previous-day
      // prediction in history freezes to the static poster PNG.
      return active ? ANIMATIONS.predictionBall : OBJECTS.prediction;
  }
}

function statusTextFor(card, active) {
  if (card.state === CARD_STATE.MISSED) return card.tag || 'Not opened';
  if (!active && OPENED_RESULT_STATES.includes(card.state)) return card.tag || 'Opened';
  return '';
}

function badgeClassFor(kind) {
  // Status badges (Opened / Not opened) share the outline style; the date badge
  // stays filled.
  return kind === 'status'
    ? 'lb-card__badge lb-card__badge--outline'
    : 'lb-card__badge lb-card__badge--filled';
}

function renderBadges(card, active) {
  const dateText = card.date ? escapeHtml(card.date) : '';
  const statusText = escapeHtml(statusTextFor(card, active));

  if (!dateText && !statusText) return '';

  const dateBadge = dateText
    ? `<span class="${badgeClassFor('date')}">${dateText}</span>`
    : '';
  const statusBadge = statusText
    ? `<span class="${badgeClassFor('status')}">${statusText}</span>`
    : '';
  const single = statusText ? '' : ' lb-card__badges--single';

  return `<div class="lb-card__badges${single}">${dateBadge}${statusBadge}</div>`;
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

function renderInner(card, spotlight = false) {
  const active = isActive(card);
  const light = lightFor(card, active, spotlight);
  const background = backgroundFor(card, active);
  const title = escapeHtml(card.title || DEFAULT_TITLES[card.state] || '');
  const titleHtml = title ? `<p class="lb-card__title">${title}</p>` : '';
  // CTA on today's opened result (prize OR prediction, `active`), only while the
  // parent sends non-empty `cta`. Full-width button pinned to the card bottom.
  const cta =
    OPENED_RESULT_STATES.includes(card.state) && isActive(card) && card.cta
      ? `<span class="lb-card__cta">${escapeHtml(card.cta)}</span>`
      : '';
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
    ${renderBadges(card, active)}
  `;
}

/** Progressive loading: reveal the animated disco ball once it has decoded,
 * crossfading it over the static poster. */
function activateDiscoBall(el) {
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

/** SVGator SVGs loaded via <img> share ONE animation timeline per URL, started at
 * first load. Since flash/confetti are one-shot (`iteration 1/5, forwards`), a URL
 * warmed during charge would already be at its end frame (invisible) by reveal.
 * A per-open token gives each reveal a fresh URL → its timeline starts on display. */
function withReplayToken(url, token) {
  return `${url}${url.includes('?') ? '&' : '?'}o=${token}`;
}

/** Decorative motion <img> tuned for reveal-critical loading (no lazy, high priority). */
function createFlashImg(token) {
  const { width, height } = ANIMATION_SIZES.flash;
  const img = document.createElement('img');
  img.className = 'lb-card__flash';
  img.src = withReplayToken(ANIMATIONS.flash, token);
  img.srcset = `${withReplayToken(ANIMATIONS.flash, token)} 1x, ${withReplayToken(ANIMATIONS.flash2x, token)} 2x`;
  img.width = width;
  img.height = height;
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.setAttribute('role', 'presentation');
  img.loading = 'eager';
  img.decoding = 'sync';
  img.draggable = false;
  if ('fetchPriority' in img) img.fetchPriority = 'high';
  return img;
}

/** Confetti burst layers (prize only). Same SVG, different size/position via CSS modifiers. */
const CONFETTI_VARIANTS = ['--1', '--2', '--3'];

function createConfettiImg(variant, token) {
  const { width, height } = ANIMATION_SIZES.confetti;
  const img = document.createElement('img');
  img.className = `lb-card__confetti lb-card__confetti${variant}`;
  img.src = withReplayToken(ANIMATIONS.confetti, token);
  img.width = width;
  img.height = height;
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.setAttribute('role', 'presentation');
  img.loading = 'eager';
  img.decoding = 'async';
  img.draggable = false;
  if ('fetchPriority' in img) img.fetchPriority = 'high';
  return img;
}

/**
 * @param {import('./content-store.js').LootboxCard} card
 * @param {{ onCardClick?: (card: import('./content-store.js').LootboxCard) => void }} [handlers]
 */
export function createCardElement(card, { onCardClick, spotlightLocked = false } = {}) {
  const clickable = isClickable(card);
  const el = document.createElement(clickable ? 'button' : 'div');

  el.className = `lb-card lb-card--${card.state}`;
  if (isActive(card)) el.classList.add('lb-card--active');
  // Cards whose object is a hanging disco ball on a chain: the chain must meet
  // the top edge, so the content is top-aligned instead of vertically centered.
  if (CHAIN_STATES.includes(card.state)) el.classList.add('lb-card--chain');
  // The "next up" locked card: rotating glow + a padlock that nudges as if it
  // were trying to open (see .lb-card--next in widget.css).
  if (spotlightLocked && card.state === CARD_STATE.LOCKED) {
    el.classList.add('lb-card--next');
  }
  el.dataset.index = String(card.index);
  el.dataset.id = String(card.id);
  el.dataset.state = card.state;
  el.setAttribute('role', 'listitem');

  if (clickable) {
    el.type = 'button';
    el.addEventListener('click', () => onCardClick?.(card));
  } else {
    el.classList.add('lb-card--disabled');
    el.setAttribute('aria-disabled', 'true');
  }

  el.innerHTML = renderInner(card, spotlightLocked);
  if (card.state === CARD_STATE.AVAILABLE) activateDiscoBall(el);
  return el;
}

/**
 * Phase 1 — CHARGE. Called on `cardClick` for an available card. The disco ball
 * starts a pulsing "charge" loop that masks backend latency; it keeps looping
 * until `playOpenReveal` is called with the result. No result is known yet.
 * @param {HTMLElement} el
 */
export function startOpenCharge(el) {
  el.classList.add('lb-card--opening', 'lb-card--charging');
  warmOpenRevealAssets();
}

/**
 * Phase 2 — FLASH REVEAL. Called when `setCardState` brings the backend result.
 * A full-card flash covers the card; at its peak the visible content is swapped
 * to the final result *under the white*, so the prize/prediction appears from
 * inside the flash. Confetti bursts only for `prize`. When the flash finishes,
 * `onComplete` fires (widget emits `animationComplete`, then re-renders static).
 *
 * @param {HTMLElement} el   the card element currently charging
 * @param {import('./content-store.js').LootboxCard} card  the final card data
 * @param {{ onComplete?: () => void }} [handlers]
 */
export function playOpenReveal(el, card, { onComplete } = {}) {
  void runPlayOpenReveal(el, card, { onComplete });
}

async function runPlayOpenReveal(el, card, { onComplete } = {}) {
  const isPrize = card.state === CARD_STATE.PRIZE;
  el.classList.remove('lb-card--charging');
  el.classList.add('lb-card--revealing');

  // Fresh timeline token for this open (see withReplayToken).
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  await ensurePreloaded(ANIMATIONS.flash);

  const fx = document.createElement('div');
  fx.className = 'lb-card__open-fx';
  // Prediction (non-prize) reveals use a softer, slightly dimmed flash instead
  // of the full white burst reserved for prizes.
  if (!isPrize) fx.classList.add('lb-card__open-fx--dim');
  fx.setAttribute('aria-hidden', 'true');

  const veil = document.createElement('span');
  veil.className = 'lb-card__flash-veil';
  const flashImg = createFlashImg(token);

  fx.append(veil, flashImg);
  el.appendChild(fx);

  await waitForImageElement(flashImg, OPEN_ANIMATION.FLASH_READY_TIMEOUT_MS);

  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  fx.classList.add('is-active');

  window.setTimeout(() => {
    const holder = document.createElement('div');
    holder.innerHTML = renderInner(card);
    [...el.children].forEach((child) => {
      if (child !== fx) child.remove();
    });
    while (holder.firstChild) el.insertBefore(holder.firstChild, fx);

    const active = isActive(card);
    el.className = `lb-card lb-card--${card.state} lb-card--opening lb-card--revealing`;
    if (active) el.classList.add('lb-card--active');
    if (CHAIN_STATES.includes(card.state)) el.classList.add('lb-card--chain');
    el.dataset.state = card.state;
    if (card.state === CARD_STATE.AVAILABLE) activateDiscoBall(el);
  }, OPEN_ANIMATION.SWAP_AT_MS);

  // Confetti fire later than the swap so their fresh burst is seen AS the white
  // veil clears (~VEIL_MS) instead of already looping hidden underneath it.
  if (isPrize) {
    window.setTimeout(() => {
      void appendConfetti(fx, token).then(() => {
        if (OPEN_ANIMATION.CONFETTI_DEBUG_FREEZE) {
          fx.classList.add('lb-card__open-fx--freeze');
        }
      });
    }, OPEN_ANIMATION.CONFETTI_AT_MS);
  }

  // Prize confetti get their on-screen time (measured from their delayed start)
  // before the overlay bows out; other outcomes settle right after the flash.
  // DEBUG FREEZE: skip fade/removal so confetti stay put for layout tuning.
  if (OPEN_ANIMATION.CONFETTI_DEBUG_FREEZE && isPrize) {
    return;
  }

  // Then the whole overlay fades (no hard DOM cut) and only afterwards do we
  // notify the parent + normalize the card.
  const holdMs = isPrize
    ? OPEN_ANIMATION.CONFETTI_AT_MS + OPEN_ANIMATION.CONFETTI_HOLD_MS
    : OPEN_ANIMATION.COMPLETE_AT_MS;

  window.setTimeout(() => {
    fx.classList.add('is-out');
    window.setTimeout(() => {
      el.classList.remove('lb-card--opening', 'lb-card--revealing');
      fx.remove();
      onComplete?.();
    }, OPEN_ANIMATION.FADE_OUT_MS);
  }, holdMs);
}

async function appendConfetti(fx, token) {
  await ensurePreloaded(ANIMATIONS.confetti);
  const layers = CONFETTI_VARIANTS.map((variant) => createConfettiImg(variant, token));
  await Promise.all(
    layers.map((img) =>
      waitForImageElement(img, OPEN_ANIMATION.FLASH_READY_TIMEOUT_MS),
    ),
  );
  layers.forEach((img) => fx.appendChild(img));
}
