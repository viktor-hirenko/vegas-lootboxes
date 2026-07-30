import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT) || 4173;
const BASE_URL = `http://localhost:${PORT}`;

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
    ...devices['Desktop Chrome'],
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'node scripts/serve.js',
    url: `${BASE_URL}/lootbox-test/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
