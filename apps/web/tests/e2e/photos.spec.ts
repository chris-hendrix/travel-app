import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import { authenticateViaAPI } from "./helpers/auth";
import { createTrip } from "./helpers/trips";
import { removeNextjsDevOverlay } from "./helpers/nextjs-dev";
import { dismissToast } from "./helpers/toast";
import { snap } from "./helpers/screenshots";
import { API_BASE, ELEMENT_TIMEOUT } from "./helpers/timeouts";

/**
 * Minimal valid JPEG for upload testing.
 * SOI + JFIF APP0 + quantization table + SOF + Huffman tables + SOS + EOI.
 */
const MINIMAL_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08,
  0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a,
  0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d,
  0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20, 0x22,
  0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34,
  0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0,
  0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4,
  0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
  0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01,
  0x03, 0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d,
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13,
  0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42,
  0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a,
  0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35,
  0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a,
  0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67,
  0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84,
  0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98,
  0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3,
  0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7,
  0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
  0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00,
  0x00, 0x3f, 0x00, 0x7b, 0x94, 0x11, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xd9,
]);

/** Write a test JPEG to a temp directory. Returns the file path. */
function createTestImage(dir: string, name: string): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, MINIMAL_JPEG);
  return filePath;
}

/** Upload a photo via the hidden file input using the filechooser event. */
async function uploadPhoto(
  page: import("@playwright/test").Page,
  imagePath: string,
): Promise<void> {
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page
    .locator('[aria-label="Upload photo files"]')
    .dispatchEvent("click");
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(imagePath);
}

/**
 * Poll the API directly until the expected number of photos have status "ready".
 * This decouples the wait from TanStack Query's staleTime/refetch timing.
 * After all photos are ready, reloads the page so the UI picks up the changes.
 */
async function waitForPhotoProcessing(
  page: import("@playwright/test").Page,
  tripId: string,
  expectedCount: number,
  timeout = 30_000,
): Promise<void> {
  await expect(async () => {
    const response = await page.request.get(
      `${API_BASE}/trips/${tripId}/photos`,
    );
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    const readyPhotos = data.photos.filter(
      (p: { status: string }) => p.status === "ready",
    );
    expect(readyPhotos.length).toBe(expectedCount);
  }).toPass({ timeout, intervals: [1000, 2000, 3000] });

  await page.reload({ waitUntil: "networkidle" });
}

/** Locator for photo cards that have finished processing (contain an img element). */
function readyPhotoCards(page: import("@playwright/test").Page) {
  // Photo cards have role="button" and contain a next/image <img> when status is "ready".
  // We match any img (not just alt="Trip photo") since captions change the alt text.
  return page
    .locator('[role="button"]')
    .filter({ has: page.locator("img[src]") });
}

/**
 * E2E Journey: Trip Photos
 *
 * Tests photo upload, grid display, lightbox navigation,
 * caption editing, and photo deletion.
 */
