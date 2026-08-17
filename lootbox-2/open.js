// Thor open sequence: wobble the card while the backend answers, then turn it
// over to reveal the prize. Also the missed-day burn-out, which is the same idea
// in reverse — the card loses its neon before the row reshuffles.
//
// Timings live in open-animation.js; the CSS side is in theme.css.

import { isActive, prizeTypeOf } from '../core/card-model.js';
import { prefersReducedMotion } from '../core/transitions.js';
import { warmAssets, waitForImageElement } from '../core/asset-preload.js';
import { OBJECTS_LG, MISSED_ART, BACKGROUNDS } from './icons.js';
import { PRIZE } from './vocabulary.js';
import { renderInner, cardClasses } from './render.js';
import { observeBgAnim } from './bg-anim.js';
import { OPEN_ANIMATION, BURN_ANIMATION } from './open-animation.js';

/** Every 128px object the reveal could land on. Warmed during Phase 1 so the
 * swap at the edge-on moment paints a decoded image instead of a blank box.
 *
 * Backgrounds are not in here on purpose: a revealed card keeps the portal it is
 * already showing (`backgroundFor` in render.js returns `available` for an active
 * result), so the reveal re-uses a raster that is already on screen. The burn is
 * the one swap that changes the background — see `stageFace`.
 *
 * And the animated portal must never be added here either: `warmAssets` does
 * `new Image().src = url` with no `srcset`/`sizes`, so it can only warm one
 * arbitrary density — a second download of the wrong file. The reveal already
 * re-uses whatever candidate the pre-click card selected (same `sizes`, same DPR,
 * same URL, so a memory-cache hit). */
const REVEAL_ASSET_URLS = Object.freeze(Object.values(OBJECTS_LG));

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Phase 1 — CHARGE. Called on `cardClick` for an available card. The card starts
 * a wobble loop that masks backend latency; it keeps looping until
 * `playOpenReveal` is called with the result.
 * @param {HTMLElement} el
 */
export function startOpenCharge(el) {
  el.classList.add('lb-card--opening', 'lb-card--charging');
  warmAssets(REVEAL_ASSET_URLS);
}

/**
 * Phase 2 — FLIP REVEAL. Called when `setCardState` brings the backend result.
 *
 * @param {HTMLElement} el the card element currently charging
 * @param {object} card the final card data
 * @param {{ onComplete?: () => void }} [handlers]
 */
export function playOpenReveal(el, card, { onComplete } = {}) {
  void runPlayOpenReveal(el, card, { onComplete });
}

/** Puts the card into its revealed state, keeping the open-sequence classes so
 * the animation that is mid-flight is not interrupted. The runtime re-renders the
 * row from scratch on `onComplete`, so this only has to be right for the duration
 * of the animation.
 *
 * @param {HTMLElement} el
 * @param {object} card
 * @param {string[]} extraClasses
 * @param {HTMLElement} [staged] a face built by `stageFace`; without it the
 *   markup is rendered straight into the card.
 */
function swapToResult(el, card, extraClasses, staged) {
  const active = isActive(card);
  if (staged) el.replaceChildren(...staged.childNodes);
  else el.innerHTML = renderInner(card, { active });
  el.className = [
    'lb-card',
    `lb-card--${card.state}`,
    ...(active ? ['lb-card--active'] : []),
    ...cardClasses(card, { active }),
    ...extraClasses,
  ].join(' ');
  el.dataset.state = card.state;
  // This function is the single funnel for both the flip reveal and the burn
  // settle, and neither goes through `core/card.js` — so without this call the
  // freshly built portal layer would never be handed to the gate, and a revealed
  // card would stay static for good. A no-op on the burn, whose missed face has no
  // animated background at all.
  observeBgAnim(el);
}

