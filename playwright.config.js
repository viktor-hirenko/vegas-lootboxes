import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT) || 4173;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * `reducedMotion` is deliberately NOT set here, and must not be added back.
 *
 * Playwright 1.62 does not apply it from `use` — neither from this file nor from
 * a `test.use()` block. Measured: with `use: { reducedMotion: 'reduce' }` the page
 * still reports `matchMedia('(prefers-reduced-motion: reduce)').matches === false`,
 * while `browser.newContext({ reducedMotion: 'reduce' })` and
 * `page.emulateMedia({ reducedMotion: 'reduce' })` both work.
 *
 * So the option used to sit here reading as "the whole suite runs under reduced
 * motion" while every spec actually ran with motion enabled — which is what the
 * animation specs want, but by accident rather than by declaration. A spec that
 * needs a specific setting must call `page.emulateMedia()` or create its own
 * context; see tests/e2e/thor-bg-animation.spec.js.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  /**
   * The animated portal is an AVIF/WebP image sequence, and "does this actually
   * animate" is engine-specific in a way nothing else in this widget is: Firefox
   * only learned animated AVIF in 113 and Safari in 16.4, and both fail SILENTLY
   * before that by rendering the still primary item. Chromium alone cannot catch
   * that, so all three engines run the suite.
   *
   * The two mobile projects exist for the asset-size question rather than for the
   * engines: they are the only projects with a device pixel ratio above 1 and a
   * viewport narrow enough to pin the card to its flat 208px width.
   */
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'node scripts/serve.js',
    url: `${BASE_URL}/lootbox-test/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
