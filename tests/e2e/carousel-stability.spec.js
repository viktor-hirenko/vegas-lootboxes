import { test, expect } from '@playwright/test';
import { gotoSandbox, loadScenario, waitForCards, widgetFrame } from './helpers.js';

// A card's snap area travels with its transform, so an animating card used to
// drag the mandatory-snapped track along with it — Thor's reveal turns the card
// on its Y axis and pulled the whole row ~100px sideways and back. The guard is
// the row: whatever a card does to itself, its neighbours must not move.
//
// The suite opts out of the project-wide reduced-motion default on purpose:
// with it on, the reveal swaps straight to the result and there is no rotation
// left to regress against.
test.use({ reducedMotion: 'no-preference' });

/** Long enough to cover the mock backend's default delay plus the full reveal. */
const OPEN_SEQUENCE_MS = 2600;

/**
 * Clicks today's card and watches the row for the whole open sequence, sampling
 * every frame from inside the page. Cards are re-queried per sample because the
 * runtime rebuilds the track once the reveal finishes.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ scrollDrift: number, neighbourDrift: number, activeCardWidthDrop: number, samples: number }>}
 */
async function recordOpenSequence(page) {
  return page.evaluate(async (durationMs) => {
    const doc = document.getElementById('widget-frame').contentDocument;
    const track = doc.querySelector('[data-lb-track]');
    const cardAt = (i) => track.querySelectorAll('.lb-card')[i];
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

    // Mounting the row scrolls the focus card into view, and outside of reduced
    // motion that scroll is animated — sampling through its tail would measure
    // the carousel doing its job, not the bug.
    let previous = null;
    for (let settled = 0; settled < 5; settled += 1) {
      await nextFrame();
      if (track.scrollLeft !== previous) settled = -1;
      previous = track.scrollLeft;
    }

    const scrollLefts = [];
    const neighbourLefts = [];
    const activeWidths = [];
    let running = true;

    const sample = () => {
      scrollLefts.push(track.scrollLeft);
      neighbourLefts.push(cardAt(1).getBoundingClientRect().left);
      activeWidths.push(cardAt(0).getBoundingClientRect().width);
      if (running) requestAnimationFrame(sample);
    };

    sample();
    cardAt(0).click();
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    running = false;

    const spread = (values) => Math.max(...values) - Math.min(...values);
    return {
      scrollDrift: spread(scrollLefts),
      neighbourDrift: spread(neighbourLefts),
      activeCardWidthDrop: spread(activeWidths),
      samples: scrollLefts.length,
    };
  }, OPEN_SEQUENCE_MS);
}

for (const project of ['thor', 'vegas']) {
  test.describe(`${project} carousel stability`, () => {
    test("opening today's card leaves the rest of the row where it was", async ({ page }) => {
      await gotoSandbox(page, project);
      // Today's card first in the row: the worst case, since it is the snap
      // target the track is resting on.
      await loadScenario(page, 'day1-available');
      await waitForCards(widgetFrame(page));

      const { scrollDrift, neighbourDrift, activeCardWidthDrop, samples } =
        await recordOpenSequence(page);

      expect(samples).toBeGreaterThan(30);
      expect(scrollDrift).toBeLessThanOrEqual(1);
      expect(neighbourDrift).toBeLessThanOrEqual(1);

      // Thor is the brand that transforms the card box, so it is also the one
      // where a passing stability check could otherwise mean "nothing animated".
      if (project === 'thor') {
        expect(activeCardWidthDrop).toBeGreaterThan(50);
      }
    });
  });
}
