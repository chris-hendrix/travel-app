import { test, expect } from "@playwright/test";
import { authenticateViaAPI } from "./helpers/auth";
import { snap } from "./helpers/screenshots";
import { removeNextjsDevOverlay } from "./helpers/nextjs-dev";
import { pickDateTime } from "./helpers/date-pickers";
import { createTrip } from "./helpers/trips";
import { clickFabAction, createEvent } from "./helpers/itinerary";
import {
  NAVIGATION_TIMEOUT,
  ELEMENT_TIMEOUT,
  TOAST_TIMEOUT,
  DIALOG_TIMEOUT,
} from "./helpers/timeouts";

/**
 * E2E Journey: Itinerary CRUD, View Modes, and Permissions
 *
 * Consolidates 12 individual itinerary tests into 3 journey tests.
 * Uses authenticateViaAPI for fast auth.
 */

test.describe("Itinerary Journey", () => {
  test.beforeEach(async ({ page }) => {
    await removeNextjsDevOverlay(page);
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
          type: "Meal",
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

      await test.step("create accommodation", async () => {
        await clickFabAction(page, "Accommodation");
        await expect(
          page.getByRole("heading", { name: "Create a new accommodation" }),
        ).toBeVisible();

        const accommodationName = `Downtown Hotel ${Date.now()}`;
        await page.locator('input[name="name"]').fill(accommodationName);
        await page
          .locator('input[name="address"]')
          .fill("123 Main St, San Diego");
        // Description and links are inside collapsed "More details" section
        const accommDialog = page.getByRole("dialog");
        await accommDialog.getByText("More details").click();
        await page
          .locator('textarea[name="description"]')
          .fill("Modern hotel in the heart of downtown");
        await pickDateTime(
          page,
          page.getByRole("button", { name: "Check-in" }),
          "2026-10-01T15:00",
        );
        await pickDateTime(
          page,
          page.getByRole("button", { name: "Check-out" }),
          "2026-10-03T11:00",
        );

        const linkInput = page.locator('input[aria-label="Link URL"]');
        await linkInput.fill("https://example.com/hotel");
        await page.getByRole("button", { name: "Add link" }).click();

        await page
          .getByRole("button", { name: "Create accommodation" })
          .click();

        // Accommodation appears in the InfoPanel sidebar (not the day-by-day itinerary)
        await expect(page.getByText("Accommodation created successfully")).toBeVisible({
          timeout: TOAST_TIMEOUT,
        });
        // Verify the accommodation name appears in the Accommodations section
        const accommodationButton = page
          .getByRole("button")
          .filter({
            hasText: new RegExp(accommodationName.replace(/\d+/g, "\\d+")),
          })
          .first();
        await expect(accommodationButton).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await snap(page, "09-itinerary-with-events");

      await test.step("add member travel", async () => {
        await clickFabAction(page, "My Travel");
        await expect(
          page.getByRole("heading", { name: "Add your travel details" }),
        ).toBeVisible();

        await page.getByRole("radio", { name: "Arrival" }).click();

        const travelTimeTrigger = page.getByRole("button", {
          name: "Travel time",
        });
        await pickDateTime(page, travelTimeTrigger, "2026-10-01T14:30");

        await page.locator('input[name="location"]').fill("San Diego Airport");
        await page
          .locator('textarea[name="details"]')
          .fill("Arriving from Chicago");
        await page.locator('button[type="submit"]', { hasText: "Add travel details" }).click();

        // Travel card shows member name (location is in the detail sheet)
        await expect(page.getByText(/Itinerary Tester/).first()).toBeVisible();

        // Click the travel line-item card to open the detail sheet
        // The card only shows member name, so match on that
        const travelCard = page
          .locator('[role="button"]')
          .filter({ hasText: /Itinerary Tester/ })
          .first();
        await travelCard.click();

        // Verify location and details in the detail sheet
        await expect(page.getByText("San Diego Airport")).toBeVisible();
        await expect(page.getByText("Arriving from Chicago")).toBeVisible();

        // Close the detail sheet so it doesn't block subsequent steps
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
        // Location is inside collapsed "More details" section
        const editDialog = page.getByRole("dialog");
        await editDialog.getByText("More details").click();
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
    "itinerary view modes",
    { tag: "@regression" },
    async ({ page, request }) => {
      test.slow(); // Multiple FAB interactions + date pickers are slow on iPhone WebKit
      await authenticateViaAPI(page, request, "View Mode User");
      const tripName = `View Mode Trip ${Date.now()}`;

      await test.step("create trip with multiple events", async () => {
        await createTrip(
          page,
          tripName,
          "Las Vegas, NV",
          "2027-03-10",
          "2027-03-13",
        );

        const mealEvent = `Lunch ${Date.now()}`;
        await createEvent(page, mealEvent, "2027-03-10T12:00", {
          type: "Meal",
        });
        await expect(page.getByText(/Lunch/)).toBeVisible();

        const activityEvent = `Show ${Date.now()}`;
        await createEvent(page, activityEvent, "2027-03-10T20:00", {
          type: "Activity",
        });
        await expect(page.getByText(/Show/)).toBeVisible();
      });

      await test.step("add member travel (arrival)", async () => {
        await clickFabAction(page, "My Travel");
        await expect(
          page.getByRole("heading", { name: "Add your travel details" }),
        ).toBeVisible();

        await page.getByRole("radio", { name: "Arrival" }).click();

        const travelTimeTrigger = page.getByRole("button", {
          name: "Travel time",
        });
        await pickDateTime(page, travelTimeTrigger, "2027-03-10T09:00");

        await page.locator('input[name="location"]').fill("Las Vegas Airport");
        await page.locator('button[type="submit"]', { hasText: "Add travel details" }).click();

        // Wait for success toast confirming API call completed (refetch follows)
        await expect(page.getByText(/travel details added/i)).toBeVisible({
          timeout: TOAST_TIMEOUT,
        });

        // Travel card shows member name (appears after refetch with JOIN data;
        // optimistic update lacks memberName so the real name loads on refetch).
        // Use NAVIGATION_TIMEOUT — refetch can be slow on CI after toast + API round-trip.
        await expect(page.getByText(/View Mode User/).first()).toBeVisible({
          timeout: NAVIGATION_TIMEOUT,
        });

        // Location details are in the detail sheet (decluttered card view)
        const travelCard = page
          .locator('[role="button"]')
          .filter({ hasText: /View Mode User/ })
          .first();
        await travelCard.click();
        await expect(page.getByText("Las Vegas Airport")).toBeVisible();
        const airportLink = page.getByRole("link", {
          name: /Las Vegas Airport.*Google Maps/,
        });
        await expect(airportLink).toBeVisible();
        await expect(airportLink).toHaveAttribute(
          "href",
          /google\.com\/maps\/search/,
        );
        // Close the detail sheet
        await page.keyboard.press("Escape");
      });

      await test.step("verify date gutter in day-by-day view", async () => {
        // The calendar-style date gutter should show month, day number, and weekday
        // Trip dates: 2027-03-10 to 2027-03-13
        await expect.soft(page.getByText("Mar").first()).toBeVisible();
        await expect.soft(page.getByText("10").first()).toBeVisible();
        await expect.soft(page.getByText("Wed").first()).toBeVisible();
      });

      await snap(page, "10-itinerary-day-by-day");

      await test.step("filter by type using pills", async () => {
        // The itinerary header now uses filter pills instead of view toggle.
        // Pills: All (text) | Activity (icon) | Meal (icon) | Travel (icon) | Members (icon)
        const header = page.getByTestId("itinerary-header");
        await expect(header).toBeVisible();

        // Click the Meal filter pill (3rd pill, index 2)
        const pills = header.locator("button");
        await pills.nth(2).click();

        // Should still show meal events
        await expect(page.getByText(/Lunch/)).toBeVisible();
        // Activity events should be hidden
        await expect(page.getByText(/Show/)).not.toBeVisible();

        await snap(page, "11-itinerary-filtered-meals");
      });

      await test.step("reset filter to all", async () => {
        const header = page.getByTestId("itinerary-header");
        // Click "All" pill (first pill, shows text)
        await header.locator("button").filter({ hasText: "All" }).click();
        await expect(page.getByText(/Lunch/)).toBeVisible();
        await expect(page.getByText(/Show/)).toBeVisible();
      });

      await test.step("mobile viewport", async () => {
        await page.setViewportSize({ width: 375, height: 667 });

        // On mobile the trip detail renders a swiper layout starting on the
        // Info panel (index 0).  Navigate to the Itinerary panel (index 1)
        // via the icon strip so the itinerary header and FAB become visible.
        const itineraryIcon = page.getByRole("button", {
          name: "Itinerary",
          exact: true,
        });
        await itineraryIcon.waitFor({ state: "visible", timeout: 5_000 });
        await itineraryIcon.click();
        // Allow swiper transition to settle
        await page.waitForTimeout(400);

        const header = page.getByTestId("itinerary-header");
        await expect(header).toBeVisible();

        // Filter pills should be visible on mobile too
        await expect(
          header.locator("button").filter({ hasText: "All" }),
        ).toBeVisible();
        await expect(page.getByText(/Lunch/)).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Add to itinerary" }),
        ).toBeVisible();

        // Dialog works on mobile via FAB
        await clickFabAction(page, "Event");
        await expect(
          page.getByRole("heading", { name: "Create a new event" }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(
          page.getByRole("heading", { name: "Create a new event" }),
        ).not.toBeVisible({ timeout: DIALOG_TIMEOUT });

        // Restore desktop viewport
        await page.setViewportSize({ width: 1280, height: 720 });
        await expect(page.getByText(/Lunch/)).toBeVisible({
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
      let eventId: string;

      await test.step("create trip via UI", async () => {
        await createTrip(
          page,
          tripName,
          "Portland, OR",
          "2026-10-01",
          "2026-10-05",
        );
        tripId = page.url().split("/trips/")[1];
        expect(tripId).toBeTruthy();
      });

      await test.step("create event via API", async () => {
        const response = await page.request.post(
          `http://localhost:8000/api/trips/${tripId}/events`,
          {
            data: {
              name: "Dinner at Joe's",
              eventType: "meal",
              startTime: "2026-10-01T18:00:00.000Z",
            },
          },
        );
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        eventId = data.event.id;
        expect(eventId).toBeTruthy();
      });

      await test.step("reload and verify event is visible", async () => {
        await page.reload();
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
        // Reload to ensure fresh data - the optimistic update may still show
        // the event in the main list during cache refetch
        await page.reload();

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

        await expect(page.getByText("Dinner at Joe's")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });

        await snap(page, "21-event-restored");
      });
    },
  );
});
