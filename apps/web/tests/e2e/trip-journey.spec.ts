import { test, expect } from "@playwright/test";
import {
  authenticateViaAPI,
  authenticateViaAPIWithPhone,
  createUserViaAPI,
} from "./helpers/auth";
import { TripsPage, TripDetailPage } from "./helpers/pages";
import { snap } from "./helpers/screenshots";
import { removeNextjsDevOverlay, dismissPwaPrompts } from "./helpers/nextjs-dev";
import { pickDate } from "./helpers/date-pickers";
import { createTripViaAPI, inviteAndAcceptViaAPI } from "./helpers/invitations";
import { navigateToMobilePanel } from "./helpers/mobile-panels";
import { dismissToast } from "./helpers/toast";
import {
  NAVIGATION_TIMEOUT,
  ELEMENT_TIMEOUT,
  TOAST_TIMEOUT,
  DIALOG_TIMEOUT,
  SLOW_NAVIGATION_TIMEOUT,
  RETRY_INTERVAL,
  API_BASE,
} from "./helpers/timeouts";

/**
 * E2E Journey: Trip CRUD, Permissions, and Delegation
 *
 * Slimmed to critical full-stack flows only.
 * Form fill/validation steps cut — covered by create-trip-dialog.test.tsx,
 * edit-trip-dialog.test.tsx, members-list.test.tsx, event-detail-sheet.test.tsx.
 */

