/**
 * E2E Journey: travel entry (mobile).
 *
 * Critical flow 8 (Travel entry). Two tests, one flow: a member files
 * their own arrival and the board shows it, and a **cold load** of a
 * filed record's edit URL opens that record and saves over it rather
 * than beside it.
 *
 * The second test is the reason this spec exists at all. The regression
 * it covers is about *when* a value is computed — a `useState` seed that
 * captured the viewer because the section query had not landed on the
 * first render — and this suite has no renderer, so no unit test can see
 * `e9e024e0`. A unit test cannot see "the form edited the wrong person
 * while the URL named someone else" either: the memo/seed class of bug
 * only exists once something mounts. So the assertion of record is a
 * fresh `page.goto` on the form URL, and the proof that the save went to
 * the right row is a re-read from the API: exactly one live row for that
 * member and direction, the same id, carrying the change.
 *
 * Selectors are accessible names, never `testID`. Nothing here
 * re-verifies a unit test: `__tests__/travel-where.test.ts` owns the
 * ranking, `travel-days.test.ts` the strip's cells and
 * `new-travel.test.ts` the D5 leg rule. Field-level validation is banned
 * at this level and is not asserted.
 */

import { test, expect } from "@playwright/test";
import {
  armSession,
  generateUniquePhone,
  seedUserViaAPI,
  uniqueLabel,
} from "./helpers/auth";
import { NAVIGATION_TIMEOUT } from "./helpers/timeouts";
import { seedTripViaAPI, tripTimezoneViaAPI } from "./helpers/trip";
import {
  organizerMemberIdViaAPI,
  seedTravelViaAPI,
  travelRowsViaAPI,
} from "./helpers/travel";

/**
 * The DayStrip's label for a date: "Thu 12". `lib/travelDays.ts` builds
 * the cell from the ISO string through `lib/dateRange.ts`, which reads it
 * in the browser's local zone — so the expectation is read the same way
 * rather than in UTC, and the two agree wherever the suite runs.
 */
function dayCellLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const weekday = new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
  });
  return `${weekday} ${day}`;
}

/**
 * The clock the app prints for an instant, in the **trip's** own zone.
 * The travel board and form read a record in the trip's clock by default
 * (`displayZone`; the viewer can switch to their own), so the expectation
 * is built from the zone the API actually gave the trip — which is
 * geocoded from the destination, not the one the seeding helper posted —
 * rather than from a hardcoded guess.
 *
 * One repair: ICU separates the hour from the meridiem with a narrow
 * no-break space in this locale, and `lib/time.ts:formatClock` writes a
 * plain one.
 */
function clockIn(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .replace(/\u202f/g, " ");
}

