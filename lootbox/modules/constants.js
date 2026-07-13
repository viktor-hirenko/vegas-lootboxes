// Single source of truth for the integration contract: card states and
// postMessage type names. Keep this file the reference when writing docs.

/** Canonical card states used by query params and postMessage. `skeleton` is an
 * internal render mode, not a state that comes from query params/setCardState.
 *
 * The prize/prediction "opened result" states have two visual variants
 * driven by the `active` card flag:
 *   - active: true  -> today's just-opened result (320px, glow, single date badge)
 *   - active: false -> a previous day in history (288px, date + "Opened" badges) */
export const CARD_STATE = Object.freeze({
  AVAILABLE: 'available', // Ready to open — today, clickable
  LOCKED: 'locked', // Locked / Upcoming — not clickable
  PRIZE: 'prize', // Opened with prize — shows prize art (+ optional CTA)
  PREDICTION: 'prediction', // Opened with prediction — "Something is waiting..."
  MISSED: 'missed', // Missed day — prize shown inside a disco ball
})

export const VALID_CARD_STATES = Object.freeze(Object.values(CARD_STATE))

/** "Opened result" states that support the active/previous variant + status
 * badge ("Opened" when previous). */
export const OPENED_RESULT_STATES = Object.freeze([CARD_STATE.PRIZE, CARD_STATE.PREDICTION])

/** States whose object is a disco ball hanging on a chain (available / the
 * prediction ball / missed). Their content is top-aligned so the chain meets
 * the top edge of the card; prize/locked objects stay vertically centered. */
export const CHAIN_STATES = Object.freeze([
  CARD_STATE.AVAILABLE,
  CARD_STATE.PREDICTION,
  CARD_STATE.MISSED,
])

/** Prize types — map to prize/missed art keyed by these values. */
export const VALID_PRIZE_TYPES = Object.freeze(['bonus-money', 'cash', 'coin', 'free-spins'])

export const DEFAULT_PRIZE_TYPE = 'coin'

/** Documented clickable cases (actual check is `isClickable` in card.js):
 *  - `available`: open flow (draft animation + animationComplete)
 *  - `prize` + `active: true` + non-empty `cta`: reopen win popup
 * Past prize / prediction / locked / missed are not clickable. */
export const CLICKABLE_STATES = Object.freeze([CARD_STATE.AVAILABLE, CARD_STATE.PRIZE])

export const DEFAULT_LANG = 'en'

/** Number of placeholder cards rendered while waiting for real data
 * (no card params in the URL yet and no setContent received). */
export const DEFAULT_SKELETON_COUNT = 5

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
  CONFETTI_HOLD_MS: 8000, // visible confetti time before the graceful fade begins.
  // confetti.svg loops every 3000ms; 3 cycles ≈ 3 pops (8000ms), then fade masks the 4th restart.
  FADE_OUT_MS: 700, // graceful overlay fade before removal (sync with .lb-card__open-fx.is-out)
  COMPLETE_AT_MS: 2000, // non-prize: emit animationComplete after flash.svg resolves
  FLASH_READY_TIMEOUT_MS: 800, // max wait for flash decode before starting reveal
  /** TEMP: keep prize confetti on screen for positioning / static-confetti work.
   * Set false before shipping. Skips overlay fade, blocks render() wipe. */
  CONFETTI_DEBUG_FREEZE: false,
})

/** postMessage `type` values. Message shape is always `{ type, data }`. */
export const MESSAGE_TYPES = Object.freeze({
  // iFrame -> Parent
  READY: 'ready',
  CARD_CLICK: 'cardClick',
  ANIMATION_COMPLETE: 'animationComplete',
  RESIZE: 'resize',
  // Parent -> iFrame
  SET_CONTENT: 'setContent',
  SET_CARD_STATE: 'setCardState',
  PLAY_OPEN: 'playOpen',
  SET_LOADING: 'setLoading',
})
