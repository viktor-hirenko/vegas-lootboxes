// Wires card-row navigation. Desktop gets prev/next arrow buttons that scroll
// the track; mobile relies on native horizontal swipe/scroll (scroll-snap is
// handled entirely in CSS). This module only manages arrow visibility/state
// and click-to-scroll — it does not care how many cards there are.

const EDGE_TOLERANCE_PX = 4;
const SCROLL_STEP_RATIO = 0.9;

/**
 * @param {HTMLElement} root element with [data-lb-carousel]
 * @returns {() => void} disposer
 */
export function initCarousel(root) {
  const track = root.querySelector('[data-lb-track]');
  const prevBtn = root.querySelector('[data-lb-prev]');
  const nextBtn = root.querySelector('[data-lb-next]');

  if (!track) return () => {};

  function scrollByDirection(direction) {
    track.scrollBy({ left: track.clientWidth * SCROLL_STEP_RATIO * direction, behavior: 'smooth' });
  }

  function updateState() {
    const maxScroll = track.scrollWidth - track.clientWidth;
    const scrollable = maxScroll > EDGE_TOLERANCE_PX;
    const atStart = track.scrollLeft <= EDGE_TOLERANCE_PX;
    const atEnd = track.scrollLeft >= maxScroll - EDGE_TOLERANCE_PX;

    root.classList.toggle('lb-carousel--scrollable', scrollable);
    root.classList.toggle('lb-carousel--at-start', atStart);
    root.classList.toggle('lb-carousel--at-end', atEnd);

    if (prevBtn) prevBtn.disabled = !scrollable || atStart;
    if (nextBtn) nextBtn.disabled = !scrollable || atEnd;
  }

  const handlePrev = () => scrollByDirection(-1);
  const handleNext = () => scrollByDirection(1);

  prevBtn?.addEventListener('click', handlePrev);
  nextBtn?.addEventListener('click', handleNext);
  track.addEventListener('scroll', updateState, { passive: true });

  const resizeObserver = new ResizeObserver(updateState);
  resizeObserver.observe(track);

  // Re-check after layout settles (fonts/images can change scrollWidth).
  window.requestAnimationFrame(updateState);

  return () => {
    prevBtn?.removeEventListener('click', handlePrev);
    nextBtn?.removeEventListener('click', handleNext);
    track.removeEventListener('scroll', updateState);
    resizeObserver.disconnect();
  };
}
