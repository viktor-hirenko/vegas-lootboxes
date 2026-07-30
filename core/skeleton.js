// Renders placeholder skeleton cards while the widget waits for real content.
// Static layout: flat brand background (--lb-skeleton-bg) with an optional
// centered brand mark at reduced opacity, taken from the brand config.

/**
 * @param {HTMLElement} track container to fill with skeleton cards
 * @param {number} count how many placeholder cards to render
 * @param {{ mark?: string, markWidth?: number, markHeight?: number }} skeleton brand
 *   config; a brand with no mark asset yet renders a bare tinted placeholder
 */
export function renderSkeleton(track, count, skeleton) {
  track.innerHTML = '';
  track.setAttribute('aria-busy', 'true');

  const { mark, markWidth = 128, markHeight = 128 } = skeleton;
  const markHtml = mark
    ? `<div class="lb-card__skeleton-logo">
        <img src="${mark}" alt="" width="${markWidth}" height="${markHeight}" decoding="async" />
      </div>`
    : '';

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) {
    const el = document.createElement('div');
    el.className = 'lb-card lb-card--skeleton';
    if (i === 0) el.classList.add('lb-card--active');
    el.setAttribute('role', 'listitem');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = markHtml;
    fragment.appendChild(el);
  }
  track.appendChild(fragment);
}

export function clearSkeleton(track) {
  track.removeAttribute('aria-busy');
}
