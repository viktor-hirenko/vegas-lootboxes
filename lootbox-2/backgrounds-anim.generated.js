// GENERATED FILE — do not edit by hand.
// Regenerate with: npm run build:animations
//
// Animated portal loops for the Thor card background, built from
// lootbox-2/animation-source/ by scripts/build-card-animations.mjs.
//
// Paths are relative to lootbox-2/index.html, exactly like icons.js: these are
// HTML attribute values, resolved against the document, not module specifiers.
//
// The hash in each filename is derived from the source video bytes plus the full
// encoder-settings object, so replacing a source video changes every URL and no
// CDN can serve a stale animation. Same source + same settings + same tools =>
// same names, so re-running this produces no git diff.
//
// AVIF carries the full 1x-3x ladder; the animated-WebP fallback stops at
// 416px wide on purpose — VP8 measures 3-4x the AVIF bytes on this
// material, and the browsers that need it are the older ones. They upscale the
// 416-wide loop, which on a soft glow is imperceptible.
//
// Built with quality 65 (posters 82), 12 fps, no alpha, infinite loop,
// CICP 1/13/6 limited range, avifenc 1.4.2 / libwebp 1.6.0 / ffmpeg 8.1.2.

const BASE = './assets/images/backgrounds-anim';

export const BG_ANIM = Object.freeze({
  available: Object.freeze({
    hash: '747e5077',
    // The CSS card box this art was composed for; also its exact aspect ratio,
    // which is why `object-fit: fill` never distorts a settled card.
    box: Object.freeze({ width: 208, height: 320 }),
    fps: 12,
    frames: 121,
    durationMs: 10083,
    avif: Object.freeze([
      Object.freeze({ url: `${BASE}/available-208w.747e5077.avif`, width: 208 }),
      Object.freeze({ url: `${BASE}/available-312w.747e5077.avif`, width: 312 }),
      Object.freeze({ url: `${BASE}/available-416w.747e5077.avif`, width: 416 }),
      Object.freeze({ url: `${BASE}/available-520w.747e5077.avif`, width: 520 }),
      Object.freeze({ url: `${BASE}/available-624w.747e5077.avif`, width: 624 }),
    ]),
    webp: Object.freeze([
      Object.freeze({ url: `${BASE}/available-208w.747e5077.webp`, width: 208 }),
      Object.freeze({ url: `${BASE}/available-312w.747e5077.webp`, width: 312 }),
      Object.freeze({ url: `${BASE}/available-416w.747e5077.webp`, width: 416 }),
    ]),
    poster: Object.freeze({
      avif: Object.freeze([
        Object.freeze({ url: `${BASE}/available-poster-208w.747e5077.avif`, width: 208 }),
        Object.freeze({ url: `${BASE}/available-poster-312w.747e5077.avif`, width: 312 }),
        Object.freeze({ url: `${BASE}/available-poster-416w.747e5077.avif`, width: 416 }),
        Object.freeze({ url: `${BASE}/available-poster-520w.747e5077.avif`, width: 520 }),
        Object.freeze({ url: `${BASE}/available-poster-624w.747e5077.avif`, width: 624 }),
      ]),
      webp: Object.freeze([
        Object.freeze({ url: `${BASE}/available-poster-208w.747e5077.webp`, width: 208 }),
        Object.freeze({ url: `${BASE}/available-poster-312w.747e5077.webp`, width: 312 }),
        Object.freeze({ url: `${BASE}/available-poster-416w.747e5077.webp`, width: 416 }),
        Object.freeze({ url: `${BASE}/available-poster-520w.747e5077.webp`, width: 520 }),
        Object.freeze({ url: `${BASE}/available-poster-624w.747e5077.webp`, width: 624 }),
      ]),
    }),
  }),
  locked: Object.freeze({
    hash: '191c38d7',
    // The CSS card box this art was composed for; also its exact aspect ratio,
    // which is why `object-fit: fill` never distorts a settled card.
    box: Object.freeze({ width: 208, height: 288 }),
    fps: 12,
    frames: 121,
    durationMs: 10083,
    avif: Object.freeze([
      Object.freeze({ url: `${BASE}/locked-208w.191c38d7.avif`, width: 208 }),
      Object.freeze({ url: `${BASE}/locked-312w.191c38d7.avif`, width: 312 }),
      Object.freeze({ url: `${BASE}/locked-416w.191c38d7.avif`, width: 416 }),
      Object.freeze({ url: `${BASE}/locked-520w.191c38d7.avif`, width: 520 }),
      Object.freeze({ url: `${BASE}/locked-624w.191c38d7.avif`, width: 624 }),
    ]),
    webp: Object.freeze([
      Object.freeze({ url: `${BASE}/locked-208w.191c38d7.webp`, width: 208 }),
      Object.freeze({ url: `${BASE}/locked-312w.191c38d7.webp`, width: 312 }),
      Object.freeze({ url: `${BASE}/locked-416w.191c38d7.webp`, width: 416 }),
    ]),
    poster: Object.freeze({
      avif: Object.freeze([
        Object.freeze({ url: `${BASE}/locked-poster-208w.191c38d7.avif`, width: 208 }),
        Object.freeze({ url: `${BASE}/locked-poster-312w.191c38d7.avif`, width: 312 }),
        Object.freeze({ url: `${BASE}/locked-poster-416w.191c38d7.avif`, width: 416 }),
        Object.freeze({ url: `${BASE}/locked-poster-520w.191c38d7.avif`, width: 520 }),
        Object.freeze({ url: `${BASE}/locked-poster-624w.191c38d7.avif`, width: 624 }),
      ]),
      webp: Object.freeze([
        Object.freeze({ url: `${BASE}/locked-poster-208w.191c38d7.webp`, width: 208 }),
        Object.freeze({ url: `${BASE}/locked-poster-312w.191c38d7.webp`, width: 312 }),
        Object.freeze({ url: `${BASE}/locked-poster-416w.191c38d7.webp`, width: 416 }),
        Object.freeze({ url: `${BASE}/locked-poster-520w.191c38d7.webp`, width: 520 }),
        Object.freeze({ url: `${BASE}/locked-poster-624w.191c38d7.webp`, width: 624 }),
      ]),
    }),
  }),
});

/** States that have an animated background; the rest keep their static raster. */
export const BG_ANIM_STATES = Object.freeze(['available', 'locked']);
