import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E Test Configuration
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

  // Reporter to use
  reporter: process.env.CI ? "blob" : "html",

  // Shared settings for all tests
  use: {
    // Base URL for navigation
    baseURL: "http://localhost:3000",

    // Use a consistent non-UTC timezone so trip timezone differs from user
    // timezone (set to UTC by auth helper), ensuring timezone selector tests work
    timezoneId: "America/Chicago",

    // Collect trace on failure
    trace: "retain-on-failure",

    // Screenshot on failure
    screenshot: "only-on-failure",

    // Video on failure
    video: "retain-on-failure",
  },

  // Configure projects: chromium (primary) + iphone (mobile viewport + WebKit engine)
  // Dropped firefox, webkit, ipad — they caught flakiness, not real bugs (see 1f7fa72)
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 1080 },
      },
    },
    {
      name: "iphone",
      use: { ...devices["iPhone 14"] },
    },
  ],

  // Auto-start servers for e2e tests
  // Reuse existing dev servers locally, start fresh in CI
  webServer: [
    {
      command: "cd ../api && NODE_ENV=test ENABLE_QUEUE_WORKERS=true pnpm dev",
      url: "http://localhost:8000/api/health",
      timeout: 120 * 1000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm dev",
      url: "http://localhost:3000",
      timeout: 120 * 1000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
