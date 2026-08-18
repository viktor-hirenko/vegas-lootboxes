import { test, expect } from '@playwright/test';
import { gotoSandbox, gotoWidgetStandalone, widgetFrame, waitForCards } from './helpers.js';
import { BG_ANIM } from '../../lootbox-2/backgrounds-anim.generated.js';

// Does the browser always fetch the RIGHT rung of the size ladder?
//
// This is the one question the whole responsive-image setup exists to answer,
// and getting it wrong is invisible in a screenshot: an under-sized pick is a
// slightly soft portal, an over-sized pick is wasted mobile data. Neither throws.
//
// The pick is driven by BG_SIZES in lootbox-2/icons.js, which hand-copies the
// `--lb-card-width` formula from core/base.css. Nothing links those two, so this
// spec measures the card the browser actually laid out rather than trusting
// either of them — if the formula and the CSS ever drift apart, the numbers here
// stop matching and the assertion fires.

/** Ladder widths the manifest actually shipped, per format. */
const LADDER = {
  avif: BG_ANIM.available.avif.map((candidate) => candidate.width),
  webp: BG_ANIM.available.webp.map((candidate) => candidate.width),
};

/** `…/available-416w.e61cc802.avif` -> `{ width: 416, format: 'avif' }`. */
function parseCandidate(url) {
  const match = /-(\d+)w\.[0-9a-f]{8}\.(avif|webp)$/.exec(url);
  if (!match) throw new Error(`Not a ladder URL: ${url}`);
  return { width: Number(match[1]), format: match[2] };
}

/** The rung a browser ought to choose: the smallest that still covers the need,
 * or the top of the ladder when nothing does. */
function idealRung(ladder, needed) {
  return ladder.find((width) => width >= needed) ?? ladder[ladder.length - 1];
}

/**
 * Measures the live card box, the device pixel ratio the iframe sees, and what
 * each layer actually downloaded.
 * @param {import('@playwright/test').FrameLocator} frame
 */
async function measure(frame, selector) {
  return frame.locator(selector).evaluate((card) => {
    const poster = card.querySelector('.lb-card__bg');
    const loop = card.querySelector('.lb-card__anim-img');
    return {
      cardWidth: card.getBoundingClientRect().width,
      dpr: window.devicePixelRatio,
      viewport: window.innerWidth,
      posterSrc: poster?.currentSrc ?? '',
      loopSrc: loop?.currentSrc ?? '',
    };
  });
}

/** Waits until the gate has promoted the loop AND the browser has committed to a
 * candidate — `currentSrc` is empty until then, which would silently pass. */
async function waitForLoopSrc(frame, selector) {
  await expect(async () => {
    const src = await frame
      .locator(`${selector} .lb-card__anim-img`)
      .evaluate((img) => img.currentSrc);
    expect(src, 'the loop never committed to a candidate').not.toBe('');
  }).toPass({ timeout: 15_000 });
}

/**
 * The core assertion, applied to one layer.
 *
 * Under-selection is a hard failure, with one legitimate exception: the top of
 * the ladder. 624px is as far as the AVIF ladder goes (and 416px for the WebP
 * fallback), so a wide desktop embed at DPR 2 genuinely cannot be served exactly
 * — see ANIMATIONS.md §2.3. That case is allowed but reported, because it is a
 * property of the source footage rather than a bug in the selection.
 *
 * Over-selection is capped at one rung above ideal: browsers are permitted some
 * latitude (and a cached larger candidate can legitimately win), but jumping two
 * rungs means `sizes` is lying about how wide the card is.
 */
function assertRung(label, url, { cardWidth, dpr }, notes) {
  const { width: picked, format } = parseCandidate(url);
  const ladder = LADDER[format];
  const needed = Math.ceil(cardWidth * dpr);
  const ideal = idealRung(ladder, needed);
  const max = ladder[ladder.length - 1];

  if (picked < needed && picked !== max) {
    throw new Error(
      `${label}: picked ${picked}w for a card needing ${needed}w ` +
        `(${cardWidth.toFixed(1)}px CSS x DPR ${dpr}), and ${max}w was available`,
    );
  }
  if (picked < needed) {
    notes.push(`${label}: ladder capped — needed ${needed}w, top rung is ${max}w (${format})`);
  }

  const idealIndex = ladder.indexOf(ideal);
  const ceiling = ladder[Math.min(idealIndex + 1, ladder.length - 1)];
  expect(
    picked,
    `${label}: picked ${picked}w where ${ideal}w covers ${needed}w — sizes may be overstating the card`,
  ).toBeLessThanOrEqual(ceiling);

  return { picked, needed, ideal, format };
}

