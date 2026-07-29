// Brand-agnostic widget runtime.
//
// Wires together: query-param parsing -> content store -> rendering
// (skeleton/cards/carousel) -> postMessage protocol (in both directions) ->
// resize reporting -> countdown badges. See /INTEGRATION.md for the full
// protocol reference.
//
// Everything here is identical for every brand. A brand supplies artwork,
// markup and animations through the object described by the `Brand` typedef
// below; it never reaches into this file.

import { MESSAGE_TYPES, DEFAULT_SKELETON_COUNT, CARD_STATE } from './protocol.js';
import { parseWidgetParams } from './params.js';
import { createMessageBus } from './message-bus.js';
import { createContentStore } from './content-store.js';
import { renderSkeleton, clearSkeleton } from './skeleton.js';
import { createCardElement } from './card.js';
import { initCarousel } from './carousel.js';
import { observeResize } from './resize.js';
import { startCountdowns } from './countdown.js';
import { measureCards, playFlip } from './transitions.js';

/**
 * @typedef {object} Brand
 * @property {string} id
 * @property {{ valid: readonly string[], default: string, aliases?: Record<string, string> }} prize
 * @property {{ mark: string, markWidth?: number, markHeight?: number, count?: number }} skeleton
 * @property {(card: object, ctx: { active: boolean, spotlight: boolean }) => string} renderInner
 * @property {(card: object, ctx: { active: boolean, spotlight: boolean }) => string[]} [cardClasses]
 * @property {(el: HTMLElement, card: object, ctx: object) => void} [onCardMounted]
 * @property {(el: HTMLElement) => void} startOpenCharge
 * @property {(el: HTMLElement, card: object, handlers: { onComplete?: () => void }) => void} playOpenReveal
 * @property {(el: HTMLElement, card: object) => Promise<void>} [playMissedBurn]
 * @property {readonly string[]} [revealStates] states whose arrival finishes an
 *   in-flight open; defaults to prize + prediction
 */

const IMAGES_READY_TIMEOUT_MS = 4000;

/** Resolves once every eager (non-lazy) <img> in `container` has loaded or
 * errored, or after `timeoutMs` as a safety net. Lazy images (animated art that
 * crossfades in later) are intentionally excluded. */
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
 * Only this card animates; -1 if none. */
function findSpotlightLockedIndex(cards) {
  for (let i = 0; i < cards.length; i += 1) {
    if (cards[i].state !== CARD_STATE.LOCKED) continue;
    const prev = cards[i - 1];
    if (prev && prev.state !== CARD_STATE.LOCKED) return i;
  }
  return -1;
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
      subtitle: raw.subtitle ?? existing?.subtitle ?? '',
      cta: raw.cta ?? existing?.cta ?? '',
      tag: raw.tag ?? existing?.tag ?? '',
      prizeType: raw.prizeType ?? existing?.prizeType ?? '',
      active: raw.active ?? existing?.active ?? false,
      timer: raw.timer ?? existing?.timer ?? '',
      timerTo: raw.timerTo ?? existing?.timerTo ?? 0,
    };
  });
}

/**
 * Boots the widget for one brand.
 *
 * @param {Brand} brand
 */
