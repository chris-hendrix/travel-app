import { _android, AndroidDevice, BrowserContext } from "playwright";

let device: AndroidDevice | null = null;

/**
 * Connect to the first available Android device via ADB.
 */
export async function connectDevice(): Promise<AndroidDevice> {
  if (device) return device;
  const devices = await _android.devices();
  if (devices.length === 0) {
    throw new Error(
      "No Android devices found. Is the emulator running? Run: adb devices",
    );
  }
  device = devices[0];
  console.log(`Connected to: ${device.model()} (${device.serial()})`);
  return device;
}

/**
 * Take a screenshot of the entire device screen.
 */
export async function takeDeviceScreenshot(name: string): Promise<string> {
  const dev = await connectDevice();
  const path = `./test-results/${name}-${Date.now()}.png`;
  await dev.screenshot({ path });
  console.log(`Screenshot saved: ${path}`);
  return path;
}

/**
 * Launch the Journiful Capacitor app on the device.
 * Assumes the APK is already installed.
 */
export async function launchJournifulApp(): Promise<void> {
  const dev = await connectDevice();
  await dev.shell("am force-stop com.journiful.app");
  await dev.shell("am start -n com.journiful.app/.MainActivity");
  // Wait for the app to start
  await new Promise((r) => setTimeout(r, 3000));
}

/**
 * Get the WebView page for the Journiful app.
 * Capacitor runs the web content in a WebView.
 */
export async function getJournifulWebView(): Promise<BrowserContext> {
  const dev = await connectDevice();
  // For Capacitor, the WebView is the app's main webview
  // We need to find it by package name
  const webview = await dev.webView({ pkg: "com.journiful.app" });
  const page = await webview.page();
  return page.context();
}

/**
 * Disconnect from the device.
 */
export async function disconnectDevice(): Promise<void> {
  if (device) {
    await device.close();
    device = null;
  }
}
