// Wires card-row navigation. Desktop gets prev/next arrow buttons that scroll
// the track; mobile relies on native horizontal swipe/scroll (scroll-snap is
// handled entirely in CSS). This module only manages arrow visibility/state
// and click-to-scroll — it does not care how many cards there are.

const EDGE_TOLERANCE_PX = 4;
const SCROLL_STEP_RATIO = 0.9;

const FOCUS_SELECTORS = [
  '.lb-card[data-state="available"]',
  '.lb-card.lb-card--active',
];

/**
 * How many cards fully fit in the track at scrollLeft = 0 (desktop: 4).
 *
 * @param {HTMLElement} track
 * @param {HTMLElement[]} cards
 * @returns {number}
 */
function countCardsInFirstScreen(track, cards) {
  let count = 0;
  for (const card of cards) {
    if (card.offsetLeft + card.offsetWidth > track.clientWidth + EDGE_TOLERANCE_PX) break;
    count += 1;
  }
  return Math.max(1, count);
}

/**
 * Scrolls to the page of cards that contains the focus card (available / today).
 *
 * Pages are groups of N cards that fit on one screen (N = 4 on desktop).
 * We align the *first card of that page* to the left — not the focus card —
 * so an active day keeps its natural slot (2nd / 3rd / 4th) and earlier days
 * on the same page stay visible. Scroll only changes when focus moves to the
 * next group of N (e.g. days 1–4 → stay at start; days 5–8 → one page step).
 *
 * @param {HTMLElement} track
 * @returns {boolean} whether a focus card was found and positioned
 */
function scrollToFocusCard(track) {
  const cards = [...track.querySelectorAll('.lb-card')];
  const focusCard = FOCUS_SELECTORS.map((selector) => track.querySelector(selector)).find(Boolean);
  if (!focusCard || cards.length === 0) return false;

  const focusIndex = cards.indexOf(focusCard);
  if (focusIndex < 0) return false;

  const pageSize = countCardsInFirstScreen(track, cards);
  const pageStartIndex = Math.floor(focusIndex / pageSize) * pageSize;
  const pageStartCard = cards[pageStartIndex];

  const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
  const paddingLeft = Number.parseFloat(getComputedStyle(track).paddingLeft) || 0;
  const targetLeft =
    pageStartIndex === 0
      ? 0
      : Math.max(0, Math.min(maxScroll, pageStartCard.offsetLeft - paddingLeft));

  track.scrollTo({ left: targetLeft, behavior: 'auto' });
  return true;
}

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

  const resizeObserver = new ResizeObserver(() => {
    scrollToFocusCard(track);
    updateState();
  });
  resizeObserver.observe(track);

  // First attempt after paint; ResizeObserver retries once layout/images settle.
  window.requestAnimationFrame(() => {
    scrollToFocusCard(track);
    updateState();
  });

  return () => {
    prevBtn?.removeEventListener('click', handlePrev);
    nextBtn?.removeEventListener('click', handleNext);
    track.removeEventListener('scroll', updateState);
    resizeObserver.disconnect();
  };
}
