// Vegas open sequence: charge the disco ball, then flash-reveal the result.
// Timings live in open-animation.js; the CSS side is in theme.css.

import { CARD_STATE } from '../core/protocol.js';
import { isActive } from '../core/card-model.js';
import { warmAssets, ensurePreloaded, waitForImageElement } from '../core/asset-preload.js';
import { ANIMATIONS, ANIMATION_SIZES } from './icons.js';
import { CHAIN_STATES } from './vocabulary.js';
import { renderInner, activateDiscoBall } from './render.js';
import { OPEN_ANIMATION } from './open-animation.js';

/** URLs warmed during Phase 1 (charge) before the reveal result is known.
 * predictionBall loops infinitely, so warming it only speeds first paint (no
 * "burned one-shot timeline" issue like flash/confetti). */
const OPEN_REVEAL_ASSET_URLS = Object.freeze([
  ANIMATIONS.flash,
  ANIMATIONS.flash2x,
  ANIMATIONS.confetti,
  ANIMATIONS.predictionBall,
]);

/**
 * Phase 1 — CHARGE. Called on `cardClick` for an available card. The disco ball
 * starts a pulsing "charge" loop that masks backend latency; it keeps looping
 * until `playOpenReveal` is called with the result. No result is known yet.
 * @param {HTMLElement} el
 */
export function startOpenCharge(el) {
  el.classList.add('lb-card--opening', 'lb-card--charging');
  warmAssets(OPEN_REVEAL_ASSET_URLS);
}

/**
 * Phase 2 — FLASH REVEAL. Called when `setCardState` brings the backend result.
 * A full-card flash covers the card; at its peak the visible content is swapped
 * to the final result *under the white*, so the prize/prediction appears from
 * inside the flash. Confetti bursts only for `prize`. When the flash finishes,
 * `onComplete` fires (runtime emits `animationComplete`, then re-renders static).
 *
 * @param {HTMLElement} el   the card element currently charging
 * @param {object} card  the final card data
 * @param {{ onComplete?: () => void }} [handlers]
 */
export function playOpenReveal(el, card, { onComplete } = {}) {
  void runPlayOpenReveal(el, card, { onComplete });
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
    layers.map((img) => waitForImageElement(img, OPEN_ANIMATION.FLASH_READY_TIMEOUT_MS)),
  );
  layers.forEach((img) => fx.appendChild(img));
}
