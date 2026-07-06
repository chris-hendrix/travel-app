import type { Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const SCREENSHOTS_DIR = path.resolve(
  __dirname,
  "../../../playwright-screenshots",
);

const isCI = !!process.env.CI;

/**
 * Capture a JPG screenshot at the current viewport. No-op in CI.
 *
 * NOTE: Resizing the viewport (e.g. desktop → mobile → desktop) triggers
 * React remounts and destroys transient component state (like open dialogs
 * and lightboxes). Always take screenshots at the current viewport, never
 * switch it inside a helper.
 */
export async function snap(page: Page, name: string): Promise<void> {
  if (isCI) return;
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, `${name}.jpg`),
    type: "jpeg",
    quality: 85,
    fullPage: true,
  });
}