test.describe('thor asset size selection', () => {
  test('poster and loop both cover the card on this device profile', async ({
    page,
  }, testInfo) => {
    // Explicit, because the config no longer sets it and a developer machine with
    // the OS setting enabled would otherwise never attach a loop to measure.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoSandbox(page, 'thor');
    const frame = widgetFrame(page);
    await waitForCards(frame);

    const selector = '.lb-card--active';
    await waitForLoopSrc(frame, selector);
    const measured = await measure(frame, selector);

    const notes = [];
    const poster = assertRung('poster', measured.posterSrc, measured, notes);
    const loop = assertRung('loop', measured.loopSrc, measured, notes);

    testInfo.attach; // no-op, keeps the report readable below
    console.log(
      `SIZE [${testInfo.project.name}] viewport ${measured.viewport} · card ` +
        `${measured.cardWidth.toFixed(1)}px · DPR ${measured.dpr} · needs ${poster.needed}w · ` +
        `poster ${poster.picked}w ${poster.format} · loop ${loop.picked}w ${loop.format}` +
        (notes.length ? `\n  ${notes.join('\n  ')}` : ''),
    );
  });

  test('the locked spotlight card sizes independently of the active one', async ({ page }) => {
    // Its box is 208x288, not 208x320, so it has its own ladder and its own
    // chance to mis-select. Same card width, different art.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoSandbox(page, 'thor');
    const frame = widgetFrame(page);
    await waitForCards(frame);

    const selector = '.lb-card--locked.lb-card--next';
    await waitForLoopSrc(frame, selector);
    const measured = await measure(frame, selector);

    const notes = [];
    assertRung('locked poster', measured.posterSrc, measured, notes);
    assertRung('locked loop', measured.loopSrc, measured, notes);
  });

  // The sweep below drives the viewport itself, so the project's own device
  // profile is irrelevant and running it five times would only cost minutes.
  test.describe('across viewports and pixel ratios', () => {
    const VIEWPORTS = [360, 390, 768, 1024, 1440, 1920];
    const RATIOS = [1, 2, 3];

    test('never under-serves the card, and reports where the ladder runs out', async ({
      browser,
    }) => {
      // Not a describe-level `test.skip(fn)`: that callback receives fixtures
      // only, and `browserName` cannot tell the chromium project from the
      // mobile-chrome one.
      test.skip(test.info().project.name !== 'chromium', 'sweep drives its own contexts');
      test.slow();

      const rows = [];
      const capped = [];

      for (const width of VIEWPORTS) {
        for (const dpr of RATIOS) {
          const context = await browser.newContext({
            viewport: { width, height: 900 },
            deviceScaleFactor: dpr,
            reducedMotion: 'no-preference',
          });
          const page = await context.newPage();
          await gotoSandbox(page, 'thor');
          const frame = widgetFrame(page);
          await waitForCards(frame);

          const selector = '.lb-card--active';
          await waitForLoopSrc(frame, selector);
          const measured = await measure(frame, selector);

          const notes = [];
          const poster = assertRung('poster', measured.posterSrc, measured, notes);
          const loop = assertRung('loop', measured.loopSrc, measured, notes);
          capped.push(...notes);

          rows.push(
            `  ${String(width).padStart(4)}px @${dpr}x  card ${measured.cardWidth
              .toFixed(0)
              .padStart(3)}px  needs ${String(poster.needed).padStart(4)}w  ` +
              `poster ${String(poster.picked).padStart(3)}w  loop ${String(loop.picked).padStart(3)}w`,
          );

          await context.close();
        }
      }

      console.log(`\nSIZE SWEEP (sandbox iframe, .lb-card--active)\n${rows.join('\n')}`);
      if (capped.length > 0) {
        console.log(`\nLadder ceiling reached in ${capped.length} case(s):`);
        for (const note of [...new Set(capped)]) console.log(`  ${note}`);
      }
    });

    test('the production embed width is covered at every pixel ratio', async ({ browser }) => {
      test.skip(test.info().project.name !== 'chromium', 'sweep drives its own contexts');

      // 872px is the measured width of the container the widget is embedded into
      // on the casino page. It is the only width that actually has to be right,
      // so it gets its own test rather than living inside a sweep — if the page
      // layout changes, this is the number to update, and the failure will say so.
      const CONTAINER_WIDTH = 872;

      for (const dpr of [1, 2, 3]) {
        const context = await browser.newContext({
          viewport: { width: CONTAINER_WIDTH, height: 900 },
          deviceScaleFactor: dpr,
          reducedMotion: 'no-preference',
        });
        const page = await context.newPage();
        await gotoWidgetStandalone(page, 'lootbox-2');

        const card = page.locator('.lb-card--active');
        await expect(async () => {
          const src = await card.locator('.lb-card__anim-img').evaluate((img) => img.currentSrc);
          expect(src).not.toBe('');
        }).toPass({ timeout: 15_000 });

        const measured = await card.evaluate((el) => ({
          cardWidth: el.getBoundingClientRect().width,
          dpr: window.devicePixelRatio,
          viewport: window.innerWidth,
          posterSrc: el.querySelector('.lb-card__bg')?.currentSrc ?? '',
          loopSrc: el.querySelector('.lb-card__anim-img')?.currentSrc ?? '',
        }));

        const notes = [];
        const poster = assertRung('poster', measured.posterSrc, measured, notes);
        const loop = assertRung('loop', measured.loopSrc, measured, notes);

        console.log(
          `SIZE [production ${CONTAINER_WIDTH}px @${dpr}x] card ${measured.cardWidth.toFixed(1)}px · ` +
            `needs ${poster.needed}w · poster ${poster.picked}w · loop ${loop.picked}w`,
        );

        // No upscaling is allowed at the width the product actually ships at.
        expect(
          notes,
          `the ladder does not cover the real embed at DPR ${dpr}: ${notes.join('; ')}`,
        ).toEqual([]);

        await context.close();
      }
    });

    test('a full-width embed is served without upscaling, or says where it stops', async ({
      browser,
    }) => {
      test.skip(test.info().project.name !== 'chromium', 'sweep drives its own contexts');
      test.slow();

      const rows = [];
      const capped = [];

      for (const width of [1280, 1440, 1680, 1920, 2560]) {
        for (const dpr of [1, 2]) {
          const context = await browser.newContext({
            viewport: { width, height: 900 },
            deviceScaleFactor: dpr,
            reducedMotion: 'no-preference',
          });
          const page = await context.newPage();
          await gotoWidgetStandalone(page, 'lootbox-2');

          const card = page.locator('.lb-card--active');
          await expect(async () => {
            const src = await card
              .locator('.lb-card__anim-img')
              .evaluate((img) => img.currentSrc);
            expect(src).not.toBe('');
          }).toPass({ timeout: 15_000 });

          const measured = await card.evaluate((el) => ({
            cardWidth: el.getBoundingClientRect().width,
            dpr: window.devicePixelRatio,
            viewport: window.innerWidth,
            posterSrc: el.querySelector('.lb-card__bg')?.currentSrc ?? '',
            loopSrc: el.querySelector('.lb-card__anim-img')?.currentSrc ?? '',
          }));

          const notes = [];
          const poster = assertRung('poster', measured.posterSrc, measured, notes);
          const loop = assertRung('loop', measured.loopSrc, measured, notes);
          capped.push(...notes);

          const shortfall = poster.needed > 624 ? `  SHORT by ${poster.needed - 624}px` : '';
          rows.push(
            `  ${String(width).padStart(4)}px @${dpr}x  card ${measured.cardWidth
              .toFixed(0)
              .padStart(3)}px  needs ${String(poster.needed).padStart(4)}w  ` +
              `poster ${String(poster.picked).padStart(3)}w  loop ${String(loop.picked).padStart(3)}w${shortfall}`,
          );

          await context.close();
        }
      }

      console.log(`\nSIZE SWEEP (standalone widget, full-width embed)\n${rows.join('\n')}`);
      if (capped.length > 0) {
        console.log(`\nLadder ceiling reached in ${capped.length} case(s):`);
        for (const note of [...new Set(capped)]) console.log(`  ${note}`);
      }
    });
  });
});
