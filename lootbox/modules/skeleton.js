// Renders placeholder skeleton cards while the widget waits for real content.
// Visual spec: Figma node 78479:537914 (State=skeleton) — bg #440e61,
// 208×288/320px, radius 8px, centered Logo_Vegas at 128px / opacity 32%.

const LOGO_SRC = './assets/images/logo-vegas.png';

/**
 * @param {HTMLElement} track container to fill with skeleton cards
 * @param {number} count how many placeholder cards to render
 */
export function renderSkeleton(track, count) {
  track.innerHTML = '';
  track.setAttribute('aria-busy', 'true');

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) {
    const el = document.createElement('div');
    el.className = 'lb-card lb-card--skeleton';
    if (i === 0) el.classList.add('lb-card--active');
    el.setAttribute('role', 'listitem');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="lb-card__skeleton-logo">
        <img src="${LOGO_SRC}" alt="" width="147" height="128" decoding="async" />
      </div>
    `;
    fragment.appendChild(el);
  }
  track.appendChild(fragment);
}

export function clearSkeleton(track) {
  track.removeAttribute('aria-busy');
}
