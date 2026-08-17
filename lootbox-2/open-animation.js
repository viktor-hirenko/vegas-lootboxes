// Thor animation timelines. Brand-specific: these values are tuned to the CSS
// keyframes in theme.css, so they live next to them and not in core/.

/**
 * Card activation, in ms. Two phases split across postMessage events so the
 * backend result decides the reveal without changing the message shapes:
 *
 * Phase 1 — CHARGE (on `cardClick`): the card wobbles on its vertical axis as if
 *   trying to turn over. It loops indefinitely, masking backend latency.
 *
 * Phase 2 — FLIP REVEAL (on `setCardState`): the card turns edge-on, the content
 *   is swapped while it is invisible, and the new face swings back in. The
 *   object then scales in (overshooting its final size) and the CTA rises up.
 *
 * The card is never mirrored: instead of a full 180° turn it goes 0 -> 90 with
 * the old face, then -90 -> 0 with the new one.
 *
 * IMPORTANT: because the reveal needs the result up-front, the parent must start
 * its API request on `cardClick` (not on `animationComplete`). See INTEGRATION.md.
 */
export const OPEN_ANIMATION = Object.freeze({
  EDGE_ON_MS: 200, // 0 -> 90deg: the old face turns away
  SWING_IN_MS: 260, // -90 -> 0deg: the new face turns towards the viewer
  OBJECT_IN_MS: 420, // object scale-in, starts with the swing (see lb-b2-object-in)
  CTA_IN_MS: 260, // CTA fade + rise, delayed until the card faces front again
  COMPLETE_AT_MS: 760, // emit animationComplete once every layer has settled
});

/**
 * Missed-day burn-out, in ms. Two beats here, plus a third one the core owns:
 *
 * DRAIN  — the neon bleeds out of the portal and the live face dissolves to
 *   nothing. The card still holds its active geometry, so nothing in the row
 *   moves yet.
 * SETTLE — at the end of the drain the card is dark and its face is empty, so
 *   the markup and state classes are replaced there (the same trick the reveal
 *   uses at the edge-on moment) and the burnt face fades in.
 *
 * The collapse into the history slot follows straight after and is timed by
 * core/transitions.js, because it is row geometry rather than Thor's look.
 */
export const BURN_ANIMATION = Object.freeze({
  DRAIN_MS: 260, // neon drains out and the live face fades to nothing
  SETTLE_MS: 240, // burnt face fades back in over the dimmed portal

  // How long the burnt face may keep the swap waiting, measured from the start of
  // the burn (see stageFace in open.js). Anything past DRAIN_MS holds the drain on
  // its end state, which costs nothing visually — the card is simply dark a beat
  // longer — whereas swapping early puts a card with no background, and so no rim,
  // in plain view. The cap is what stops a missing or stalled asset from holding
  // the row hostage: past it the transition goes ahead regardless.
  FACE_READY_CAP_MS: 600,
});
