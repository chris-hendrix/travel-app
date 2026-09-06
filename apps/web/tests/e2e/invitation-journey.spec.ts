import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import {
  authenticateViaAPIWithPhone,
  authenticateUserViaBrowserWithPhone,
  createUserViaAPI,
  generateUniquePhone,
} from "./helpers/auth";
import { removeNextjsDevOverlay, dismissPwaPrompts } from "./helpers/nextjs-dev";
import { fillPhoneInput } from "./helpers/phone-input";
import { snap } from "./helpers/screenshots";
import {
  createTripViaAPI,
  inviteViaAPI,
  rsvpViaAPI,
} from "./helpers/invitations";
import { API_BASE } from "./helpers/timeouts";
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

/**
 * E2E Journey: Guest Claim via Signup (Phase 8, Task 8.1)
 *
 * E2E justification (apps/web/tests/e2e/AGENTS.md): critical flow #3
 * (Invitation + RSVP + deep-link), guest-claim variant. This is the only seam
 * that spans UI → invite pipeline → signup → in-place claim, unverifiable
 * below E2E (service tests cover claim logic, RTL covers the Sheet, neither
 * covers the signup handoff).
 *
 * Flow: organizer adds a guest with guestPhone via the invite Sheet (mockup
 * §1) and taps Send invite; a travel row + expense row are seeded for the
 * guest; a new user signs up with that phone (fixed code 123456); the guest
 * row is claimed in place — ONE member row with the profile name, travel and
 * expense rows survived under the same member id.
 */
