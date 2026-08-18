import { test, expect } from '@playwright/test';
import { gotoSandbox, widgetFrame, waitForCards, loadScenario } from './helpers.js';

// Which cards are allowed to animate — the product rule, pinned across every
// scenario the sandbox can produce rather than just the default ribbon.
//
// The rule: today's card (including today's opened result, which keeps the live
// portal) and the single locked day the core spotlights as "next up". Everything
// else — every other locked day, every missed day, every past result — shows a
// static image. `render.js` implements this in one line, and the point of testing
// it against six scenarios is that the SPOTLIGHT half of the rule is positional:
// it depends on where the resolved days end, so a scenario with no available day,
// or with every day missed, exercises a different branch of
// `findSpotlightLockedIndex` than the happy path does.

const SCENARIOS = [
  'all-days',
  'day1-available',
  'day1-opened',
  'day1-prize-day2-open',
  'two-missed',
  'all-missed',
];

/** Reads every card's state, classes and whether it carries a loop layer. */
async function readRibbon(frame) {
  return frame.locator('[data-lb-track]').evaluate((track) =>
    [...track.querySelectorAll('.lb-card')].map((card) => ({
      state: card.dataset.state ?? '',
      isActive: card.classList.contains('lb-card--active'),
      isNext: card.classList.contains('lb-card--next'),
      isLocked: card.classList.contains('lb-card--locked'),
      hasLoop: Boolean(card.querySelector('[data-lb-bg-anim]')),
      // A card that lost its loop must still be showing artwork, not a bare
      // background colour — that is the whole premise of the poster layer.
      posterSrc:
        card.querySelector('.lb-card__bg')?.getAttribute('src') ??
        card.querySelector('img.lb-card__bg')?.getAttribute('src') ??
        '',
    })),
  );
}

function assertOnlyEligibleCardsAnimate(ribbon, label) {
  const offenders = ribbon.filter(
    (card) => card.hasLoop && !(card.isActive || (card.isLocked && card.isNext)),
  );
  expect(
    offenders,
    `${label}: these cards animate but must not — ${JSON.stringify(offenders)}`,
  ).toEqual([]);

  const eligible = ribbon.filter((card) => card.isActive || (card.isLocked && card.isNext));
  const missing = eligible.filter((card) => !card.hasLoop);
  expect(
    missing,
    `${label}: these cards should animate but have no layer — ${JSON.stringify(missing)}`,
  ).toEqual([]);

  // At most one of each, by construction: one "today" and one "next up".
  expect(ribbon.filter((card) => card.hasLoop).length, `${label}: too many loops`).toBeLessThanOrEqual(2);

  const blank = ribbon.filter((card) => card.posterSrc === '');
  expect(blank, `${label}: cards with no background image — ${JSON.stringify(blank)}`).toEqual([]);
}

test.describe('thor animation is confined to the two eligible cards', () => {
  for (const scenario of SCENARIOS) {
    test(`scenario "${scenario}"`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await gotoSandbox(page, 'thor');
      await loadScenario(page, scenario);

      const frame = widgetFrame(page);
      await waitForCards(frame);

      const ribbon = await readRibbon(frame);
      expect(ribbon.length, 'scenario rendered no cards').toBeGreaterThan(0);
      assertOnlyEligibleCardsAnimate(ribbon, scenario);
    });
  }

  test('the rule still holds after a card is opened', async ({ page }) => {
    // `swapToResult` rebuilds a card's children outside the normal render path,
    // so the reveal is the one moment the markup is assembled by open.js rather
    // than by render.js's `backgroundFor`. Today's result keeps the live portal;
    // the previously spotlighted locked day must keep exactly one loop, not gain
    // a second or lose its own.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoSandbox(page, 'thor');
    await loadScenario(page, 'day1-available');

    const frame = widgetFrame(page);
    await waitForCards(frame);

    const card = frame.locator('button.lb-card[data-state="available"]');
    await card.waitFor({ state: 'visible' });
    await card.click();

    const revealed = frame.locator('.lb-card[data-state="prize"], .lb-card[data-state="prediction"]');
    await expect(revealed.first()).toBeVisible({ timeout: 15_000 });

    await expect(async () => {
      const ribbon = await readRibbon(frame);
      assertOnlyEligibleCardsAnimate(ribbon, 'after reveal');
    }).toPass({ timeout: 10_000 });
  });

  test('a missed day never animates, even mid-burn', async ({ page }) => {
    // The burn path also goes through `swapToResult`, and `missed` is one of the
    // three states that kept its original static raster. If it ever picked up a
    // loop layer the burn would be compositing against a moving background.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoSandbox(page, 'thor');
    await loadScenario(page, 'two-missed');

    const frame = widgetFrame(page);
    await waitForCards(frame);

    await expect(frame.locator('.lb-card--missed')).not.toHaveCount(0);
    await expect(frame.locator('.lb-card--missed [data-lb-bg-anim]')).toHaveCount(0);
  });
});
