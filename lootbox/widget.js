// Vegas Lootboxes — Fortune Drops widget bootstrap.
// Wires together: query-param parsing -> content store -> rendering
// (skeleton/cards/carousel) -> postMessage protocol (in both directions) ->
// resize reporting. See /INTEGRATION.md for the full protocol reference.

import { MESSAGE_TYPES, DEFAULT_SKELETON_COUNT, CARD_STATE } from './modules/constants.js';
import { parseWidgetParams } from './modules/params.js';
import { createMessageBus } from './modules/message-bus.js';
import { createContentStore } from './modules/content-store.js';
import { renderSkeleton, clearSkeleton } from './modules/skeleton.js';
import { createCardElement, playOpenAnimation } from './modules/card.js';
import { initCarousel } from './modules/carousel.js';
import { observeResize } from './modules/resize.js';

const rootEl = document.querySelector('[data-lb-root]');
const carouselEl = document.querySelector('[data-lb-carousel]');
const trackEl = document.querySelector('[data-lb-track]');

const initialParams = parseWidgetParams();

const bus = createMessageBus({ allowedOrigin: initialParams.origin });

const store = createContentStore({
  cards: initialParams.cards,
});

// Loading (skeleton) until we have cards from the URL, or the parent tells us
// otherwise via setContent/setLoading. This is the mechanism that covers a
// backend that resolves a few seconds after the page/iframe has loaded.
let isLoading = initialParams.cards.length === 0;
let disposeCarousel = () => {};

function normalizeIncomingCards(rawCards, existingCards) {
  if (!Array.isArray(rawCards)) return existingCards;

  return rawCards.map((raw, position) => {
    const index = Number(raw.index ?? position + 1);
    const existing = existingCards.find((card) => card.index === index);
    return {
      index,
      id: raw.id !== undefined ? String(raw.id) : (existing?.id ?? String(index)),
      state: raw.state ?? existing?.state ?? 'locked',
      date: raw.date ?? existing?.date ?? '',
      title: raw.title ?? existing?.title ?? '',
      cta: raw.cta ?? existing?.cta ?? '',
      tag: raw.tag ?? existing?.tag ?? '',
      prizeType: raw.prizeType ?? existing?.prizeType ?? '',
      active: raw.active ?? existing?.active ?? false,
    };
  });
}

function render() {
  const state = store.get();

  if (isLoading) {
    renderSkeleton(trackEl, Math.max(state.cards.length, DEFAULT_SKELETON_COUNT));
  } else {
    clearSkeleton(trackEl);
    trackEl.innerHTML = '';
    const fragment = document.createDocumentFragment();
    state.cards.forEach((card) => {
      fragment.appendChild(createCardElement(card, { onCardClick: handleCardClick }));
    });
    trackEl.appendChild(fragment);
  }

  disposeCarousel();
  disposeCarousel = initCarousel(carouselEl);
}

function findCardElement(card) {
  return trackEl.querySelector(`[data-id="${CSS.escape(String(card.id))}"]`);
}

function triggerOpenAnimation(card) {
  const el = findCardElement(card);
  if (!el) return;
  playOpenAnimation(el, {
    onComplete: () => {
      bus.postToParent(MESSAGE_TYPES.ANIMATION_COMPLETE, {
        index: card.index,
        id: card.id,
        state: card.state,
      });
    },
  });
}

function handleCardClick(card) {
  bus.postToParent(MESSAGE_TYPES.CARD_CLICK, {
    index: card.index,
    id: card.id,
    state: card.state,
  });
  // Draft open animation only for available; prize re-clicks just notify parent
  // so it can show the win popup again (Figma: claimed card → popup).
  if (card.state === CARD_STATE.AVAILABLE) {
    triggerOpenAnimation(card);
  }
}

// --- Parent -> iFrame handlers -------------------------------------------

bus.on(MESSAGE_TYPES.SET_CONTENT, (payload) => {
  if (!payload) return;
  isLoading = false;
  const current = store.get();
  store.set({
    cards: normalizeIncomingCards(payload.cards, current.cards),
  });
});

bus.on(MESSAGE_TYPES.SET_CARD_STATE, (payload) => {
  if (!payload) return;
  const matcher = payload.id !== undefined ? { id: payload.id } : { index: payload.index };
  const updated = store.updateCard(matcher, {
    state: payload.state,
    title: payload.title,
    cta: payload.cta,
    tag: payload.tag,
    date: payload.date,
    prizeType: payload.prizeType,
    active: payload.active,
  });
  if (updated) isLoading = false;
  render();
});

bus.on(MESSAGE_TYPES.PLAY_OPEN, (payload) => {
  if (!payload) return;
  const matcher = payload.id !== undefined ? { id: payload.id } : { index: payload.index };
  const card = store.findCard(matcher);
  if (card) triggerOpenAnimation(card);
});

bus.on(MESSAGE_TYPES.SET_LOADING, (payload) => {
  isLoading = Boolean(payload?.loading);
  render();
});

// --- Bootstrap -------------------------------------------------------------

store.subscribe(render);
bus.attach();
render();

observeResize(rootEl, (height) => {
  bus.postToParent(MESSAGE_TYPES.RESIZE, { height });
});

bus.postToParent(MESSAGE_TYPES.READY, { count: initialParams.cards.length });

if (initialParams.debug) {
  window.__lootboxWidget = { store, bus };
  // eslint-disable-next-line no-console
  console.info('[vegas-lootboxes-widget] debug mode — window.__lootboxWidget exposed', store.get());
}
