import { test, expect } from '@playwright/test';
import {
  gotoSandbox,
  widgetFrame,
  loadScenario,
  clickAvailableCard,
} from './helpers.js';

for (const project of ['vegas', 'thor']) {
  test.describe(`${project} open flow`, () => {
    test('click available runs mock backend and reveals prize', async ({ page }) => {
      await gotoSandbox(page, project);
      await loadScenario(page, 'day1-available');

      const frame = widgetFrame(page);
      await clickAvailableCard(frame);

      await expect(frame.locator('.lb-card[data-state="prize"]').first()).toBeVisible({
        timeout: 15_000,
      });
    });
  });
}
