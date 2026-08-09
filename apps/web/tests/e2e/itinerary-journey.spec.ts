import { test, expect } from "@playwright/test";
import { authenticateViaAPI } from "./helpers/auth";
import { snap } from "./helpers/screenshots";
import { removeNextjsDevOverlay, dismissPwaPrompts } from "./helpers/nextjs-dev";
import { createTrip } from "./helpers/trips";
import { createEvent } from "./helpers/itinerary";
import { navigateToMobilePanel } from "./helpers/mobile-panels";
import {
  NAVIGATION_TIMEOUT,
  ELEMENT_TIMEOUT,
  TOAST_TIMEOUT,
  DIALOG_TIMEOUT,
} from "./helpers/timeouts";

/**
 * E2E Journey: Itinerary event CRUD and Deleted Items / Restore
 *
 * Covers only critical event CRUD and the delete+restore flow.
 * Accommodation, member travel, and view-mode behaviors are covered by
 * lower-layer RTL component tests.
 */

test.describe("Itinerary Journey", () => {
  test.beforeEach(async ({ page }) => {
    await removeNextjsDevOverlay(page);
    await dismissPwaPrompts(page);
    await page.context().clearCookies();
  });

  test(
    "itinerary CRUD journey",
    { tag: "@smoke" },
    async ({ page, request }) => {
      test.slow(); // Many date pickers + FAB interactions are slow on iPhone WebKit
      await authenticateViaAPI(page, request, "Itinerary Tester");
      const tripName = `Itinerary Trip ${Date.now()}`;

      await test.step("create trip", async () => {
        await createTrip(
          page,
          tripName,
          "San Diego, CA",
          "2026-10-01",
          "2026-10-03",
        );
      });

      await test.step("create meal event", async () => {
        const eventName = `Dinner at Harbor ${Date.now()}`;
        await createEvent(page, eventName, "2026-10-01T18:30", {
          type: "Food & Drink",
          location: "Harbor Drive Seafood",
          description: "Seafood restaurant by the bay",
          endDateTime: "2026-10-01T20:00",
        });

        await expect(page.getByText(/Dinner at Harbor/)).toBeVisible();
        await expect.soft(page.getByText(/6:30 PM/)).toBeVisible();

        // Location details are in the detail sheet (decluttered card view)
        await page.getByText(/Dinner at Harbor/).first().click();
        const locationLink = page.getByRole("link", {
          name: /Harbor Drive Seafood.*Google Maps/,
        });
        await expect.soft(page.getByText("Harbor Drive Seafood")).toBeVisible();
        await expect.soft(locationLink).toBeVisible();
        await expect
          .soft(locationLink)
          .toHaveAttribute("href", /google\.com\/maps\/search/);
        // Close the detail sheet
        await page.keyboard.press("Escape");
      });

      await test.step("edit event", async () => {
        // Click event card to open detail sheet, then click Edit
        await page
          .getByText(/Dinner at Harbor/)
          .first()
          .click();
        await page.locator('button[title="Edit"]').first().click();
        await expect(
          page.getByRole("heading", { name: "Edit event" }),
        ).toBeVisible();

        const updatedEventName = `Updated Dinner ${Date.now()}`;
        const nameInput = page.locator('input[name="name"]');
        await nameInput.clear();
        await nameInput.fill(updatedEventName);
        await page.locator('input[name="location"]').fill("Gaslamp Quarter");
        await page.getByRole("button", { name: "Update event" }).click();

        // Wait for edit dialog to close
        await expect(
          page.getByRole("heading", { name: "Edit event" }),
        ).not.toBeVisible();

        await expect(page.getByText(/Updated Dinner/)).toBeVisible();
        await expect(page.getByText(/Dinner at Harbor/)).not.toBeVisible();

        // Verify updated location in detail sheet
        await page.getByText(/Updated Dinner/).first().click();
        const updatedLocationLink = page.getByRole("link", {
          name: /Gaslamp Quarter.*Google Maps/,
        });
        await expect(page.getByText("Gaslamp Quarter")).toBeVisible();
        await expect(updatedLocationLink).toBeVisible();
        await expect(updatedLocationLink).toHaveAttribute(
          "href",
          /google\.com\/maps\/search/,
        );
        // Close detail sheet
        await page.keyboard.press("Escape");
        // Wait for sheet to fully close before next interaction (radix-ui 1.6.x timing fix)
        await expect(page.locator('[data-slot="sheet-content"]')).not.toBeVisible({
          timeout: 5000,
        });
        await page.waitForTimeout(200);
      });

      await test.step("delete event with cancel then confirm", async () => {
        // Click event card to open detail sheet
        await page
          .getByText(/Updated Dinner/)
          .first()
          .click();
        const deleteBtn = page.locator('button[title="Delete"]').first();
        await expect(deleteBtn).toBeVisible({ timeout: DIALOG_TIMEOUT });

        // Click Delete in detail sheet — triggers confirmation dialog
        await deleteBtn.click();
        await expect(page.getByText("Are you sure?")).toBeVisible();

        // Cancel first
        await page.getByRole("button", { name: "Cancel" }).last().click();

        // Detail sheet should still be open — Delete button still visible
        await expect(deleteBtn).toBeVisible();

        // Delete for real
        await deleteBtn.click();
        await expect(page.getByText("Are you sure?")).toBeVisible();
        await page.getByRole("button", { name: "Yes, delete" }).click();

        // Wait for the delete toast, then reload to ensure fresh state
        await expect(page.getByText("Event deleted")).toBeVisible({
          timeout: TOAST_TIMEOUT,
        });
        await page.reload();
        await expect(page.getByText(/Updated Dinner/)).not.toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });
    },
  );

  test(
    "deleted items and restore",
    { tag: "@regression" },
    async ({ page, request }) => {
      test.slow(); // Trip creation + event CRUD + dialog interactions are slow on iPhone WebKit
      await authenticateViaAPI(page, request, "Delete Restore User");
      const tripName = `Delete Restore Trip ${Date.now()}`;
      let tripId: string;

      await test.step("create trip via UI", async () => {
        await createTrip(
          page,
          tripName,
          "Portland, OR",
          "2026-10-01",
          "2026-10-05",
        );
        tripId = new URL(page.url()).searchParams.get("id")!;
        expect(tripId).toBeTruthy();
      });

      await test.step("create event via UI", async () => {
        await createEvent(page, "Dinner at Joe's", "2026-10-01T18:00", { type: "Food & Drink" });
      });

      await test.step("reload and verify event is visible", async () => {
        // Use page.goto() instead of page.reload() — on WebKit, reload can
        // redirect to /trips after cookie auth check during client hydration.
        // Navigate to the explicit trip URL (no Swiper hash) to ensure the
        // trip detail page loads correctly.
        const eventsResponse = page.waitForResponse(
          (resp) =>
            resp.url().includes(`/trips/${tripId}/events`) &&
            resp.status() === 200,
          { timeout: NAVIGATION_TIMEOUT },
        );
        await page.goto(`/trips?id=${tripId}`, {
          waitUntil: "domcontentloaded",
        });
        // Confirm the trip detail page loaded by waiting for the heading.
        await page
          .getByRole("heading", { level: 1 })
          .first()
          .waitFor({ state: "visible", timeout: NAVIGATION_TIMEOUT });
        await eventsResponse;

        // On mobile the swiper defaults to the Info panel (index 0);
        // navigate to Itinerary (index 1) where event cards are rendered.
        await navigateToMobilePanel(page, "Itinerary");

        await expect(page.getByText("Dinner at Joe's")).toBeVisible({
          timeout: NAVIGATION_TIMEOUT,
        });
      });

      await test.step("open event detail sheet and delete via dialog", async () => {
        // Click on the event card to open the detail sheet
        const card = page
          .locator('[role="button"]')
          .filter({ hasText: /Dinner at Joe's/ })
          .first();
        await card.click();

        // Click the Delete button (trash icon) in the detail sheet
        await expect(
          page.locator('button[title="Delete"]').first(),
        ).toBeVisible({ timeout: DIALOG_TIMEOUT });
        await page.locator('button[title="Delete"]').first().click();

        // Confirm deletion in the alert dialog
        await expect(page.getByText("Are you sure?")).toBeVisible();
        await page.getByRole("button", { name: "Yes, delete" }).click();
      });

      await test.step("verify event deleted and toast shown", async () => {
        await expect(page.getByText("Event deleted")).toBeVisible({
          timeout: TOAST_TIMEOUT,
        });
      });

      await test.step("open Deleted Items dialog and verify content", async () => {
        // Reload to ensure fresh data — the optimistic update may still show
        // the event in the main list during cache refetch.
        // Wait for events API (both regular and includeDeleted) to settle
        // so the "View deleted items" button appears after the refetch.
        // Register the response waiter BEFORE navigation to catch the response.
        const eventsResponse = page.waitForResponse(
          (resp) =>
            resp.url().includes(`/trips/${tripId}/events`) &&
            resp.status() === 200,
          { timeout: NAVIGATION_TIMEOUT },
        );
        await page.goto(`/trips?id=${tripId}`, {
          waitUntil: "domcontentloaded",
        });
        await eventsResponse;
        // Confirm the trip detail page loaded.
        await page
          .getByRole("heading", { level: 1 })
          .first()
          .waitFor({ state: "visible", timeout: NAVIGATION_TIMEOUT });

        // Deleted items are now in a dialog. With the only event deleted,
        // the empty state shows a "View deleted items" link for organizers.
        const viewDeletedBtn = page.getByRole("button", {
          name: "View deleted items",
        });
        await expect(viewDeletedBtn).toBeVisible({
          timeout: NAVIGATION_TIMEOUT,
        });
        await viewDeletedBtn.click();

        // Verify dialog opens with the deleted event
        await expect(
          page.getByRole("heading", { name: "Deleted items" }),
        ).toBeVisible();
        await expect(page.getByText("Dinner at Joe's")).toBeVisible();
        await snap(page, "20-deleted-items-dialog");
      });

      await test.step("restore the event", async () => {
        // Scope to the dialog to avoid matching buttons outside the sheet
        // whose accessible name happens to contain "Restore" (e.g. the
        // InfoPanel member button when the organizer is "Delete Restore User").
        const dialog = page.getByRole("dialog");
        const restoreButton = dialog
          .getByRole("button", { name: "Restore" })
          .first();
        await restoreButton.click();

        await expect(page.getByText("Event restored")).toBeVisible({
          timeout: TOAST_TIMEOUT,
        });
      });

      await test.step("verify event reappears in the itinerary", async () => {
        // Close dialog if still open
        await page.keyboard.press("Escape");

        // Navigate to the explicit trip URL (no Swiper hash) to ensure
        // the trip detail page loads correctly on WebKit.
        const eventsResponse = page.waitForResponse(
          (resp) =>
            resp.url().includes(`/trips/${tripId}/events`) &&
            resp.status() === 200,
          { timeout: NAVIGATION_TIMEOUT },
        );
        await page.goto(`/trips?id=${tripId}`, {
          waitUntil: "domcontentloaded",
        });
        await page
          .getByRole("heading", { level: 1 })
          .first()
          .waitFor({ state: "visible", timeout: NAVIGATION_TIMEOUT });
        await eventsResponse;

        // On mobile the swiper defaults to the Info panel (index 0);
        // navigate to Itinerary (index 1) where event cards are rendered.
        await navigateToMobilePanel(page, "Itinerary");

        await expect(page.getByText("Dinner at Joe's")).toBeVisible({
          timeout: NAVIGATION_TIMEOUT,
        });

        await snap(page, "21-event-restored");
      });
    },
  );
});
