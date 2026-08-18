import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { gotoSandbox, widgetFrame, waitForCards } from './helpers.js';

// Does the portal actually MOVE in this browser?
//
// This is the one failure mode the whole pipeline is built to avoid and the one
// nothing else can see. An animated AVIF whose `avis` brand or `moov` box went
// missing, or a browser that understands `image/avif` but not image sequences,
// does not error and does not fall through to the WebP <source> — it renders the
// still primary item. The card looks correct in the DOM, in the network panel and
// in `currentSrc`. It simply never moves.
//
// Firefox only shipped animated AVIF in 113 and Safari in 16.4, and both behaved
// exactly like that before, so "it works in Chrome" proves nothing here.
//
// HOW THIS IS MEASURED, AND ONE WAY THAT DOES NOT WORK
// Sampling the <img> into a canvas with drawImage looks like the precise way to
// read the decoder, and it is useless: every engine draws the image's DEFAULT
// frame, so a playing 151-frame loop scores a difference of exactly 0.000 and the
// test passes or fails for the wrong reason. Screenshotting the element is what
// actually observes the compositor. The <img> is screenshotted rather than the
// card so that neither the active card's halo nor the countdown badge's ticking
// text can stand in for a moving portal, and the static-card control below fails
// loudly if that isolation ever stops holding.

const SAMPLE_COUNT = 6;
const SAMPLE_INTERVAL_MS = 300;
/** Screenshots are downsampled before comparison: the loop is a soft ambient
 * glow, so fine detail adds noise and cost without adding signal. */
const COMPARE_PX = 64;

/** A still element scores 0.00; a playing loop measures in the single digits or
 * higher. 0.5 sits far enough above encoder/compositor dither to be safe. */
const MOTION_THRESHOLD = 0.5;

/** Mean absolute per-channel difference (0-255) between two PNG screenshots. */
async function pixelDistance(pngA, pngB) {
  const toRaw = (png) =>
    sharp(png)
      .resize(COMPARE_PX, COMPARE_PX, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();
  const [rawA, rawB] = await Promise.all([toRaw(pngA), toRaw(pngB)]);

  let sum = 0;
  for (let i = 0; i < rawA.length; i += 1) sum += Math.abs(rawA[i] - rawB[i]);
  return sum / rawA.length;
}

/**
 * Largest difference between the first screenshot of `locator` and any later one.
 * @param {import('@playwright/test').Locator} locator
 */
async function measureMotion(locator) {
  const shots = [];
  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    shots.push(await locator.screenshot());
    if (i < SAMPLE_COUNT - 1) await locator.page().waitForTimeout(SAMPLE_INTERVAL_MS);
  }

  let maxDiff = 0;
  for (let i = 1; i < shots.length; i += 1) {
    maxDiff = Math.max(maxDiff, await pixelDistance(shots[0], shots[i]));
  }
  return maxDiff;
}

/**
 * Blocks until the image has actually decoded, which matters in both directions:
 * a first screenshot taken before the art paints reads as a huge difference
 * against later ones (a static card scoring 32 out of 255 under parallel load,
 * observed in Firefox), and the same race would let a loop that never animates
 * pass on the strength of its own fade-in.
 */
async function waitForPainted(locator) {
  await locator.evaluate(async (img) => {
    if (!img.complete || img.naturalWidth === 0) {
      await new Promise((resolve, reject) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', () => reject(new Error('image failed to load')), {
          once: true,
        });
        setTimeout(() => reject(new Error('image did not load in time')), 15000);
      });
    }
    await img.decode().catch(() => {});
  });
  // The layer crossfades in over 240ms (theme.css); sampling through that would
  // read the fade itself as motion.
  await locator.page().waitForTimeout(600);
}

/** Waits for the gate to promote the loop and the browser to commit to a file. */
async function waitForLoop(frame, selector) {
  const locator = frame.locator(selector);
  await expect(async () => {
    const src = await locator.evaluate((img) => img.currentSrc);
    expect(src, 'the gate never promoted the loop').not.toBe('');
  }).toPass({ timeout: 15_000 });
  await waitForPainted(locator);
  return locator.evaluate((img) => img.currentSrc);
}

async function expectMoving(frame, selector, label, projectName) {
  const source = await waitForLoop(frame, selector);
  const maxDiff = await measureMotion(frame.locator(selector));
  const format = source.endsWith('.avif') ? 'AVIF' : 'WebP';

  console.log(
    `MOTION [${projectName}] ${label}: ${format} diff ${maxDiff.toFixed(2)} ` +
      `(${source.split('/').pop()})`,
  );

  expect(
    maxDiff,
    `${label} is not moving in ${projectName} — the browser decoded ${format} as a still image`,
  ).toBeGreaterThan(MOTION_THRESHOLD);
}

test.describe('thor portal loop really animates', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoSandbox(page, 'thor');
    await waitForCards(widgetFrame(page));
  });

  test("today's card", async ({ page }, testInfo) => {
    await expectMoving(
      widgetFrame(page),
      '.lb-card--active .lb-card__anim-img',
      'active card',
      testInfo.project.name,
    );
  });

  test('the spotlighted locked day', async ({ page }, testInfo) => {
    await expectMoving(
      widgetFrame(page),
      '.lb-card--locked.lb-card--next .lb-card__anim-img',
      'locked next',
      testInfo.project.name,
    );
  });

  test('a non-spotlight locked day stays perfectly still', async ({ page }, testInfo) => {
    // The control. It proves two things at once: that `posterOnly` really does
    // withhold the loop from the other 25 locked days, and that the measurement
    // above is reading the portal rather than some ambient CSS motion.
    const frame = widgetFrame(page);
    const still = frame.locator('.lb-card--locked:not(.lb-card--next) .lb-card__bg').first();
    await expect(still).toBeVisible();
    await waitForPainted(still);

    const maxDiff = await measureMotion(still);
    console.log(`MOTION [${testInfo.project.name}] static locked control: diff ${maxDiff.toFixed(2)}`);
    expect(maxDiff, 'a locked day that must be static is animating').toBeLessThanOrEqual(
      MOTION_THRESHOLD,
    );
  });

  test('reduced motion leaves the portal frozen', async ({ page }, testInfo) => {
    // The counterpart to the byte-level check in thor-bg-animation.spec.js: not
    // only are no animation bytes requested, what the player is left looking at
    // genuinely does not move.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    const frame = widgetFrame(page);
    await waitForCards(frame);

    const poster = frame.locator('.lb-card--active .lb-card__bg');
    await expect(poster).toBeVisible();
    await waitForPainted(poster);

    // Nothing should have been promoted in the first place.
    await expect(frame.locator('[data-lb-bg-anim][data-lb-anim-on="1"]')).toHaveCount(0);

    const maxDiff = await measureMotion(poster);
    console.log(`MOTION [${testInfo.project.name}] reduced motion: diff ${maxDiff.toFixed(2)}`);
    expect(maxDiff, 'something is still moving under prefers-reduced-motion').toBeLessThanOrEqual(
      MOTION_THRESHOLD,
    );
  });
});
