// Decides when a card's animated portal is allowed to load, and when it must let
// go again. Brand-local: the core knows nothing about it beyond calling
// `onCardMounted`.
//
// WHY NOT JUST loading="lazy"
// Native lazy loading does defer correctly inside the carousel: the intersection
// algorithm clips a target by every ancestor's clip rect before intersecting with
// the root, so a card scrolled out of the horizontally-scrolling track has an
// empty rect and is genuinely not fetched. Three things it cannot do, all of
// which matter here because EVERY locked day animates and a 30-day ribbon has
// ~26 of them:
//
//   1. It never gives the frames back. A loaded image is never unloaded, so after
//      one sweep of the row all ~26 loops stay decoded for the rest of the
//      session. Traffic is not the problem — every card of a state shares one
//      content-hashed URL, so that is a single request and 25 memory-cache hits
//      (Chromium even shares one decoder and frame buffer between identical
//      <img>s). Decoded frame buffers and per-frame raster work are the problem.
//   2. It does not survive a subtree swap. `swapToResult` in open.js replaces a
//      card's children wholesale, so the layer it attached to is simply gone.
//   3. It does not know about `prefers-reduced-motion` changing mid-session.
//
// So the animation ships with its candidates parked in `data-srcset` and no
// `src` at all — inert, zero requests — and this module promotes them when a card
// comes into view and strips them again when it leaves.

/** Slack around the track, in track-widths, before attaching or releasing. Half a
 * track is roughly two cards on desktop, which covers a normal swipe. */
const ROOT_MARGIN = '0px 50%';
/** Ride out a fast swipe before releasing a layer that just left the viewport. */
const DETACH_DELAY_MS = 400;
/** Paired with the opacity transition on .lb-card__bg-anim in theme.css. */
const FADE_MS = 240;

/** True in a browser, false under `node --test`: tests/card-model.test.js imports
 * render.js for `statusTextFor`, which pulls this module in, so nothing at module
 * scope may touch the DOM. */
const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';

/** Live query, not a one-shot read: a player can enable the setting after the row
 * is on screen, and `attach` has to start refusing from that moment. Deliberately
 * not core/transitions.js's `prefersReducedMotion()` — that helper answers "right
 * now", which is right for a 400ms animation and wrong for a layer that lives as
 * long as the card. */
const reduceMotion =
  hasDom && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

/** Cards currently observed. Also the set the reduced-motion handler walks. */
const tracked = new Set();
/** Cards handed over before they were in the document — see observeBgAnim. */
const pending = new Set();
/** Pending release timers, keyed by card element. */
const releaseTimers = new WeakMap();

let observer = null;
let rowWatcher = null;

function layerOf(card) {
  return card.querySelector('[data-lb-bg-anim]');
}

function cancelRelease(card) {
  const timers = releaseTimers.get(card);
  if (!timers) return;
  timers.forEach((id) => window.clearTimeout(id));
  releaseTimers.delete(card);
}

/** Promotes the parked candidates so the browser can pick one and start the loop.
 * Idempotent: a second call on an attached layer does nothing. */
function attach(card) {
  if (reduceMotion?.matches) return;
  const layer = layerOf(card);
  if (!layer || layer.dataset.lbAnimOn === '1') return;

  layer.dataset.lbAnimOn = '1';
  const img = layer.querySelector('img');

  for (const source of layer.querySelectorAll('source')) {
    if (source.dataset.srcset) source.srcset = source.dataset.srcset;
  }

  if (!img) return;

  // Property assignment rather than addEventListener(..., { once: true }): a
  // release before the image loads would leave a `once` listener registered
  // forever, one dead closure per attach/detach cycle. Assignment is idempotent
  // by construction, and the guard stops a late load from a superseded request
  // lighting up a layer that has since been released.
  img.onload = () => {
    if (layer.dataset.lbAnimOn === '1') layer.classList.add('is-anim-loaded');
  };
  if (img.dataset.srcset) img.srcset = img.dataset.srcset;
  if (img.dataset.src) img.src = img.dataset.src;
  if (img.complete && img.naturalWidth > 0) layer.classList.add('is-anim-loaded');
}

/** Fades the layer out, then drops its sources so the decoded frames can go. */
function detach(card) {
  const layer = layerOf(card);
  if (!layer || layer.dataset.lbAnimOn !== '1') return;

  delete layer.dataset.lbAnimOn;
  layer.classList.remove('is-anim-loaded');

  const strip = window.setTimeout(() => {
    for (const source of layer.querySelectorAll('source')) source.removeAttribute('srcset');
    const img = layer.querySelector('img');
    if (img) {
      img.onload = null;
      img.removeAttribute('srcset');
      img.removeAttribute('src');
    }
  }, FADE_MS);

  releaseTimers.set(card, [strip]);
}

