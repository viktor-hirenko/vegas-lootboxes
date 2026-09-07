import { test, expect } from '@playwright/test';
import {
  gotoSandbox,
  loadScenario,
  widgetFrame,
  waitForCards,
  countWidgetMessages,
} from './helpers.js';

// The two halves of "one player intent, one backend call".
//
// The widget does not call the backend itself: it asks the parent page to, and
// the parent answers with `setCardState`. That leaves two failure modes the
// widget alone can close, and both used to be open:
//
//   1. Nothing stopped a second ask. The brands set `pointer-events: none` on a
//      charging card, which stops a mouse and does nothing at all to a focused
//      <button> receiving Enter — measured at 6 `cardClick` on Thor and 9 on
//      Vegas for one intended open.
//   2. Nothing ended the wait. A parent that never answered left the card
//      charging forever, and because a charging card is not clickable the player
//      could not even retry.
//
// The mock backend is switched OFF in both tests so the parent stays silent and
// the widget is measured on its own behaviour, not the sandbox's.

/** Puts the sandbox in "one openable card, and nothing will ever answer" state. */
async function openableCardWithSilentParent(page, project) {
  await gotoSandbox(page, project);
  await page.locator('#mock-enabled').uncheck();
  await loadScenario(page, 'day1-available');

  const frame = widgetFrame(page);
  await waitForCards(frame);

  const card = frame.locator('.lb-card[data-state="available"]');
  await expect(card).toBeVisible();
  return { frame, card };
}

for (const project of ['thor', 'vegas']) {
  test(`${project}: hammering a card asks the parent exactly once`, async ({ page }) => {
    const { card } = await openableCardWithSilentParent(page, project);

    const before = await countWidgetMessages(page, 'cardClick');

    // `force` because the guard's own effect (a disabled button) would otherwise
    // make Playwright wait for actionability and time out rather than click —
    // the point here is to fire the events regardless and prove they go nowhere.
    for (let i = 0; i < 4; i += 1) {
      await card.click({ force: true, timeout: 2_000 }).catch(() => {});
    }
    // Keyboard is the path `pointer-events: none` never covered.
    await card.focus().catch(() => {});
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press('Enter');
    }

    await expect
      .poll(() => countWidgetMessages(page, 'cardClick'), {
        message: 'nine activations must still be one request to the parent',
      })
      .toBe(before + 1);
  });
}

test.describe('a parent that never answers', () => {
  test('gives the card back and says so', async ({ page }) => {
    // Pure protocol logic with no engine-specific surface, and it costs a real
    // 15s wall-clock wait — so unlike the animation specs it runs on one engine.
    // (A describe-level `test.skip(condition)` gets the fixtures but no
    // testInfo, and `browserName` cannot tell chromium from mobile-chrome.)
    test.skip(
      test.info().project.name !== 'chromium',
      'engine-independent; the 15s deadline is not worth paying five times',
    );

    const { frame, card } = await openableCardWithSilentParent(page, 'thor');
    await card.click({ force: true });

    // Phase 1 is running and the card is out of play.
    await expect(frame.locator('.lb-card--opening')).toHaveCount(1);
    await expect(card).toBeDisabled();

    // OPEN_TIMEOUT_MS is 15s; allow the wait plus a render.
    await expect
      .poll(() => countWidgetMessages(page, 'openTimeout'), { timeout: 20_000 })
      .toBe(1);

    // The card is rebuilt from the store: charge gone, clickable again.
    await expect(frame.locator('.lb-card--opening')).toHaveCount(0);
    await expect(card).toBeEnabled();

    // And the retry actually reaches the parent — the guard released with it.
    const before = await countWidgetMessages(page, 'cardClick');
    await card.click();
    await expect.poll(() => countWidgetMessages(page, 'cardClick')).toBe(before + 1);
  });
});
