// Reports the widget's real rendered height to the parent so the host page
// can size the iframe without clipping card glow effects. See task section on
// responsive layout ("glow карток не повинен обрізатися").

/**
 * @param {HTMLElement} el element whose content-box height should be observed
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
      notify(entry.contentRect.height);
    }
  });

  observer.observe(el);
  return () => observer.disconnect();
}
