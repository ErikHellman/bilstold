import { defineConfig, devices } from '@playwright/test';

const DEV = 5179, PREVIEW = 5180;
/** Point at an already-installed Chromium instead of running `npx playwright install`. */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const chromium = { ...devices['Desktop Chrome'], launchOptions: { executablePath } };

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    // Dev server: exposes window.__w / __game so tests can check what the sim did.
    { name: 'desktop', testIgnore: /(touch|prod)\.spec\.ts/, use: { ...chromium, baseURL: `http://localhost:${DEV}` } },
    {
      name: 'phone', testMatch: /touch\.spec\.ts/,
      use: { ...devices['Pixel 7 landscape'], launchOptions: { executablePath }, baseURL: `http://localhost:${DEV}` },
    },
    // The real production bundle, as GitHub Pages serves it.
    { name: 'prod', testMatch: /prod\.spec\.ts/, use: { ...chromium, baseURL: `http://localhost:${PREVIEW}` } },
  ],
  webServer: [
    { command: `npx vite --port ${DEV} --strictPort`, port: DEV, reuseExistingServer: !process.env.CI },
    { command: `npx vite build && npx vite preview --port ${PREVIEW} --strictPort`, port: PREVIEW, reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
});
