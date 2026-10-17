/**
 * E2E Journey: travel entry (mobile).
 *
 * Critical flow 8 (Travel entry). Five tests, one flow: a member files
 * their own arrival and the board shows it — and the sheet behind that
 * row, where the where offers `Open in Maps` — a **cold load** of a filed
 * record's edit URL opens that record and saves over it rather than
 * beside it, deleting one of two directions keeps the form open on the
 * other, a delete on a member who is not going keeps the form on *that
 * member*, and a **hire** filed with both its ends carries its mode to
 * the board and both ends back into a cold-loaded panel.
 *
 * The cold-load test is the reason this spec exists at all. The
 * regression it covers is about *when* a value is computed — a `useState`
 * seed that captured the viewer because the section query had not landed
 * on the first render — and this suite has no renderer, so no unit test
 * can see `e9e024e0`. A unit test cannot see "the form edited the wrong
 * person while the URL named someone else" either: the memo/seed class of
 * bug only exists once something mounts. So the assertion of record is a
 * fresh `page.goto` on the form URL, and the proof that the save went to
 * the right row is a re-read from the API: exactly one live row for that
 * member and direction, the same id, carrying the change. A last step
 * cold-loads the `member=` door as well — the URL the app itself builds
 * for a traveler who still owes a direction, which names the member and
 * not the record, so the row it is about can only come from the section
 * read.
 *
 * The last test is that same class on the delete path: a member who is on
 * the trip but not on the going roster (a guest, or anyone who answered
 * "maybe" after filing) holds records, and the delete redirect hands the
 * form a `member=` URL. Resolving that against the going roster rather
 * than against everyone the picker can name put the *viewer's* travel on
 * the screen — no unit test can see it, and the other three tests cannot
 * either, because their member is going.
 *
 * The fifth test is the mode's own relay, and the reason it is here is
 * that its claims are three renderings of one field: the chips showing
 * the mode the record carries, the board's row wearing the chip its
 * record names, and a cold-loaded hire's panel showing **both** its ends
 * on the filed day — then a chip committing another mode and the board
 * wearing that instead. The Vitest suite has no renderer, so no unit test
 * can watch a chip, a badge and a panel agree; the wire itself is Task
 * 4's and the derived day Task 9's, and neither is re-verified here.
 *
 * Selectors are accessible names, never `testID`. The form's fields are
 * named by the mode's own word for their end (`lib/transportMode.ts`,
 * D3), so an arrival's `Where` reads `Lands at` on the default flight and
 * `Pickup at` on a hire — the words are the feature, and a spec that
 * named a field by its position would be asserting the shape this change
 * removed. Nothing here re-verifies a unit test:
 * `__tests__/travel-where.test.ts` owns the ranking, `travel-days.test.ts`
 * the strip's cells and `new-travel.test.ts` the D5 leg rule. Field-level
 * validation is banned at this level and is not asserted.
 */

