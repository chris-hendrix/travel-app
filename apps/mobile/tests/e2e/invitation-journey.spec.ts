/**
 * E2E Journey: Invitation + RSVP + deep link (mobile) — Phase 5, Task 5.
 *
 * Three flows, one scenario shape: an organizer seeds a trip through
 * the API (`POST /api/trips`), invites a second number through the
 * real batch endpoint (`POST /api/trips/:tripId/invitations` with
 * `{phoneNumbers: [phone], userIds: []}` — the exact batch shape Task 2
 * verified), and reads the invitation id straight out of the create
 * response (`{success, invitations: [{id, ...}], ...}` — see
 * `apps/api/src/controllers/invitation.controller.ts:57-64`, which
 * replies 201 with the service's created rows). No list fallback is
 * needed: the create response carries the ids.
 *
 * The deep link is `/invite?id=...` — the param name comes from
 * `useLocalSearchParams<{ id }>()` in `app/invite.tsx`, not a guess.
 *
 * RSVP drives the REAL `RsvpControl` in `trips/detail.tsx` (Task 3
 * wired it): the `Segmented` radios `Going` / `Maybe` / `Not going`
 * (`RSVP_LABEL` in `lib/rsvp.ts`), asserted via the radio selected
 * state AND reload persistence (server round-trip, not cache).
 *
 * Selectors are `getByRole`/`getByText` only; every selector names the
 * screen file and line-shape it matches in a comment.
 *
 * TODO (parked, apps/mobile/docs/PRD.md:45): guest members stay
 * deferred, so there is no guest-claim spec here — add one (invite a
 * guest link, claim it without a full account) once guests exist.
 */

import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  AUTH_TOKEN_KEY,
  FIXED_CODE,
  generateUniquePhone,
  seedUserViaAPI,
} from "./helpers/auth";
import { API_BASE } from "./helpers/timeouts";
import {
  ELEMENT_TIMEOUT,
  NAVIGATION_TIMEOUT,
  SLOW_NAVIGATION_TIMEOUT,
} from "./helpers/timeouts";

function isoIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Seed a trip through the real create endpoint. Returns the trip id. */
async function seedTripViaAPI(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<string> {
  // POST /api/trips — body mirrors createTripSchema
  // (shared/schemas/trip.ts): name, destination, timezone required.
  // Response is CreateTripResponse: {success, trip: {id, ...}} (the
  // shape lib/queries/trips.ts:createTrip reads as body.trip).
  const res = await request.post(`${API_BASE}/trips`, {
    data: {
      name,
      destination: "Mallorca, Spain",
      timezone: "America/Chicago",
      startDate: isoIn(30),
      endDate: isoIn(35),
    },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`create-trip failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { trip: { id: string } };
  return body.trip.id;
}

/**
 * Invite one number through the real batch endpoint. Returns the
 * invitation id from the create response's `invitations` array.
 */
async function seedInviteViaAPI(
  request: APIRequestContext,
  organizerToken: string,
  tripId: string,
  guestPhone: string,
): Promise<string> {
  // POST /api/trips/:tripId/invitations — the batch shape
  // {phoneNumbers, userIds} (lib/queries/invitations.ts:invite).
  const res = await request.post(`${API_BASE}/trips/${tripId}/invitations`, {
    data: { phoneNumbers: [guestPhone], userIds: [] },
    headers: { Authorization: `Bearer ${organizerToken}` },
  });
  if (!res.ok()) {
    throw new Error(
      `create-invitations failed: ${res.status()} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { invitations: Array<{ id: string }> };
  const first = body.invitations[0];
  if (!first) {
    throw new Error("create-invitations returned no invitations");
  }
  return first.id;
}

/**
 * Arm `page.addInitScript` to write a known token into `localStorage`
 * before the app boots (the `authenticateViaAPI` mechanic, but for a
 * token seeded under a caller-chosen phone rather than a generated one).
 */
async function seedPageWithToken(
  page: Page,
  token: string,
): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, value);
        }
      } catch {
        // Private-mode storage failure: the app treats a missing token
        // as signed-out, so the spec fails at its guard assertion
        // rather than here.
      }
    },
    { key: AUTH_TOKEN_KEY, value: token },
  );
}

