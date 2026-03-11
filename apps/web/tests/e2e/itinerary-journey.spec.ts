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

        // Location text visible with link icon to Google Maps
        await expect.soft(page.getByText("Harbor Drive Seafood")).toBeVisible();
        const locationLink = page.getByRole("link", {
          name: /Harbor Drive Seafood.*Google Maps/,
        });
        await expect.soft(locationLink).toBeVisible();
        await expect
          .soft(locationLink)
          .toHaveAttribute("href", /google\.com\/maps\/search/);
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

        // Address link is visible in the compact line-item (click opens detail sheet)
        const accommodationCard = page
          .locator('[role="button"]')
          .filter({
            hasText: new RegExp(accommodationName.replace(/\d+/g, "\\d+")),
          })
          .first();
        await expect(accommodationCard).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });

        // Location pin + link icon visible (address details in detail sheet)
        const addressLink = accommodationCard.getByRole("link", {
          name: /Google Maps/,
        });
        await expect(addressLink).toBeVisible();
        await expect(addressLink).toHaveAttribute(
          "href",
          /google\.com\/maps\/search/,
        );
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
        await page.getByRole("button", { name: "Add travel details" }).click();

        // Travel card shows member name (location details in detail sheet)
        await expect(page.getByText(/Itinerary Tester/).first()).toBeVisible();

        // Expand travel card to see details — use getByRole to target
        // the travel card button, not the "Itinerary Tester" text in Organizers
        const travelCard = page.getByRole("button", {
          name: /Itinerary Tester.*San Diego Airport/,
        });
        await travelCard.click();
        await expect(page.getByText("Arriving from Chicago")).toBeVisible();

        // Close the edit travel dialog so it doesn't block subsequent steps
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
        // Updated location text visible with link icon
        await expect(page.getByText("Gaslamp Quarter")).toBeVisible();
        const updatedLocationLink = page.getByRole("link", {
          name: /Gaslamp Quarter.*Google Maps/,
        });
        await expect(updatedLocationLink).toBeVisible();
        await expect(updatedLocationLink).toHaveAttribute(
          "href",
          /google\.com\/maps\/search/,
        );
        await expect(page.getByText(/Dinner at Harbor/)).not.toBeVisible();
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
        await page.getByRole("button", { name: "Add travel details" }).click();

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

        // Location text visible with link icon
        await expect(page.getByText("Las Vegas Airport")).toBeVisible();
        const airportLink = page.getByRole("link", {
          name: /Las Vegas Airport.*Google Maps/,
        });
        await expect(airportLink).toBeVisible();
        await expect(airportLink).toHaveAttribute(
          "href",
          /google\.com\/maps\/search/,
        );
      });

      await test.step("verify date gutter in day-by-day view", async () => {
        // The calendar-style date gutter should show month, day number, and weekday
        // Trip dates: 2027-03-10 to 2027-03-13
        await expect.soft(page.getByText("Mar").first()).toBeVisible();
        await expect.soft(page.getByText("10").first()).toBeVisible();
        await expect.soft(page.getByText("Wed").first()).toBeVisible();
      });

      await snap(page, "10-itinerary-day-by-day");

      await test.step("toggle day-by-day to group-by-type", async () => {
        const dayByDayButton = page
          .getByRole("button", { name: "Day by Day" })
          .first();
        await expect(dayByDayButton).toBeVisible();

        await page.getByRole("button", { name: "Group by Type" }).click();

        // Section icons have title tooltips
        await expect.soft(page.locator('[title="Meals"]')).toBeVisible();
        await expect.soft(page.locator('[title="Activities"]')).toBeVisible();
        await expect.soft(page.locator('[title="Arrivals"]')).toBeVisible();
        await expect.soft(page.getByText(/Lunch/)).toBeVisible();
        await expect.soft(page.getByText(/Show/)).toBeVisible();
        // Location still visible in group-by-type view
        await expect
          .soft(page.getByText("Las Vegas Airport").first())
          .toBeVisible();
        // Verify date labels appear on cards in group-by-type view
        await expect.soft(page.getByText(/Mar 10/).first()).toBeVisible();
        await snap(page, "11-itinerary-group-by-type");
      });

      await test.step("toggle back to day-by-day", async () => {
        await page.getByRole("button", { name: "Day by Day" }).click();
        await expect(page.getByText(/Lunch/)).toBeVisible();
        await expect(page.getByText(/Show/)).toBeVisible();
      });

      await test.step("change timezone via dropdown", async () => {
        // Open timezone selector and pick user timezone
        const tzTrigger = page.getByRole("combobox", { name: "Timezone" });
        await expect(tzTrigger).toBeVisible();
        await expect(tzTrigger).toContainText("Trip");

        // Radix Select on mobile WebKit can be slow to position the listbox.
        // Wait for the option to be visible before clicking.
        await tzTrigger.click();
        const currentOption = page.getByRole("option", { name: /Current/ });
        await currentOption.waitFor({
          state: "visible",
          timeout: ELEMENT_TIMEOUT,
        });
        await currentOption.click();
        await expect(tzTrigger).toContainText("Current");
        await expect(page.getByText(/Lunch/)).toBeVisible();

        // Switch back to trip timezone
        await tzTrigger.click();
        const tripOption = page.getByRole("option", { name: /Trip/ });
        await tripOption.waitFor({
          state: "visible",
          timeout: ELEMENT_TIMEOUT,
        });
        await tripOption.click();
        await expect(tzTrigger).toContainText("Trip");
      });

      await test.step("mobile viewport", async () => {
        await page.setViewportSize({ width: 375, height: 667 });

        const header = page.getByTestId("itinerary-header");
        await expect(header).toBeVisible();

        await expect(
          page.getByRole("button", { name: "Day by Day" }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Group by Type" }),
        ).toBeVisible();
        await expect(
          page.getByRole("combobox", { name: "Timezone" }),
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
        const restoreButton = page
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
