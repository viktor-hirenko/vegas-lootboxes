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
  const rects = new Map()
  for (const el of track.querySelectorAll('.lb-card[data-id]')) {
    rects.set(el.dataset.id, el.getBoundingClientRect())
  }
  return rects
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
export function playFlip(
  track,
  firstRects,
  { durationMs = 940, easing = 'cubic-bezier(0.22, 0.61, 0.36, 1)' } = {}
) {
  if (prefersReducedMotion()) return Promise.resolve()

  const cards = [...track.querySelectorAll('.lb-card[data-id]')]
  const timing = { duration: durationMs, easing, fill: 'none' }
  const animations = []
  const releaseTrack = holdTrackHeight(track, firstRects, cards)

  for (const el of cards) {
    const first = firstRects.get(el.dataset.id)
    if (!first) continue

    const last = el.getBoundingClientRect()
    const dx = first.left - last.left
    const dy = first.top - last.top
    const grewOrShrank = Math.abs(first.height - last.height) > 0.5
    const keptWidth = Math.abs(first.width - last.width) <= 0.5

    // A card that only changed height gets its real box animated instead: the
    // missed-day collapse and the next day growing into the active slot are both
    // this case. Replaying them as scaleY would stretch the artwork and the type
    // by ~10%, which reads as a glitch rather than as motion, and it would also
    // freeze the contents — animating the box lets the object and the copy glide
    // to their new places instead of arriving there on the frame after.
    // The row is centre-aligned, so the vertical shift follows from the height
    // and only a real slot change is still worth replaying.
    if (grewOrShrank && keptWidth) {
      animations.push(
        settle(
          el.animate(
            [
              { height: `${first.height}px`, transform: `translateX(${dx}px)` },
              { height: `${last.height}px`, transform: 'translateX(0)' },
            ],
            timing
          )
        )
      )
      continue
    }

    const sx = last.width === 0 ? 1 : first.width / last.width
    const sy = last.height === 0 ? 1 : first.height / last.height

    const moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5
    const resized = Math.abs(sx - 1) > 0.005 || Math.abs(sy - 1) > 0.005
    if (!moved && !resized) continue

    // transform-origin at the top-left corner so the translate above is exactly
    // the corner delta and the scale does not fight it.
    const previousOrigin = el.style.transformOrigin
    el.style.transformOrigin = 'top left'

    const animation = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        { transform: 'translate(0, 0) scale(1, 1)' },
      ],
      timing
    )

    animations.push(
      settle(animation).then(() => {
        el.style.transformOrigin = previousOrigin
      })
    )
  }

  // A hidden tab stops handing out animation frames, which leaves every
  // animation above parked mid-flight — `finished` simply never settles. The
  // timeout is what guarantees the track gets its own sizing back (and that the
  // caller stops considering itself mid-transition) instead of staying pinned
  // until the player happens to look at the page again.
  return Promise.race([
    Promise.all(animations),
    new Promise(resolve => window.setTimeout(resolve, durationMs + 200)),
  ]).then(releaseTrack)
}

function settle(animation) {
  return animation.finished.catch(() => {})
}

/**
 * Animating real heights makes the row briefly shorter than in either state: one
 * card shrinks while another grows, so half-way through both are between the two
 * sizes and the tallest is neither. Unpinned, that dip travels to the parent page
 * as a `resize` and the whole widget bobs mid-transition.
 *
 * @param {HTMLElement} track
 * @param {Map<string, DOMRect>} firstRects
 * @param {HTMLElement[]} cards
 * @returns {() => void} hands the track back its own sizing
 */
function holdTrackHeight(track, firstRects, cards) {
  let tallest = 0
  for (const rect of firstRects.values()) tallest = Math.max(tallest, rect.height)
  for (const el of cards) tallest = Math.max(tallest, el.getBoundingClientRect().height)
  if (tallest === 0) return () => {}

  // min-height caps the content box under content-box sizing but the border box
  // under border-box, so the track's vertical padding has to be added back in the
  // latter case for the pin to still clear the tallest card.
  const style = window.getComputedStyle(track)
  const padding =
    style.boxSizing === 'border-box'
      ? (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)
      : 0

  const previous = track.style.minHeight
  track.style.minHeight = `${tallest + padding}px`
  return () => {
    track.style.minHeight = previous
  }
}

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}