import { test, expect } from "@playwright/test";
import {
  armSession,
  generateUniquePhone,
  seedUserViaAPI,
  uniqueLabel,
} from "./helpers/auth";
import { NAVIGATION_TIMEOUT } from "./helpers/timeouts";
import { seedGuestViaAPI } from "./helpers/members";
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

      // The Who field is an organizer's picker, and the only member is
      // the viewer, so it opens answered: the roster's own name for them.
      // It is a picker rather than a text box now, so it is read as the
      // button it is, named by the value it shows.
      await expect(page.getByRole("button", { name: memberName })).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });

      // components/ui/DayStrip.tsx: each cell is `role="radio"` named
      // "Thu 12" — the trip's own days, and the morning after it ends.
      await page.getByRole("radio", { name: dayCellLabel(startDate) }).click();

      // components/ui/TimeField.tsx: closed, the field is a button
      // named by what it shows. The arrival's own end is `Lands`, the
      // only one still asking — `Leaves` is optional for an arrival and
      // says so — so the required field is the one to press.
      await page.getByRole("button", { name: "Pick a time" }).click();
      // Open, the field is a column of `role="radio"` slots labelled the
      // way the itinerary prints them.
      await page.getByRole("radio", { name: "9:00 AM" }).click();

      // components/ui/Dropdown.tsx: a live list, so the list opens on the
      // first keystroke rather than on focus, and `freeText` commits every
      // one of them — the field keeps the words and the list is merely
      // advising. `pressSequentially`, not `fill`: `fill()` desynchronizes
      // controlled RN inputs.
      //
      // CI carries no `GOOGLE_MAPS_API_KEY`, so the live half degrades to a
      // status row and this path is the local one: the trip's own wheres,
      // the typed row, and nothing that needs Google
      // (`components/trip/TravelWhereField.tsx`). That is the same
      // degradation the stay and event address fields already rely on.
      //
      // Named `Lands at`, not `Where`: the label is the end's own word
      // from the mode's table (`lib/transportMode.ts`), and a flight's
      // arrival lands.
      const whereInput = page.getByRole("textbox", { name: "Lands at" });
      await whereInput.click();
      await whereInput.pressSequentially(where);

      await page.getByRole("button", { name: "Add travel" }).last().click();
    });

    await test.step("the board shows the filed arrival", async () => {
      // The save dismisses back to the board, whose rows now carry a
      // clock instead of "Not shared yet".
      //
      // Asserted on the row, not on the clock alone: a bare
      // `getByText("9:00 AM")` resolved to three nodes and failed strict
      // mode, because the dismissed form is still in the tree while the
      // route resolves and it renders the same clock (and its own summary
      // line). The row is named by the member and carries the clock — the
      // form's own controls carry one or the other, never both.
      await expect(
        page
          .getByRole("button")
          .filter({ hasText: memberName })
          .filter({ hasText: "9:00 AM" }),
      ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
      await expect(
        page.getByText("Nobody has shared their times yet."),
      ).toHaveCount(0);
    });

    await test.step("the sheet behind the row offers Maps for the where", async () => {
      // The board's row is the press (`app/trips/travel.tsx`), and the
      // sheet it opens is the leg read whole. Its where carries
      // `Open in Maps` — the verb the stay and event sheets put under
      // their own address — which is the one place on this screen a reader
      // can leave the app from, and the door the port from the web sheet
      // lost once. The URL it builds is `lib/links.ts`' own and is
      // unit-tested in `__tests__/links.test.ts`; what no unit test can
      // see (this suite has no renderer) is that a filed where still
      // offers the press at all.
      await page
        .getByRole("button")
        .filter({ hasText: memberName })
        .filter({ hasText: "9:00 AM" })
        .click();
      await expect(page).toHaveURL(/\/trips\/travel\/detail/);
      await expect(
        page.getByRole("button", { name: `Open ${where} in Google Maps` }),
      ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
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
      await expect(page.getByRole("textbox", { name: "Lands at" })).toHaveValue(
        seededWhere,
        { timeout: NAVIGATION_TIMEOUT },
      );
      await expect(
        page.getByRole("radio", { name: dayCellLabel(startDate) }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("button", { name: clockIn(arrivalIso(), tripZone) }),
      ).toBeVisible();
      // The far end was never filed, and its pair is shut behind its own
      // trigger: a leg's counterpart is optional, so what says so is a
      // line offering to add it — `Add the departure`, named by the side
      // it would fill — rather than an empty pair of fields. The one
      // field still asking is the arrival's own end, which is how this
      // spec reads "the record's own values" without re-testing the
      // formatter.
      await expect(page.getByRole("button", { name: "Pick a time" })).toHaveCount(
        0,
      );
      await expect(
        page.getByRole("button", { name: "Add the departure" }),
      ).toBeVisible();
      // Delete names the direction this URL is about. It is only
      // rendered for a filed direction, and it is the clearest signal
      // that the form resolved the record rather than the viewer.
      await expect(
        page.getByRole("button", { name: "Delete arrival" }),
      ).toBeVisible();
    });

    await test.step("edit the where and save", async () => {
      const whereInput = page.getByRole("textbox", { name: "Lands at" });
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

    await test.step("cold-load the member's own door onto the same row", async () => {
      // The same class on the door the app builds for a traveler who still
      // owes a direction (`components/trip/TripActions.tsx`): that URL
      // names the *member*, not the record, so nothing in it says which
      // row this is about — the section read does. On a cold load the
      // dialog used to mount before that read landed and seed its panels
      // from nothing, which said "Not shared yet" over a member who has
      // filed, while `Delete` said otherwise, and a save then posted a leg
      // the server folded into the row, clearing what the body left out.
      await page.goto(`/trips/travel/form?id=${tripId}&member=${memberId}`);
      await expect(page.getByText("Edit travel", { exact: true })).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(page.getByRole("textbox", { name: "Lands at" })).toHaveValue(
        editedWhere,
        { timeout: NAVIGATION_TIMEOUT },
      );
      await expect(
        page.getByRole("button", { name: "Delete arrival" }),
      ).toBeVisible();
      await expect(page.getByText("Not shared yet")).toHaveCount(0);
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
      await expect(page.getByRole("textbox", { name: "Lands at" })).toHaveValue(
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
      await expect(page.getByRole("button", { name: memberName })).toBeVisible();
      // The deleted direction's fields are empty and its door is gone —
      // a panel still holding the deleted record's values would offer to
      // re-file it under a verb that says "Add travel".
      await expect(page.getByRole("textbox", { name: "Lands at" })).toHaveValue(
        "",
      );
      // One field still asks — the arrival's own end, which is required —
      // and the counterpart is optional, which the form draws as a pair
      // shut behind its own trigger rather than as an empty field.
      await expect(page.getByRole("button", { name: "Pick a time" })).toHaveCount(
        1,
      );
      await expect(
        page.getByRole("button", { name: "Add the departure" }),
      ).toBeVisible();
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

  test("a delete on a member who is not going keeps the form on that member", async ({
    page,
    request,
  }) => {
    const tripName = uniqueLabel("E2E Maybe Travel");
    const organizerName = uniqueLabel("Travel Organizer");
    const guestName = uniqueLabel("Maybe Traveler");
    const arrivalWhere = uniqueLabel("LIS T1");
    const departureWhere = uniqueLabel("LIS T2");

    let tripId: string;
    let startDate: string;
    let token: string;
    let guestMemberId: string;
    let arrivalId: string;

    await test.step("seed a member who is not going, holding both directions", async () => {
      ({ token } = await seedUserViaAPI(
        request,
        generateUniquePhone(),
        organizerName,
      ));
      ({ id: tripId, startDate } = await seedTripViaAPI(
        request,
        token,
        tripName,
      ));
      // A guest is inserted with `status: "no_response"`
      // (`apps/api/src/db/schema/index.ts:163`), so they are on the trip and
      // off the going roster — while still being someone an organizer can
      // file for. A member who answered "maybe" after filing is the same
      // pair of facts, and it is the state the delete redirect has to name.
      guestMemberId = await seedGuestViaAPI(request, token, tripId, guestName);
      arrivalId = await seedTravelViaAPI(
        request,
        token,
        tripId,
        guestMemberId,
        "arrival",
        { arrivalTime: `${startDate}T14:00:00Z` },
        arrivalWhere,
      );
      await seedTravelViaAPI(
        request,
        token,
        tripId,
        guestMemberId,
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
      // The picker names the member the URL named: a member who holds a
      // record is one the picker can name even when they are not going
      // (`lib/members.ts` `travelMemberOptions`).
      await expect(page.getByRole("button", { name: guestName })).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });

      await page.getByRole("button", { name: "Delete arrival" }).click();
    });

    await test.step("the form stays on the member, and on the member's other direction", async () => {
      // The redirect keeps the member and drops the id of the row that is
      // gone — and this member is outside the going roster, which is
      // exactly the state that used to resolve to the *viewer*
      // (`form.tsx`'s `linkedMember`). Every assertion below is a fact
      // about the guest that only holds if the form is still about them.
      await expect(page).toHaveURL(new RegExp(`member=${guestMemberId}`));
      await expect(page.getByRole("button", { name: guestName })).toBeVisible();
      // Their other direction is still here, still filled in, and the
      // screen is still editing rather than adding.
      await page.getByRole("radio", { name: "Departing" }).click();
      // The departure's own word now, not the arrival's: `Leaves from` on
      // the default flight.
      await expect(
        page.getByRole("textbox", { name: "Leaves from" }),
      ).toHaveValue(departureWhere);
      await expect(
        page.getByRole("button", { name: "Save changes" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Delete departure" }),
      ).toBeVisible();
    });

    await test.step("the server holds the member's departure and nothing else", async () => {
      await expect
        .poll(
          async () => {
            const rows = await travelRowsViaAPI(request, token, tripId);
            return rows
              .filter((row) => row.memberId === guestMemberId)
              .map(
                (row) =>
                  `${row.travelType}:${row.departureLocation ?? row.arrivalLocation}`,
              );
          },
          { timeout: NAVIGATION_TIMEOUT },
        )
        .toEqual([`departure:${departureWhere}`]);
    });
  });

  test("a hire keeps its mode and both ends through the round trip", async ({
    page,
    request,
  }) => {
    const tripName = uniqueLabel("E2E Hire");
    const memberName = uniqueLabel("Travel Hirer");
    const pickupWhere = uniqueLabel("PMI Desk");
    const dropoffWhere = uniqueLabel("PMI Garage");

    let tripId: string;
    let startDate: string;
    let memberId: string;
    let token: string;
    let travelId: string;
    let tripZone: string;
    // Two ends of one hire, hours apart on the filed day, stamped in UTC
    // and read back through the zone the API geocoded for the trip — the
    // spec never asserts a clock it guessed.
    const pickupIso = () => `${startDate}T10:00:00Z`;
    const dropoffIso = () => `${startDate}T14:00:00Z`;

    await test.step("seed a trip and a hire holding both its ends", async () => {
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
      tripZone = await tripTimezoneViaAPI(request, token, tripId);
      // Filed through the real endpoint with the mode the chips would
      // commit and with *both* ends, which is the one shape the form
      // files as a single record and the board reads back as one row.
      travelId = await seedTravelViaAPI(
        request,
        token,
        tripId,
        memberId,
        "arrival",
        { arrivalTime: pickupIso(), departureTime: dropoffIso() },
        pickupWhere,
        { mode: "rental", farLocation: dropoffWhere },
      );
    });

    await test.step("the board wears the chip the record names", async () => {
      await armSession(page, token);
      await page.goto(`/trips/travel?id=${tripId}`);
      const row = page
        .getByRole("button")
        .filter({ hasText: memberName })
        .filter({ hasText: "Rental" });
      await expect(row).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
      // The chip sits *beside* the name — the row is read across (chip,
      // where, when), which is the whole reason the board wears the
      // roster's row. Asserted as geometry because this name is
      // deliberately long (`uniqueLabel` makes it so): a name too wide for
      // its column has to yield rather than push the chip onto a second
      // line, or the row's shape ends up depending on how long someone's
      // name is. Only the phone project can catch this; at 1280 there is
      // room for any name.
      const nameBox = await row
        .getByText(memberName, { exact: true })
        .boundingBox();
      const chipBox = await row.getByText("Rental", { exact: true }).boundingBox();
      expect(nameBox).not.toBeNull();
      expect(chipBox).not.toBeNull();
      // Vertically overlapping means one line: a wrapped chip would begin
      // below the name's own box.
      expect(chipBox!.y).toBeLessThan(nameBox!.y + nameBox!.height);
      expect(chipBox!.y + chipBox!.height).toBeGreaterThan(nameBox!.y);
      // The far column stacks the day over the clock rather than joining
      // them, because the joined form was the widest thing in the row and
      // is what squeezed this name. The clock has no element of its own to
      // match when the two are one string, so this cannot pass on a joined
      // column.
      const farDay = await row
        .getByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) /)
        .boundingBox();
      const farClock = await row
        .getByText(clockIn(pickupIso(), tripZone), { exact: true })
        .boundingBox();
      expect(farDay).not.toBeNull();
      expect(farClock).not.toBeNull();
      expect(farDay!.y).toBeLessThan(farClock!.y);
    });

    await test.step("a cold load opens the hire on both its ends", async () => {
      // A fresh load of the record's own URL, the way the class of bug
      // the other tests cover is reached: whatever the pane shows has to
      // come from the record, not from a leg a previous screen left in
      // memory.
      await page.goto(`/trips/travel/form?id=${tripId}&travel=${travelId}`);
      await expect(page.getByText("Edit travel", { exact: true })).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      // The mode the record carries, on the control that commits it: the
      // chips are the one place a mode reaches a screen.
      await expect(page.getByRole("radio", { name: "Rental" })).toHaveAttribute(
        "aria-selected",
        "true",
        { timeout: NAVIGATION_TIMEOUT },
      );
      // A hire's own end on an arrival row is the pickup — the word is
      // keyed by the *side*, not by the field's position (D3), so the
      // field the flight calls `Lands at` reads `Pickup at` here.
      await expect(
        page.getByRole("textbox", { name: "Pickup at" }),
      ).toHaveValue(pickupWhere, { timeout: NAVIGATION_TIMEOUT });
      await expect(
        page.getByRole("button", {
          name: clockIn(pickupIso(), tripZone),
          exact: true,
        }),
      ).toBeVisible();
      // The far end is open because it *holds* something rather than
      // because it was asked (D4): the pair renders on the value, and
      // the dropoff is where the record put it.
      await expect(
        page.getByRole("textbox", { name: "Dropoff at" }),
      ).toHaveValue(dropoffWhere);
      // Exact, because the shut line above reads the same clock back
      // inside a sentence (`Dropoff · 3:00 PM · PMI Garage`).
      await expect(
        page.getByRole("button", {
          name: clockIn(dropoffIso(), tripZone),
          exact: true,
        }),
      ).toBeVisible();
      // Both ends on the filed day, which is what the absence of the far
      // end's note says: `farEndNote` exists only when its day is not the
      // one the strip above shows, and its word comes from the same table
      // as the labels.
      await expect(
        page.getByText(/^Dropoff (Mon|Tue|Wed|Thu|Fri|Sat|Sun) /),
      ).toHaveCount(0);
      await expect(
        page.getByRole("radio", { name: dayCellLabel(startDate) }),
      ).toHaveAttribute("aria-selected", "true");
    });

    await test.step("a chip commits another mode, and the board wears that", async () => {
      // The chip renames the fields and never gates them (D2): the hire's
      // two ends stay where they are while the mode changes, so the field
      // the hire called `Pickup at` is a train's `Arrives at` over the
      // same where — one leg, two vocabularies, and the words come from
      // the one table.
      await page.getByRole("radio", { name: "Train" }).click();
      await expect(
        page.getByRole("textbox", { name: "Arrives at" }),
      ).toHaveValue(pickupWhere);
      await page.getByRole("button", { name: "Save changes" }).click();
      // The save dismisses, and where it dismisses to is not this test's
      // claim: a cold-loaded form has no stack behind it, so
      // `useDismiss` falls back (`hooks/useDismiss.ts`) instead of
      // returning to a board it never came from. The board is asked for
      // by URL, and the chip it wears is the mode the press committed.
      await page.goto(`/trips/travel?id=${tripId}`);
      await expect(
        page
          .getByRole("button")
          .filter({ hasText: memberName })
          .filter({ hasText: "Train" }),
      ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
    });

    await test.step("the same hire's other direction reads pickup then dropoff", async () => {
      // A hire's pickup is always the arrival-side end and its dropoff the
      // departure-side one, so the arrival-side pair leads whichever way the
      // row faces. On a *departure* row that pair is the far one, so the
      // pickup has to read above the dropoff — the only row whose order
      // differs from "the row's own end leads", and the reason the board's
      // half of this hire is not enough. Nothing in the Vitest suite has a
      // renderer, so two fields' order is only assertable here, as geometry.
      const departureTravelId = await seedTravelViaAPI(
        request,
        token,
        tripId,
        memberId,
        "departure",
        { departureTime: dropoffIso(), arrivalTime: pickupIso() },
        dropoffWhere,
        { mode: "rental", farLocation: pickupWhere },
      );
      await page.goto(
        `/trips/travel/form?id=${tripId}&travel=${departureTravelId}`,
      );
      await expect(page.getByText("Edit travel", { exact: true })).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(page.getByRole("radio", { name: "Rental" })).toHaveAttribute(
        "aria-selected",
        "true",
        { timeout: NAVIGATION_TIMEOUT },
      );
      // The own end of a departure row is the departure column, which a hire
      // calls `Dropoff at`; the far end is the pickup the record holds.
      const pickupField = page.getByRole("textbox", { name: "Pickup at" });
      const dropoffField = page.getByRole("textbox", { name: "Dropoff at" });
      await expect(pickupField).toHaveValue(pickupWhere, {
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(dropoffField).toHaveValue(dropoffWhere);
      const [pickupBox, dropoffBox] = await Promise.all([
        pickupField.boundingBox(),
        dropoffField.boundingBox(),
      ]);
      expect(pickupBox).not.toBeNull();
      expect(dropoffBox).not.toBeNull();
      expect(pickupBox?.y ?? 0).toBeLessThan(dropoffBox?.y ?? 0);
    });
  });
});