/**
 * Builds a card's face off-screen and resolves once its background raster is
 * painted, so the swap moves an image that is already complete onto the card
 * rather than one that still has to fetch.
 *
 * Why the background specifically, and why the element rather than the URL:
 *
 * This only ever stages a `missed` face, which is one of the three legacy rasters
 * that still carry their neon rim in the artwork (see BACKGROUNDS in icons.js) —
 * and that raster is the one layer a swap does not fade in, because
 * `lb-b2-face-in` covers `.lb-card__content`, not `.lb-card__bg`. So a background
 * that is still loading is not a late portal, it is a card with no rim on any side,
 * sitting on the flat `--lb-card-bg`, in full view. Everything inside the content
 * wrapper can arrive a frame late without being seen, which is what `warmAssets` is
 * enough for.
 *
 * Because the staged face is always a legacy state, it is also always the plain
 * single-source `<img>` markup — no `srcset`, no animation layer — so the wait below
 * stays a wait on one known URL.
 *
 * And the guarantee has to be about this element: preloading the URL only promises
 * that the resource was fetched once, while the `<img>` the swap creates does its
 * own load and can miss the cache. Waiting on the staged element instead is what
 * makes the two the same thing — a detached `<img>` loads exactly like an attached
 * one, and reparenting a complete image does not restart it.
 *
 * @param {object} card
 * @param {number} capMs give up waiting after this, measured from the call
 * @param {{ pinnedActive?: boolean }} [ctx] forwarded to renderInner
 * @returns {Promise<HTMLElement>}
 */
async function stageFace(card, capMs, { pinnedActive = false } = {}) {
  const staged = document.createElement('div');
  staged.innerHTML = renderInner(card, { active: isActive(card), pinnedActive });

  const bg = staged.querySelector('.lb-card__bg');
  if (bg) await waitForImageElement(bg, capMs);

  return staged;
}

async function runPlayOpenReveal(el, card, { onComplete } = {}) {
  el.classList.remove('lb-card--charging');

  if (prefersReducedMotion()) {
    swapToResult(el, card, []);
    onComplete?.();
    return;
  }

  // The old face turns away first, so the swap happens while the card is edge-on
  // and neither the question mark nor the prize is legible.
  el.classList.add('lb-card--revealing', 'lb-card--edge-out');
  await wait(OPEN_ANIMATION.EDGE_ON_MS);

  swapToResult(el, card, ['lb-card--opening', 'lb-card--revealing', 'lb-card--edge-in']);
  await wait(OPEN_ANIMATION.COMPLETE_AT_MS - OPEN_ANIMATION.EDGE_ON_MS);

  el.classList.remove('lb-card--opening', 'lb-card--revealing', 'lb-card--edge-in');
  onComplete?.();
}

/**
 * Missed-day burn-out. Two beats (see BURN_ANIMATION and the matching CSS
 * block), then the runtime collapses the row.
 *
 * Runs while the card still has its active 208x320 box, so the runtime can
 * measure that geometry as the FLIP starting point. That is also why the box is
 * pinned in pixels here: the state classes below drop `lb-card--active`, and
 * with it the 208/320 aspect-ratio, which would otherwise resize the card a beat
 * early and split the collapse into two separate jumps.
 *
 * @param {HTMLElement} el
 * @param {object} card the card as the parent now reports it (state: missed)
 * @returns {Promise<void>}
 */
export async function playMissedBurn(el, card) {
  if (prefersReducedMotion()) return;

  // The drain doubles as the loading window for the face it hands over to: the
  // burnt face starts building before the first frame of the drain, and the swap
  // waits on both. Normally the face wins and the drain's own duration is what
  // decides; when it does not, the drain simply holds its end state, which is a
  // dark card rather than a rim-less one.
  //
  // `pinnedActive` because the box below is held at 208x320 until the collapse
  // runs: the burnt portal has to be the one drawn for that taller box, or the
  // rim it carries is stretched for the whole move (see icons.js).
  const face = stageFace(card, BURN_ANIMATION.FACE_READY_CAP_MS, { pinnedActive: true });
  // The history-sized portal is what the runtime re-renders into once the
  // collapse has finished, so it is warmed here rather than fetched at that swap.
  // `.poster` because BACKGROUNDS entries are descriptors now, not bare URLs —
  // passing the object would have `warmAssets` fetch "[object Object]", and it
  // swallows its own errors, so the only symptom would be a slower final swap.
  warmAssets([MISSED_ART[prizeTypeOf(card, PRIZE)], BACKGROUNDS.missed.poster.fallback]);

  el.classList.add('lb-card--burning');
  const [staged] = await Promise.all([face, wait(BURN_ANIMATION.DRAIN_MS)]);

  // The face is at opacity 0 by now, so everything the swap changes — art, copy,
  // badge row, per-state paddings — changes out of sight.
  el.style.height = `${el.getBoundingClientRect().height}px`;
  swapToResult(el, card, ['lb-card--burnt-in'], staged);

  await wait(BURN_ANIMATION.SETTLE_MS);
}
