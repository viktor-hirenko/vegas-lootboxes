/** Shared helpers for sandbox + iframe E2E flows. */

/**
 * Counts `ready` messages on the parent page, installed before any document runs
 * so the widget's own `ready` cannot land before the listener does.
 *
 * This exists because the protocol says commands are only safe AFTER `ready`
 * (INTEGRATION.md §2), and a helper that ignores that races the widget's boot.
 * Chromium happened to win that race and WebKit did not: `setContent` posted too
 * early is dropped on the floor, the widget keeps whatever the URL gave it, and
 * the spec fails somewhere far away from the actual cause.
 */
function installReadyProbe(page) {
  return page.addInitScript(() => {
    // Runs in the widget iframe too, where it simply never increments — harmless,
    // and cheaper than trying to detect which frame this is.
    window.__lbReadyCount = 0;
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'ready') window.__lbReadyCount += 1;
    });
  });
}

/** @param {import('@playwright/test').Page} page */
export async function gotoSandbox(page, project) {
  await installReadyProbe(page);
  await page.goto(`/lootbox-test/index.html?project=${project}`);
  await page.locator('#widget-frame').waitFor({ state: 'attached' });
  await waitForWidgetReady(page);
  await scrollWidgetIntoView(page);
}

/**
 * Brings the widget iframe on screen, which every spec wants and none used to do.
 *
 * The sandbox stacks its control panel above the widget, so on a narrow viewport
 * the iframe lands roughly 4000px down the page — far enough that Chromium
 * correctly declines to load the loop's `loading="lazy"` image at all. That is
 * the browser behaving exactly as intended (and in production it is the feature:
 * a widget below the fold costs nothing), but it means a spec that never scrolls
 * is measuring a widget no user is looking at, and the result depends on the
 * engine's lazy-load threshold rather than on anything this repo controls.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function scrollWidgetIntoView(page) {
  await page.locator('#widget-frame').scrollIntoViewIfNeeded();
}

/**
 * Resolves once the widget has posted `ready` at least `count` times — i.e. it
 * has rendered and, crucially, attached its message listener.
 * @param {import('@playwright/test').Page} page
 */
export async function waitForWidgetReady(page, count = 1) {
  await page.waitForFunction(
    (expected) => (window.__lbReadyCount ?? 0) >= expected,
    count,
    { timeout: 15_000 },
  );
}

/** @param {import('@playwright/test').Page} page */
export function widgetFrame(page) {
  return page.frameLocator('#widget-frame');
}

/** @param {import('@playwright/test').FrameLocator} frame */
export async function waitForCards(frame) {
  await frame.locator('.lb-card').first().waitFor({ state: 'visible' });
}

/** A four-card ribbon covering the states worth measuring: one history result, the
 * active day, and two locked days so one of them becomes the spotlight. */
const STANDALONE_CARDS = [
  'c1_state=prize&c1_date=1+Mar&c1_prize=coin&c1_title=20+Free+Spins',
  'c2_state=available&c2_date=2+Mar',
  'c3_state=locked&c3_date=3+Mar',
  'c4_state=locked&c4_date=4+Mar',
].join('&');

/**
 * Loads a widget as a top-level document instead of through the sandbox.
 *
 * The sandbox devotes most of its width to the control panel, so its iframe
 * never gets much past 870px however wide the browser is — which pins the card
 * near its 208px floor and leaves the fluid desktop branch of `--lb-card-width`
 * (`calc(100cqw * 13 / 57)`, core/base.css) essentially untested. A real embed
 * has no such panel, so this is the only way to see how the widget behaves when
 * a card is genuinely large.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} folder brand folder, e.g. `lootbox-2`
 */
export async function gotoWidgetStandalone(page, folder) {
  await page.goto(`/${folder}/index.html?${STANDALONE_CARDS}`);
  await page.locator('.lb-card').first().waitFor({ state: 'visible' });
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
