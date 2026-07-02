// Renders a single card DOM element for any of the 5 canonical states, and
// plays the draft "open" transition used before the ANIMATION_COMPLETE event
// fires. Deliberately simple/replaceable — final animation is a separate task.

import { CARD_STATE, CLICKABLE_STATES } from './constants.js';
import { ICONS } from './icons.js';

const DEFAULT_TITLES = {
  [CARD_STATE.AVAILABLE]: "See what's inside",
  [CARD_STATE.LOCKED]: 'Locked',
  [CARD_STATE.PRIZE]: 'You won a prize',
  [CARD_STATE.PREDICTION]: 'Something is waiting for you in the future',
  [CARD_STATE.EMPTY]: 'Come back tomorrow',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isClickable(card) {
  return CLICKABLE_STATES.includes(card.state);
}

function renderInner(card) {
  const dateTag = card.date ? `<span class="lb-card__date">${escapeHtml(card.date)}</span>` : '';
  const tag = card.tag ? `<span class="lb-card__tag">${escapeHtml(card.tag)}</span>` : '';
  const title = escapeHtml(card.title || DEFAULT_TITLES[card.state] || '');
  const icon = ICONS[card.state] || ICONS[CARD_STATE.EMPTY];
  const glow = card.state === CARD_STATE.LOCKED || card.state === CARD_STATE.EMPTY ? '' : ' lb-card__visual--glow';
  const cta = card.state === CARD_STATE.PRIZE && card.cta
    ? `<span class="lb-card__cta">${escapeHtml(card.cta)}</span>`
    : '';
  const titleClass = card.state === CARD_STATE.LOCKED || card.state === CARD_STATE.EMPTY
    ? 'lb-card__title lb-card__title--muted'
    : 'lb-card__title';

  return `
    ${dateTag}${tag}
    <div class="lb-card__visual${glow}">
      <div class="lb-card__icon">${icon}</div>
    </div>
    <p class="${titleClass}">${title}</p>
    ${cta}
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
  el.dataset.index = String(card.index);
  el.dataset.id = String(card.id);
  el.dataset.state = card.state;
  el.setAttribute('role', 'listitem');

  if (card.state === CARD_STATE.AVAILABLE) {
    el.classList.add('lb-card--today');
  }

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
