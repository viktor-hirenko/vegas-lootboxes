import { test, expect } from '@playwright/test';
import { gotoSandbox, widgetFrame, waitForCards, loadScenario } from './helpers.js';

for (const project of ['vegas', 'thor']) {
  test.describe(`${project} smoke`, () => {
    test('sandbox loads iframe and renders cards', async ({ page }) => {
      await gotoSandbox(page, project);
      const frame = widgetFrame(page);
      await waitForCards(frame);
      await expect(frame.locator('.lb-card')).not.toHaveCount(0);
    });
  });
}

test.describe('vegas smoke', () => {
  test('day1-available scenario shows one openable card', async ({ page }) => {
    await gotoSandbox(page, 'vegas');
    await loadScenario(page, 'day1-available');
    const frame = widgetFrame(page);
    await expect(frame.locator('button.lb-card[data-state="available"]')).toHaveCount(1);
  });
});

test.describe('thor smoke', () => {
  test('day1-available scenario shows one openable card', async ({ page }) => {
    await gotoSandbox(page, 'thor');
    await loadScenario(page, 'day1-available');
    const frame = widgetFrame(page);
    await expect(frame.locator('button.lb-card[data-state="available"]')).toHaveCount(1);
  });
});
