// Reports the widget's real rendered height to the parent so the host page can
// size the iframe without clipping card glow effects.
//
// The iframe element on the parent does not grow with content inside it. After
// the widget renders, ResizeObserver measures .lb-widget and the widget sends
// `resize { height }` so the parent can set iframe.style.height. Parent may
// also keep a CSS min-height to avoid a layout jump before the widget boots.
//
// Only the widget's own box is measured, never the document. Inside an iframe
// `documentElement.scrollHeight` is never below the iframe itself, so a height
// taken from it is just the height the parent last set: once anything on the
// host made the iframe taller for a moment — a desktop layout on its first
// frame, a tall placeholder, a rotation — that height came straight back and
// the iframe could never shrink again, leaving an empty gap under the cards.
// The box is also complete: everything that moves or glows lives inside the
// card track, which clips, with the glow room reserved in the track's own
// padding, so nothing paints outside .lb-widget.

/**
 * A shrink smaller than this is not reported when the widget's width changed
 * since the last report.
 *
 * Shrinking the iframe can change the iframe's own width. The host page gets
 * shorter, its scrollbar goes away, the iframe gets ~17px wider — and on
 * desktop the cards scale with the width (card = width · 13/57), so the widget
 * grows ~6px back, the page grows, the scrollbar returns, and the two heights
 * alternate every frame. Content that merely gets shorter (a card that stops
 * being today's) does not change the width and is always reported exactly; a
 * width-driven shrink this small is left as a few transparent pixels instead.
 * 16px holds against a classic scrollbar down to 50% browser zoom, where it is
 * ~34 CSS px wide and worth ~12px of widget height.
 */
export const MIN_WIDTH_DRIVEN_SHRINK = 16;

/**
 * Whether a newly measured size should be posted to the parent.
 *
 * @param {{ width: number, height: number } | null} last size in the last report, null before the first
 * @param {{ width: number, height: number }} next size just measured, height already rounded up
 * @returns {boolean}
 */
export function shouldReport(last, next) {
  if (last === null) return true;
  // Growth never waits: an iframe shorter than the widget clips the cards.
  if (next.height > last.height) return true;
  if (next.height === last.height) return false;
  return next.width === last.width || last.height - next.height >= MIN_WIDTH_DRIVEN_SHRINK;
}

/**
 * @param {ResizeObserverEntry} entry
 * @returns {{ width: number, height: number }}
 */
function readBorderBox(entry) {
  const box = entry.borderBoxSize?.[0];
  if (box?.inlineSize != null && box?.blockSize != null) {
    return { width: box.inlineSize, height: box.blockSize };
  }
  const rect = entry.target.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

/**
 * @param {HTMLElement} el root element whose border-box height should be observed
 * @param {(height: number) => void} callback called with the rounded height in px
 * @returns {() => void} disposer
 */
export function observeResize(el, callback) {
  /** @type {{ width: number, height: number } | null} */
  let last = null;

  const notify = ({ width, height }) => {
    // Rounded up so a fractional box never leaves the bottom pixel clipped.
    const next = { width, height: Math.ceil(height) };
    if (!shouldReport(last, next)) return;
    last = next;
    callback(next.height);
  };

  if (typeof ResizeObserver === 'undefined') {
    // Extremely old browsers: fall back to a one-shot measurement.
    const rect = el.getBoundingClientRect();
    notify({ width: rect.width, height: rect.height });
    return () => {};
  }

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      notify(readBorderBox(entry));
    }
  });

  observer.observe(el);
  return () => observer.disconnect();
}
