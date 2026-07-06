// Reports the widget's real rendered height to the parent so the host page
// can size the iframe without clipping card glow effects.
//
// The iframe element on the parent does not grow with content inside it. After
// the widget renders, ResizeObserver measures .lb-widget and the widget sends
// `resize { height }` so the parent can set iframe.style.height. Parent may
// also keep a CSS min-height to avoid a layout jump before the widget boots.

/**
 * @param {ResizeObserverEntry} entry
 * @returns {number}
 */
function readBorderBoxHeight(entry) {
  const box = entry.borderBoxSize?.[0];
  if (box?.blockSize != null) return box.blockSize;
  return entry.target.getBoundingClientRect().height;
}

/**
 * @param {HTMLElement} el root element whose border-box height should be observed
 * @param {(height: number) => void} callback called with the rounded height in px
 * @returns {() => void} disposer
 */
export function observeResize(el, callback) {
  let lastHeight = -1;

  const notify = (height) => {
    const rounded = Math.ceil(height);
    if (rounded === lastHeight) return;
    lastHeight = rounded;
    callback(rounded);
  };

  if (typeof ResizeObserver === 'undefined') {
    // Extremely old browsers: fall back to a one-shot measurement.
    notify(el.getBoundingClientRect().height);
    return () => {};
  }

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      notify(readBorderBoxHeight(entry));
    }
  });

  observer.observe(el);
  return () => observer.disconnect();
}
