import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E Test Configuration (mobile — Expo web build)
 *
 * Targets the Expo dev server (`npx expo start --web --port 8081`) with the
 * API alongside it, mirroring apps/web/playwright.config.ts conventions
 * (blob reporter for CI sharding, same timeout/retry shape). Suite is
 * chromium-only for now; add an iphone project once chromium is green.
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests/e2e",

  // Maximum time one test can run
  timeout: 60 * 1000,

  // Test execution settings
  fullyParallel: true,
  forbidOnly: !!process.env.CI, // Fail if test.only is left in CI
  retries: process.env.CI ? 1 : 0, // 1 retry in CI for flaky browser tests
  workers: process.env.CI ? 4 : 2, // 2 locally, 4 in CI

  // Reporter to use (blob in CI so shards merge in Task 4 without
  // colliding with the web suite's apps/web/blob-report/ artifacts)
  reporter: process.env.CI ? "blob" : "html",

  // Shared settings for all tests
  use: {
    // Base URL for navigation (Expo web dev server)
    baseURL: "http://localhost:8081",

    // Collect trace on failure
    trace: "retain-on-failure",

    // Screenshot on failure
    screenshot: "only-on-failure",

    // Video on failure
    video: "retain-on-failure",
  },

  // Chromium only (see header comment re: iphone later)
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 1080 },
      },
    },
  ],

  // Auto-start servers for e2e tests (array form: API + Expo web).
  // Reuse existing dev servers locally, start fresh in CI.
  // Metro has no health endpoint, so the Expo entry polls the dev server
  // root with a 180s timeout (cold start = Metro bundling on first request).
  webServer: [
    {
      command: "cd ../api && NODE_ENV=test ENABLE_QUEUE_WORKERS=true pnpm dev",
      url: "http://localhost:8000/api/health",
      timeout: 180 * 1000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "npx expo start --web --port 8081",
      url: "http://localhost:8081",
      timeout: 180 * 1000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      // The CI job exports NODE_ENV=test, which Expo would inherit — and
      // @react-native/dev-middleware throws under NODE_ENV=test
      // ("DefaultToolLauncher must be mocked"). A dev server is a
      // development server, so pin it back explicitly.
      env: { NODE_ENV: "development" },
    },
  ],
});
