// Renders placeholder skeleton cards while the widget waits for real content.
// Static layout: flat brand background with a centered brand mark at reduced
// opacity. The mark and its intrinsic size come from the brand config; the
// background colour is a theme token (--lb-skeleton-bg).

/**
 * @param {HTMLElement} track container to fill with skeleton cards
 * @param {number} count how many placeholder cards to render
 * @param {{ mark: string, markWidth?: number, markHeight?: number }} skeleton brand config
 */
export function renderSkeleton(track, count, skeleton) {
  track.innerHTML = '';
  track.setAttribute('aria-busy', 'true');

  const { mark, markWidth = 128, markHeight = 128 } = skeleton;

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) {
    const el = document.createElement('div');
    el.className = 'lb-card lb-card--skeleton';
    if (i === 0) el.classList.add('lb-card--active');
    el.setAttribute('role', 'listitem');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="lb-card__skeleton-logo">
        <img src="${mark}" alt="" width="${markWidth}" height="${markHeight}" decoding="async" />
      </div>
    `;
    fragment.appendChild(el);
  }
  track.appendChild(fragment);
}

export function clearSkeleton(track) {
  track.removeAttribute('aria-busy');
}
