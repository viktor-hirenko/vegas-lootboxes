/** Shared helpers for sandbox + iframe E2E flows. */

/** @param {import('@playwright/test').Page} page */
export async function gotoSandbox(page, project) {
  await page.goto(`/lootbox-test/index.html?project=${project}`);
  await page.locator('#widget-frame').waitFor({ state: 'attached' });
}

/** @param {import('@playwright/test').Page} page */
export function widgetFrame(page) {
  return page.frameLocator('#widget-frame');
}

/** @param {import('@playwright/test').FrameLocator} frame */
export async function waitForCards(frame) {
  await frame.locator('.lb-card').first().waitFor({ state: 'visible' });
}

/**
 * Load a preset scenario from projects.js and push it into the widget.
 * @param {import('@playwright/test').Page} page
 * @param {string} scenarioId
 */
export async function loadScenario(page, scenarioId) {
  await page.locator('#in-scenario').selectOption(scenarioId);
  await page.locator('#btn-load-example').click();
  await page.locator('#btn-send-content').click();
}

/**
 * Push a custom card set through the sandbox parent page (same path as setContent).
 * @param {import('@playwright/test').Page} page
 * @param {object[]} cards
 */
export async function sendCards(page, cards) {
  await page.evaluate((payload) => {
    const iframe = document.getElementById('widget-frame');
    if (!iframe?.contentWindow) throw new Error('widget iframe is not ready');
    const targetOrigin = new URL(iframe.src, window.location.href).origin;
    iframe.contentWindow.postMessage({ type: 'setContent', data: { cards: payload } }, targetOrigin);
  }, cards);
}

/** @param {import('@playwright/test').FrameLocator} frame */
export async function clickAvailableCard(frame) {
  const card = frame.locator('button.lb-card[data-state="available"]').first();
  await card.waitFor({ state: 'visible' });
  await card.click();
}
