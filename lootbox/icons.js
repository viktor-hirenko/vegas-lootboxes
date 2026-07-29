// Maps card states and prize types to raster assets under lootbox/assets/images/.

const BASE = './assets/images';

/** Full-bleed background scenes. Prize/prediction have an "active" (today,
 * with glow) and a "previous" (history) variant. */
export const BACKGROUNDS = Object.freeze({
  available: `${BASE}/backgrounds/ready.webp`,
  locked: `${BASE}/backgrounds/locked.webp`,
  missed: `${BASE}/backgrounds/missed.webp`,
  prizeActive: `${BASE}/backgrounds/prize.webp`,
  prizePrevious: `${BASE}/backgrounds/previous-prize.webp`,
  predictionActive: `${BASE}/backgrounds/without-prize.webp`,
  predictionPrevious: `${BASE}/backgrounds/previous-prediction.webp`,
});

/** Static radial glow behind the object (history / non-spotlight states).
 * Active / spotlight cards use the animated glow SVGs in ANIMATIONS instead. */
export const LIGHTS = Object.freeze({
  other: `${BASE}/lights/other.webp`,
});

/** Central objects that are not prize-dependent. */
export const OBJECTS = Object.freeze({
  available: `${BASE}/objects/ready-ball.webp`, // disco ball
  locked: `${BASE}/objects/locked.webp`, // padlock
  prediction: `${BASE}/objects/prediction.webp`, // ball + "prediction" note
});

/** Prize art keyed by prize type (colorful, "won" variant). */
export const PRIZE_ART = Object.freeze({
  'bonus-money': `${BASE}/prizes/bonus-money.webp`,
  cash: `${BASE}/prizes/cash.webp`,
  coin: `${BASE}/prizes/coin.webp`,
  'free-spins': `${BASE}/prizes/free-spins.webp`,
});

/** Missed-day art keyed by prize type (prize embedded in a disco ball). */
export const MISSED_ART = Object.freeze({
  'bonus-money': `${BASE}/missed/bonus-money.webp`,
  cash: `${BASE}/missed/cash.webp`,
  coin: `${BASE}/missed/coin.webp`,
  'free-spins': `${BASE}/missed/free-spins.webp`,
});

/**
 * Final motion-designer assets. Formats chosen per medium:
 *   - Disco ball: animated AVIF with WebP fallback, in 1x + 2x (retina).
 *   - Glow / hand / confetti / prediction ball: self-contained CSS-animated SVGs
 *     (SVGator export). Their declarative CSS animation plays even when the
 *     SVG is referenced via <img> (browser "secure animated mode"), so no
 *     inlining or scripting is needed.
 *
 * Progressive loading: the static poster in OBJECTS/LIGHTS is shown first,
 * then swapped for the animated asset once it has loaded.
 */
export const ANIMATIONS = Object.freeze({
  // available — spinning disco ball (over the static ready-ball poster)
  discoBall: Object.freeze({
    avif: `${BASE}/animations/disco-ball/disco-ball.avif`,
    webp: `${BASE}/animations/disco-ball/disco-ball.webp`,
    avif2x: `${BASE}/animations/disco-ball/disco-ball@2x.avif`,
    webp2x: `${BASE}/animations/disco-ball/disco-ball@2x.webp`,
    poster: OBJECTS.available,
  }),
  // rotating/pulsing rays under the disco ball (available / today's result)
  glowReady: `${BASE}/animations/lights/glow-ready.svg`,
  // rotating/pulsing rays under the lock (next-up locked card)
  glowLocked: `${BASE}/animations/lights/glow-locked.svg`,
  // click hint — tapping hand (new element, available state only)
  hand: `${BASE}/animations/hand/hand-tap.svg`,
  // win burst — confetti (new element, plays a finite number of loops)
  confetti: `${BASE}/animations/confetti/confetti.svg`,
  // full-card flash burst (one-shot SVG, replaces old CSS gradient flash)
  flash: `${BASE}/animations/flash/flash.svg`,
  flash2x: `${BASE}/animations/flash/flash@2x.svg`,
  // active prediction — looping ball + note SVG (replaces the static
  // objects/prediction.webp while the prediction card is the current day).
  // Vector, so no @2x variant is needed.
  predictionBall: `${BASE}/animations/prediction-ball/prediction-ball.svg`,
});

/** Intrinsic sizes from SVGator viewBox — used for layout hints on <img>. */
export const ANIMATION_SIZES = Object.freeze({
  flash: Object.freeze({ width: 208, height: 320 }),
  confetti: Object.freeze({ width: 160, height: 160 }),
});
