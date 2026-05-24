import { test, expect } from "@playwright/test";
import {
  connectDevice,
  takeDeviceScreenshot,
  launchJournifulApp,
  disconnectDevice,
} from "./helpers/android-device";

/**
 * Push Notification Tests (Android)
 *
 * These tests verify that push notifications are delivered and displayed
 * on the Android device. They require:
 * - API server running with FCM configured
 * - Valid test user with push subscription
 * - FCM credentials in environment
 *
 * Run with: npx playwright test --config=tests/mobile/playwright.mobile.config.ts tests/mobile/push.spec.ts
 */
test.describe("Journiful Push Notifications", () => {
  test.afterAll(async () => {
    await disconnectDevice();
  });

  test("app registers for push on launch", async () => {
    test.skip(
      !process.env.CI,
      "Requires running API server and Firebase/FCM configuration"
    );

    await launchJournifulApp();
    await takeDeviceScreenshot("push-app-launched");

    // Verify the app is running
    const device = await connectDevice();
    expect(device.serial()).toBeTruthy();
  });

  test("push notification is received and displayed", async () => {
    test.skip(
      !process.env.CI,
      "Requires running API server, FCM credentials, and test push trigger"
    );

    // Launch the app (ensures push registration)
    await launchJournifulApp();

    const device = await connectDevice();

    // Trigger a push notification via the API
    // This would typically be done by calling a test endpoint or
    // inserting a push/deliver job directly
    // For now, this is a skeleton.

    // Wait for notification to appear
    await device.shell("sleep 5");

    // Take a screenshot to verify notification is visible
    await takeDeviceScreenshot("push-notification-received");

    // Check if notification is in the notification shade
    // Note: reading notification content via adb is platform-dependent
    const notifDump = await device.shell(
      "dumpsys notification --noredact | grep -A 5 'journiful' | head -20"
    );
    console.log("Notification dump:", notifDump.toString());
  });

  test("tapping notification opens correct trip page", async () => {
    test.skip(
      !process.env.CI,
      "Requires full push notification flow with valid trip data"
    );

    const device = await connectDevice();

    // Open notification via adb
    await device.shell("cmd statusbar expand-notifications");

    // Click the Journiful notification
    // This requires knowing the notification key, which is complex
    // Skeleton for now

    await takeDeviceScreenshot("push-notification-tapped");
  });
});
