// Single source of truth for the integration contract: card states and
// postMessage type names. Shared by every brand — keep this file the reference
// when writing docs, and never fork it into a brand folder.
//
// Brand-specific vocabulary (prize types, which states hang on a chain, open
// animation timings) does NOT belong here — it lives in <brand>/brand.config.js.

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
  MISSED: 'missed', // Missed day — the prize the player did not claim
})

export const VALID_CARD_STATES = Object.freeze(Object.values(CARD_STATE))

/** "Opened result" states that support the active/previous variant + status
 * badge ("Opened" when previous). */
export const OPENED_RESULT_STATES = Object.freeze([CARD_STATE.PRIZE, CARD_STATE.PREDICTION])

/** Documented clickable cases (actual check is `isClickable` in card-model.js):
 *  - `available`: open flow (open animation + animationComplete)
 *  - `prize` + `active: true` + non-empty `cta`: reopen win popup
 * Past prize / prediction / locked / missed are not clickable. */
export const CLICKABLE_STATES = Object.freeze([CARD_STATE.AVAILABLE, CARD_STATE.PRIZE])

export const DEFAULT_LANG = 'en'

/** Number of placeholder cards rendered while waiting for real data
 * (no card params in the URL yet and no setContent received). */
export const DEFAULT_SKELETON_COUNT = 5

/**
 * How long the widget waits for the parent's `setCardState` after a card was
 * clicked, before it gives the card back to the player.
 *
 * There is no transport underneath us to time this out on its own: the widget
 * does not call the backend, it asks the parent page to, and a parent that never
 * answers is indistinguishable from one that is still working. Without a
 * deadline the card charges forever, and because a charging card is not
 * clickable the player cannot even retry — only a reload gets out of it.
 *
 * 15s is chosen to be longer than any answer worth waiting for on a slow mobile
 * connection, and short of the point where a player concludes the page is dead.
 * Erring long is deliberate: giving up while the parent is still working risks
 * the player losing an attempt the backend already spent.
 */
export const OPEN_TIMEOUT_MS = 15000

/** postMessage `type` values. Message shape is always `{ type, data }`. */
export const MESSAGE_TYPES = Object.freeze({
  // iFrame -> Parent
  READY: 'ready',
  CARD_CLICK: 'cardClick',
  ANIMATION_COMPLETE: 'animationComplete',
  RESIZE: 'resize',
  /** A card's countdown reached zero. The parent should refetch and push a fresh
   * `setContent`, otherwise the badge stays pinned at 00:00:00. */
  TIMER_END: 'timerEnd',
  /** The widget waited OPEN_TIMEOUT_MS for a `setCardState` after `cardClick`
   * and gave up: the card has been returned to its previous state and is
   * clickable again. The parent should surface its own error and may still send
   * a late `setCardState` — it will simply render without the open animation. */
  OPEN_TIMEOUT: 'openTimeout',
  // Parent -> iFrame
  SET_CONTENT: 'setContent',
  SET_CARD_STATE: 'setCardState',
  PLAY_OPEN: 'playOpen',
  SET_LOADING: 'setLoading',
})
