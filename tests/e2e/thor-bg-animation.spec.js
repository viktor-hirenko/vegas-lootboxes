import { test, expect } from '@playwright/test';
import { gotoSandbox, widgetFrame, waitForCards, loadScenario } from './helpers.js';

// The animated portal background is gated by an IntersectionObserver in
// lootbox-2/bg-anim.js rather than by `loading="lazy"` alone, because every
// locked day animates and a scenario ribbon is padded to 30 of them. These specs
// pin the two properties that gate is there for — only the cards near the viewport
// ever load a loop, and reduced motion loads none at all — plus the one silent
// failure mode in the wiring: a card revealed by the flip gets a brand-new layer
// that the observer has never seen, so `swapToResult` has to re-register it.
//
// A note on reduced motion, because it is a trap here: `reducedMotion` as a
// fixture option — in `playwright.config.js` OR in `test.use` — is NOT applied by
// Playwright 1.62, so every spec in this repo actually runs with motion enabled
// regardless of what the config says. `page.emulateMedia()` does work, so the
// spec below sets it at runtime rather than trusting the option.

const ANIM_URL = /backgrounds-anim\//;

/** Layers whose sources the gate has promoted (i.e. actually downloading/playing). */
function attachedLayers(frame) {
  return frame.locator('[data-lb-bg-anim][data-lb-anim-on="1"]');
}

test.describe('thor animated background', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('only today and the next locked day carry a loop at all', async ({ page }) => {
    await gotoSandbox(page, 'thor');
    const frame = widgetFrame(page);
    await waitForCards(frame);

    // The default ribbon is padded out to 30 days, so this is the worst case.
    await expect(frame.locator('.lb-card')).toHaveCount(30);

    // Exactly two layers exist in the markup: today's card and the one locked day
    // the core spotlights. Every other closed day renders the same portal as a
    // single frame, so 26 loops never enter the DOM in the first place.
    await expect(frame.locator('[data-lb-bg-anim]')).toHaveCount(2);
    await expect(frame.locator('.lb-card--active [data-lb-bg-anim]')).toHaveCount(1);
    await expect(frame.locator('.lb-card--locked.lb-card--next [data-lb-bg-anim]')).toHaveCount(1);
    // ...and no other locked day has one.
    await expect(
      frame.locator('.lb-card--locked:not(.lb-card--next) [data-lb-bg-anim]'),
    ).toHaveCount(0);

    // The gate must still attach them — otherwise this spec would pass simply
    // because nothing ever animates.
    await expect(async () => {
      expect(await attachedLayers(frame).count()).toBe(2);
    }).toPass({ timeout: 10_000 });
  });

  test('the poster carries the card radius on every background layer', async ({ page }) => {
    await gotoSandbox(page, 'thor');
    const frame = widgetFrame(page);
    await waitForCards(frame);

    // The active card is `overflow: visible` so its halo can escape, so it does not
    // clip its children — a background layer left at radius 0 shows square corners
    // outside the rounded rim. core/base.css sets `border-radius: inherit` on
    // .lb-card__bg, which only resolves to the card's radius while every wrapper
    // between them carries it too.
    const radii = await frame.locator('.lb-card--active').evaluate((card) => {
      const read = (sel) => {
        const el = card.querySelector(sel);
        return el ? getComputedStyle(el).borderTopLeftRadius : null;
      };
      return {
        card: getComputedStyle(card).borderTopLeftRadius,
        frame: read('.lb-card__bg-frame'),
        poster: read('.lb-card__bg'),
        layer: read('.lb-card__bg-anim'),
        loop: read('.lb-card__anim-img'),
      };
    });

    expect(radii.card).not.toBe('0px');
    for (const [name, value] of Object.entries(radii)) {
      expect(value, `${name} must match the card radius`).toBe(radii.card);
    }
  });

  test('the animation layer never blocks the skeleton gate', async ({ page }) => {
    await gotoSandbox(page, 'thor');
    const frame = widgetFrame(page);
    await waitForCards(frame);

    // core/runtime.js holds the skeleton until every non-lazy <img> has settled,
    // and an <img> with no src fires neither load nor error — so a loop that lost
    // its loading="lazy" would stall the first paint for the full 4s timeout.
    await expect(frame.locator('.lb-card__anim-img:not([loading="lazy"])')).toHaveCount(0);
  });

  test('a revealed card re-registers its new layer with the gate', async ({ page }) => {
    await gotoSandbox(page, 'thor');
    await loadScenario(page, 'day1-available');
    const frame = widgetFrame(page);
    await waitForCards(frame);

    const card = frame.locator('button.lb-card[data-state="available"]');
    await card.waitFor({ state: 'visible' });
    await card.click();

    // The sandbox's mock backend answers, then the flip runs and the runtime
    // re-renders. `swapToResult` rebuilds the card's children, so the layer the
    // observer knew is gone and a fresh one has taken its place.
    const revealed = frame.locator('.lb-card[data-state="prize"], .lb-card[data-state="prediction"]');
    await expect(revealed.first()).toBeVisible({ timeout: 15_000 });

    // Today's opened result keeps the live portal, so it must still be animating.
    await expect(async () => {
      const layer = revealed.first().locator('[data-lb-bg-anim][data-lb-anim-on="1"]');
      expect(await layer.count()).toBe(1);
    }).toPass({ timeout: 10_000 });
  });

  test('the picked candidate follows device pixel ratio', async ({ browser }) => {
    // 208px card at DPR 3 needs 624px of raster; at DPR 1 it needs 208.
    for (const [dpr, expected] of [[1, '208w'], [3, '624w']]) {
      const context = await browser.newContext({
        deviceScaleFactor: dpr,
        viewport: { width: 500, height: 900 },
        reducedMotion: 'no-preference',
      });
      const page = await context.newPage();
      await gotoSandbox(page, 'thor');
      const frame = widgetFrame(page);
      await waitForCards(frame);

      const poster = frame.locator('.lb-card[data-state="available"] .lb-card__bg');
      await expect(poster).toHaveJSProperty('complete', true);
      const picked = await poster.evaluate((img) => img.currentSrc);
      expect(picked, `DPR ${dpr} should pick the ${expected} poster`).toContain(expected);

      await context.close();
    }
  });
});

test.describe('thor animated background under reduced motion', () => {
  test('requests no animation bytes at all', async ({ page }) => {
    // Runtime emulation, not the `reducedMotion` fixture option — see the note at
    // the top of this file. This has to be set before the widget's modules run,
    // because bg-anim.js reads the query once at module scope for `attach` to
    // consult (it also listens for changes, which is a different guarantee).
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const animRequests = [];
    page.on('request', (request) => {
      if (ANIM_URL.test(request.url()) && !/-poster-/.test(request.url())) {
        animRequests.push(request.url());
      }
    });

    await gotoSandbox(page, 'thor');
    const frame = widgetFrame(page);
    await waitForCards(frame);
    await page.waitForTimeout(1500);

    // Not "loaded then hidden" — never requested. The candidates sit in
    // data-srcset and the layer is display:none, so it never intersects.
    expect(animRequests).toEqual([]);
    await expect(frame.locator('[data-lb-bg-anim][data-lb-anim-on="1"]')).toHaveCount(0);
    // The poster is still there, so the card is not blank.
    await expect(frame.locator('.lb-card[data-state="available"] .lb-card__bg')).toBeVisible();
  });
});
