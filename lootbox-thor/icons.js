// Maps card states and prize types to raster assets under lootbox-thor/assets/images/.
//
// Thor's artwork model is flatter than Vegas's: the card's neon rim, the portal,
// the podium and the glow behind the object are all baked into one background
// frame per state, so a card is just background + object + text. Because the rim
// comes with the frame, theme.css switches the core's CSS border off — see the
// note on .lb-card there before adding any border back.
//
// The only thing the widget draws itself is the halo OUTSIDE the card, a
// box-shadow in theme.css (exporting a Figma frame clips it away).

const BASE = './assets/images';

/** Full-bleed portal scenes. Five of them cover all seven card variants:
 *  - `available` (the bright portal with lightning) is also today's opened
 *    result, because in the design an opened card keeps the live portal;
 *  - `previous` is the same portal dimmed, for any past result;
 *  - `missed` / `missedActive` are the same burnt-out portal drawn twice, for
 *    the two card boxes it has to sit in. A missed day appears at the history
 *    size, but the burn-out starts while the card still holds the active box
 *    and only shrinks into history over the collapse. One raster cannot serve
 *    both without being stretched, and the rim is drawn to the very edge — see
 *    the `object-fit: fill` note in theme.css. So the 320-tall variant covers
 *    the burn and the collapse, and the 288-tall one every settled state. */
export const BACKGROUNDS = Object.freeze({
  available: `${BASE}/backgrounds/available.webp`,
  locked: `${BASE}/backgrounds/locked.webp`,
  missed: `${BASE}/backgrounds/missed.webp`,
  missedActive: `${BASE}/backgrounds/missed-active.webp`,
  previous: `${BASE}/backgrounds/previous.webp`,
});

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
