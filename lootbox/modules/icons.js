// Maps card states / prize types to the raster art exported from Figma
// (lootbox/assets/images/**). Using real images — not CSS/SVG drawings —
// keeps the cards pixel-identical to the mockups.

const BASE = './assets/images';

/** Full-bleed background scenes. Prize/prediction have an "active" (today,
 * with glow) and a "previous" (history) variant. */
export const BACKGROUNDS = Object.freeze({
  available: `${BASE}/backgrounds/ready.png`,
  locked: `${BASE}/backgrounds/locked.png`,
  missed: `${BASE}/backgrounds/missed.png`,
  prizeActive: `${BASE}/backgrounds/prize.png`,
  prizePrevious: `${BASE}/backgrounds/previous-prize.png`,
  predictionActive: `${BASE}/backgrounds/without-prize.png`,
  predictionPrevious: `${BASE}/backgrounds/previous-prediction.png`,
});

/** Radial glow behind the object. `ready` is the wider sunburst. */
export const LIGHTS = Object.freeze({
  ready: `${BASE}/lights/ready.png`,
  other: `${BASE}/lights/other.png`,
});

/** Central objects that are not prize-dependent. */
export const OBJECTS = Object.freeze({
  available: `${BASE}/objects/ready-ball.png`, // disco ball
  locked: `${BASE}/objects/locked.png`, // padlock
  prediction: `${BASE}/objects/prediction.png`, // ball + "prediction" note
});

/** Prize art keyed by prize type (colorful, "won" variant). */
export const PRIZE_ART = Object.freeze({
  'bonus-money': `${BASE}/prizes/bonus-money.png`,
  cash: `${BASE}/prizes/cash.png`,
  coin: `${BASE}/prizes/coin.png`,
  'free-spins': `${BASE}/prizes/free-spins.png`,
});

/** Missed-day art keyed by prize type (prize embedded in a disco ball). */
export const MISSED_ART = Object.freeze({
  'bonus-money': `${BASE}/missed/bonus-money.png`,
  cash: `${BASE}/missed/cash.png`,
  coin: `${BASE}/missed/coin.png`,
  'free-spins': `${BASE}/missed/free-spins.png`,
});
