/**
 * E2E Journey: Trips (mobile).
 *
 * The one critical flow: create via UI → detail (sections present, edit
 * affordance) → list → edit the name → reload and confirm the edit
 * persisted (server round-trip, not cache).
 *
 * Auth is seeded via `authenticateViaAPI` (helpers/auth.ts), same as the
 * auth journey spec. Selectors are `getByRole`/`getByText` only; every
 * selector names the screen file and line-shape it matches in a comment.
 *
 * TODO (parked):
 * delete-trip has no UI surface yet — add a spec here once it does.
 * (Resolved: member removal and co-organizer promote/demote are covered
 * by the "remove and promote a member" test below.)
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  armSession,
  authenticateViaAPI,
  generateUniquePhone,
  seedUserViaAPI,
  uniqueLabel,
} from "./helpers/auth";
import {
  API_BASE,
  ELEMENT_TIMEOUT,
  NAVIGATION_TIMEOUT,
  SLOW_NAVIGATION_TIMEOUT,
} from "./helpers/timeouts";

test.describe("Trip Journey", () => {
  test("create via UI → detail → list → edit name → reload confirms", async ({
    page,
    request,
  }) => {
    const tripName = uniqueLabel("E2E Trip");
    const editedName = `${tripName} II`;
    // Typed, never a suggestion pick: CI carries no Places key, so the
    // picker degrades to the typed row — which is exactly the path
    // asserted here. A string no live row can contain, so no Google
    // row can steal the tap.
    let tripId: string;

    await test.step("seeded session lands on trips", async () => {
      await authenticateViaAPI(page, request, "Trip User");
      await page.goto("/trips");
      // app/trips/index.tsx: a freshly seeded user has no trips, so the
      // empty state's copy proves the list resolved empty. The page's
      // create action is the ActionBar at the foot ("Create trip"),
      // which is present on every trip list — including while it loads —
      // so it cannot carry that proof.
      await expect(page.getByText("No trips yet")).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
    });

    await test.step("open the create form", async () => {
      // app/trips/index.tsx (TripsScreen): the page's one action is the
      // ActionBar at the foot, `primaryTitle="Create trip"`. It was a box
      // inside the empty state and only rendered when trips.length === 0;
      // it is now the screen's foot and always renders, because a bar that
      // appeared only once data arrived would move the page under the
      // reader. It routes to /trips/new. components/ui/Button.tsx renders
      // accessibilityRole="button" with the title as its name.
      await page.getByRole("button", { name: "Create trip" }).click();
      await page.waitForURL("**/trips/new", {
        timeout: NAVIGATION_TIMEOUT,
      });
      // app/trips/new.tsx: FullscreenDialog title="Create trip".
      // Named as a button rather than as text: the dialog's title and the
      // form's submit button carry the same two words, and so does the
      // trips screen's footer ActionBar, which stays mounted underneath.
      // Three elements, one string. `getByRole` matches the visible button
      // and ignores the hidden footer; the title is not a control and is
      // not what this step is proving.
      await expect(
        page.getByRole("button", { name: "Create trip" }),
      ).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
    });

    await test.step("fill name, place, and dates", async () => {
      // app/trips/new.tsx: TextField label="Trip name".
      // pressSequentially, not fill: the auth spec's input lesson —
      // fill() desynchronizes controlled RN inputs.
      const nameInput = page.getByRole("textbox", { name: "Trip name" });
      await nameInput.click();
      await nameInput.pressSequentially(tripName);

      // app/trips/new.tsx: Dropdown label="Location" backed by live Places
      // suggestions plus the typed text as a row (lib/queries/places.ts
      // placePickerRows). The Dropdown only commits on a suggestion
      // pick, so a typed-but-unpicked string fails validation ("Where
      // are you going?") — type to open the list, then pick the typed
      // row. CI carries no Places key, so the lookup degrades to the
      // typed row with no network: that degradation is the path
      // asserted here, not a flake — if the typed row is missing, this
      // spec failing is the signal wanted.
      // components/ui/SuggestionList.tsx: each row is role="button"
      // named by its label; the typed row's label is the query in
      // quotes with secondary "Use what you typed".
      const locationInput = page.getByRole("textbox", { name: "Location" });
      await locationInput.click();
      const placeText = uniqueLabel("E2E Place");
      await locationInput.pressSequentially(placeText);
      await page
        .getByRole("button", { name: `"${placeText}"`, exact: true })
        .click();

      // app/trips/new.tsx: DatePicker with no min/max bounds.
      // components/ui/DatePicker.tsx: each day is role="button" named
      // by its ISO date (aria-label={iso}). One tap is a day trip
      // (end falls back to start), so a single tap suffices. Step into
      // next month first so the tapped day is upcoming regardless of
      // the day the suite runs; the tapped label is read back out of
      // the DOM rather than computed, so container/browser timezone
      // skew cannot pick a wrong day.
      // Deviation from the role/text-only rule, justified: the month
      // arrows in components/ui/DatePicker.tsx (Arrow) are icon-only
      // Pressables with an aria-label and no role, so getByRole cannot
      // match them and there is no text to match — getByLabel on the
      // aria-label is the only accessible selector. Day cells below
      // carry role="button", so they stay on getByRole.
      await page.getByLabel("Next month").click();
      // Day cells are discovered through locators, not the DOM: the
      // tapped label is read back out of the rendered buttons rather
      // than computed, so container/browser timezone skew cannot pick
      // a wrong day.
      const now = new Date();
      const todayLocal = `${now.getFullYear()}-${String(
        now.getMonth() + 1,
      ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const dayButtons = page.getByRole("button", {
        name: /^\d{4}-\d{2}-\d{2}$/,
      });
      let tappedIso: string | null = null;
      const dayCount = await dayButtons.count();
      for (let i = 0; i < dayCount; i += 1) {
        const label = await dayButtons.nth(i).getAttribute("aria-label");
        if (label !== null && label > todayLocal) {
          tappedIso = label;
          break;
        }
      }
      if (tappedIso === null) throw new Error("no future day cell found");
      await page.getByRole("button", { name: tappedIso }).click();
    });

    await test.step("submit and land on the new trip's detail", async () => {
      // app/trips/new.tsx: FullscreenDialog primaryTitle="Create trip"
      // (ActionBar → Button). Success replaces to /trips/detail?id=….
      await page.getByRole("button", { name: "Create trip" }).last().click();
      await page.waitForURL("**/trips/detail?id=*", {
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
      tripId = new URL(page.url()).searchParams.get("id") ?? "";
      expect(tripId).not.toBe("");
    });

    await test.step("detail shows the trip, its sections, edit affordance", async () => {
      // app/trips/detail.tsx: the header renders the trip title as
      // display text (right column, date → name → place order).
      // .last(): the app header echoes the same title in a hidden
      // element, so the bare text matches twice — the detail header
      // (text-5xl) is the last match.
      await expect(page.getByText(tripName).last()).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
      // components/trip/Itinerary.tsx: the run has no section head any
      // more — its structure is its own display headings (STAYS, then
      // the days) — so a trip that was just created proves the block
      // rendered by its empty state: no events and no roofs. Both reads
      // are server-backed now, so a fresh trip is genuinely empty here.
      await expect(page.getByText("Nothing planned yet")).toBeVisible();
      // app/trips/detail.tsx: the trip creator is the organizer
      // server-side, so the action block renders with its organizer
      // contents. The trigger is in the same place for every member
      // (components/ui/DisclosureButton.tsx), so the trigger is what
      // proves the block mounted.
      await expect(
        page.getByRole("button", { name: "Trip actions" }),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      // …and the trip's own verbs are shut inside it, so Edit trip is a
      // press away rather than on the page.
      await page.getByRole("button", { name: "Trip actions" }).click();
      await expect(
        page.getByRole("button", { name: "Edit trip" }),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
    });

    await test.step("the new trip appears on the list", async () => {
      await page.goto("/trips");
      // app/trips/index.tsx: Upcoming section renders a TripCard per
      // trip; the card carries the trip title. The tapped date is next
      // month, so the trip is upcoming, not past.
      await expect(page.getByText(tripName)).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
    });

    await test.step("edit the name", async () => {
      await page.goto(`/trips/detail?id=${tripId}`);
      await expect(page.getByText(tripName).last()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      // app/trips/detail.tsx: the row titled "Edit trip" routes to
      // /trips/edit?id=…. It sits behind the "Trip actions" trigger
      // (components/ui/DisclosureButton.tsx), so the trigger is pressed
      // first; this goto remounts the page, so it lands shut again.
      await page.getByRole("button", { name: "Trip actions" }).click();
      await page.getByRole("button", { name: "Edit trip" }).click();
      await page.waitForURL("**/trips/edit?id=*", {
        timeout: NAVIGATION_TIMEOUT,
      });
      // app/trips/edit.tsx: TextField label="Trip name" is prefilled
      // from the detail query — the prefilled value proves the edit
      // screen mounted with the trip (the "Edit trip" title text also
      // matches a hidden app-header echo, so the field is the mount
      // proof). Append rather than replace: avoids clear-and-refill
      // desync on the controlled input (same lesson as the create
      // form above).
      const editInput = page.getByRole("textbox", { name: "Trip name" });
      await expect(editInput).toHaveValue(tripName, {
        timeout: ELEMENT_TIMEOUT,
      });
      await editInput.click();
      // Phone width (390px) narrows the field, so the click can land
      // mid-string; End puts the caret where the append means it.
      await editInput.press("End");
      await editInput.pressSequentially(" II");
      // app/trips/edit.tsx: FullscreenDialog
      // primaryTitle="Save changes"; success dismisses to detail.
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.waitForURL("**/trips/detail?id=*", {
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
      await expect(page.getByText(editedName).last()).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
    });

    await test.step("reload and confirm the edit persisted", async () => {
      // Reload re-fetches the detail from the server (the seeded token
      // survives in localStorage), so the edited name proves a server
      // round-trip rather than an optimistic cache value.
      await page.reload();
      await expect(page.getByText(editedName).last()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
    });
  });

  test("remove and promote a member, both confirmed by reload", async ({
    page,
    request,
  }) => {
    const tripName = uniqueLabel("E2E Member Path");
    const leaverPhone = generateUniquePhone();
    const riserPhone = generateUniquePhone();
    const leaverName = uniqueLabel("E2E Leaver");
    const riserName = uniqueLabel("E2E Riser");
    let tripId: string;
    let orgToken: string;

    await test.step("seed organizer, trip, and two members", async () => {
      // The organizer session is seeded the way this suite already
      // seeds things (authenticateViaAPI writes the bearer token into
      // localStorage ahead of boot); the trip and the two members
      // come through the real API rather than a UI path that does
      // not exist — POST /api/trips, then one batch invite per
      // number, then each number signs up so the pending invitation
      // is consumed into membership server-side.
      const orgPhone = generateUniquePhone();
      ({ token: orgToken } = await seedUserViaAPI(
        request,
        orgPhone,
        "Member Host",
      ));
      await armSession(page, orgToken);
      tripId = await seedTripViaAPI(request, orgToken, tripName);
      for (const [phone, name] of [
        [leaverPhone, leaverName],
        [riserPhone, riserName],
      ] as const) {
        await seedInviteViaAPI(request, orgToken, tripId, phone);
        await seedUserViaAPI(request, phone, name);
      }
    });

    await test.step("both members are on the roll call", async () => {
      await page.goto(`/trips/members?id=${tripId}`);
      // app/trips/members.tsx: FullscreenDialog titled "Who's
      // coming"; each member row carries the member's name.
      await expect(page.getByText("Who's coming")).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(page.getByText(leaverName)).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
      await expect(page.getByText(riserName)).toBeVisible();
    });

    await test.step("remove a member with the confirm the guest also takes", async () => {
      // app/trips/members.tsx MemberRow: the organizer's rows are
      // pressable (role="button" named by the member's name) and
      // push /trips/members/detail?id=…&member=….
      await page.getByRole("button", { name: leaverName }).click();
      await page.waitForURL("**/trips/members/detail?id=*&member=*", {
        timeout: NAVIGATION_TIMEOUT,
      });
      // app/trips/members/detail.tsx MemberDialog: facts, then the
      // Manage Section; the Remove block's button reads "Remove" and
      // arms on the first press — a Cancel appears under it — and only
      // the second press removes. Both dialogs that take a person off
      // the trip ask it the same way.
      await expect(page.getByText("Manage")).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
      const removeButton = page.getByRole("button", {
        name: "Remove",
        exact: true,
      });
      await expect(removeButton).toBeVisible();
      await removeButton.click();
      // app/trips/members/detail.tsx MemberDialog: the armed state asks
      // the question in its own line and offers the way out.
      await expect(
        page.getByText("Are you sure?"),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      await expect(
        page.getByRole("button", { name: "Cancel" }),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      await removeButton.click();
      // The DELETE lands and the dialog re-reads the roster: with
      // the row gone it renders its gone state rather than the
      // Manage block. (The dialog does not auto-dismiss back to the
      // roll call in this flow — flagged in the task report — so the
      // spec returns there explicitly instead of asserting a
      // navigation the app does not perform.)
      // app/trips/members/detail.tsx PersonDetailDialog fallback.
      await expect(
        page.getByText("That person is not on this trip any more."),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      // Back on the roll call, the row is gone.
      await page.goto(`/trips/members?id=${tripId}`);
      await expect(page.getByText("Who's coming")).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(page.getByText(leaverName)).toBeHidden({
        timeout: ELEMENT_TIMEOUT,
      });
    });

    await test.step("reload: the removal persisted server-side", async () => {
      // Reload re-reads the roll call from the server, so the still-
      // missing row proves the DELETE landed rather than an
      // optimistic cache value.
      await page.reload();
      await expect(page.getByText("Who's coming")).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(page.getByText(leaverName)).toBeHidden({
        timeout: ELEMENT_TIMEOUT,
      });
      await expect(page.getByText(riserName)).toBeVisible();
    });

    await test.step("promote a member to organizer", async () => {
      await page.getByRole("button", { name: riserName }).click();
      await page.waitForURL("**/trips/members/detail?id=*&member=*", {
        timeout: NAVIGATION_TIMEOUT,
      });
      // app/trips/members/detail.tsx MemberDialog: the role row's
      // button reads "Make organizer" for a non-organizer; one
      // press applies the change, and the row inverts to
      // "Remove as organizer".
      await expect(
        page.getByRole("button", { name: "Make organizer" }),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      await page.getByRole("button", { name: "Make organizer" }).click();
      await expect(
        page.getByRole("button", { name: "Remove as organizer" }),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
    });

    await test.step("reload: the promotion persisted server-side", async () => {
      await page.reload();
      // The inverted role row survives the round-trip: the member is
      // still an organizer on the server.
      await expect(
        page.getByRole("button", { name: "Remove as organizer" }),
      ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
    });

    await test.step("demote back, and see it stick", async () => {
      await page
        .getByRole("button", { name: "Remove as organizer" })
        .click();
      await expect(
        page.getByRole("button", { name: "Make organizer" }),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Make organizer" }),
      ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
    });
  });
});

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

/** Invite one number through the real batch endpoint. */
async function seedInviteViaAPI(
  request: APIRequestContext,
  organizerToken: string,
  tripId: string,
  guestPhone: string,
): Promise<void> {
  // POST /api/trips/:tripId/invitations — the batch shape
  // {phoneNumbers, userIds} (lib/queries/invitations.ts:invite).
  // Acceptance happens server-side at verify
  // (processPendingInvitations), so inviting and then signing up
  // that number is what turns it into a member.
  const res = await request.post(`${API_BASE}/trips/${tripId}/invitations`, {
    data: { phoneNumbers: [guestPhone], userIds: [] },
    headers: { Authorization: `Bearer ${organizerToken}` },
  });
  if (!res.ok()) {
    throw new Error(
      `create-invitations failed: ${res.status()} ${await res.text()}`,
    );
  }
}