test.describe("Invitation Journey", () => {
  test("RSVP accept then decline persists across reload", async ({
    page,
    request,
  }) => {
    const tripName = `E2E Invite ${Date.now()}`;
    const orgPhone = generateUniquePhone();
    const guestPhone = generateUniquePhone();
    let tripId: string;
    let orgToken: string;

    await test.step("organizer seeds a trip and invites the guest", async () => {
      ({ token: orgToken } = await seedUserViaAPI(
        request,
        orgPhone,
        "Invite Host",
      ));
      tripId = await seedTripViaAPI(request, orgToken, tripName);
      await seedInviteViaAPI(request, orgToken, tripId, guestPhone);
    });

    await test.step("guest signs in (pending invitation becomes membership)", async () => {
      // Acceptance happens server-side at verify
      // (processPendingInvitations — app/invite.tsx header comment), so
      // by the time the guest can see the trip screen they are already
      // on the trip; there is no Accept button to press.
      const { token: guestToken } = await seedUserViaAPI(
        request,
        guestPhone,
        "Invite Guest",
      );
      await seedPageWithToken(page, guestToken);
      await page.goto(`/trips/detail?id=${tripId}`);
      // app/trips/detail.tsx: the header renders the trip title as
      // display text (same shape the trip spec asserts with .last()).
      await expect(page.getByText(tripName).last()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
    });

    await test.step("accept: tap Going, control shows it selected", async () => {
      // components/trip/RsvpControl.tsx via
      // components/ui/Segmented.tsx: role="radio" cells named by
      // RSVP_LABEL (lib/rsvp.ts) — "Going", "Maybe", "Not going" —
      // with aria-selected on the chosen one. The screen defaults to
      // the traveler variant, which renders the control. exact:true
      // is load-bearing: role-name matching is substring by default,
      // so "Going" also matches "Not going" without it.
      // Playwright's `selected` only supports option/tab/grid roles,
      // never radio — so the selector stays getByRole and the selected
      // state is asserted as the aria-selected attribute Segmented.tsx
      // sets (role="radio" aria-selected={chosen}).
      const going = page.getByRole("radio", { name: "Going", exact: true });
      await going.click();
      await expect(going).toHaveAttribute("aria-selected", "true", {
        timeout: ELEMENT_TIMEOUT,
      });
    });

    await test.step("reload: the accept persisted server-side", async () => {
      await page.reload();
      await expect(page.getByText(tripName).last()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(
        page.getByRole("radio", { name: "Going", exact: true }),
      ).toHaveAttribute("aria-selected", "true", {
        timeout: ELEMENT_TIMEOUT,
      });
    });

    await test.step("decline: tap Not going, the roster records it", async () => {
      // Why the roster, not the control's selected state: a declined
      // member is filtered out of the roster a traveler sees — the API
      // returns only going/maybe rows to non-organizers by default
      // (invitation.service.ts:getTripMembers, the showAllMembers-off
      // branch) — so the guest's own row vanishes, `viewerOf`
      // (lib/members.ts, the account-matched viewer) falls back to
      // null, and the
      // control renders its no_response empty state. The decline POST
      // still succeeds (verified 200 + status not_going during
      // development); the traveler control just cannot display it.
      // The organizer sees every row, so the organizer-side roster is
      // where the decline is asserted.
      await page
        .getByRole("radio", { name: "Not going", exact: true })
        .click();
      // GET /trips/:tripId/members as the organizer (full roster).
      // Poll: the tap fires the mutation, the write lands, then the
      // row reads not_going. Scoped to this trip, so the fixed
      // "Invite Guest" display name is unambiguous.
      await expect
        .poll(
          async () => {
            const res = await request.get(
              `${API_BASE}/trips/${tripId}/members`,
              { headers: { Authorization: `Bearer ${orgToken}` } },
            );
            if (!res.ok()) return null;
            const body = (await res.json()) as {
              members: Array<{ displayName: string; status: string }>;
            };
            return (
              body.members.find((m) => m.displayName === "Invite Guest")
                ?.status ?? null
            );
          },
          { timeout: ELEMENT_TIMEOUT },
        )
        .toBe("not_going");
    });

    await test.step("reload: the decline persisted server-side", async () => {
      await page.reload();
      await expect(page.getByText(tripName).last()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      // The control clears: the declined self-row is absent from the
      // traveler roster (see above), so nothing is selected — Going is
      // explicitly not selected anymore, which is the user-observable
      // half of the decline next to the roster assertion.
      await expect(
        page.getByRole("radio", { name: "Going", exact: true }),
      ).toHaveAttribute("aria-selected", "false", {
        timeout: ELEMENT_TIMEOUT,
      });
    });
  });

  test("logged-out deep link → sign in through the UI → lands in the trip", async ({
    page,
    request,
  }) => {
    const tripName = `E2E Deep Link ${Date.now()}`;
    const guestPhone = generateUniquePhone();
    let inviteId: string;
    let tripId: string;

    await test.step("organizer seeds a trip and invites the guest", async () => {
      const { token: orgToken } = await seedUserViaAPI(
        request,
        generateUniquePhone(),
        "Invite Host",
      );
      tripId = await seedTripViaAPI(request, orgToken, tripName);
      inviteId = await seedInviteViaAPI(request, orgToken, tripId, guestPhone);
    });

    await test.step("signed-out card shows the invite with a sign-in call", async () => {
      await page.goto(`/invite?id=${inviteId}`);
      // components/trip/InviteCard.tsx: "{inviterName} invited you."
      // plus the trip name in the display face; app/invite.tsx titles
      // the signed-out button "Sign in to join".
      await expect(page.getByText("Invite Host invited you.")).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(page.getByText(tripName)).toBeVisible();
      await page.getByRole("button", { name: "Sign in to join" }).click();
      await page.waitForURL("**/login", { timeout: NAVIGATION_TIMEOUT });
    });

    await test.step("sign in as the invited number through the UI", async () => {
      // app/login.tsx: heading "Get started" (the auth spec's flow —
      // pressSequentially, not fill: fill() desynchronizes the
      // controlled RN input and leaves Continue disabled).
      await expect(page.getByText("Get started")).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
      const phoneInput = page.getByRole("textbox", { name: "Phone number" });
      await phoneInput.click();
      await phoneInput.pressSequentially(guestPhone);
      // components/ui/Checkbox.tsx: role="checkbox", the consent row
      // is the only checkbox on app/login.tsx.
      await page.getByRole("checkbox").click();
      await page.getByRole("button", { name: "Continue" }).click();
      // app/verify.tsx: heading "Verify your number"; the fixed dev
      // code submits at length 6.
      await page.waitForURL("**/verify", {
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
      await expect(page.getByText("Verify your number")).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
      await page.getByRole("textbox", { name: "Code" }).fill(FIXED_CODE);
      // A brand-new invited number requires a profile, so verify lands
      // on complete-profile (app/verify.tsx branches on the server's
      // requiresProfile).
      await page.waitForURL("**/complete-profile", {
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
      // app/complete-profile.tsx: heading "Complete your profile",
      // TextField "Display name", Button "Continue".
      await page
        .getByRole("textbox", { name: "Display name" })
        .fill("Invite Guest");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForURL("**/trips", {
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
    });

    await test.step("the invited trip is in the trips list", async () => {
      // The invite screen's own contract (app/invite.tsx header): the
      // flow ends in the trips list, with the trip in it — nothing
      // about the invitation has to survive sign-in because acceptance
      // already happened server-side at verify.
      // .last(): the list renders the trip name twice — the app
      // header echoes the title in a hidden element (the failure
      // screenshot shows the first match as a hidden text-5xl div),
      // the same echo the trip spec's detail step dodges with .last().
      await expect(page.getByText(tripName).last()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
    });

    await test.step("the trip detail opens for the new member", async () => {
      await page.goto(`/trips/detail?id=${tripId}`);
      await expect(page.getByText(tripName).last()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      // components/trip/Itinerary.tsx: the section head labels the
      // block "Itinerary", proving the sections rendered.
      await expect(page.getByText("Itinerary")).toBeVisible();
    });
  });

  test("already-signed-in deep link shows the trip card", async ({
    page,
    request,
  }) => {
    const tripName = `E2E Signed Link ${Date.now()}`;
    const guestPhone = generateUniquePhone();
    let inviteId: string;
    let tripId: string;

    await test.step("organizer seeds a trip and invites the guest", async () => {
      // Two invitations go out: one for the guest's own number (signing
      // in consumes it — the preview endpoint answers `{status:
      // "accepted"}` for a consumed row, which the screen renders as
      // the gone state, "someone has already used it"), and one for a
      // number that never signs in, which stays pending so the
      // signed-in card has something to show.
      const { token: orgToken } = await seedUserViaAPI(
        request,
        generateUniquePhone(),
        "Invite Host",
      );
      tripId = await seedTripViaAPI(request, orgToken, tripName);
      await seedInviteViaAPI(request, orgToken, tripId, guestPhone);
      inviteId = await seedInviteViaAPI(
        request,
        orgToken,
        tripId,
        generateUniquePhone(),
      );
    });

    await test.step("guest session is seeded, then the link is opened", async () => {
      const { token: guestToken } = await seedUserViaAPI(
        request,
        guestPhone,
        "Invite Guest",
      );
      await seedPageWithToken(page, guestToken);
      await page.goto(`/invite?id=${inviteId}`);
      // app/invite.tsx signed-in branch: the same InviteCard plus
      // Button titled "Go to the trip".
      await expect(page.getByText("Invite Host invited you.")).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(page.getByText(tripName)).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Go to the trip" }),
      ).toBeVisible();
    });

    await test.step("Go to the trip lands on the detail", async () => {
      await page.getByRole("button", { name: "Go to the trip" }).click();
      await page.waitForURL("**/trips/detail?id=*", {
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
      await expect(page.getByText(tripName).last()).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
    });
  });
});
