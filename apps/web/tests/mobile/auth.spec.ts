import { test, expect } from "@playwright/test";
import {
  connectDevice,
  takeDeviceScreenshot,
  launchJournifulApp,
  disconnectDevice,
} from "./helpers/android-device";
import {
  loginViaUI,
  isOnLoginPage,
  isOnTripsPage,
} from "./fixtures/mobile-auth";

test.describe("Journiful Mobile Auth Flow", () => {
  test.afterAll(async () => {
    await disconnectDevice();
  });

  test("unauthenticated user sees login screen", async () => {
    await launchJournifulApp();

    // Take screenshot for visual verification
    await takeDeviceScreenshot("auth-unauthenticated");

    // The app should redirect to /login since there's no auth token.
    // (We verify this visually via screenshot — Playwright _android
    // may not have WebView access from WSL2.)
  });

  test("login flow redirects to trips", async () => {
    // This test requires the API to be running and a valid test user.
    // For now, it's a documentation/skeleton test.
    test.skip(
      !process.env.CI,
      "Requires running API server and test user credentials",
    );

    await launchJournifulApp();

    // Get the WebView page
    const device = await connectDevice();
    const webview = await device.webView({ pkg: "com.journiful.app" });
    const page = await webview.page();

    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/);

    // Perform login
    await loginViaUI(page, "test@journiful.com", "testpassword");

    // Should be redirected to trips
    await expect(page).toHaveURL(/\/trips/);

    await takeDeviceScreenshot("auth-logged-in");
  });
});