test.describe("Guest Claim via Signup", () => {
  test.beforeEach(async ({ page }) => {
    await removeNextjsDevOverlay(page);
    await dismissPwaPrompts(page);
    await page.context().clearCookies();
  });

  test(
    "guest added in invite sheet is claimed in place when their phone signs up",
    { tag: "@regression" },
    async ({ page, request }) => {
      test.slow();

      const organizerPhone = generateUniquePhone();
      const guestPhone = generateUniquePhone();
      const guestName = "Guest Claimer";
      const profileName = "Claimed Guest";
      const tripName = `Guest Claim Trip ${Date.now()}`;

      const organizerCookie = await createUserViaAPI(
        request,
        organizerPhone,
        "Organizer GuestClaim",
      );
      const tripId = await createTripViaAPI(request, organizerCookie, {
        name: tripName,
        destination: "Lisbon, Portugal",
        startDate: "2026-10-01",
        endDate: "2026-10-07",
      });

      // PR-evidence screenshots (Task 7.6): raw page.screenshot() PNGs into
      // repo-root .playwright-cli/ with <nn>-<surface>.png naming. Written
      // unconditionally (unlike the snap() helper, which is a CI no-op).
      const shot = async (name: string) => {
        const dir = path.join(__dirname, "../../../../.playwright-cli");
        fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({
          path: path.join(dir, `${name}.png`),
          fullPage: true,
        });
      };
      const apiHeaders = { cookie: organizerCookie };

      await test.step("organizer adds guest with phone via invite sheet", async () => {
        await authenticateViaAPIWithPhone(
          page,
          request,
          organizerPhone,
          "Organizer GuestClaim",
        );

        await page.goto(`/trips?id=${tripId}`);
        await expect(
          page.getByRole("heading", { level: 1, name: tripName }),
        ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });

        await page.getByRole("button", { name: /invite/i }).first().click();
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByText("Invite members")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
        await expect(dialog.getByTestId("guest-section")).toBeVisible();

        await dialog.getByLabel("Guest name").fill(guestName);
        await fillPhoneInput(
          dialog.getByPlaceholder("Phone (optional)"),
          guestPhone,
        );
        await dialog.getByRole("button", { name: "Add guest" }).click();
        await expect(
          dialog.getByTestId("guest-chips").getByText(guestName),
        ).toBeVisible({ timeout: ELEMENT_TIMEOUT });

        // §1 evidence: invite Sheet with guest section + chips
        await shot("01-invite-sheet-guest");

        await dialog
          .getByRole("button", { name: "Send invitations" })
          .click();
        await expect(page.getByText(/guest added/i)).toBeVisible({
          timeout: TOAST_TIMEOUT,
        });
        await expect(dialog).not.toBeVisible({ timeout: DIALOG_TIMEOUT });
      });

      let guestMemberId: string;
      let organizerMemberId: string;

      await test.step("guest row renders; seed guest travel + expense via API", async () => {
        // Members live in the Members Sheet (opened via the "N going"
        // summary); guests default to no_response → Invited tab for organizer.
        await page.getByText(/\d+ going/).first().click();
        const membersSheet = page.getByRole("dialog");
        await expect(
          membersSheet.getByRole("tab", { name: /^invited/i }),
        ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
        await membersSheet.getByRole("tab", { name: /^invited/i }).click();
        await expect(membersSheet.getByText(guestName).first()).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
        await expect(
          membersSheet.getByText("Guest", { exact: true }).first(),
        ).toBeVisible();

        // §3 evidence: members list with guest row
        await shot("02-members-list-guest");

        const membersRes = await request.get(
          `${API_BASE}/trips/${tripId}/members`,
          { headers: apiHeaders },
        );
        expect(membersRes.ok()).toBe(true);
        const membersJson = (await membersRes.json()) as {
          members: Array<{ id: string; userId: string | null }>;
        };
        const guest = membersJson.members.find((m) => m.userId === null);
        const organizer = membersJson.members.find((m) => m.userId !== null);
        expect(guest).toBeDefined();
        expect(organizer).toBeDefined();
        guestMemberId = guest!.id;
        organizerMemberId = organizer!.id;

        const travelRes = await request.post(
          `${API_BASE}/trips/${tripId}/member-travel`,
          {
            data: {
              travelType: "arrival",
              time: "2026-10-01T15:00:00.000Z",
              location: "LIS",
              memberId: guestMemberId,
            },
            headers: apiHeaders,
          },
        );
        expect(travelRes.ok()).toBe(true);

        const paymentRes = await request.post(
          `${API_BASE}/trips/${tripId}/payments`,
          {
            data: {
              description: "Guest dinner",
              amount: 10000,
              payerMemberId: organizerMemberId,
              participants: [
                { memberId: organizerMemberId },
                { memberId: guestMemberId },
              ],
            },
            headers: apiHeaders,
          },
        );
        expect(paymentRes.ok()).toBe(true);
      });

      await test.step("signup with guest phone claims the row in place", async () => {
        await page.context().clearCookies();
        await authenticateUserViaBrowserWithPhone(
          page,
          guestPhone,
          profileName,
        );

        // RSVP Going so the claimed member surfaces on the Going tab.
        const browserCookies = await page.context().cookies();
        const token =
          browserCookies.find((c) => c.name === "auth_token")?.value ?? "";
        expect(token.length).toBeGreaterThan(0);
        await rsvpViaAPI(request, tripId, `auth_token=${token}`, "going");

        await page.goto(`/trips?id=${tripId}`);
        await expect(
          page.getByRole("heading", { level: 1, name: tripName }),
        ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
        // Claimed member is now Going → visible on the Going tab.
        await page.getByText(/\d+ going/).first().click();
        const claimedSheet = page.getByRole("dialog");
        await expect(claimedSheet.getByText(profileName).first()).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
        await expect(
          claimedSheet.getByText(guestName, { exact: true }),
        ).not.toBeVisible();

        // §2e evidence: claimed state after signup (profile name)
        await shot("03-guest-claimed-state");

        // API: no duplicate row — exactly one member row carries the profile
        // name, under the SAME member id; no guest rows remain.
        const afterRes = await request.get(
          `${API_BASE}/trips/${tripId}/members`,
          { headers: apiHeaders },
        );
        expect(afterRes.ok()).toBe(true);
        const afterJson = (await afterRes.json()) as {
          members: Array<{
            id: string;
            userId: string | null;
            displayName: string;
          }>;
        };
        expect(afterJson.members).toHaveLength(2);
        expect(
          afterJson.members.filter((m) => m.userId === null),
        ).toHaveLength(0);
        const claimed = afterJson.members.find(
          (m) => m.displayName === profileName,
        );
        expect(claimed).toBeDefined();
        expect(claimed!.id).toBe(guestMemberId);

        // Travel + expense rows survived under the same member id.
        const travelAfter = await request.get(
          `${API_BASE}/trips/${tripId}/member-travel`,
          { headers: apiHeaders },
        );
        expect(travelAfter.ok()).toBe(true);
        const travelJson = (await travelAfter.json()) as {
          memberTravels: Array<{ memberId: string }>;
        };
        expect(
          travelJson.memberTravels.some((t) => t.memberId === guestMemberId),
        ).toBe(true);

        const paymentsAfter = await request.get(
          `${API_BASE}/trips/${tripId}/payments`,
          { headers: apiHeaders },
        );
        expect(paymentsAfter.ok()).toBe(true);
        const paymentsJson = (await paymentsAfter.json()) as {
          payments: Array<{
            description: string;
            participants: Array<{ memberId: string }>;
          }>;
        };
        const dinner = paymentsJson.payments.find(
          (p) => p.description === "Guest dinner",
        );
        expect(dinner).toBeDefined();
        expect(
          dinner!.participants.some((pt) => pt.memberId === guestMemberId),
        ).toBe(true);
      });
    },
  );
});
