import { test, expect } from "@playwright/test";
import { authenticateViaAPIWithPhone, createUserViaAPI } from "./helpers/auth";
import { removeNextjsDevOverlay } from "./helpers/nextjs-dev";
import { fillPhoneInput } from "./helpers/phone-input";
import { snap } from "./helpers/screenshots";
import {
  createTripViaAPI,
  inviteViaAPI,
  rsvpViaAPI,
  inviteAndAcceptViaAPI,
} from "./helpers/invitations";
import {
  NAVIGATION_TIMEOUT,
  ELEMENT_TIMEOUT,
  TOAST_TIMEOUT,
  DIALOG_TIMEOUT,
} from "./helpers/timeouts";
import { pickDateTime } from "./helpers/date-pickers";
import { dismissToast } from "./helpers/toast";

/**
 * E2E Journey: Invitations & RSVP
 *
 * Tests the invitation flow, RSVP management, trip preview,
 * members list, and "member no longer attending" indicator.
 * Uses authenticateViaAPI for fast auth (no browser navigation).
 */

test.describe("Invitation Journey", () => {
  test.beforeEach(async ({ page }) => {
    await removeNextjsDevOverlay(page);
    await page.context().clearCookies();
  });

  test(
    "invitation and RSVP journey",
    { tag: "@smoke" },
    async ({ page, request }) => {
      test.slow();

      const timestamp = Date.now();
      const shortTimestamp = timestamp.toString().slice(-10);
      const organizerPhone = `+1555${shortTimestamp}`;
      const inviteePhone = `+1555${(parseInt(shortTimestamp) + 1000).toString()}`;

      let tripId: string;

      // Setup: create organizer and trip via API
      const organizerCookie = await createUserViaAPI(
        request,
        organizerPhone,
        "Organizer Alpha",
      );

      tripId = await createTripViaAPI(request, organizerCookie, {
        name: `Invite Trip ${timestamp}`,
        destination: "Honolulu, HI",
        startDate: "2026-12-01",
        endDate: "2026-12-05",
      });

      await test.step("organizer invites member via dialog", async () => {
        await authenticateViaAPIWithPhone(
          page,
          request,
          organizerPhone,
          "Organizer Alpha",
        );

        await page.goto(`/trips/${tripId}`);
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: `Invite Trip ${timestamp}`,
          }),
        ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });

        await snap(page, "09-trip-detail-invite-button");

        // Dismiss any toast that might intercept the button click
        await dismissToast(page);

        // Click "Invite" button in trip header
        const inviteButton = page
          .getByRole("button", { name: "Invite" })
          .first();
        await inviteButton.click();

        // Wait for sheet (dynamically imported, may take time in CI)
        // Retry click if sheet didn't open (handles rare hydration race in CI)
        const inviteHeading = page.getByRole("heading", {
          name: "Invite members",
        });
        if (
          !(await inviteHeading
            .isVisible({ timeout: DIALOG_TIMEOUT })
            .catch(() => false))
        ) {
          await inviteButton.click();
        }
        await expect(inviteHeading).toBeVisible({
          timeout: DIALOG_TIMEOUT,
        });

        await snap(page, "10-invite-dialog");

        // Fill phone input within the dialog
        const dialog = page.getByRole("dialog");
        await fillPhoneInput(dialog.locator('input[type="tel"]'), inviteePhone);

        // Click "Add" button
        await dialog.getByRole("button", { name: "Add" }).click();

        await snap(page, "11-invite-phone-added");

        // Click "Send invitations" button
        await dialog.getByRole("button", { name: "Send invitations" }).click();

        // Verify toast with "invitation" text appears
        await expect(page.getByText(/invitation/i)).toBeVisible({
          timeout: TOAST_TIMEOUT,
        });
        await snap(page, "12-invite-sent");
      });

      await test.step("invited member sees trip preview", async () => {
        await page.context().clearCookies();
        await authenticateViaAPIWithPhone(
          page,
          request,
          inviteePhone,
          "Invited Member",
        );

        await page.goto(`/trips/${tripId}`);

        // Verify preview mode
        await expect(page.getByText("You've been invited!")).toBeVisible({
          timeout: NAVIGATION_TIMEOUT,
        });
        await expect(
          page.getByText("RSVP to see the full itinerary."),
        ).toBeVisible();
        await expect(
          page.locator('[data-testid="rsvp-buttons"]'),
        ).toBeVisible();
        await snap(page, "13-trip-preview-invitee");
      });

      await test.step("member RSVPs Going and sees full itinerary", async () => {
        // Click "Going" button
        await page
          .locator('[data-testid="rsvp-buttons"]')
          .getByRole("button", { name: "Going", exact: true })
          .click();

        // Verify toast
        await expect(page.getByText('RSVP updated to "Going"')).toBeVisible({
          timeout: TOAST_TIMEOUT,
        });

        // Wait for the onboarding wizard Sheet to appear (dynamically imported)
        const wizardDialog = page.getByRole("dialog");

        // Step 0: phone sharing step appears first
        await expect(
          wizardDialog.getByText("Share your phone number?"),
        ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });

        // Skip past the phone sharing step
        await wizardDialog.getByRole("button", { name: "Skip" }).click();

        // Step 1: arrival step
        await expect(
          wizardDialog.getByText("When are you arriving?"),
        ).toBeVisible({ timeout: ELEMENT_TIMEOUT });

        // Dismiss the wizard by clicking the Sheet close button
        await wizardDialog.getByRole("button", { name: "Close" }).click();
        await expect(wizardDialog).not.toBeVisible({
          timeout: DIALOG_TIMEOUT,
        });

        // Preview should disappear
        await expect(page.getByText("You've been invited!")).not.toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });

        // Full trip view should show destination and member count
        await expect(page.getByText("Honolulu, HI")).toBeVisible();
        await expect(page.getByText(/\d+ members?/)).toBeVisible();
        await snap(page, "14-rsvp-going-full-view");
      });
    },
  );

  test(
    "RSVP status change and member indicator",
    { tag: "@regression" },
    async ({ page, request }) => {
      test.slow();

      const timestamp = Date.now();
      const shortTimestamp = timestamp.toString().slice(-10);
      const organizerPhone = `+1555${shortTimestamp}`;
      const inviteePhone = `+1555${(parseInt(shortTimestamp) + 2000).toString()}`;

      let tripId: string;

      // Setup: create organizer, trip, and invite+accept a member
      const organizerCookie = await createUserViaAPI(
        request,
        organizerPhone,
        "Organizer Beta",
      );

      tripId = await createTripViaAPI(request, organizerCookie, {
        name: `RSVP Change Trip ${timestamp}`,
        destination: "Denver, CO",
        startDate: "2026-11-10",
        endDate: "2026-11-14",
      });

      await inviteAndAcceptViaAPI(
        request,
        tripId,
        organizerPhone,
        inviteePhone,
        "Member Beta",
        organizerCookie,
      );

      const eventName = `Test Event ${timestamp}`;

      await test.step("member creates an event via API", async () => {
        // Auth as member in browser
        await authenticateViaAPIWithPhone(
          page,
          request,
          inviteePhone,
          "Member Beta",
        );

        // Create event via API (member has canAddEvent permission)
        const eventResponse = await page.request.post(
          `http://localhost:8000/api/trips/${tripId}/events`,
          {
            data: {
              name: eventName,
              eventType: "activity",
              startTime: "2026-11-11T10:00:00.000Z",
            },
          },
        );
        expect(eventResponse.ok()).toBeTruthy();

        // Navigate to trip to verify event is visible
        await page.goto(`/trips/${tripId}`);
        await expect(page.getByText(eventName)).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
      });

      await test.step("member changes RSVP to Maybe", async () => {
        // Use API shortcut to change RSVP
        const inviteeCookie = await createUserViaAPI(
          request,
          inviteePhone,
          "Member Beta",
        );
        await rsvpViaAPI(request, tripId, inviteeCookie, "maybe");

        // Refresh page
        await page.reload();

        // Since member is now "maybe" (non-Going), they should see preview
        await expect(page.getByText("You've been invited!")).toBeVisible({
          timeout: NAVIGATION_TIMEOUT,
        });
        await snap(page, "15-rsvp-changed-to-maybe");
      });

      await test.step("organizer sees member no longer attending indicator", async () => {
        await page.context().clearCookies();
        await authenticateViaAPIWithPhone(
          page,
          request,
          organizerPhone,
          "Organizer Beta",
        );

        await page.goto(`/trips/${tripId}`);
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: `RSVP Change Trip ${timestamp}`,
          }),
        ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });

        // Verify "Member no longer attending" badge is visible
        await expect(page.getByText("Member no longer attending")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
        await snap(page, "16-member-not-attending-indicator");
      });

      await test.step("organizer changes own RSVP via dropdown", async () => {
        // The organizer is already on the trip detail page from the previous step.
        // Click the RSVP dropdown (organizer is "Going" by default)
        const rsvpButton = page.getByRole("button", { name: "Going" });
        await rsvpButton.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await rsvpButton.click();

        // Select "Maybe" from the dropdown
        await page.getByRole("menuitem", { name: "Maybe" }).click();

        // Wait for dropdown to close
        await expect(page.getByRole("menu")).not.toBeVisible();

        // Verify toast confirms the change
        await expect(page.getByText('RSVP updated to "Maybe"')).toBeVisible({
          timeout: TOAST_TIMEOUT,
        });
        await dismissToast(page);

        // Trigger button should now show "Maybe"
        const maybeButton = page.getByRole("button", { name: "Maybe" });
        await maybeButton.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });

        // Change back to "Going" via dropdown
        await maybeButton.click();
        await page.getByRole("menuitem", { name: "Going" }).first().click();

        // Wait for dropdown to close
        await expect(page.getByRole("menu")).not.toBeVisible();

        await expect(page.getByText('RSVP updated to "Going"')).toBeVisible({
          timeout: TOAST_TIMEOUT,
        });
        await dismissToast(page);

        await expect(
          page.getByRole("button", { name: "Going" }),
        ).toBeVisible({ timeout: ELEMENT_TIMEOUT });

        await snap(page, "16b-organizer-rsvp-dropdown");
      });

      await test.step("member RSVPs Going again, indicator removed", async () => {
        // Use API shortcut to change RSVP back to going
        const inviteeCookie = await createUserViaAPI(
          request,
          inviteePhone,
          "Member Beta",
        );
        await rsvpViaAPI(request, tripId, inviteeCookie, "going");

        // Reload organizer's page
        await page.reload();
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: `RSVP Change Trip ${timestamp}`,
          }),
        ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });

        // Verify badge is gone
        await expect(
          page.getByText("Member no longer attending"),
        ).not.toBeVisible();
      });
    },
  );

  test(
    "uninvited user access",
    { tag: "@regression" },
    async ({ page, request }) => {
      const timestamp = Date.now();
      const shortTimestamp = timestamp.toString().slice(-10);
      const organizerPhone = `+1555${shortTimestamp}`;
      const uninvitedPhone = `+1555${(parseInt(shortTimestamp) + 3000).toString()}`;

      let tripId: string;

      // Setup: create organizer and trip
      const organizerCookie = await createUserViaAPI(
        request,
        organizerPhone,
        "Organizer Gamma",
      );

      tripId = await createTripViaAPI(request, organizerCookie, {
        name: `Private Trip ${timestamp}`,
        destination: "Aspen, CO",
      });

      await test.step("uninvited user cannot access trip", async () => {
        await authenticateViaAPIWithPhone(
          page,
          request,
          uninvitedPhone,
          "Uninvited User",
        );

        await page.goto(`/trips/${tripId}`);

        // Verify 404 page
        await expect(
          page.getByRole("heading", { name: "Trip not found" }),
        ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
        await snap(page, "17-uninvited-user-404");
      });
    },
  );

  test("member list", { tag: "@regression" }, async ({ page, request }) => {
    test.slow();

    const timestamp = Date.now();
    const shortTimestamp = timestamp.toString().slice(-10);
    const organizerPhone = `+1555${shortTimestamp}`;
    const member1Phone = `+1555${(parseInt(shortTimestamp) + 4000).toString()}`;
    const member2Phone = `+1555${(parseInt(shortTimestamp) + 5000).toString()}`;

    let tripId: string;

    // Setup: create organizer and trip
    const organizerCookie = await createUserViaAPI(
      request,
      organizerPhone,
      "Organizer Delta",
    );

    tripId = await createTripViaAPI(request, organizerCookie, {
      name: `Members Trip ${timestamp}`,
      destination: "Nashville, TN",
      startDate: "2026-10-20",
      endDate: "2026-10-24",
    });

    // Member 1: invite and accept (RSVP "going")
    await inviteAndAcceptViaAPI(
      request,
      tripId,
      organizerPhone,
      member1Phone,
      "Member One",
      organizerCookie,
    );

    // Member 2: invite, auth, then RSVP "maybe" via API
    const inviterCookie = await createUserViaAPI(
      request,
      organizerPhone,
      "Organizer Delta",
    );
    await inviteViaAPI(request, tripId, inviterCookie, [member2Phone]);
    const member2Cookie = await createUserViaAPI(
      request,
      member2Phone,
      "Member Two",
    );
    await rsvpViaAPI(request, tripId, member2Cookie, "maybe");

    await test.step("organizer views member list with statuses", async () => {
      await authenticateViaAPIWithPhone(
        page,
        request,
        organizerPhone,
        "Organizer Delta",
      );

      await page.goto(`/trips/${tripId}`);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: `Members Trip ${timestamp}`,
        }),
      ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });

      // Click member count button to open members sheet
      const memberCountBtn = page
        .getByRole("button")
        .filter({ hasText: /\d+ members?/ });
      await memberCountBtn.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
      await memberCountBtn.click();

      // Wait for Members sheet to appear
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("heading", { name: "Members" }),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });

      // Verify organizer is listed with "Organizer" badge
      await expect(dialog.getByText("Organizer Delta")).toBeVisible();
      await expect(
        dialog.getByText("Organizer", { exact: true }).first(),
      ).toBeVisible();

      // Verify Member 1 with "Going" badge
      await expect(dialog.getByText("Member One")).toBeVisible();

      // Switch to Maybe tab and verify Member 2
      await dialog.getByRole("tab", { name: /Maybe/ }).click();
      await expect(dialog.getByText("Member Two")).toBeVisible();

      await snap(page, "18-member-list-with-statuses");
    });

    await test.step("organizer sees invite button", async () => {
      // Verify "Invite" button is visible in the members dialog
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("button", { name: "Invite" }),
      ).toBeVisible();
    });
  });

  test(
    "member completes onboarding wizard after RSVP",
    { tag: "@regression" },
    async ({ page, request }) => {
      test.slow();

      const timestamp = Date.now();
      const shortTimestamp = timestamp.toString().slice(-10);
      const organizerPhone = `+1555${shortTimestamp}`;
      const inviteePhone = `+1555${(parseInt(shortTimestamp) + 6000).toString()}`;

      // Setup: create organizer and trip with dates
      const organizerCookie = await createUserViaAPI(
        request,
        organizerPhone,
        "Organizer Epsilon",
      );

      const tripId = await createTripViaAPI(request, organizerCookie, {
        name: `Wizard Trip ${timestamp}`,
        destination: "Portland, OR",
        startDate: "2026-10-01",
        endDate: "2026-10-05",
      });

      // Invite member via API
      await inviteViaAPI(request, tripId, organizerCookie, [inviteePhone]);

      await test.step("member authenticates and navigates to trip", async () => {
        await authenticateViaAPIWithPhone(
          page,
          request,
          inviteePhone,
          "Wizard Member",
        );

        await page.goto(`/trips/${tripId}`);

        // Verify preview mode
        await expect(page.getByText("You've been invited!")).toBeVisible({
          timeout: NAVIGATION_TIMEOUT,
        });
      });

      await test.step("member RSVPs Going and wizard opens", async () => {
        // Click "Going" button
        await page
          .locator('[data-testid="rsvp-buttons"]')
          .getByRole("button", { name: "Going", exact: true })
          .click();

        // Verify toast
        await expect(page.getByText('RSVP updated to "Going"')).toBeVisible({
          timeout: TOAST_TIMEOUT,
        });

        // Dismiss toast before interacting with wizard elements
        await dismissToast(page);

        // Wait for the onboarding wizard to appear (dynamically imported)
        const dialog = page.getByRole("dialog");

        // Step 0: phone sharing step appears first
        await expect(dialog.getByText("Share your phone number?")).toBeVisible({
          timeout: NAVIGATION_TIMEOUT,
        });
        await expect.soft(dialog.getByText("Step 1 of 5")).toBeVisible();

        // Skip past the phone sharing step
        await dialog.getByRole("button", { name: "Skip" }).click();

        // Step 1: arrival step
        await expect(dialog.getByText("When are you arriving?")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
        await expect.soft(dialog.getByText("Step 2 of 5")).toBeVisible();
        await snap(page, "20-wizard-arrival-step");
      });

      await test.step("fill arrival step and advance", async () => {
        const dialog = page.getByRole("dialog");

        // Pick arrival date and time
        const arrivalTrigger = page.getByLabel("Arrival date and time");
        await pickDateTime(page, arrivalTrigger, "2026-10-01T14:00");

        // Enter arrival location
        await page.locator("#arrival-location").fill("PDX Airport");

        await snap(page, "21-wizard-arrival-filled");

        // Click "Next" to advance to departure step
        await dialog.getByRole("button", { name: "Next" }).click();

        // Wait for departure step to appear
        await expect(dialog.getByText("When are you leaving?")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
        await expect.soft(dialog.getByText("Step 3 of 5")).toBeVisible();
      });

      await test.step("verify departure pre-fill and fill departure step", async () => {
        const dialog = page.getByRole("dialog");

        // Verify departure location is pre-filled from arrival
        await expect(page.locator("#departure-location")).toHaveValue(
          "PDX Airport",
        );

        // Pick departure date and time
        const departureTrigger = page.getByLabel("Departure date and time");
        await pickDateTime(page, departureTrigger, "2026-10-05T10:00");

        await snap(page, "22-wizard-departure-filled");

        // Click "Next" to advance to events step
        await dialog.getByRole("button", { name: "Next" }).click();

        // Wait for events step to appear
        await expect(
          dialog.getByText("Want to suggest any activities?"),
        ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
        await expect.soft(dialog.getByText("Step 4 of 5")).toBeVisible();
      });

      await test.step("add an event and advance", async () => {
        const dialog = page.getByRole("dialog");

        // Fill event name
        await page.locator("#event-name").fill("Hiking Mt. Hood");

        // Pick event date and time
        const eventTrigger = page.getByLabel("Event date and time");
        await pickDateTime(page, eventTrigger, "2026-10-02T09:00");

        // Click "Add" to save the event
        await dialog.getByRole("button", { name: "Add" }).click();

        // Verify the event chip appears
        await expect(dialog.getByText("Hiking Mt. Hood")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });

        await snap(page, "23-wizard-event-added");

        // Click "Next" to advance to done step
        await dialog.getByRole("button", { name: "Next" }).click();

        // Wait for done step to appear
        await expect(dialog.getByText("You're all set!")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
        await expect.soft(dialog.getByText("Step 5 of 5")).toBeVisible();
      });

      await test.step("verify done step summary and close wizard", async () => {
        const dialog = page.getByRole("dialog");

        // Verify summary shows arrival info
        await expect(dialog.getByText("Arrival")).toBeVisible();

        // Verify summary shows departure info
        await expect(dialog.getByText("Departure")).toBeVisible();

        // Verify summary shows activities count
        await expect(dialog.getByText("1 activity added")).toBeVisible();

        await snap(page, "24-wizard-done-summary");

        // Click "View Itinerary" to close the wizard
        await dialog.getByRole("button", { name: "View Itinerary" }).click();

        // Wizard should close
        await expect(dialog).not.toBeVisible({ timeout: DIALOG_TIMEOUT });
      });

      await test.step("full trip view is shown after wizard", async () => {
        // Verify full trip view is displayed
        await expect(page.getByText("Portland, OR")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
        await expect(page.getByText(/\d+ members?/)).toBeVisible();

        // Preview should not be visible
        await expect(page.getByText("You've been invited!")).not.toBeVisible();

        await snap(page, "25-wizard-complete-full-view");
      });
    },
  );
});
