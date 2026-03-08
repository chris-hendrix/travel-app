import { test, expect } from "@playwright/test";
import {
  authenticateViaAPI,
  authenticateViaAPIWithPhone,
  createUserViaAPI,
} from "./helpers/auth";
import { TripsPage, TripDetailPage } from "./helpers/pages";
import { snap } from "./helpers/screenshots";
import { removeNextjsDevOverlay } from "./helpers/nextjs-dev";
import { pickDate, pickDateTime } from "./helpers/date-pickers";
import { createTripViaAPI, inviteAndAcceptViaAPI } from "./helpers/invitations";
import { dismissToast } from "./helpers/toast";
import {
  NAVIGATION_TIMEOUT,
  ELEMENT_TIMEOUT,
  TOAST_TIMEOUT,
  DIALOG_TIMEOUT,
  SLOW_NAVIGATION_TIMEOUT,
  RETRY_INTERVAL,
} from "./helpers/timeouts";

/**
 * E2E Journey: Trip CRUD, Permissions, and Validation
 *
 * Consolidates 10 individual trip tests into 6 journey tests.
 * Uses authenticateViaAPI for fast auth (no browser navigation).
 */

test.describe("Trip Journey", () => {
  test.beforeEach(async ({ page }) => {
    await removeNextjsDevOverlay(page);
    await page.context().clearCookies();
  });

  test("trip CRUD journey", { tag: "@smoke" }, async ({ page, request }) => {
    test.slow(); // Create, verify, edit, delete flow is slow on iPhone WebKit
    const trips = new TripsPage(page);
    const tripDetail = new TripDetailPage(page);
    await authenticateViaAPI(page, request, "Trip Creator");

    const tripName = `Test Trip ${Date.now()}`;
    const tripDestination = "Miami Beach, FL";
    const tripDescription = "A test trip for E2E verification";

    await test.step("create trip with full details", async () => {
      // Retry click — on cold CI the first click can be swallowed during React hydration
      await expect(async () => {
        await trips.createTripButton.click();
        await expect(tripDetail.createDialogHeading).toBeVisible({
          timeout: RETRY_INTERVAL,
        });
      }).toPass({ timeout: ELEMENT_TIMEOUT });
      await expect(tripDetail.step1Indicator).toBeVisible();
      await expect(page.getByText("Trip details")).toBeVisible();

      await tripDetail.nameInput.fill(tripName);
      await tripDetail.destinationInput.fill(tripDestination);
      await pickDate(page, tripDetail.startDateButton, "2026-10-12");
      await pickDate(page, tripDetail.endDateButton, "2026-10-14");
      await tripDetail.descriptionInput.fill(tripDescription);
      await snap(page, "05-create-trip-step1");
      await tripDetail.continueButton.click();

      await expect(tripDetail.step2Indicator).toBeVisible();
      await expect(page.getByText("Customize")).toBeVisible();
      await snap(page, "06-create-trip-step2");
      await tripDetail.createTripButton.click();

      await page.waitForURL("**/trips/**", { timeout: NAVIGATION_TIMEOUT });
      expect(page.url()).toContain("/trips/");
    });

    await test.step("verify trip detail page", async () => {
      // Use NAVIGATION_TIMEOUT — on iPhone WebKit, SSR + hydration + data
      // fetch after the create-trip redirect can take longer than ELEMENT_TIMEOUT.
      await expect(
        page.getByRole("heading", { level: 1, name: tripName }),
      ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
      await expect.soft(page.getByText(tripDestination)).toBeVisible();
      await expect.soft(page.getByText("Oct 12 - 14, 2026")).toBeVisible();
      await expect.soft(page.getByText(tripDescription)).toBeVisible();
      await expect.soft(page.getByText("Going")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Edit trip" }),
      ).toBeVisible();
      await snap(page, "07-trip-detail");
    });

    await test.step("trip appears in trips list", async () => {
      await trips.goto();
      await expect(page.getByText(tripName)).toBeVisible();
      await expect(page.getByText(tripDestination)).toBeVisible();
      await expect(trips.upcomingTripsHeading).toBeVisible();
      await snap(page, "08-trips-list");

      await dismissToast(page);
      await page.getByText(tripName).click();
      await page.waitForURL("**/trips/**");
      await expect(
        page.getByRole("heading", { level: 1, name: tripName }),
      ).toBeVisible();
    });

    const updatedName = `Updated Trip ${Date.now()}`;
    const updatedDestination = "Los Angeles, CA";
    const updatedDescription = "Updated description with new information";

    await test.step("edit trip with pre-populated form", async () => {
      await dismissToast(page);
      // Retry click — on mobile WebKit the button click can be swallowed
      await expect(async () => {
        await tripDetail.editButton.click();
        await expect(tripDetail.editDialogHeading).toBeVisible({
          timeout: RETRY_INTERVAL,
        });
      }).toPass({ timeout: ELEMENT_TIMEOUT });

      // Edit dialog is a single form (no stepper)
      await expect.soft(tripDetail.nameInput).toHaveValue(tripName);
      await expect
        .soft(tripDetail.destinationInput)
        .toHaveValue(tripDestination);
      await expect
        .soft(tripDetail.startDateButton)
        .toContainText("Oct 12, 2026");
      await expect.soft(tripDetail.endDateButton).toContainText("Oct 14, 2026");
      await expect
        .soft(tripDetail.descriptionInput)
        .toHaveValue(tripDescription);

      await tripDetail.nameInput.fill(updatedName);
      await tripDetail.destinationInput.fill(updatedDestination);
      await tripDetail.descriptionInput.fill(updatedDescription);
      await tripDetail.updateTripButton.click();
    });

    await test.step("verify optimistic update and success", async () => {
      await expect(
        page.locator("h1").filter({ hasText: updatedName }),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      await expect(page.getByText("Trip updated successfully")).toBeVisible();
      await expect(tripDetail.editDialogHeading).not.toBeVisible();

      await expect.soft(page.getByText(updatedDestination)).toBeVisible();
      await expect.soft(page.getByText("Oct 12 - 14, 2026")).toBeVisible();
      await expect.soft(page.getByText(updatedDescription)).toBeVisible();
    });

    await test.step("changes persist in trips list", async () => {
      await trips.goto();
      await expect(page.getByText(updatedName)).toBeVisible();
      await expect.soft(page.getByText(updatedDestination)).toBeVisible();
      await expect.soft(page.getByText(tripName)).not.toBeVisible();
    });

    await test.step("delete trip with cancel then confirm", async () => {
      await dismissToast(page);
      await page.getByText(updatedName).click();
      await page.waitForURL("**/trips/**");

      await expect(async () => {
        await tripDetail.editButton.click();
        await expect(tripDetail.editDialogHeading).toBeVisible({
          timeout: RETRY_INTERVAL,
        });
      }).toPass({ timeout: ELEMENT_TIMEOUT });

      // Delete button is at the bottom of the single form
      await tripDetail.deleteTripButton.click();
      await expect(
        page.getByText("Are you sure you want to delete this trip?"),
      ).toBeVisible();
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(
        page.getByText("Are you sure you want to delete this trip?"),
      ).not.toBeVisible();
      await expect(tripDetail.deleteTripButton).toBeVisible();

      // Click delete again and confirm
      await tripDetail.deleteTripButton.click();
      await expect(
        page.getByText("Are you sure you want to delete this trip?"),
      ).toBeVisible();
      await page.getByRole("button", { name: "Yes, delete" }).click();
    });

    await test.step("trip removed from trips list", async () => {
      await page.waitForURL("**/trips", { timeout: SLOW_NAVIGATION_TIMEOUT });
      await expect(page.getByText(updatedName)).not.toBeVisible();

      await expect(trips.emptyStateHeading).toBeVisible();
    });
  });

  test(
    "trip permissions journey",
    { tag: "@regression" },
    async ({ page, request }) => {
      test.slow(); // Multiple auth switches and navigations
      const trips = new TripsPage(page);
      const tripDetail = new TripDetailPage(page);
      const timestamp = Date.now();
      const shortTimestamp = timestamp.toString().slice(-10);
      const userAPhone = `+1555${shortTimestamp}`;
      const userBPhone = `+1555${(parseInt(shortTimestamp) + 1000).toString()}`;

      await test.step("User A creates a trip", async () => {
        await authenticateViaAPIWithPhone(
          page,
          request,
          userAPhone,
          "User A - Trip Creator",
        );
        await expect(trips.heading).toBeVisible();
      });

      const tripName = `Permission Trip ${timestamp}`;
      const tripDestination = "Barcelona, Spain";
      let tripId: string;

      await test.step("create trip with dates", async () => {
        await expect(async () => {
          await trips.createTripButton.click();
          await expect(tripDetail.createDialogHeading).toBeVisible({
            timeout: RETRY_INTERVAL,
          });
        }).toPass({ timeout: ELEMENT_TIMEOUT });

        await tripDetail.nameInput.fill(tripName);
        await tripDetail.destinationInput.fill(tripDestination);
        await pickDate(page, tripDetail.startDateButton, "2026-09-15");
        await pickDate(page, tripDetail.endDateButton, "2026-09-20");
        await tripDetail.continueButton.click();
        await expect(tripDetail.step2Indicator).toBeVisible();
        await tripDetail.createTripButton.click();

        await page.waitForURL("**/trips/**");
        tripId = page.url().split("/trips/")[1];
        await expect(
          page.getByRole("heading", { level: 1, name: tripName }),
        ).toBeVisible();
        await expect(tripDetail.editButton).toBeVisible();
      });

      await test.step("non-member cannot access trip", async () => {
        await page.context().clearCookies();
        await authenticateViaAPIWithPhone(
          page,
          request,
          userBPhone,
          "User B - Non-Member",
        );

        await page.goto(`/trips/${tripId}`);
        await expect(
          page.getByRole("heading", { name: "Trip not found" }),
        ).toBeVisible();
        await expect(
          page.getByText(
            /This trip doesn't exist or you don't have access to it/i,
          ),
        ).toBeVisible();
        await expect(tripDetail.editButton).not.toBeVisible();

        const returnLink = page.getByRole("link", {
          name: "Return to trips",
        });
        await expect(returnLink).toBeVisible();
        await returnLink.click();
        await page.waitForURL("**/trips");
        await expect(trips.heading).toBeVisible();
        await expect(page.getByText(tripName)).not.toBeVisible();
      });

      await test.step("add User B as co-organizer", async () => {
        await page.context().clearCookies();
        await authenticateViaAPIWithPhone(
          page,
          request,
          userAPhone,
          "User A - Trip Creator",
        );

        await page.goto(`/trips/${tripId}`);
        await expect(
          page.getByRole("heading", { level: 1, name: tripName }),
        ).toBeVisible();

        const addCoOrgResponse = await page.request.post(
          `http://localhost:8000/api/trips/${tripId}/co-organizers`,
          { data: { phoneNumber: userBPhone } },
        );
        expect(addCoOrgResponse.ok()).toBeTruthy();
      });

      await test.step("co-organizer can view and edit trip", async () => {
        await page.context().clearCookies();
        await authenticateViaAPIWithPhone(
          page,
          request,
          userBPhone,
          "User B - Co-Organizer",
        );

        await page.goto(`/trips/${tripId}`);
        await expect(
          page.getByRole("heading", { level: 1, name: tripName }),
        ).toBeVisible();
        await expect(tripDetail.editButton).toBeVisible();

        const updatedTripName = `${tripName} - Updated by Co-Org`;
        await tripDetail.editButton.click();
        await expect(tripDetail.editDialogHeading).toBeVisible();
        await tripDetail.nameInput.fill(updatedTripName);
        await tripDetail.updateTripButton.click();

        await expect(
          page.getByRole("heading", { level: 1, name: updatedTripName }),
        ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
        await expect(page.getByText("Trip updated successfully")).toBeVisible();
      });

      await test.step("remove co-organizer and verify access revoked", async () => {
        await page.context().clearCookies();
        await authenticateViaAPIWithPhone(
          page,
          request,
          userAPhone,
          "User A - Trip Creator",
        );

        const tripResponse = await page.request.get(
          `http://localhost:8000/api/trips/${tripId}`,
        );
        expect(tripResponse.ok()).toBeTruthy();

        const tripData = await tripResponse.json();
        const userBId = tripData.trip.organizers.find(
          (org: { phoneNumber: string }) => org.phoneNumber === userBPhone,
        )?.id;
        expect(userBId).toBeDefined();

        const removeCoOrgResponse = await page.request.delete(
          `http://localhost:8000/api/trips/${tripId}/co-organizers/${userBId}`,
        );
        expect(removeCoOrgResponse.ok()).toBeTruthy();

        await page.context().clearCookies();
        await authenticateViaAPIWithPhone(
          page,
          request,
          userBPhone,
          "User B - Co-Organizer",
        );

        await page.goto(`/trips/${tripId}`);
        await expect(
          page.getByRole("heading", { name: "Trip not found" }),
        ).toBeVisible();
        await expect(tripDetail.editButton).not.toBeVisible();
      });
    },
  );

  test(
    "auto-lock past trips",
    { tag: "@regression" },
    async ({ page, request }) => {
      const timestamp = Date.now();
      const shortTimestamp = timestamp.toString().slice(-10);
      const organizerPhone = `+1555${shortTimestamp}`;

      let tripId: string;

      await test.step("create user and past trip via API", async () => {
        const organizerCookie = await createUserViaAPI(
          request,
          organizerPhone,
          "Past Trip Organizer",
        );

        tripId = await createTripViaAPI(request, organizerCookie, {
          name: `Past Trip ${timestamp}`,
          destination: "Historic City",
          startDate: "2025-01-01",
          endDate: "2025-01-05",
        });
        expect(tripId).toBeTruthy();
      });

      await test.step("authenticate and navigate to past trip", async () => {
        await authenticateViaAPIWithPhone(
          page,
          request,
          organizerPhone,
          "Past Trip Organizer",
        );

        await page.goto(`/trips/${tripId}`);
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: `Past Trip ${timestamp}`,
          }),
        ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
      });

      await test.step("verify read-only banner is visible", async () => {
        await expect(
          page.getByText("This trip has ended. The itinerary is read-only."),
        ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
        await snap(page, "22-past-trip-read-only-banner");
      });

      await test.step("verify FAB is not visible", async () => {
        await expect(
          page.getByRole("button", { name: "Add to itinerary" }),
        ).not.toBeVisible();
      });

      await test.step("verify empty state has no add buttons", async () => {
        await expect(
          page.getByRole("button", { name: "Add Event" }),
        ).not.toBeVisible();
        await expect(
          page.getByRole("button", { name: "Add Accommodation" }),
        ).not.toBeVisible();
      });

      await test.step("API rejects event creation for locked trip", async () => {
        const response = await page.request.post(
          `http://localhost:8000/api/trips/${tripId}/events`,
          {
            data: {
              name: "Should Fail",
              eventType: "activity",
              startTime: "2025-01-02T10:00:00.000Z",
            },
          },
        );
        expect(response.status()).toBe(403);
      });
    },
  );

  test(
    "remove member from trip",
    { tag: "@regression" },
    async ({ page, request }) => {
      test.slow(); // Multiple auth cycles

      const timestamp = Date.now();
      const shortTimestamp = timestamp.toString().slice(-10);
      const organizerPhone = `+1555${shortTimestamp}`;
      const memberPhone = `+1555${(parseInt(shortTimestamp) + 1000).toString()}`;

      let tripId: string;

      await test.step("setup: create organizer, trip, invite member, and member creates event", async () => {
        const organizerCookie = await createUserViaAPI(
          request,
          organizerPhone,
          "Remove Test Org",
        );

        tripId = await createTripViaAPI(request, organizerCookie, {
          name: `Remove Member Trip ${timestamp}`,
          destination: "Austin, TX",
          startDate: "2026-10-01",
          endDate: "2026-10-05",
        });

        await inviteAndAcceptViaAPI(
          request,
          tripId,
          organizerPhone,
          memberPhone,
          "Test Member",
          organizerCookie,
        );

        const memberCookie = await createUserViaAPI(
          request,
          memberPhone,
          "Test Member",
        );
        const eventResponse = await request.post(
          `http://localhost:8000/api/trips/${tripId}/events`,
          {
            data: {
              name: "Member's Dinner Plan",
              eventType: "meal",
              startTime: "2026-10-02T19:00:00.000Z",
            },
            headers: { cookie: memberCookie },
          },
        );
        if (!eventResponse.ok()) {
          throw new Error(
            `Failed to create member event: ${eventResponse.status()} ${await eventResponse.text()}`,
          );
        }
      });

      await test.step("organizer navigates to trip and verifies member's event", async () => {
        await authenticateViaAPIWithPhone(
          page,
          request,
          organizerPhone,
          "Remove Test Org",
        );

        await page.goto(`/trips/${tripId}`);
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: `Remove Member Trip ${timestamp}`,
          }),
        ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });

        await expect(page.getByText("Member's Dinner Plan")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await test.step("verify 2 members and open members dialog", async () => {
        await expect(page.getByText(/2 members?/)).toBeVisible();

        // Retry click — SSR text may be visible before React hydrates the onClick handler
        const dialog = page.getByRole("dialog");
        await expect(async () => {
          await page.getByText(/2 members?/).click();
          await expect(
            dialog.getByRole("heading", { name: "Members" }),
          ).toBeVisible({ timeout: RETRY_INTERVAL });
        }).toPass({ timeout: ELEMENT_TIMEOUT });

        await expect(dialog.getByText("Remove Test Org")).toBeVisible();
        await expect(dialog.getByText("Test Member")).toBeVisible();
        await snap(page, "23-members-dialog-before-remove");
      });

      await test.step("click remove button for member", async () => {
        await page
          .getByRole("button", { name: "Actions for Test Member" })
          .click();
        await page.getByText("Remove from trip").click();

        await expect(
          page.getByRole("heading", { name: "Remove member" }),
        ).toBeVisible();
        await expect(
          page.getByText(/Are you sure you want to remove/),
        ).toBeVisible();
        await expect(
          page.getByText("Test Member", { exact: false }),
        ).toBeVisible();
      });

      await test.step("confirm removal", async () => {
        const toastPromise = page
          .getByText(/Test Member has been removed/)
          .waitFor({ state: "visible", timeout: NAVIGATION_TIMEOUT });

        await page.getByRole("button", { name: "Remove", exact: true }).click();

        await toastPromise;

        await snap(page, "24-member-removed");
      });

      await test.step("verify member count updated", async () => {
        await expect(page.getByText("Test Member")).not.toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });

        await page.keyboard.press("Escape");

        await expect(page.getByText(/1 member(?!s)/)).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await test.step("verify member's event shows 'no longer attending' badge", async () => {
        await expect(page.getByText("Member's Dinner Plan")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });

        await expect(page.getByText("Member no longer attending")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });

        await snap(page, "25-member-no-longer-attending");
      });
    },
  );

  test(
    "promote and demote co-organizer via members dialog",
    { tag: "@regression" },
    async ({ page, request }) => {
      test.slow();

      const timestamp = Date.now();
      const shortTimestamp = timestamp.toString().slice(-10);
      const organizerPhone = `+1555${shortTimestamp}`;
      const memberPhone = `+1555${(parseInt(shortTimestamp) + 1000).toString()}`;

      let tripId: string;

      await test.step("setup: create organizer, trip, and invite member", async () => {
        const organizerCookie = await createUserViaAPI(
          request,
          organizerPhone,
          "Promote Test Org",
        );

        tripId = await createTripViaAPI(request, organizerCookie, {
          name: `Promote Trip ${timestamp}`,
          destination: "Denver, CO",
          startDate: "2026-11-01",
          endDate: "2026-11-05",
        });

        await inviteAndAcceptViaAPI(
          request,
          tripId,
          organizerPhone,
          memberPhone,
          "Test Promotee",
          organizerCookie,
        );
      });

      await test.step("organizer navigates to trip and opens members dialog", async () => {
        await authenticateViaAPIWithPhone(
          page,
          request,
          organizerPhone,
          "Promote Test Org",
        );

        await page.goto(`/trips/${tripId}`);
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: `Promote Trip ${timestamp}`,
          }),
        ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });

        await expect(page.getByText(/2 members?/)).toBeVisible();

        // Retry click — heading may be server-rendered before React hydrates the onClick handler
        const dialog = page.getByRole("dialog");
        await expect(async () => {
          await page.getByText(/2 members?/).click();
          await expect(
            dialog.getByRole("heading", { name: "Members" }),
          ).toBeVisible({ timeout: RETRY_INTERVAL });
        }).toPass({ timeout: ELEMENT_TIMEOUT });

        await expect(dialog.getByText("Promote Test Org")).toBeVisible();
        await expect(dialog.getByText("Test Promotee")).toBeVisible();
      });

      await test.step("promote member to co-organizer", async () => {
        const dialog = page.getByRole("dialog");

        // Find the actions button for the member (not the organizer)
        const memberRow = dialog
          .locator("div")
          .filter({ hasText: "Test Promotee" });
        const actionsButton = memberRow.getByRole("button", {
          name: "Actions for Test Promotee",
        });
        await actionsButton.click();

        // Click "Make co-organizer" in the dropdown
        await page.getByText("Make co-organizer").click();

        // Verify toast success message
        await expect(
          page.getByText("Test Promotee is now a co-organizer"),
        ).toBeVisible({ timeout: TOAST_TIMEOUT });

        // Verify "Organizer" badge appears on that member in the dialog
        // The dialog should still be open and now show the badge
        const promoteeNameEl = dialog.getByText("Test Promotee", {
          exact: true,
        });
        await expect(
          promoteeNameEl.locator("..").getByText("Organizer"),
        ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      });

      await test.step("demote member from co-organizer", async () => {
        const dialog = page.getByRole("dialog");

        // Open dropdown again on the same member
        const memberRow = dialog
          .locator("div")
          .filter({ hasText: "Test Promotee" });
        const actionsButton = memberRow.getByRole("button", {
          name: "Actions for Test Promotee",
        });
        await actionsButton.click();

        // Click "Remove co-organizer" in the dropdown
        await page.getByText("Remove co-organizer").click();

        // Verify toast success message
        await expect(
          page.getByText("Test Promotee is no longer a co-organizer"),
        ).toBeVisible({ timeout: TOAST_TIMEOUT });

        // Verify "Organizer" badge is removed from that member
        // Wait for the UI to update
        const demoteeNameEl = dialog.getByText("Test Promotee", {
          exact: true,
        });
        await expect(
          demoteeNameEl.locator("..").getByText("Organizer"),
        ).not.toBeVisible({ timeout: ELEMENT_TIMEOUT });
      });
    },
  );

  test(
    "organizer can add travel for another member via delegation",
    { tag: "@regression" },
    async ({ page, request }) => {
      test.slow();

      const timestamp = Date.now();
      const shortTimestamp = timestamp.toString().slice(-10);
      const organizerPhone = `+1555${shortTimestamp}`;
      const memberPhone = `+1555${(parseInt(shortTimestamp) + 1000).toString()}`;

      let tripId: string;

      await test.step("setup: create organizer, trip, event, and invite member", async () => {
        const organizerCookie = await createUserViaAPI(
          request,
          organizerPhone,
          "Delegation Org",
        );

        tripId = await createTripViaAPI(request, organizerCookie, {
          name: `Delegation Trip ${timestamp}`,
          destination: "Seattle, WA",
          startDate: "2026-12-01",
          endDate: "2026-12-05",
        });

        // Create an event so the itinerary has content and the FAB is visible
        // (empty state only shows "Add Event" / "Add Accommodation" buttons, not the FAB)
        const eventResponse = await request.post(
          `http://localhost:8000/api/trips/${tripId}/events`,
          {
            data: {
              name: "Welcome Dinner",
              eventType: "meal",
              startTime: "2026-12-01T18:00:00.000Z",
            },
            headers: { cookie: organizerCookie },
          },
        );
        if (!eventResponse.ok()) {
          throw new Error(
            `Failed to create event: ${eventResponse.status()} ${await eventResponse.text()}`,
          );
        }

        await inviteAndAcceptViaAPI(
          request,
          tripId,
          organizerPhone,
          memberPhone,
          "Delegated Member",
          organizerCookie,
        );
      });

      await test.step("organizer navigates to trip", async () => {
        await authenticateViaAPIWithPhone(
          page,
          request,
          organizerPhone,
          "Delegation Org",
        );

        await page.goto(`/trips/${tripId}`);
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: `Delegation Trip ${timestamp}`,
          }),
        ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
      });

      await test.step("open My Travel dialog via FAB", async () => {
        await dismissToast(page);

        const fab = page.getByRole("button", { name: "Add to itinerary" });
        await expect(fab).toBeVisible({ timeout: ELEMENT_TIMEOUT });
        await fab.click();
        await page.getByRole("menuitem", { name: "My Travel" }).click();

        await expect(
          page.getByRole("heading", { name: "Add your travel details" }),
        ).toBeVisible();
      });

      await test.step("verify member selector is visible for organizer", async () => {
        // Organizer should see the member selector
        const memberSelector = page.locator('[data-testid="member-selector"]');
        await expect(memberSelector).toBeVisible();

        // Should show the helper text
        await expect(
          page.getByText("As organizer, you can add travel for any member"),
        ).toBeVisible();
      });

      await test.step("select the other member", async () => {
        const memberSelector = page.locator('[data-testid="member-selector"]');
        await memberSelector.click();

        // Wait for the dropdown options to appear
        const delegatedOption = page.getByRole("option", {
          name: /Delegated Member/,
        });
        await expect(delegatedOption).toBeVisible({ timeout: DIALOG_TIMEOUT });

        // Select the delegated member
        await delegatedOption.click();

        // Verify the selector now shows the selected member
        await expect(memberSelector).toContainText("Delegated Member");
      });

      await test.step("fill in travel details and submit", async () => {
        await page.getByRole("radio", { name: "Arrival" }).click();

        const travelTimeTrigger = page.getByRole("button", {
          name: "Travel time",
        });
        await pickDateTime(page, travelTimeTrigger, "2026-12-01T14:00");

        await page
          .locator('input[name="location"]')
          .fill("Seattle-Tacoma Airport");
        await page
          .locator('textarea[name="details"]')
          .fill("Arriving on behalf of member");
        await page.getByRole("button", { name: "Add travel details" }).click();

        // Wait for success toast
        await expect(
          page.getByText("Travel details added successfully"),
        ).toBeVisible({ timeout: TOAST_TIMEOUT });
      });

      await test.step("verify delegated travel appears with correct member name", async () => {
        // The travel card shows "Name · Time · Location" format
        // Verify the delegated member's name appears on the travel card
        await expect(page.getByText("Delegated Member").first()).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });

        // Location should also be visible (compact view truncates > 20 chars)
        const locationLink = page.getByRole("link", {
          name: /Seattle-Tacoma/,
        });
        await expect(locationLink).toBeVisible({ timeout: ELEMENT_TIMEOUT });

        await snap(page, "30-member-travel-delegation");
      });
    },
  );
});
