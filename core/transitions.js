// FLIP (First - Last - Invert - Play) helper for card rows.
//
// Needed because a card can change both its slot and its size inside one
// update: on a missed day the active 208x320 card shrinks to 208x288 and moves
// back into the history row while the next card grows into the active slot.
// Rebuilding the DOM does that instantly; FLIP replays it as motion.
//
// Brand-agnostic on purpose — the *look* of a transition (neon fading out, art
// swapping) belongs to the brand adapter, the geometry does not.

/**
 * FIRST: geometry of every card before the DOM is replaced, keyed by card id.
 *
 * @param {HTMLElement} track
 * @returns {Map<string, DOMRect>}
 */
export function measureCards(track) {
  const rects = new Map();
  for (const el of track.querySelectorAll('.lb-card[data-id]')) {
    rects.set(el.dataset.id, el.getBoundingClientRect());
  }
  return rects;
}

/**
 * LAST + INVERT + PLAY: for every card that existed before, animate from its old
 * box to its new one. Cards without a previous box (newly added) are left alone.
 *
 * @param {HTMLElement} track
 * @param {Map<string, DOMRect>} firstRects from `measureCards` before the swap
 * @param {{ durationMs?: number, easing?: string }} [options]
 * @returns {Promise<void>} resolves when the longest animation finishes
 */
export function playFlip(track, firstRects, { durationMs = 420, easing = 'cubic-bezier(0.22, 0.61, 0.36, 1)' } = {}) {
  if (prefersReducedMotion()) return Promise.resolve();

  const animations = [];

  for (const el of track.querySelectorAll('.lb-card[data-id]')) {
    const first = firstRects.get(el.dataset.id);
    if (!first) continue;

    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const sx = last.width === 0 ? 1 : first.width / last.width;
    const sy = last.height === 0 ? 1 : first.height / last.height;

    const moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
    const resized = Math.abs(sx - 1) > 0.005 || Math.abs(sy - 1) > 0.005;
    if (!moved && !resized) continue;

    // transform-origin at the top-left corner so the translate above is exactly
    // the corner delta and the scale does not fight it.
    const previousOrigin = el.style.transformOrigin;
    el.style.transformOrigin = 'top left';

    const animation = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        { transform: 'translate(0, 0) scale(1, 1)' },
      ],
      { duration: durationMs, easing, fill: 'none' },
    );

    animation.finished
      .catch(() => {})
      .then(() => {
        el.style.transformOrigin = previousOrigin;
      });

    animations.push(animation.finished.catch(() => {}));
  }

  return Promise.all(animations).then(() => undefined);
}

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}
