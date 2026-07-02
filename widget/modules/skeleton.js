// Renders placeholder skeleton cards while the widget waits for real content
// (no card params in the URL yet, and no setContent/setLoading received).

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
    if (i === 0) el.classList.add('lb-card--today');
    el.setAttribute('role', 'listitem');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="lb-card__skeleton-shimmer"></div>';
    fragment.appendChild(el);
  }
  track.appendChild(fragment);
}

export function clearSkeleton(track) {
  track.removeAttribute('aria-busy');
}