test.describe("Travel Journey", () => {
  test("an organizer files an arrival, and the board shows it", async ({
    page,
    request,
  }) => {
    const tripName = uniqueLabel("E2E Travel");
    const memberName = uniqueLabel("Travel Host");
    const where = uniqueLabel("SJD T1");

    let tripId: string;
    let startDate: string;
    let memberId: string;
    let token: string;

    await test.step("seed a session, a trip and the member filing", async () => {
      ({ token } = await seedUserViaAPI(
        request,
        generateUniquePhone(),
        memberName,
      ));
      ({ id: tripId, startDate } = await seedTripViaAPI(
        request,
        token,
        tripName,
      ));
      // `seedTripViaAPI` makes a one-member trip, and the creator is the
      // organizer — the member whose travel this test files.
      memberId = await organizerMemberIdViaAPI(request, token, tripId);
    });

    await test.step("open the board", async () => {
      await armSession(page, token);
      // The board is a dialog route of its own (`app/trips/travel.tsx`),
      // reached from the trip header's `Travel` door.
      await page.goto(`/trips/travel?id=${tripId}`);
      await expect(
        page.getByText("Nobody has shared their times yet."),
      ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
    });

    await test.step("fill the arrival", async () => {
      // The board's ActionBar primary — the dialog's title is `Travel`
      // and its one action reads `Add travel`.
      await page.getByRole("button", { name: "Add travel" }).last().click();

      // The Who picker is an organizer's field, and the only member is
      // the viewer, so it opens answered: the roster's own name for them.
      await expect(page.getByRole("textbox", { name: "Who" })).toHaveValue(
        memberName,
        { timeout: NAVIGATION_TIMEOUT },
      );

      // components/ui/DayStrip.tsx: each cell is `role="radio"` named
      // "Thu 12" — the trip's own days, and the morning after it ends.
      await page.getByRole("radio", { name: dayCellLabel(startDate) }).click();

      // components/ui/TimeField.tsx: closed, the field is a button
      // named by what it shows. Nothing is set yet, so both read
      // "Pick a time"; the arrival's own end is `Lands`, which is the
      // second one in the panel, and the far end is never required.
      await page.getByRole("button", { name: "Pick a time" }).last().click();
      // Open, the field is a column of `role="radio"` slots labelled the
      // way the itinerary prints them.
      await page.getByRole("radio", { name: "9:00 AM" }).click();

      // components/ui/Dropdown.tsx: a local list, so entering the field
      // opens it (openOnPress) with no request in flight. Typing commits
      // through `freeText` — the list narrows to "No matches" and the
      // field keeps the words. `pressSequentially`, not `fill`: `fill()`
      // desynchronizes controlled RN inputs.
      const whereInput = page.getByRole("textbox", { name: "Where" });
      await whereInput.click();
      await whereInput.pressSequentially(where);

      await page.getByRole("button", { name: "Add travel" }).last().click();
    });

    await test.step("the board shows the filed arrival", async () => {
      // The save dismisses back to the board, whose rows now carry a
      // clock instead of "Not shared yet".
      await expect(page.getByText("9:00 AM")).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(
        page.getByText("Nobody has shared their times yet."),
      ).toHaveCount(0);
    });

    await test.step("the server holds exactly one arrival for the member", async () => {
      await expect
        .poll(
          async () => {
            const rows = await travelRowsViaAPI(request, token, tripId);
            return rows
              .filter(
                (row) =>
                  row.memberId === memberId && row.travelType === "arrival",
              )
              .map((row) => row.arrivalLocation);
          },
          { timeout: NAVIGATION_TIMEOUT },
        )
        .toEqual([where]);
    });
  });

  test("a cold load of a filed record edits it instead of filing a second", async ({
    page,
    request,
  }) => {
    const tripName = uniqueLabel("E2E Cold Load");
    const memberName = uniqueLabel("Travel Editor");
    const seededWhere = uniqueLabel("CDG T2");
    const editedWhere = uniqueLabel("CDG T2 Hall 4");

    let tripId: string;
    let startDate: string;
    let memberId: string;
    let token: string;
    let travelId: string;
    let tripZone: string;
    const arrivalIso = () => `${startDate}T14:00:00Z`;

    await test.step("seed a session, a trip and a filed arrival", async () => {
      ({ token } = await seedUserViaAPI(
        request,
        generateUniquePhone(),
        memberName,
      ));
      ({ id: tripId, startDate } = await seedTripViaAPI(
        request,
        token,
        tripName,
      ));
      memberId = await organizerMemberIdViaAPI(request, token, tripId);
      // The zone the record will be read back in — geocoded from the
      // destination at creation, so it is asked for rather than assumed.
      tripZone = await tripTimezoneViaAPI(request, token, tripId);
      // Filed through the real endpoint, exactly as the form would file
      // it — the row this URL names.
      travelId = await seedTravelViaAPI(
        request,
        token,
        tripId,
        memberId,
        "arrival",
        { arrivalTime: arrivalIso() },
        seededWhere,
      );
    });

    await test.step("cold-load the edit URL", async () => {
      await armSession(page, token);
      // A fresh load, not an in-app navigation: the bug this covers only
      // exists on the first render, before the section query lands.
      await page.goto(`/trips/travel/form?id=${tripId}&travel=${travelId}`);

      // The title the record, not the viewer, decides. Exact, because
      // the trip's own title sits above it in the same dialog and
      // `getByText` is a substring match by default.
      await expect(page.getByText("Edit travel", { exact: true })).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      // Its own values: the where it was filed with, its day, its clock.
      await expect(page.getByRole("textbox", { name: "Where" })).toHaveValue(
        seededWhere,
        { timeout: NAVIGATION_TIMEOUT },
      );
      await expect(
        page.getByRole("radio", { name: dayCellLabel(startDate) }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("button", { name: clockIn(arrivalIso(), tripZone) }),
      ).toBeVisible();
      // The far end was never filed, so exactly one time field is still
      // asking — which is how this spec reads "the record's own values"
      // without re-testing the formatter.
      await expect(
        page.getByRole("button", { name: "Pick a time" }),
      ).toHaveCount(1);
      // Delete names the direction this URL is about. It is only
      // rendered for a filed direction, and it is the clearest signal
      // that the form resolved the record rather than the viewer.
      await expect(
        page.getByRole("button", { name: "Delete arrival" }),
      ).toBeVisible();
    });

    await test.step("edit the where and save", async () => {
      const whereInput = page.getByRole("textbox", { name: "Where" });
      await whereInput.click();
      await whereInput.selectText();
      await whereInput.pressSequentially(editedWhere);

      // The verb follows what saving will do to this member's row: an
      // edit updates it.
      await page.getByRole("button", { name: "Save changes" }).click();
    });

    await test.step("the server holds the one row, changed, under its own id", async () => {
      await expect
        .poll(
          async () => {
            const rows = await travelRowsViaAPI(request, token, tripId);
            return rows
              .filter(
                (row) =>
                  row.memberId === memberId && row.travelType === "arrival",
              )
              .map((row) => `${row.id}:${row.arrivalLocation}`);
          },
          { timeout: NAVIGATION_TIMEOUT },
        )
        .toEqual([`${travelId}:${editedWhere}`]);
    });
  });

  test("deleting one of two entries leaves the form open on the other", async ({
    page,
    request,
  }) => {
    const tripName = uniqueLabel("E2E Delete Travel");
    const memberName = uniqueLabel("Travel Deleter");
    const arrivalWhere = uniqueLabel("SJD T1");
    const departureWhere = uniqueLabel("SJD T2");

    let tripId: string;
    let startDate: string;
    let memberId: string;
    let token: string;
    let arrivalId: string;

    await test.step("seed a session, a trip and both directions", async () => {
      ({ token } = await seedUserViaAPI(
        request,
        generateUniquePhone(),
        memberName,
      ));
      ({ id: tripId, startDate } = await seedTripViaAPI(
        request,
        token,
        tripName,
      ));
      memberId = await organizerMemberIdViaAPI(request, token, tripId);
      // Both ends of the member's travel are filed, which is the state
      // this test is about: deleting one of two is not deleting the
      // screen's subject.
      arrivalId = await seedTravelViaAPI(
        request,
        token,
        tripId,
        memberId,
        "arrival",
        { arrivalTime: `${startDate}T14:00:00Z` },
        arrivalWhere,
      );
      await seedTravelViaAPI(
        request,
        token,
        tripId,
        memberId,
        "departure",
        { departureTime: `${startDate}T18:00:00Z` },
        departureWhere,
      );
    });

    await test.step("open the arrival's form and delete it", async () => {
      await armSession(page, token);
      await page.goto(`/trips/travel/form?id=${tripId}&travel=${arrivalId}`);
      await expect(page.getByText("Edit travel", { exact: true })).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(page.getByRole("textbox", { name: "Where" })).toHaveValue(
        arrivalWhere,
        { timeout: NAVIGATION_TIMEOUT },
      );

      await page.getByRole("button", { name: "Delete arrival" }).click();
    });

    await test.step("the form stays, on the member, with the deleted panel empty", async () => {
      // Still the same screen: the title, the member and the other
      // direction's panel are all still here.
      await expect(page.getByText("Edit travel", { exact: true })).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(page.getByRole("textbox", { name: "Who" })).toHaveValue(
        memberName,
      );
      // The deleted direction's fields are empty and its door is gone —
      // a panel still holding the deleted record's values would offer to
      // re-file it under a verb that says "Add travel".
      await expect(page.getByRole("textbox", { name: "Where" })).toHaveValue(
        "",
      );
      await expect(page.getByRole("button", { name: "Pick a time" })).toHaveCount(
        2,
      );
      await expect(page.getByText("Not shared yet")).toHaveCount(1);
      await expect(
        page.getByRole("button", { name: "Delete arrival" }),
      ).toHaveCount(0);
      // And the URL no longer names the row that is gone: it names the
      // member and the panel instead.
      await expect(page).not.toHaveURL(/travel=/);
      await expect(page).toHaveURL(new RegExp(`member=${memberId}`));
    });

    await test.step("the server holds the departure and nothing else", async () => {
      await expect
        .poll(
          async () => {
            const rows = await travelRowsViaAPI(request, token, tripId);
            return rows
              .filter((row) => row.memberId === memberId)
              .map((row) => `${row.travelType}:${row.departureLocation ?? row.arrivalLocation}`);
          },
          { timeout: NAVIGATION_TIMEOUT },
        )
        .toEqual([`departure:${departureWhere}`]);
    });
  });
});