function scheduleDetach(card) {
  cancelRelease(card);
  const id = window.setTimeout(() => detach(card), DETACH_DELAY_MS);
  releaseTimers.set(card, [id]);
}

function release(card) {
  cancelRelease(card);
  tracked.delete(card);
  pending.delete(card);
  observer?.unobserve(card);
}

function getObserver(track) {
  if (observer) return observer;

  // The track is the scroll container, so it has to be the root: with an element
  // root, rootMargin expands the root's own box and the hysteresis above is
  // expressible. With `root: null` it is not, because a card one slot past the
  // track's edge is fully clipped away regardless of how far the viewport margin
  // reaches.
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          cancelRelease(entry.target);
          attach(entry.target);
        } else {
          scheduleDetach(entry.target);
        }
      }
    },
    { root: track, rootMargin: ROOT_MARGIN, threshold: 0 },
  );
  return observer;
}

/**
 * Watches the row for both halves of a card's life, because the core offers the
 * brand no hook for either.
 *
 * REMOVALS are the teardown signal. `mountCards` in core/runtime.js empties the
 * track with `innerHTML = ''`, which would otherwise leave every card of the
 * outgoing row observed — and an IntersectionObserver holds its targets strongly,
 * so that is a full row of detached subtrees kept alive per render.
 *
 * INSERTIONS are when a card actually becomes observable. `buildCards` calls
 * `onCardMounted` while the row is still an unattached fragment (and on first
 * paint, a detached `<div>` holder — see runtime.js), so at that point a card has
 * no box and nothing to intersect. Rather than rely on an observer re-evaluating a
 * target that was detached when it was handed over, `observeBgAnim` parks such
 * cards in `pending` and this is where they get observed for real.
 *
 * The track element is static markup and is never replaced, so one watcher covers
 * the widget's lifetime.
 */
function watchRow(track) {
  if (rowWatcher) return;
  rowWatcher = new MutationObserver((records) => {
    const io = getObserver(track);
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (node.nodeType === 1) release(node);
      }
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1 || !pending.has(node)) continue;
        pending.delete(node);
        tracked.add(node);
        io.observe(node);
      }
    }
  });
  rowWatcher.observe(track, { childList: true });
}

/**
 * Registers a freshly mounted card. Safe to call on any card — one without an
 * animated background is ignored.
 *
 * @param {HTMLElement} card
 */
export function observeBgAnim(card) {
  if (!hasDom) return;
  if (!layerOf(card)) return;

  if (!('IntersectionObserver' in window)) {
    // Pre-2019 fallback: attach immediately and let the browser's own lazy
    // loading do what it can.
    attach(card);
    return;
  }

  // Look the track up from the document, not with card.closest(): the card is
  // usually not in the tree yet when this runs, so it has no track ancestor.
  const track = document.querySelector('[data-lb-track]');
  if (!track) return;

  watchRow(track);

  // Not in the document yet — the row is still a fragment being built. Park it;
  // watchRow observes it the moment it is inserted. Observing it here instead
  // would mean relying on the observer to re-evaluate a boxless target, and
  // getting that wrong is silent: the layer simply never loads.
  if (!card.isConnected) {
    pending.add(card);
    return;
  }

  // Already in the tree, so this is a re-render in place — `swapToResult` after a
  // flip reveal or a burn settle. Re-observe even when the card is already
  // tracked: the element is the same but its layer is a brand-new node that was
  // never attached, and an IntersectionObserver will not report a change it did
  // not observe. Dropping and re-adding the target is what re-delivers an initial
  // observation. (Yes, this looks redundant. It is not — without it a revealed
  // card stays static for good.)
  const io = getObserver(track);
  if (tracked.has(card)) io.unobserve(card);
  tracked.add(card);
  io.observe(card);
}

// Toggling the OS setting has to take effect on the row already on screen. On
// enable, drop every loop; on disable, re-observe so the observer re-delivers an
// initial entry for the visible cards (it stays silent otherwise — no
// intersection actually changed).
reduceMotion?.addEventListener?.('change', (event) => {
  for (const card of [...tracked]) {
    if (event.matches) {
      cancelRelease(card);
      detach(card);
    } else if (observer) {
      observer.unobserve(card);
      observer.observe(card);
    }
  }
});
