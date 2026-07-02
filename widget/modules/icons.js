// Small inline SVG placeholders for each card state. Deliberately simple —
// final artwork/animation is a separate task (out of scope here). Keeping
// icons inline avoids extra network requests, matching the "minimal weight"
// requirement.

const GIFT = `
<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="26" width="44" height="30" rx="4" fill="url(#g1)" />
  <rect x="10" y="26" width="44" height="10" fill="#fff" fill-opacity="0.18" />
  <rect x="28" y="26" width="8" height="30" fill="#fff" fill-opacity="0.35" />
  <path d="M32 26c-6-10-20-8-16 0" stroke="#ec4899" stroke-width="4" stroke-linecap="round" />
  <path d="M32 26c6-10 20-8 16 0" stroke="#a855f7" stroke-width="4" stroke-linecap="round" />
  <defs>
    <linearGradient id="g1" x1="10" y1="26" x2="54" y2="56" gradientUnits="userSpaceOnUse">
      <stop stop-color="#f472b6" />
      <stop offset="1" stop-color="#7c3aed" />
    </linearGradient>
  </defs>
</svg>`;

const LOCK = `
<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="16" y="28" width="32" height="26" rx="6" fill="#3a2a55" />
  <path d="M22 28v-6a10 10 0 0 1 20 0v6" stroke="#8b7bab" stroke-width="4" fill="none" />
  <circle cx="32" cy="40" r="4" fill="#8b7bab" />
  <rect x="30" y="42" width="4" height="8" rx="2" fill="#8b7bab" />
</svg>`;

const PRIZE = `
<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="20" width="48" height="34" rx="6" fill="url(#g2)" />
  <path d="M14 30h36" stroke="#fff" stroke-opacity="0.5" stroke-width="2" />
  <text x="32" y="42" text-anchor="middle" font-size="16" font-weight="700" fill="#fff" font-family="sans-serif">$</text>
  <defs>
    <linearGradient id="g2" x1="8" y1="20" x2="56" y2="54" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffd76a" />
      <stop offset="1" stop-color="#ff6a00" />
    </linearGradient>
  </defs>
</svg>`;

const PREDICTION = `
<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="30" r="18" fill="url(#g3)" />
  <text x="32" y="37" text-anchor="middle" font-size="20" font-weight="800" fill="#fff" font-family="sans-serif">?</text>
  <defs>
    <radialGradient id="g3" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(32 30) rotate(90) scale(18)">
      <stop stop-color="#f0abfc" />
      <stop offset="1" stop-color="#7c3aed" />
    </radialGradient>
  </defs>
</svg>`;

const EMPTY = `
<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="12" y="24" width="40" height="28" rx="6" fill="#241638" />
  <path d="M20 32h24" stroke="#5b4a78" stroke-width="3" stroke-linecap="round" />
  <path d="M20 40h16" stroke="#5b4a78" stroke-width="3" stroke-linecap="round" />
</svg>`;

export const ICONS = Object.freeze({
  available: GIFT,
  locked: LOCK,
  prize: PRIZE,
  prediction: PREDICTION,
  empty: EMPTY,
});
