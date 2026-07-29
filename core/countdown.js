// Local countdown ticker for the unlock-deadline badge.
//
// Division of responsibility (see .project-context/thor/decisions.md #5): the
// parent sends an absolute deadline once (`timerTo`, epoch ms) because only it
// knows the campaign timezone and server time; the widget formats and ticks it
// locally instead of the parent posting a new string every second.
//
// One shared interval drives every badge on screen. Badges are found by their
// `data-lb-timer-to` attribute on each tick, so re-renders need no bookkeeping —
// a rebuilt DOM is simply picked up on the next second.

const TICK_MS = 1000;

/**
 * @param {number} msRemaining
 * @returns {string} `HH:MM:SS`, hours not wrapped at 24 so a multi-day deadline
 *   still reads correctly
 */
export function formatCountdown(msRemaining) {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * @param {object} options
 * @param {HTMLElement} options.root element to scan for countdown badges
 * @param {(info: { index: number, id: string }) => void} [options.onEnd] fired
 *   once per card when its deadline passes
 * @returns {{ refresh: () => void, dispose: () => void }}
 */
export function startCountdowns({ root, onEnd }) {
  /** Cards already reported as finished, so `onEnd` fires once per deadline. */
  const ended = new Set();

  function tick() {
    const now = Date.now();

    for (const el of root.querySelectorAll('[data-lb-timer-to]')) {
      const deadline = Number(el.dataset.lbTimerTo);
      if (!Number.isFinite(deadline) || deadline <= 0) continue;

      const remaining = deadline - now;
      el.textContent = formatCountdown(remaining);

      if (remaining > 0) continue;

      const card = el.closest('.lb-card');
      const id = card?.dataset.id ?? '';
      const key = `${id}:${deadline}`;
      if (ended.has(key)) continue;
      ended.add(key);
      onEnd?.({ index: Number(card?.dataset.index ?? 0), id });
    }
  }

  tick();
  const timer = window.setInterval(tick, TICK_MS);

  return {
    /** Re-run immediately, e.g. right after a render, so a fresh badge does not
     * show its server-rendered placeholder for up to a second. */
    refresh: tick,
    dispose: () => window.clearInterval(timer),
  };
}