test.describe("Trip Journey", () => {
  test.beforeEach(async ({ page }) => {
    await removeNextjsDevOverlay(page);
    await dismissPwaPrompts(page);
    await page.context().clearCookies();
  });

  test("trip CRUD journey", { tag: "@smoke" }, async ({ page, request }) => {
    test.slow(); // Create, verify, delete flow is slow on iPhone WebKit
    const trips = new TripsPage(page);
    const tripDetail = new TripDetailPage(page);
    await authenticateViaAPI(page, request, "Trip Creator");

    // Extract auth cookie for API calls
    const cookies = await page.context().cookies();
    const authToken =
      cookies.find((c) => c.name === "auth_token")?.value || "";
    const authCookie = `auth_token=${authToken}`;

    const tripName = `Test Trip ${Date.now()}`;
    const tripDestination = "Miami Beach, FL";

    let tripId: string;

    await test.step("create trip via API", async () => {
      tripId = await createTripViaAPI(request, authCookie, {
        name: tripName,
        destination: tripDestination,
        startDate: "2026-10-12",
        endDate: "2026-10-14",
        description: "A test trip for E2E verification",
      });
    });

    await test.step("verify trip detail page", async () => {
      await page.goto(`/trips?id=${tripId}`);
      await expect(
        page.getByRole("heading", { level: 1, name: tripName }),
      ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
      await expect
        .soft(page.getByText(tripDestination).first())
        .toBeVisible();
      await expect.soft(page.getByText("Oct 12 - 14, 2026")).toBeVisible();
      await expect
        .soft(
          page.getByText("A test trip for E2E verification").first(),
        )
        .toBeVisible();
      await expect
        .soft(page.getByRole("button", { name: "Going" }).first())
        .toBeVisible();
      await expect(
        page.getByRole("button", { name: "Edit trip", exact: true }),
      ).toBeVisible();
      await snap(page, "07-trip-detail");
    });

    await test.step("trip appears in trips list", async () => {
      await trips.goto();
      await expect(page.getByText(tripName).first()).toBeVisible();
      await expect(page.getByText(tripDestination).first()).toBeVisible();
      await expect(trips.upcomingTripsHeading).toBeVisible();
      await snap(page, "08-trips-list");

      await dismissToast(page);
      await page.getByText(tripName).first().click();
      await page.waitForURL("**/trips?id=**");
      await expect(
        page.getByRole("heading", { level: 1, name: tripName }),
      ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
    });

    await test.step("delete trip with cancel then confirm", async () => {
      await dismissToast(page);

      // Open edit dialog to reveal delete button
      await expect(async () => {
        await tripDetail.editButton.click();
        await expect(tripDetail.editDialogHeading).toBeVisible({
          timeout: RETRY_INTERVAL,
        });
      }).toPass({ timeout: ELEMENT_TIMEOUT });

      await tripDetail.deleteTripButton.click();
      await expect(
        page.getByText("Are you sure you want to delete this trip?"),
      ).toBeVisible();
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(
        page.getByText("Are you sure you want to delete this trip?"),
      ).not.toBeVisible({ timeout: DIALOG_TIMEOUT });
      await expect(tripDetail.deleteTripButton).toBeVisible();

      await tripDetail.deleteTripButton.click();
      await expect(
        page.getByText("Are you sure you want to delete this trip?"),
      ).toBeVisible();
      await page.getByRole("button", { name: "Yes, delete" }).click();
    });

    await test.step("trip removed from trips list", async () => {
      await page.waitForURL("**/trips", { timeout: SLOW_NAVIGATION_TIMEOUT });
      await expect(page.getByText(tripName)).not.toBeVisible();
      await expect(trips.emptyStateHeading).toBeVisible();
    });
  });

  test(
    "promote and demote co-organizer by phone",
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
        await tripDetail.createTripButton.click({ noWaitAfter: true });

        // Step 3: timezone confirmation — click "Go to trip" to complete navigation
        await expect(tripDetail.goToTripButton).toBeVisible({
          timeout: NAVIGATION_TIMEOUT,
        });
        await tripDetail.goToTripButton.click();
        await page.waitForURL("**/trips?id=**");
        tripId = new URL(page.url()).searchParams.get("id")!;
        await expect(
          page.getByRole("heading", { level: 1, name: tripName }),
        ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
        await expect(tripDetail.editButton).toBeVisible();
      });

      await test.step("invite User B to trip", async () => {
        await inviteAndAcceptViaAPI(
          request,
          tripId,
          userAPhone,
          userBPhone,
          "User B - Co-Organizer",
        );
      });

      await test.step("promote member to co-organizer via UI", async () => {
        await page.context().clearCookies();
        await authenticateViaAPIWithPhone(
          page,
          request,
          userAPhone,
          "User A - Trip Creator",
        );

        await page.goto(`/trips?id=${tripId}`);
        await expect(
          page.getByRole("heading", { level: 1, name: tripName }),
        ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });

        // Open Members dialog by clicking the member count
        await expect(page.getByText(/2 going/).first()).toBeVisible();

        const dialog = page.getByRole("dialog");
        await expect(async () => {
          await page.getByText(/2 going/).first().click();
          await expect(
            dialog.getByRole("heading", { name: "Members" }),
          ).toBeVisible({ timeout: 1000 });
        }).toPass({ timeout: ELEMENT_TIMEOUT });

        await expect(dialog.getByText("User A - Trip Creator")).toBeVisible();
        await expect(
          dialog.getByText("User B - Co-Organizer"),
        ).toBeVisible();

        // Find the actions button for User B
        const memberRow = dialog
          .locator("div")
          .filter({ hasText: "User B - Co-Organizer" });
        const actionsButton = memberRow.getByRole("button", {
          name: "Actions for User B - Co-Organizer",
        });
        await actionsButton.click();

        // Click "Make co-organizer" in the dropdown
        await page.getByText("Make co-organizer").click();

        // Verify toast success message
        await expect(
          page.getByText("User B - Co-Organizer is now a co-organizer"),
        ).toBeVisible({ timeout: 5000 });
      });

      await test.step("co-organizer can view and edit trip", async () => {
        await page.context().clearCookies();
        await authenticateViaAPIWithPhone(
          page,
          request,
          userBPhone,
          "User B - Co-Organizer",
        );

        await page.goto(`/trips?id=${tripId}`);
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
        await expect(
          page.getByText("Trip updated successfully"),
        ).toBeVisible();
      });

      await test.step(
        "demote co-organizer and verify organizer role removed",
        async () => {
          await page.context().clearCookies();
          await authenticateViaAPIWithPhone(
            page,
            request,
            userAPhone,
            "User A - Trip Creator",
          );

          await page.goto(`/trips?id=${tripId}`);
          await expect(
            page.getByRole("heading", { level: 1, name: tripName }),
          ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });

          // Open Members dialog
          const dialog = page.getByRole("dialog");
          await expect(async () => {
            await page.getByText(/2 going/).first().click();
            await expect(
              dialog.getByRole("heading", { name: "Members" }),
            ).toBeVisible({ timeout: 1000 });
          }).toPass({ timeout: ELEMENT_TIMEOUT });

          // Find User B and open actions dropdown
          const memberRow = dialog
            .locator("div")
            .filter({ hasText: "User B - Co-Organizer" });
          const actionsButton = memberRow.getByRole("button", {
            name: "Actions for User B - Co-Organizer",
          });
          await actionsButton.click();

          // Click "Remove co-organizer" in the dropdown
          await page.getByText("Remove co-organizer").click();

          // Verify toast
          await expect(
            page.getByText(
              "User B - Co-Organizer is no longer a co-organizer",
            ),
          ).toBeVisible({ timeout: 5000 });

          // Verify User B can still view the trip as a regular member
          await page.context().clearCookies();
          await authenticateViaAPIWithPhone(
            page,
            request,
            userBPhone,
            "User B - Co-Organizer",
          );

          await page.goto(`/trips?id=${tripId}`);
          await expect(
            page.getByRole("heading", { level: 1, name: tripName }),
          ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
          // User B is no longer an organizer, so the edit button should be hidden
          await expect(tripDetail.editButton).not.toBeVisible();
        },
      );
    },
  );

  test(
    "organizer can add travel and verify FAB navigation",
    { tag: "@regression" },
    async ({ page, request }) => {
      test.slow();

      const timestamp = Date.now();
      const shortTimestamp = timestamp.toString().slice(-10);
      const organizerPhone = `+1555${shortTimestamp}`;

      let tripId: string;

      await test.step("setup: create organizer, trip, and travel via API", async () => {
        const organizerCookie = await createUserViaAPI(
          request,
          organizerPhone,
          "Travel Org",
        );

        tripId = await createTripViaAPI(request, organizerCookie, {
          name: `Travel Trip ${timestamp}`,
          destination: "Seattle, WA",
          startDate: "2026-12-01",
          endDate: "2026-12-05",
        });

        // Create travel via API so the card renders on the itinerary panel
        const travelResp = await request.post(
          `${API_BASE}/trips/${tripId}/member-travel`,
          {
            data: {
              travelType: "arrival",
              time: "2026-12-01T14:00:00.000Z",
              location: "Seattle-Tacoma Airport",
              details: "Arriving via API",
            },
            headers: { cookie: organizerCookie },
          },
        );
        if (!travelResp.ok()) {
          throw new Error(
            `Failed to create member travel: ${travelResp.status()}`,
          );
        }
      });

      await test.step("organizer navigates to trip", async () => {
        await authenticateViaAPIWithPhone(
          page,
          request,
          organizerPhone,
          "Travel Org",
        );

        await page.goto(`/trips?id=${tripId}`);
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: `Travel Trip ${timestamp}`,
          }),
        ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
      });

      await test.step("verify travel card renders on itinerary", async () => {
        await navigateToMobilePanel(page, "Itinerary");
        await dismissToast(page);

        // Dismiss the CalendarSyncCard via localStorage
        await page.evaluate(() =>
          localStorage.setItem("calendar-sync-card-dismissed", "true"),
        );
        await page.waitForTimeout(200);

        // Verify the travel card with organizer name appears
        await expect(page.getByText("Travel Org").first()).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });

        await snap(page, "30-travel-card-rendering");
      });

      await test.step("open My Travel dialog via FAB", async () => {
        const fab = page.getByRole("button", { name: "Add to itinerary" });
        await expect(fab).toBeVisible({
          timeout: SLOW_NAVIGATION_TIMEOUT,
        });

        // Retry: FAB dropdown can detach during React re-renders
        await expect(async () => {
          await page.keyboard.press("Escape");
          await fab.click();
          const myTravelItem = page.getByRole("menuitem", {
            name: "My Travel",
          });
          await expect(myTravelItem).toBeVisible({
            timeout: RETRY_INTERVAL,
          });
          await myTravelItem.click({ force: true });
          await expect(
            page.getByRole("heading", { name: "Add your travel details" }),
          ).toBeVisible({ timeout: RETRY_INTERVAL });
        }).toPass({ timeout: SLOW_NAVIGATION_TIMEOUT });
      });
    },
  );
});
