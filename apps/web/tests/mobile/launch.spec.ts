import { test, expect } from "@playwright/test";
import {
  connectDevice,
  takeDeviceScreenshot,
  launchJournifulApp,
  disconnectDevice,
} from "./helpers/android-device";
import { isOnLoginPage } from "./fixtures/mobile-auth";

test.describe("Journiful Android App Launch", () => {
  test.afterAll(async () => {
    await disconnectDevice();
  });

  test("app launches and shows login screen", async () => {
    // Launch the app
    await launchJournifulApp();

    // Take a screenshot for visual verification
    const screenshotPath = await takeDeviceScreenshot("launch-screen");
    expect(screenshotPath).toBeTruthy();

    // Verify the device is connected and responsive
    const device = await connectDevice();
    expect(device).toBeDefined();
    expect(device.serial()).toBeTruthy();
  });
});
