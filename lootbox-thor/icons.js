// Maps card states and prize types to raster assets under lootbox-thor/assets/images/.
//
// Thor's artwork model is flatter than Vegas's: the portal, the podium and the
// glow behind the object all arrive as one background frame per state, so a card
// is just background + object + text.
//
// Two of those backgrounds are now animated loops rather than single frames (see
// BACKGROUNDS below), and those two carry no rim: theirs is drawn in CSS, because
// a video frame has no alpha to round its corners with. The other three are still
// the original rasters with the rim baked in. The only thing the widget has always
// drawn itself is the halo OUTSIDE the card, a box-shadow in theme.css (exporting
// a Figma frame clips it away).

import { BG_ANIM } from './backgrounds-anim.generated.js';

const BASE = './assets/images';

/** `srcset` value from a manifest candidate list: `url 208w, url 312w, …`.
 * Width descriptors rather than `1x/2x` because the card's width depends on the
 * embed width, not only on device pixel ratio — see BG_SIZES. */
function srcset(candidates) {
  return candidates.map((candidate) => `${candidate.url} ${candidate.width}w`).join(', ');
}

/**
 * The `sizes` value every background candidate list is selected against.
 *
 * It mirrors `--lb-card-width` in core/base.css exactly: a flat 208px below the
 * 768px breakpoint, and `100cqw * 13 / 57` at or above it. `cqw` is not allowed
 * in `sizes`, but `vw` is numerically identical here — the query container is
 * `body`, which fills the iframe, and `html { overflow: hidden }` means there is
 * no scrollbar to deduct. The media condition is viewport-based for the same
 * reason, so 767px is the same boundary as the container query's 768px.
 */
export const BG_SIZES = '(min-width: 768px) calc(100vw * 13 / 57), 208px';

/**
 * Full-bleed portal scenes. Five of them cover all seven card variants:
 *  - `available` (the bright portal with lightning) is also today's opened
 *    result, because in the design an opened card keeps the live portal;
 *  - `previous` is the same portal dimmed, for any past result;
 *  - `missed` / `missedActive` are the same burnt-out portal drawn twice, for
 *    the two card boxes it has to sit in. A missed day appears at the history
 *    size, but the burn-out starts while the card still holds the active box
 *    and only shrinks into history over the collapse. One raster cannot serve
 *    both without being stretched, and the rim is drawn to the very edge — see
 *    the `object-fit: fill` note in theme.css. So the 320-tall variant covers
 *    the burn and the collapse, and the 288-tall one every settled state.
 *
 * Every value is a descriptor rather than a bare URL, so `backgroundFor` in
 * render.js and `renderBackground` need no per-state branching. `anim` being
 * present is the single signal that a state has a loop to layer on: it drives
 * the animation markup, the IntersectionObserver gate and the CSS rim.
 */
export const BACKGROUNDS = Object.freeze({
  available: animated(BG_ANIM.available),
  locked: animated(BG_ANIM.locked),
  /** The locked portal as a single frame, for every closed day except the next one
   * up. Same art, same rim-in-CSS, just no loop — a month is up to 26 locked days
   * and only the one the player is waiting for earns a running animation. */
  lockedStatic: posterOnly(BG_ANIM.locked),
  missed: still(`${BASE}/backgrounds/missed.webp`),
  missedActive: still(`${BASE}/backgrounds/missed-active.webp`),
  previous: still(`${BASE}/backgrounds/previous.webp`),
});

/**
 * A legacy single-frame background: one URL, its rim baked in, no loop.
 *
 * `poster.avif` is deliberately empty so render.js emits the plain `<img>` these
 * states have always had. That keeps the missed-day burn path byte-identical to
 * today's markup, which matters because `stageFace` in open.js stages only
 * `missed` faces and blocks on that exact element.
 */
function still(url) {
  return Object.freeze({
    poster: Object.freeze({ avif: '', webp: '', fallback: url }),
    anim: null,
  });
}

/** The responsive first-frame poster of an animated entry. Eager and always
 * painted, so it is what the skeleton gate waits on and what a card falls back to
 * whenever the loop is not wanted. */
function posterOf(entry) {
  return Object.freeze({
    avif: srcset(entry.poster.avif),
    webp: srcset(entry.poster.webp),
    fallback: entry.poster.webp[0].url,
  });
}

/** An animated background: the poster plus the loop itself. The loop is lazy and
 * only gets its sources once the card scrolls into view (see bg-anim.js). The 1x
 * candidate is the plain `src` fallback in both cases. */
function animated(entry) {
  return Object.freeze({
    poster: posterOf(entry),
    anim: Object.freeze({
      avif: srcset(entry.avif),
      webp: srcset(entry.webp),
      fallback: entry.webp[0].url,
    }),
  });
}

/** The same art with the loop dropped: a card that must not animate. Frozen once
 * here rather than derived per render, so `backgroundFor` stays allocation-free. */
function posterOnly(entry) {
  return Object.freeze({ poster: posterOf(entry), anim: null });
}

/** 128px artwork for today's card: vivid, full-colour. */
export const OBJECTS_LG = Object.freeze({
  'bonus-money': `${BASE}/objects-lg/bonus-money.webp`,
  cashback: `${BASE}/objects-lg/cashback.webp`,
  coin: `${BASE}/objects-lg/coin.webp`,
  'free-spins': `${BASE}/objects-lg/free-spins.webp`,
  cookies: `${BASE}/objects-lg/cookies.webp`,
  question: `${BASE}/objects-lg/question.webp`,
});

/** 112px artwork for past days: the same objects, drawn smaller. */
export const OBJECTS_SM = Object.freeze({
  'bonus-money': `${BASE}/objects-sm/bonus-money.webp`,
  cashback: `${BASE}/objects-sm/cashback.webp`,
  coin: `${BASE}/objects-sm/coin.webp`,
  'free-spins': `${BASE}/objects-sm/free-spins.webp`,
  cookies: `${BASE}/objects-sm/cookies.webp`,
  lock: `${BASE}/objects-sm/lock.webp`,
});

/** 112px desaturated artwork for a missed day. Separate art, not a CSS filter:
 * the designer greys the object out by hand so the neon rim survives. */
export const MISSED_ART = Object.freeze({
  'bonus-money': `${BASE}/missed/bonus-money.webp`,
  cashback: `${BASE}/missed/cashback.webp`,
  coin: `${BASE}/missed/coin.webp`,
  'free-spins': `${BASE}/missed/free-spins.webp`,
  cookies: `${BASE}/missed/cookies.webp`,
});
