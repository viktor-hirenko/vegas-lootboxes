// Warms and caches motion assets so reveal animations start on a decoded frame.

import { ANIMATIONS } from './icons.js';

/** @type {Map<string, Promise<void>>} */
const preloadCache = new Map();

/**
 * @param {string} url
 * @returns {Promise<void>}
 */
function preloadUrl(url) {
  const cached = preloadCache.get(url);
  if (cached) return cached;

  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';

    const finish = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(resolve).catch(resolve);
        return;
      }
      resolve();
    };

    img.addEventListener('load', finish, { once: true });
    img.addEventListener(
      'error',
      () => reject(new Error(`Failed to preload image: ${url}`)),
      { once: true },
    );
    img.src = url;
  }).catch((error) => {
    preloadCache.delete(url);
    throw error;
  });

  preloadCache.set(url, promise);
  return promise;
}

/** URLs warmed during Phase 1 (charge) before the reveal result is known.
 * predictionBall loops infinitely, so warming it only speeds first paint (no
 * "burned one-shot timeline" issue like flash/confetti). */
export const OPEN_REVEAL_ASSET_URLS = Object.freeze([
  ANIMATIONS.flash,
  ANIMATIONS.flash2x,
  ANIMATIONS.confetti,
  ANIMATIONS.predictionBall,
]);

/** Fire-and-forget preload while the backend responds (Phase 1 — charge). */
export function warmOpenRevealAssets() {
  OPEN_REVEAL_ASSET_URLS.forEach((url) => {
    preloadUrl(url).catch(() => {});
  });
}

/**
 * @param {string} url
 * @returns {Promise<void>}
 */
export function ensurePreloaded(url) {
  return preloadUrl(url).catch(() => {});
}

/**
 * Waits until an in-DOM <img> is ready to paint. SVGator timelines start at
 * load/decode time, so reveal timers must begin only after this resolves.
 *
 * @param {HTMLImageElement} img
 * @param {number} [timeoutMs]
 * @returns {Promise<void>}
 */
export function waitForImageElement(img, timeoutMs = 800) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (typeof img.decode === 'function') {
        img.decode().then(resolve).catch(resolve);
        return;
      }
      resolve();
    };

    const timer = window.setTimeout(finish, timeoutMs);

    if (img.complete && img.naturalWidth > 0) {
      finish();
      return;
    }

    img.addEventListener('load', finish, { once: true });
    img.addEventListener('error', finish, { once: true });
  });
}
