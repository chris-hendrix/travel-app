import { test, expect } from "@playwright/test";
import {
  authenticateViaAPIWithPhone,
  createUserViaAPI,
} from "./helpers/auth";
import { removeNextjsDevOverlay, dismissPwaPrompts } from "./helpers/nextjs-dev";
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
  RETRY_INTERVAL,
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
    await dismissPwaPrompts(page);
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

        // Verify toast with "invitation sent" text appears
        await expect(page.getByText(/invitation.*sent/i)).toBeVisible({
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
        await expect(
          page.locator("#main-content").getByText("You've been invited!"),
        ).toBeVisible({
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
        await expect(
          page.locator("#main-content").getByText("You've been invited!"),
        ).not.toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });

        // Full trip view should show destination and member summary
        await expect(page.getByText("Honolulu, HI")).toBeVisible();
        await expect(page.getByText(/\d+ going/).first()).toBeVisible();
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
        await expect(page.getByText(eventName)).toBeVisible({
          timeout: NAVIGATION_TIMEOUT,
        });
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
        await expect(
          page.locator("#main-content").getByText("You've been invited!"),
        ).toBeVisible({
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

        // Badge is in the detail sheet — click event card to open it
        await page.getByText(eventName).click();
        await expect(page.getByText("Member no longer attending")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
        await snap(page, "16-member-not-attending-indicator");
        await page.keyboard.press("Escape");
      });

      await test.step("organizer changes own RSVP via pills", async () => {
        // The organizer is already on the trip detail page from the previous step.
        // Click the "Maybe" RSVP pill to change status (pills are direct-action buttons)
        const maybePill = page.getByRole("button", { name: "Maybe", exact: true });
        await maybePill.waitFor({
          state: "visible",
          timeout: ELEMENT_TIMEOUT,
        });
        await maybePill.click();

        // Verify toast confirms the change
        await expect(page.getByText('RSVP updated to "Maybe"')).toBeVisible({
          timeout: TOAST_TIMEOUT,
        });
        await dismissToast(page);

        // Change back to "Going" via pill
        const goingPill = page.getByRole("button", { name: "Going", exact: true });
        await goingPill.click();

        await expect(page.getByText('RSVP updated to "Going"')).toBeVisible({
          timeout: TOAST_TIMEOUT,
        });
        await dismissToast(page);

        await snap(page, "16b-organizer-rsvp-pills");
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

        // Badge should be gone — open detail sheet to verify
        await page.getByText(eventName).click();
        await expect(
          page.getByText("Member no longer attending"),
        ).not.toBeVisible();
        await page.keyboard.press("Escape");
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

      // Click member summary button to open members sheet
      // Retry click — on cold CI the first click can be swallowed during React hydration
      const memberCountBtn = page
        .getByRole("button")
        .filter({ hasText: /\d+ going/ });
      await memberCountBtn.waitFor({
        state: "visible",
        timeout: ELEMENT_TIMEOUT,
      });
      const dialog = page.getByRole("dialog");
      await expect(async () => {
        await memberCountBtn.click();
        await expect(
          dialog.getByRole("heading", { name: "Members" }),
        ).toBeVisible({ timeout: RETRY_INTERVAL });
      }).toPass({ timeout: ELEMENT_TIMEOUT });

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
        await expect(
          page.locator("#main-content").getByText("You've been invited!"),
        ).toBeVisible({
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
        await expect(page.getByText(/\d+ going/).first()).toBeVisible();

        // Preview should not be visible
        await expect(
          page.locator("#main-content").getByText("You've been invited!"),
        ).not.toBeVisible();

        await snap(page, "25-wizard-complete-full-view");
      });
    },
  );
});

/**
 * E2E Journey: Invite Deep Link
 *
 * Tests the SMS deep link invite flow: /invite/:invitationId
 * - Unauthenticated user sees preview, completes login, lands on trip
 * - Authenticated user auto-accepts and redirects to trip
 * - Re-click on accepted invitation redirects to trip
 * - Invalid invitation shows fallback
 */
test.describe("Invite Deep Link Journey", () => {
  test.beforeEach(async ({ page }) => {
    await removeNextjsDevOverlay(page);
    await dismissPwaPrompts(page);
    await page.context().clearCookies();
  });

  test(
    "unauthenticated user completes invite deep link flow",
    { tag: "@smoke" },
    async ({ page, request }) => {
      test.slow();

      const timestamp = Date.now();
      const shortTimestamp = timestamp.toString().slice(-10);
      const organizerPhone = `+1555${shortTimestamp}`;
      const inviteePhone = `+1555${(parseInt(shortTimestamp) + 7000).toString()}`;
      const tripName = `Deep Link Trip ${timestamp}`;

      // Setup: create organizer, trip, and invitation via API
      const organizerCookie = await createUserViaAPI(
        request,
        organizerPhone,
        "Organizer DeepLink",
      );

      const tripId = await createTripViaAPI(request, organizerCookie, {
        name: tripName,
        destination: "Barcelona, Spain",
        startDate: "2026-09-01",
        endDate: "2026-09-10",
      });

      const inviteResult = await inviteViaAPI(
        request,
        tripId,
        organizerCookie,
        [inviteePhone],
      );
      const invitationId = (inviteResult.invitations[0] as { id: string }).id;

      await test.step("preview card shows trip info", async () => {
        await page.goto(`/invite/${invitationId}`);

        // Assert preview card content
        await expect(
          page.getByRole("heading", { name: "You're invited!" }),
        ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
        await expect(page.getByText(tripName)).toBeVisible();
        await expect(page.getByText("Barcelona, Spain")).toBeVisible();
        await expect(page.getByText("Organizer DeepLink")).toBeVisible();

        await snap(page, "30-invite-deep-link-preview");
      });

      await test.step("Join Trip navigates to login with redirect", async () => {
        await page.getByRole("link", { name: "Join Trip" }).click();

        await page.waitForURL("**/login**", {
          timeout: NAVIGATION_TIMEOUT,
        });
        expect(page.url()).toContain("/login");
        expect(page.url()).toContain("redirect=");
        expect(page.url()).toContain("phone=");
      });

      await test.step("complete login and verify flow", async () => {
        // Phone is pre-filled with a masked value from the invite preview.
        // Clear and type the real phone number for the test bypass to work.
        const phoneInput = page.locator('input[type="tel"]');
        await fillPhoneInput(phoneInput, inviteePhone);

        const smsConsent = page.getByRole("checkbox", {
          name: /I agree to receive text messages/i,
        });
        await smsConsent.check();
        await page.getByRole("button", { name: "Continue" }).click();

        // Verify page
        await page.waitForURL("**/verify**", {
          timeout: NAVIGATION_TIMEOUT,
        });
        expect(page.url()).toContain("redirect=");

        const codeInput = page.getByRole("textbox", {
          name: /verification code/i,
        });
        await codeInput.fill("123456");
        await page.getByRole("button", { name: "Verify" }).click();

        // New user → complete-profile page (redirect param forwarded)
        await page.waitForURL("**/complete-profile**", {
          timeout: NAVIGATION_TIMEOUT,
        });
        expect(page.url()).toContain("redirect=");

        const displayNameInput = page.getByRole("textbox", {
          name: /display name/i,
        });
        await displayNameInput.fill("Invitee DeepLink");
        await page.getByRole("button", { name: "Complete profile" }).click();
      });

      await test.step("lands on trip page as member", async () => {
        // Should redirect to /trips/:tripId (not /trips)
        await page.waitForURL(`**/trips/${tripId}`, {
          timeout: NAVIGATION_TIMEOUT,
        });
        expect(page.url()).toContain(`/trips/${tripId}`);

        // Trip name should be visible on the trip page
        await expect(
          page.getByRole("heading", { level: 1, name: tripName }),
        ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });

        await snap(page, "31-invite-deep-link-landed-on-trip");
      });
    },
  );

  test(
    "authenticated user clicking invite link joins trip",
    { tag: "@smoke" },
    async ({ page, request }) => {
      const timestamp = Date.now();
      const shortTimestamp = timestamp.toString().slice(-10);
      const organizerPhone = `+1555${shortTimestamp}`;
      const inviteePhone = `+1555${(parseInt(shortTimestamp) + 8000).toString()}`;
      const tripName = `Auth Invite Trip ${timestamp}`;

      // Setup: create organizer and trip
      const organizerCookie = await createUserViaAPI(
        request,
        organizerPhone,
        "Organizer AuthInvite",
      );

      const tripId = await createTripViaAPI(request, organizerCookie, {
        name: tripName,
        destination: "Tokyo, Japan",
        startDate: "2026-08-15",
        endDate: "2026-08-25",
      });

      // Authenticate the invitee BEFORE creating the invitation.
      // This ensures the invitation stays "pending" (verify-code's
      // processPendingInvitations won't find it).
      await authenticateViaAPIWithPhone(
        page,
        request,
        inviteePhone,
        "Invitee AuthInvite",
      );

      // Now create the invitation (invitee already exists + has auth cookie)
      const inviteResult = await inviteViaAPI(
        request,
        tripId,
        organizerCookie,
        [inviteePhone],
      );
      const invitationId = (inviteResult.invitations[0] as { id: string }).id;

      await test.step("invite link auto-accepts and redirects to trip", async () => {
        await page.goto(`/invite/${invitationId}`);

        // Should redirect to /trips/:tripId
        await page.waitForURL(`**/trips/${tripId}`, {
          timeout: NAVIGATION_TIMEOUT,
        });
        expect(page.url()).toContain(`/trips/${tripId}`);

        // Trip name should be visible
        await expect(
          page.getByRole("heading", { level: 1, name: tripName }),
        ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });

        await snap(page, "32-invite-deep-link-auth-redirect");
      });
    },
  );

  test(
    "re-click on accepted invitation redirects to trip",
    { tag: "@regression" },
    async ({ page, request }) => {
      const timestamp = Date.now();
      const shortTimestamp = timestamp.toString().slice(-10);
      const organizerPhone = `+1555${shortTimestamp}`;
      const inviteePhone = `+1555${(parseInt(shortTimestamp) + 9000).toString()}`;

      // Setup: create organizer and trip
      const organizerCookie = await createUserViaAPI(
        request,
        organizerPhone,
        "Organizer ReClick",
      );

      const tripId = await createTripViaAPI(request, organizerCookie, {
        name: `ReClick Trip ${timestamp}`,
        destination: "Sydney, Australia",
      });

      // Create invitation and capture the ID
      const inviteResult = await inviteViaAPI(
        request,
        tripId,
        organizerCookie,
        [inviteePhone],
      );
      const invitationId = (inviteResult.invitations[0] as { id: string }).id;

      // Accept the invitation: authenticate invitee (triggers processPendingInvitations)
      // then RSVP as going
      const inviteeCookie = await createUserViaAPI(
        request,
        inviteePhone,
        "Invitee ReClick",
      );
      await rsvpViaAPI(request, tripId, inviteeCookie, "going");

      // Set auth cookie for the invitee in the browser
      const token = inviteeCookie.match(/auth_token=([^;]+)/)?.[1] || "";
      await page.context().addCookies([
        {
          name: "auth_token",
          value: token,
          domain: "localhost",
          path: "/",
          httpOnly: true,
        },
      ]);

      await test.step("re-clicking accepted invite redirects to trip", async () => {
        await page.goto(`/invite/${invitationId}`);

        // Should redirect to /trips/:tripId (not show "no longer available")
        await page.waitForURL(`**/trips/${tripId}`, {
          timeout: NAVIGATION_TIMEOUT,
        });
        expect(page.url()).toContain(`/trips/${tripId}`);

        await snap(page, "33-invite-deep-link-reclick-redirect");
      });
    },
  );

  test(
    "invalid invitation shows fallback",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/invite/00000000-0000-0000-0000-000000000000");

      await expect(
        page.getByRole("heading", { name: "Invitation unavailable" }),
      ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });

      await expect(
        page.getByText("This invitation is no longer available"),
      ).toBeVisible();

      await snap(page, "34-invite-deep-link-invalid");
    },
  );
});
