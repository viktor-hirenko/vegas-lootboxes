import { test, expect } from '@playwright/test';
import { gotoSandbox, widgetFrame, sendCards } from './helpers.js';

test.describe('thor timer', () => {
  test('locked spotlight card shows countdown badge when timerTo is set', async ({ page }) => {
    await gotoSandbox(page, 'thor');

    const timerTo = Date.now() + 120_000;
    await sendCards(page, [
      { index: 1, state: 'prize', date: '1 Mar', title: '20 Free Spins', prizeType: 'coins' },
      { index: 2, state: 'locked', date: '2 Mar', timerTo },
      { index: 3, state: 'locked', date: '3 Mar' },
    ]);

    const frame = widgetFrame(page);
    const timerBadge = frame.locator('.lb-card--locked.lb-card--next .lb-card__badge--timer');
    await expect(timerBadge).toBeVisible();
    await expect(timerBadge).toHaveText(/\d{2}:\d{2}:\d{2}/);
  });
});
