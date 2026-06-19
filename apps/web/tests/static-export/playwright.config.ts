import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 30000,
  expect: { timeout: 10000 },
  use: {
    baseURL: "http://localhost:9000",
  },
  webServer: {
    command: "npx serve ../../out -p 9000 --no-clipboard -s",
    url: "http://localhost:9000",
    reuseExistingServer: false,
    timeout: 15000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        launchOptions: { chromiumSandbox: false },
      },
    },
  ],
});
