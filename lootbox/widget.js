// Vegas Lootboxes widget bootstrap.
// Wires together: query-param parsing -> content store -> rendering
// (skeleton/cards/carousel) -> postMessage protocol (in both directions) ->
// resize reporting. See /INTEGRATION.md for the full protocol reference.

import { MESSAGE_TYPES, DEFAULT_SKELETON_COUNT, CARD_STATE } from './modules/constants.js';
import { parseWidgetParams } from './modules/params.js';
import { createMessageBus } from './modules/message-bus.js';
import { createContentStore } from './modules/content-store.js';
import { renderSkeleton, clearSkeleton } from './modules/skeleton.js';
import { createCardElement, startOpenCharge, playOpenReveal } from './modules/card.js';
import { initCarousel } from './modules/carousel.js';
import { observeResize } from './modules/resize.js';

const rootEl = document.querySelector('[data-lb-root]');
const carouselEl = document.querySelector('[data-lb-carousel]');
const trackEl = document.querySelector('[data-lb-track]');

const initialParams = parseWidgetParams();

const bus = createMessageBus({
  allowedOrigin: initialParams.origin,
  debug: initialParams.debug,
});

const store = createContentStore({
  cards: initialParams.cards,
});

// Loading (skeleton) until we have cards from the URL, or the parent tells us
// otherwise via setContent/setLoading. This is the mechanism that covers a
// backend that resolves a few seconds after the page/iframe has loaded.
let isLoading = initialParams.cards.length === 0;
let disposeCarousel = () => {};
// Gate the first skeleton -> content swap on eager image loads so the skeleton
// only disappears once the cards' resources are ready. Subsequent updates
// (setCardState on visible cards) swap immediately, without re-gating.
let hasRevealedContent = false;
// Invalidates an in-flight first-reveal wait when a newer render supersedes it
// (e.g. setContent arrives while the initial images are still loading).
let revealToken = 0;
const IMAGES_READY_TIMEOUT_MS = 4000;

/** Resolves once every eager (non-lazy) <img> in `container` has loaded or
 * errored, or after `timeoutMs` as a safety net. Lazy images (the animated
 * disco ball) are intentionally excluded — they crossfade in later. */
