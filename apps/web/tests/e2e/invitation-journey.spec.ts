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
} from "./helpers/invitations";
import {
  NAVIGATION_TIMEOUT,
  ELEMENT_TIMEOUT,
  TOAST_TIMEOUT,
  DIALOG_TIMEOUT,
} from "./helpers/timeouts";

/**
 * E2E Journey: Invitation RSVP
 *
 * RSVP critical flow: invite → preview → RSVP Going → full trip view.
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

      await test.step("organizer invites member via API", async () => {
        await inviteViaAPI(request, tripId, organizerCookie, [inviteePhone]);

        // Navigate to trip for visual snapshot
        await authenticateViaAPIWithPhone(
          page,
          request,
          organizerPhone,
          "Organizer Alpha",
        );

        await page.goto(`/trips?id=${tripId}`);
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: `Invite Trip ${timestamp}`,
          }),
        ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });

        await snap(page, "09-trip-detail-invite-button");
      });

      await test.step("invited member sees trip preview", async () => {
        await page.context().clearCookies();
        await authenticateViaAPIWithPhone(
          page,
          request,
          inviteePhone,
          "Invited Member",
        );

        await page.goto(`/trips?id=${tripId}`);

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
        await expect(page.getByText("Honolulu, HI").first()).toBeVisible();
        await expect(page.getByText(/\d+ going/).first()).toBeVisible();
        await snap(page, "14-rsvp-going-full-view");
      });
    },
  );
});

/**
 * E2E Journey: Invite Deep Link
 *
 * Tests the SMS deep link invite flow: /invite?id=:invitationId
 * - Unauthenticated user sees preview, completes login, lands on trip
 * - Authenticated user auto-accepts and redirects to trip
 * - Re-click on accepted invitation redirects to trip
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
        await page.goto(`/invite?id=${invitationId}`);

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
        // Should redirect to /trips?id={tripId} (not /trips)
        await page.waitForURL(`**/trips?id=${tripId}`, {
          timeout: NAVIGATION_TIMEOUT,
        });
        expect(page.url()).toContain(`/trips?id=${tripId}`);

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
        await page.goto(`/invite?id=${invitationId}`);

        // Should redirect to /trips?id={tripId}
        await page.waitForURL(`**/trips?id=${tripId}`, {
          timeout: NAVIGATION_TIMEOUT,
        });
        expect(page.url()).toContain(`/trips?id=${tripId}`);

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
        await page.goto(`/invite?id=${invitationId}`);

        // Should redirect to /trips?id={tripId} (not show "no longer available")
        await page.waitForURL(`**/trips?id=${tripId}`, {
          timeout: NAVIGATION_TIMEOUT,
        });
        expect(page.url()).toContain(`/trips?id=${tripId}`);

        await snap(page, "33-invite-deep-link-reclick-redirect");
      });
    },
  );

});
