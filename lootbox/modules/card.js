// Renders a single card DOM element for every Figma state, as a layered raster
// composition (background scene + light glow + object + title + badges), and
// plays the draft "open" transition used before ANIMATION_COMPLETE fires.

import {
  CARD_STATE,
  OPENED_RESULT_STATES,
  CHAIN_STATES,
  VALID_PRIZE_TYPES,
  DEFAULT_PRIZE_TYPE,
} from './constants.js';
import { BACKGROUNDS, LIGHTS, OBJECTS, PRIZE_ART, MISSED_ART } from './icons.js';

const DEFAULT_TITLES = {
  [CARD_STATE.AVAILABLE]: "See what's inside",
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

/** `available` always; today's `prize` only while parent still sends a CTA. */
function isClickable(card) {
  if (card.state === CARD_STATE.AVAILABLE) return true;
  return (
    card.state === CARD_STATE.PRIZE && isActive(card) && Boolean(card.cta)
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

/** @returns {{ src: string, size: 'lg' | 'md' }} */
function objectFor(card, active) {
  switch (card.state) {
    case CARD_STATE.AVAILABLE:
      return { src: OBJECTS.available, size: 'lg' };
    case CARD_STATE.LOCKED:
      return { src: OBJECTS.locked, size: 'md' };
    case CARD_STATE.PRIZE:
      return { src: PRIZE_ART[prizeTypeOf(card)], size: 'md' };
    case CARD_STATE.MISSED:
      return { src: MISSED_ART[prizeTypeOf(card)], size: 'md' };
    default: // prediction
      return { src: OBJECTS.prediction, size: active ? 'lg' : 'md' };
  }
}

function statusTextFor(card, active) {
  if (card.state === CARD_STATE.MISSED) return card.tag || 'Missed';
  if (!active && OPENED_RESULT_STATES.includes(card.state)) return card.tag || 'Opened';
  return '';
}

function renderBadges(card, active) {
  const dateText = card.date ? escapeHtml(card.date) : '';
  const statusText = escapeHtml(statusTextFor(card, active));

  if (!dateText && !statusText) return '';

  const dateBadge = dateText ? `<span class="lb-card__badge">${dateText}</span>` : '';
  const statusBadge = statusText ? `<span class="lb-card__badge">${statusText}</span>` : '';
  const single = statusText ? '' : ' lb-card__badges--single';

  return `<div class="lb-card__badges${single}">${dateBadge}${statusBadge}</div>`;
}

function renderInner(card) {
  const active = isActive(card);
  const background = backgroundFor(card, active);
  const isAvailable = card.state === CARD_STATE.AVAILABLE;
  const lightSrc = isAvailable ? LIGHTS.ready : LIGHTS.other;
  const lightClass = isAvailable ? 'lb-card__light lb-card__light--ready' : 'lb-card__light';
  const object = objectFor(card, active);
  const title = escapeHtml(card.title || DEFAULT_TITLES[card.state] || '');
  const titleHtml = title ? `<p class="lb-card__title">${title}</p>` : '';
  // CTA only on today's prize (`active`) and only while parent sends non-empty `cta`.
  const cta =
    card.state === CARD_STATE.PRIZE && isActive(card) && card.cta
      ? `<span class="lb-card__cta">${escapeHtml(card.cta)}</span>`
      : '';

  return `
    <img class="lb-card__bg" src="${background}" alt="" aria-hidden="true" decoding="async" />
    <div class="lb-card__content">
      <span class="lb-card__object-wrap">
        <img class="${lightClass}" src="${lightSrc}" alt="" aria-hidden="true" decoding="async" />
        <img class="lb-card__object lb-card__object--${object.size}" src="${object.src}" alt="" aria-hidden="true" decoding="async" />
      </span>
      ${titleHtml}
      ${cta}
    </div>
    ${renderBadges(card, active)}
  `;
}

/**
 * @param {import('./content-store.js').LootboxCard} card
 * @param {{ onCardClick?: (card: import('./content-store.js').LootboxCard) => void }} [handlers]
 */
export function createCardElement(card, { onCardClick } = {}) {
  const clickable = isClickable(card);
  const el = document.createElement(clickable ? 'button' : 'div');

  el.className = `lb-card lb-card--${card.state}`;
  if (isActive(card)) el.classList.add('lb-card--active');
  // Cards whose object is a hanging disco ball on a chain: the chain must meet
  // the top edge, so the content is top-aligned instead of vertically centered.
  if (CHAIN_STATES.includes(card.state)) el.classList.add('lb-card--chain');
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

  el.innerHTML = renderInner(card);
  return el;
}

/**
 * Plays a short, replaceable "open" transition and invokes onComplete once done.
 * @param {HTMLElement} el
 * @param {{ onComplete?: () => void }} [handlers]
 */
export function playOpenAnimation(el, { onComplete } = {}) {
  const ANIMATION_DURATION_MS = 600;
  el.classList.add('lb-card--opening');

  window.setTimeout(() => {
    el.classList.remove('lb-card--opening');
    onComplete?.();
  }, ANIMATION_DURATION_MS);
}