export function createWidget(brand) {
  const rootEl = document.querySelector('[data-lb-root]');
  const carouselEl = document.querySelector('[data-lb-carousel]');
  const trackEl = document.querySelector('[data-lb-track]');

  const initialParams = parseWidgetParams();

  const bus = createMessageBus({
    allowedOrigin: initialParams.origin,
    debug: initialParams.debug,
  });

  const store = createContentStore({ cards: initialParams.cards });

  const revealStates = brand.revealStates ?? [CARD_STATE.PRIZE, CARD_STATE.PREDICTION];
  const skeletonCount = brand.skeleton.count ?? DEFAULT_SKELETON_COUNT;

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
  // Suppresses the store-subscribed auto-render for the one update that hands off
  // to the reveal, so the charging element survives to be animated over
  // (otherwise updateCard's emit would rebuild the card to its final art early,
  // exposing the result before the animation hides it).
  let suppressRender = false;
  // The row as it is currently mounted, so the next render can diff against it
  // and decide whether an update deserves a transition instead of a hard swap.
  let mountedCards = [];
  // A row transition (missed-day burn + reshuffle) is playing; further renders
  // wait for it rather than cutting it short.
  let isTransitioning = false;

  function buildCards(cards) {
    const spotlightIndex = findSpotlightLockedIndex(cards);
    const fragment = document.createDocumentFragment();
    cards.forEach((card, i) => {
      fragment.appendChild(
        createCardElement(card, {
          brand,
          onCardClick: handleCardClick,
          spotlightLocked: i === spotlightIndex,
        }),
      );
    });
    return fragment;
  }

  function mountCards(fragment, cards) {
    clearSkeleton(trackEl);
    trackEl.innerHTML = '';
    trackEl.appendChild(fragment);
    mountedCards = cards;
    disposeCarousel();
    disposeCarousel = initCarousel(carouselEl);
    countdowns.refresh();
  }

  function mountSkeleton(cards) {
    renderSkeleton(trackEl, Math.max(cards.length, skeletonCount), brand.skeleton);
    mountedCards = [];
    disposeCarousel();
    disposeCarousel = initCarousel(carouselEl);
  }

  /**
   * The card that just burned out: it was the open-ready card on screen and the
   * parent now reports it as missed. Only the most recent one is animated even
   * if several days were skipped, because only one card can be "the day the
   * player was looking at".
   */
  function findBurnedCard(nextCards) {
    if (!brand.playMissedBurn) return null;
    for (const next of nextCards) {
      if (next.state !== CARD_STATE.MISSED) continue;
      const before = mountedCards.find((card) => String(card.id) === String(next.id));
      if (before && before.state === CARD_STATE.AVAILABLE) return next;
    }
    return null;
  }

  /**
   * Missed-day transition. No new message type: the parent just sends the new
   * row via `setContent`, and the diff above decides this is a burn-out.
   *
   * 1. the still-mounted active card fades its neon and swaps to the lost-prize
   *    art (brand-specific), while the row geometry is untouched
   * 2. FIRST geometry is measured with that card still at its active size
   * 3. the new row is mounted (card is now 288px in its history slot, the next
   *    day has grown into the active slot)
   * 4. FLIP replays 2 -> 3 as motion
   */
  async function renderBurnTransition(burned, cards) {
    isTransitioning = true;
    try {
      const el = findCardElement(burned);
      if (el) await brand.playMissedBurn(el, burned);

      const firstRects = measureCards(trackEl);
      mountCards(buildCards(cards), cards);
      await playFlip(trackEl, firstRects);

      bus.postToParent(MESSAGE_TYPES.ANIMATION_COMPLETE, {
        index: burned.index,
        id: burned.id,
        state: burned.state,
      });
    } finally {
      isTransitioning = false;
    }
  }

  function render() {
    if (suppressRender || isTransitioning) return;

    const state = store.get();

    if (isLoading) {
      hasRevealedContent = false;
      revealToken += 1;
      mountSkeleton(state.cards);
      return;
    }

    // First reveal: keep the skeleton on screen until the cards' eager images
    // (backgrounds, posters, objects, glow) have loaded. Detached <img> still
    // download, so we can measure readiness before swapping the DOM.
    if (!hasRevealedContent) {
      const fragment = buildCards(state.cards);
      mountSkeleton(state.cards);

      const myToken = (revealToken += 1);
      const holder = document.createElement('div');
      holder.appendChild(fragment);
      whenImagesReady(holder, IMAGES_READY_TIMEOUT_MS).then(() => {
        if (myToken !== revealToken) return; // superseded by a newer render
        hasRevealedContent = true;
        const mountFragment = document.createDocumentFragment();
        while (holder.firstChild) mountFragment.appendChild(holder.firstChild);
        mountCards(mountFragment, state.cards);
      });
      return;
    }

    const burned = findBurnedCard(state.cards);
    if (burned) {
      void renderBurnTransition(burned, state.cards);
      return;
    }

    mountCards(buildCards(state.cards), state.cards);
  }

  function findCardElement(card) {
    return trackEl.querySelector(`[data-id="${CSS.escape(String(card.id))}"]`);
  }

  // Card ids whose open sequence is mid-flight: they have started Phase 1 and
  // are waiting for the backend result (setCardState) that triggers Phase 2.
  const openingCards = new Set();

  /** Runs Phase 2 (reveal) on a charging card, then notifies the parent and
   * settles the card to its final static render. */
  function revealOpenResult(card) {
    const el = findCardElement(card);
    if (!el) {
      render();
      return;
    }
    brand.playOpenReveal(el, card, {
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
    // Available: start Phase 1. The parent should now request its API; Phase 2
    // fires when its setCardState result arrives. Prize re-clicks only notify
    // the parent (reopen popup, no animation).
    if (card.state === CARD_STATE.AVAILABLE) {
      const el = findCardElement(card);
      if (el) {
        openingCards.add(String(card.id));
        brand.startOpenCharge(el);
      }
    }
  }

  const countdowns = startCountdowns({
    root: trackEl,
    onEnd: ({ index, id }) => {
      bus.postToParent(MESSAGE_TYPES.TIMER_END, { index, id });
    },
  });

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
    // can suppress the auto-render and keep the charging element for the reveal.
    const existing = store.findCard(matcher);
    const willReveal = Boolean(
      existing && openingCards.has(String(existing.id)) && revealStates.includes(payload.state),
    );

    suppressRender = willReveal;
    const updated = store.updateCard(matcher, {
      state: payload.state,
      title: payload.title,
      subtitle: payload.subtitle,
      cta: payload.cta,
      tag: payload.tag,
      date: payload.date,
      prizeType: payload.prizeType,
      active: payload.active,
      timer: payload.timer,
      timerTo: payload.timerTo,
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
  // reveal outcome. Runs a short charge, then the reveal (mirrors the real flow).
  bus.on(MESSAGE_TYPES.PLAY_OPEN, (payload) => {
    if (!payload) return;
    const matcher = payload.id !== undefined ? { id: payload.id } : { index: payload.index };
    const card = store.findCard(matcher);
    if (!card) return;
    const el = findCardElement(card);
    if (!el) return;

    brand.startOpenCharge(el);
    const revealState = revealStates.includes(payload.state) ? payload.state : CARD_STATE.PRIZE;
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
    window.__lootboxWidget = { brand: brand.id, store, bus, origin: originInfo, strict: bus.isStrict };
    // eslint-disable-next-line no-console
    console.info(`[${brand.id}-lootboxes-widget] debug mode — window.__lootboxWidget exposed`, {
      origin: originInfo,
      strict: bus.isStrict,
      content: store.get(),
    });
  }

  return { store, bus };
}
