// Vegas open-animation timeline. Brand-specific: the values are tuned to this
// brand's SVGator assets, so they live next to them, not in core/.

/** Open animation timeline, in ms. Two phases, split across postMessage events
 * so the backend result decides the reveal without changing the message shapes:
 *
 * Phase 1 — CHARGE (on `cardClick`): the disco ball "charges" (pulsing loop).
 *   It loops indefinitely, masking backend latency. No result is known yet.
 *
 * Phase 2 — FLASH REVEAL (on `setCardState`): a full-card flash covers the card;
 *   at its peak the content is swapped under the white to the final result
 *   (prize art or prediction), so it appears *from within* the flash. Confetti
 *   bursts only for `prize`. When the flash finishes, `animationComplete` fires.
 *
 * Tuned to the current SVGator `flash.svg` / `confetti.svg`. Replacing those
 * assets → re-check and update these ms values (esp. `FLASH_SVG_MS`,
 * `SWAP_AT_MS`, `CONFETTI_AT_MS`, `COMPLETE_AT_MS`).
 *
 * IMPORTANT: because the reveal needs the result up-front, the parent must start
 * its API request on `cardClick` (not on `animationComplete`). See INTEGRATION.md. */
export const OPEN_ANIMATION = Object.freeze({
  VEIL_MS: 900, // CSS veil duration (lb-flash-veil keyframes)
  FLASH_SVG_MS: 2000, // motion-designer flash.svg duration (SVGator export)
  SWAP_AT_MS: 220, // swap content under the veil peak (~24% of VEIL_MS)
  CONFETTI_AT_MS: 1300, // delay (from is-active) before confetti are appended, so
  // their fresh SVGator burst fires only AFTER the white is fully gone. The white
  // is dominated by flash.svg (2000ms), whose burst scales to 0 at 60% ≈ 1200ms —
  // NOT the CSS veil (900ms). Must stay > ~1200ms or confetti pop through the white.
  CONFETTI_HOLD_MS: 2200, // visible confetti time before the graceful fade begins.
  // confetti.svg loops every 3000ms; this holds ~one pop so the prize popup opens
  // fast (total to animationComplete ≈ CONFETTI_AT_MS + this + FADE_OUT_MS ≈ 4.2s),
  // then the fade masks the next restart. Tune here to trade pops for speed.
  FADE_OUT_MS: 700, // graceful overlay fade before removal (sync with .lb-card__open-fx.is-out)
  COMPLETE_AT_MS: 2000, // non-prize: emit animationComplete after flash.svg resolves
  FLASH_READY_TIMEOUT_MS: 800, // max wait for flash decode before starting reveal
  /** TEMP: keep prize confetti on screen for positioning / static-confetti work.
   * Set false before shipping. Skips overlay fade, blocks render() wipe. */
  CONFETTI_DEBUG_FREEZE: false,
})