test.describe("Photos Journey", () => {
  test.beforeEach(async ({ page }) => {
    await removeNextjsDevOverlay(page);
    await page.context().clearCookies();
  });

  test(
    "photo upload, lightbox, caption, and delete journey",
    { tag: "@smoke" },
    async ({ page, request }) => {
      test.slow(); // Photo processing via pg-boss worker requires extended waits

      const tmpDir = path.join("/tmp", `tripful-test-photos-${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });

      try {
        await authenticateViaAPI(page, request, "Photo Tester");
        const tripName = `Photo Trip ${Date.now()}`;

        await test.step("create trip", async () => {
          await createTrip(
            page,
            tripName,
            "Maui, HI",
            "2026-11-01",
            "2026-11-05",
          );
        });

        // Extract tripId from URL for API polling
        const tripId = page.url().split("/trips/")[1];

        await test.step("verify empty state", async () => {
          // Photos section header shows 0/20 count
          await expect(page.getByText(/Photos \(0\/20\)/)).toBeVisible({
            timeout: ELEMENT_TIMEOUT,
          });

          // Empty state message
          await expect(page.getByText("No photos yet")).toBeVisible();

          await snap(page, "photos-01-empty-state");
        });

        await test.step("upload first photo", async () => {
          const imagePath = createTestImage(tmpDir, "photo-1.jpg");
          await uploadPhoto(page, imagePath);

          // Dismiss upload success toast before further interactions
          await dismissToast(page);

          // Poll the API until the worker finishes processing, then reload
          await waitForPhotoProcessing(page, tripId, 1);

          // After reload, verify the ready photo card is visible
          await expect(readyPhotoCards(page).first()).toBeVisible({
            timeout: ELEMENT_TIMEOUT,
          });

          // Counter should update to 1/20
          await expect(page.getByText(/Photos \(1\/20\)/)).toBeVisible({
            timeout: ELEMENT_TIMEOUT,
          });

          await snap(page, "photos-02-one-photo");
        });

        await test.step("upload second photo", async () => {
          const imagePath = createTestImage(tmpDir, "photo-2.jpg");
          await uploadPhoto(page, imagePath);

          await dismissToast(page);

          // Poll the API until both photos are ready, then reload
          await waitForPhotoProcessing(page, tripId, 2);

          // After reload, verify both photo cards are visible
          await expect(readyPhotoCards(page)).toHaveCount(2, {
            timeout: ELEMENT_TIMEOUT,
          });

          // Counter should update to 2/20
          await expect(page.getByText(/Photos \(2\/20\)/)).toBeVisible({
            timeout: ELEMENT_TIMEOUT,
          });

          await snap(page, "photos-03-two-photos");
        });

        await test.step("open lightbox by clicking photo", async () => {
          // Click the first ready photo card
          await readyPhotoCards(page).first().click();

          // Lightbox dialog should open
          const lightbox = page.locator(
            '[role="dialog"][aria-label="Photo lightbox"]',
          );
          await expect(lightbox).toBeVisible({ timeout: ELEMENT_TIMEOUT });

          // Photo counter should show position (e.g., "1 / 2")
          const counter = lightbox.locator('[aria-live="polite"]');
          await expect(counter).toContainText(/\d+ \/ 2/);

          await snap(page, "photos-04-lightbox-open");
        });

        await test.step("navigate between photos in lightbox", async () => {
          const lightbox = page.locator(
            '[role="dialog"][aria-label="Photo lightbox"]',
          );
          const counter = lightbox.locator('[aria-live="polite"]');

          // Click next to go to photo 2
          await page.locator('[aria-label="Next photo"]').click();
          await expect(counter).toContainText("2 / 2");

          // Click previous to go back to photo 1
          await page.locator('[aria-label="Previous photo"]').click();
          await expect(counter).toContainText("1 / 2");
        });

        await test.step("edit caption", async () => {
          // Click "Add a caption..." placeholder to activate caption input
          await page.getByText("Add a caption...").click();

          // Fill in the caption
          const captionInput = page.locator(
            'input[placeholder="Add a caption..."]',
          );
          await expect(captionInput).toBeVisible({ timeout: ELEMENT_TIMEOUT });
          await captionInput.fill("Sunset in Maui");
          await page.keyboard.press("Enter");

          // Verify caption is now displayed in the lightbox (not in input mode)
          const lightbox = page.locator(
            '[role="dialog"][aria-label="Photo lightbox"]',
          );
          await expect(lightbox.getByText("Sunset in Maui")).toBeVisible({
            timeout: ELEMENT_TIMEOUT,
          });

          await snap(page, "photos-05-caption-added");
        });

        await test.step("close lightbox with Escape", async () => {
          await page.keyboard.press("Escape");

          const lightbox = page.locator(
            '[role="dialog"][aria-label="Photo lightbox"]',
          );
          await expect(lightbox).not.toBeVisible({ timeout: ELEMENT_TIMEOUT });
        });

        await test.step("delete photo via lightbox", async () => {
          // Re-open lightbox by clicking first photo
          await readyPhotoCards(page).first().click();

          const lightbox = page.locator(
            '[role="dialog"][aria-label="Photo lightbox"]',
          );
          await expect(lightbox).toBeVisible({ timeout: ELEMENT_TIMEOUT });

          // Click delete button inside lightbox (opens confirmation dialog)
          await lightbox.locator('[aria-label="Delete photo"]').click();

          // Confirm deletion in the AlertDialog
          await page.getByRole("button", { name: "Delete" }).click();

          // Wait for deletion to process
          await dismissToast(page);

          // The lightbox closes after delete (navigates to invalid index when
          // deleting first photo of two — known component behavior)
          await expect(lightbox).not.toBeVisible({ timeout: ELEMENT_TIMEOUT });

          // Counter should decrement to 1/20
          await expect(page.getByText(/Photos \(1\/20\)/)).toBeVisible({
            timeout: ELEMENT_TIMEOUT,
          });

          // Only one photo card should remain
          await expect(readyPhotoCards(page)).toHaveCount(1, {
            timeout: ELEMENT_TIMEOUT,
          });

          await snap(page, "photos-06-after-delete");
        });
      } finally {
        // Clean up temp image files
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    },
  );
});