function whenImagesReady(container, timeoutMs) {
  const pending = [...container.querySelectorAll('img')].filter(
    (img) => img.getAttribute('loading') !== 'lazy' && !(img.complete && img.naturalWidth > 0),
  );
  if (pending.length === 0) return Promise.resolve();

  return new Promise((resolve) => {
    let remaining = pending.length;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    const onSettled = () => {
      remaining -= 1;
      if (remaining <= 0) finish();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    pending.forEach((img) => {
      img.addEventListener('load', onSettled, { once: true });
      img.addEventListener('error', onSettled, { once: true });
    });
  });
}

/** Index of the "next up" locked card: the first locked card immediately
 * preceded by a resolved one (active / opened / missed — anything but locked).
 * Only this card keeps the rotating glow + padlock nudge; -1 if none. */
function findSpotlightLockedIndex(cards) {
  for (let i = 0; i < cards.length; i += 1) {
    if (cards[i].state !== CARD_STATE.LOCKED) continue;
    const prev = cards[i - 1];
    if (prev && prev.state !== CARD_STATE.LOCKED) return i;
  }
  return -1;
}

function buildCards(cards) {
  const spotlightIndex = findSpotlightLockedIndex(cards);
  const fragment = document.createDocumentFragment();
  cards.forEach((card, i) => {
    fragment.appendChild(
      createCardElement(card, {
        onCardClick: handleCardClick,
        spotlightLocked: i === spotlightIndex,
      }),
    );
  });
  return fragment;
}

function mountCards(fragment) {
  clearSkeleton(trackEl);
  trackEl.innerHTML = '';
  trackEl.appendChild(fragment);
  disposeCarousel();
  disposeCarousel = initCarousel(carouselEl);
}

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

// Suppresses the store-subscribed auto-render for the one update that hands off
// to the flash reveal, so the charging element survives to be flashed over
// (otherwise updateCard's emit would rebuild the card to its final art early,
// exposing the result before the flash hides it).
let suppressRender = false;

function render() {
  if (suppressRender) return;

  const state = store.get();

  if (isLoading) {
    hasRevealedContent = false;
    revealToken += 1;
    renderSkeleton(trackEl, Math.max(state.cards.length, DEFAULT_SKELETON_COUNT));
    disposeCarousel();
    disposeCarousel = initCarousel(carouselEl);
    return;
  }

  const fragment = buildCards(state.cards);

  // First reveal: keep the skeleton on screen until the cards' eager images
  // (backgrounds, posters, objects, glow) have loaded. Detached <img> still
  // download, so we can measure readiness before swapping the DOM.
  if (!hasRevealedContent) {
    renderSkeleton(trackEl, Math.max(state.cards.length, DEFAULT_SKELETON_COUNT));
    disposeCarousel();
    disposeCarousel = initCarousel(carouselEl);

    const myToken = (revealToken += 1);
    const holder = document.createElement('div');
    holder.appendChild(fragment);
    whenImagesReady(holder, IMAGES_READY_TIMEOUT_MS).then(() => {
      if (myToken !== revealToken) return; // superseded by a newer render
      hasRevealedContent = true;
      const mountFragment = document.createDocumentFragment();
      while (holder.firstChild) mountFragment.appendChild(holder.firstChild);
      mountCards(mountFragment);
    });
    return;
  }

  mountCards(fragment);
}

function findCardElement(card) {
  return trackEl.querySelector(`[data-id="${CSS.escape(String(card.id))}"]`);
}

// Card ids whose open sequence is mid-flight: they have started the CHARGE
// (Phase 1) and are waiting for the backend result (setCardState) that triggers
// the FLASH REVEAL (Phase 2). Keyed by string id.
const openingCards = new Set();

/** Runs Phase 2 (flash reveal) on a charging card, then notifies the parent
 * and settles the card to its final static render. */
function revealOpenResult(card) {
  const el = findCardElement(card);
  if (!el) {
    render();
    return;
  }
  playOpenReveal(el, card, {
    onComplete: () => {
      bus.postToParent(MESSAGE_TYPES.ANIMATION_COMPLETE, {
        index: card.index,
        id: card.id,
        state: card.state,
      });
      render(); // normalize to the correct final static DOM
    },
  });
}

function handleCardClick(card) {
  bus.postToParent(MESSAGE_TYPES.CARD_CLICK, {
    index: card.index,
    id: card.id,
    state: card.state,
  });
  // Available: start the CHARGE (Phase 1). The parent should now request its
  // API; the FLASH REVEAL (Phase 2) fires when its setCardState result arrives.
  // Prize re-clicks only notify the parent (reopen popup, no animation).
  if (card.state === CARD_STATE.AVAILABLE) {
    const el = findCardElement(card);
    if (el) {
      openingCards.add(String(card.id));
      startOpenCharge(el);
    }
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

  // Is this result for a card mid-open (charging)? Decide BEFORE updating so we
  // can suppress the auto-render and keep the charging element for the flash.
  const existing = store.findCard(matcher);
  const willReveal = Boolean(
    existing &&
      openingCards.has(String(existing.id)) &&
      (payload.state === CARD_STATE.PRIZE || payload.state === CARD_STATE.PREDICTION),
  );

  suppressRender = willReveal;
  const updated = store.updateCard(matcher, {
    state: payload.state,
    title: payload.title,
    cta: payload.cta,
    tag: payload.tag,
    date: payload.date,
    prizeType: payload.prizeType,
    active: payload.active,
  });
  suppressRender = false;
  if (updated) isLoading = false;

  if (willReveal) {
    openingCards.delete(String(existing.id));
    revealOpenResult(store.findCard(matcher));
    return;
  }

  render();
});

// Sandbox-only: force the open sequence without a real click. `state` picks the
// reveal outcome. Runs a short charge, then the flash reveal (mirrors real flow).
bus.on(MESSAGE_TYPES.PLAY_OPEN, (payload) => {
  if (!payload) return;
  const matcher = payload.id !== undefined ? { id: payload.id } : { index: payload.index };
  const card = store.findCard(matcher);
  if (!card) return;
  const el = findCardElement(card);
  if (!el) return;

  startOpenCharge(el);
  const revealState =
    payload.state === CARD_STATE.PREDICTION ? CARD_STATE.PREDICTION : CARD_STATE.PRIZE;
  window.setTimeout(() => {
    suppressRender = true;
    store.updateCard(matcher, { state: revealState, active: true });
    suppressRender = false;
    const updated = store.findCard(matcher);
    if (updated) revealOpenResult(updated);
  }, 600);
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
  const originInfo = bus.isStrict ? bus.origin : '(permissive *)';
  window.__lootboxWidget = { store, bus, origin: originInfo, strict: bus.isStrict };
  // eslint-disable-next-line no-console
  console.info(
    '[vegas-lootboxes-widget] debug mode — window.__lootboxWidget exposed',
    { origin: originInfo, strict: bus.isStrict, content: store.get() },
  );
}
