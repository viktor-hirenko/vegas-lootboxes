// Single source of truth for the integration contract: card states and
// postMessage type names. Keep this file the reference when writing docs.

/** Canonical card states (task: "Available today / Locked / Opened with prize /
 * Opened with prediction / Opened without prize"). `skeleton` is an internal
 * render mode, not a state that comes from query params or setCardState. */
export const CARD_STATE = Object.freeze({
  AVAILABLE: 'available', // Available today — clickable
  LOCKED: 'locked', // Locked / Upcoming — not clickable, dimmed
  PRIZE: 'prize', // Opened with prize — not clickable, shows prize + CTA
  PREDICTION: 'prediction', // Opened with prediction — not clickable
  EMPTY: 'empty', // Opened without prize — not clickable
});

export const VALID_CARD_STATES = Object.freeze(Object.values(CARD_STATE));

/** States that render as clickable ("today"). Only one card should be
 * `available` at a time in production, but the widget does not enforce that —
 * it is purely a renderer driven by whatever state the parent/query provides. */
export const CLICKABLE_STATES = Object.freeze([CARD_STATE.AVAILABLE]);

export const DEFAULT_LANG = 'en';

/** Number of placeholder cards rendered while waiting for real data
 * (no card params in the URL yet and no setContent received). */
export const DEFAULT_SKELETON_COUNT = 5;

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
});
