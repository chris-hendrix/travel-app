import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 120000,
  expect: {
    timeout: 15000,
  },
  use: {
    // Screenshots on failure
    screenshot: "only-on-failure",
    // Trace for debugging
    trace: "retain-on-failure",
    // Android-specific: we use the _android experimental API
    // This is configured per-test, not at the config level
  },
  // Output artifacts
  outputDir: "./test-results",
});
