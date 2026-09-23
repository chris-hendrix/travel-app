/**
 * E2E Journey: Trips (mobile) — Phase 4, Task 7.
 *
 * The one critical flow: create via UI → detail (sections present, edit
 * affordance) → list → edit the name → reload and confirm the edit
 * persisted (server round-trip, not cache).
 *
 * Auth is seeded via `authenticateViaAPI` (helpers/auth.ts), same as the
 * auth journey spec. Selectors are `getByRole`/`getByText` only; every
 * selector names the screen file and line-shape it matches in a comment.
 *
 * TODO (parked, apps/mobile/docs/PRD.md:45 / plan parking lot):
 * delete-trip has no UI surface yet — add a spec here once it does.
 * TODO (parked, apps/mobile/docs/PRD.md:45 / plan parking lot):
 * co-organizer promote/demote has no UI surface yet — add a spec here
 * once it does.
 */

import { test, expect } from "@playwright/test";
import { authenticateViaAPI } from "./helpers/auth";
import {
  ELEMENT_TIMEOUT,
  NAVIGATION_TIMEOUT,
  SLOW_NAVIGATION_TIMEOUT,
} from "./helpers/timeouts";

test.describe("Trip Journey", () => {
  test("create via UI → detail → list → edit name → reload confirms", async ({
    page,
    request,
  }) => {
    const tripName = `E2E Trip ${Date.now()}`;
    const editedName = `${tripName} II`;
    let tripId: string;

    await test.step("seeded session lands on trips", async () => {
      await authenticateViaAPI(page, request, "Trip User");
      await page.goto("/trips");
      // app/trips/index.tsx: a freshly seeded user has no trips, so
      // the empty state's Button titled "Create your first trip"
      // proves the list screen mounted.
      await expect(
        page.getByRole("button", { name: "Create your first trip" }),
      ).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
    });

    await test.step("open the create form", async () => {
      // app/trips/index.tsx (TripsContent): a freshly seeded user has
      // no trips, so the empty state renders Button titled "Create
      // your first trip" (the "Create trip" button only renders when
      // trips.length > 0). Both route to /trips/new.
      // components/ui/Button.tsx renders accessibilityRole="button"
      // with the title as its name.
      await page
        .getByRole("button", { name: "Create your first trip" })
        .click();
      await page.waitForURL("**/trips/new", {
        timeout: NAVIGATION_TIMEOUT,
      });
      // app/trips/new.tsx: FullscreenDialog title="Create trip".
      await expect(page.getByText("Create trip").first()).toBeVisible({
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

      // app/trips/new.tsx: Dropdown label="Where" backed by the local
      // mocks/places.ts list. The Dropdown only commits on a suggestion
      // pick (no freeText), so a typed-but-unpicked string fails
      // validation ("Where are you going?") — type to filter, then pick
      // the local mock suggestion. This is not the live Places API
      // (CI carries no Places key): the suggestion comes from the
      // in-repo mock list, never the network.
      // components/ui/SuggestionList.tsx: each row is role="button"
      // named by its label.
      const whereInput = page.getByRole("textbox", { name: "Where" });
      await whereInput.click();
      await whereInput.pressSequentially("Mallorca");
      await page
        .getByRole("button", { name: "Mallorca, Spain" })
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
      // server-side, so the organizer action group (Button titled
      // "Trip details") renders with no toggle.
      await expect(
        page.getByRole("button", { name: "Trip details" }),
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
      // app/trips/detail.tsx: Button titled "Trip details" routes to
      // /trips/edit?id=… (visible directly: the creator is organizer).
      await page.getByRole("button", { name: "Trip details" }).click();
      await page.waitForURL("**/trips/edit?id=*", {
        timeout: NAVIGATION_TIMEOUT,
      });
      // app/trips/edit.tsx: TextField label="Trip name" is prefilled
      // from the detail query — the prefilled value proves the edit
      // screen mounted with the trip (the "Trip details" title text also
      // matches a hidden app-header echo, so the field is the mount
      // proof). Append rather than replace: avoids clear-and-refill
      // desync on the controlled input (same lesson as the create
      // form above).
      const editInput = page.getByRole("textbox", { name: "Trip name" });
      await expect(editInput).toHaveValue(tripName, {
        timeout: ELEMENT_TIMEOUT,
      });
      await editInput.click();
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
});
