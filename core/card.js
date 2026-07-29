// Builds the card element shell: tag choice, state classes, data attributes,
// a11y wiring and the click handler. The visual composition inside the card is
// the brand's job (`brand.renderInner`), as is any extra state class
// (`brand.cardClasses`) and post-mount work (`brand.onCardMounted`).

import { CARD_STATE } from './protocol.js';
import { isActive, isClickable } from './card-model.js';

/**
 * @param {import('./content-store.js').LootboxCard} card
 * @param {object} options
 * @param {import('./runtime.js').Brand} options.brand
 * @param {(card: import('./content-store.js').LootboxCard) => void} [options.onCardClick]
 * @param {boolean} [options.spotlightLocked] this is the "next up" locked card
 * @returns {HTMLElement}
 */
export function createCardElement(card, { brand, onCardClick, spotlightLocked = false }) {
  const clickable = isClickable(card);
  const el = document.createElement(clickable ? 'button' : 'div');
  const active = isActive(card);

  el.className = cardClassName(card, { brand, active, spotlightLocked });
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

  el.innerHTML = brand.renderInner(card, { active, spotlight: spotlightLocked });
  brand.onCardMounted?.(el, card, { active, spotlight: spotlightLocked });
  return el;
}

/**
 * State classes in a fixed order: base, state, active, brand extras, next.
 * `lb-card--disabled` is appended later by the caller so it always lands last,
 * matching the markup integrators and snapshot tests already rely on.
 */
export function cardClassName(card, { brand, active, spotlightLocked = false }) {
  const classes = ['lb-card', `lb-card--${card.state}`];
  if (active) classes.push('lb-card--active');
  classes.push(...(brand.cardClasses?.(card, { active, spotlight: spotlightLocked }) ?? []));
  // The "next up" locked card: the only locked card that animates (rotating
  // glow + a padlock straining to open).
  if (spotlightLocked && card.state === CARD_STATE.LOCKED) classes.push('lb-card--next');
  return classes.join(' ');
}
