/**
 * E2E Journey: saved places (mobile).
 *
 * Critical flow: core value-delivery — the trip's shared library of
 * spots, typed words only. Two tests, one flow: the organizer saves a
 * typed place, edits its note, and a cold reload still reads it — and
 * the organizer pins a typed place, which leads the grid and narrows
 * through the Pinned chip.
 *
 * Typed, never a suggestion pick: CI carries no GOOGLE_MAPS_API_KEY, so
 * the picker degrades to the typed row — the same degradation the trip
 * create form relies on (`trip-journey.spec.ts`). A string no live row
 * can contain, so no Google row can steal the tap.
 *
 * Auth is seeded via `seedUserViaAPI` + `armSession` (helpers/auth.ts):
 * the trip's creator is the organizer server-side, and therefore also
 * the author of what they save. Selectors are `getByRole`/`getByText`
 * only, every one naming the screen file and line-shape it matches in
 * a comment.
 */

import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  armSession,
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
import { seedTripViaAPI } from "./helpers/trip";

/**
 * Save one typed place through the real form and land back on the list.
 * Assumes the reader is already on the list (`/trips/places?id=…`).
 */
async function saveTypedPlaceViaUI(
  page: Page,
  tripId: string,
  placeName: string,
  note?: string,
): Promise<void> {
  // app/trips/places.tsx (TripPlacesDialog): the dialog's one verb is
  // the ActionBar primary "Add place", which routes to the form.
  await page.getByRole("button", { name: "Add place" }).click();
  await page.waitForURL(`**/trips/places/form?id=${tripId}`, {
    timeout: NAVIGATION_TIMEOUT,
  });
  // components/trip/PlaceForm.tsx: Dropdown label="Where", freeText +
  // liveOptions. Type to open the list, then pick the typed row —
  // components/ui/SuggestionList.tsx renders each row as role="button"
  // named by its label, and the typed row's label is the query in
  // quotes (lib/queries/places.ts `placePickerRows`). pressSequentially,
  // not fill: the auth spec's input lesson — fill() desynchronizes
  // controlled RN inputs.
  const whereInput = page.getByRole("textbox", { name: "Where" });
  await expect(whereInput).toBeVisible({ timeout: ELEMENT_TIMEOUT });
  await whereInput.click();
  await whereInput.pressSequentially(placeName);
  await page
    .getByRole("button", { name: `"${placeName}"`, exact: true })
    .click();
  await expect(whereInput).toHaveValue(placeName, {
    timeout: ELEMENT_TIMEOUT,
  });
  if (note !== undefined) {
    // components/trip/PlaceForm.tsx: TextField label="Notes".
    const noteInput = page.getByRole("textbox", { name: "Notes" });
    await noteInput.click();
    await noteInput.pressSequentially(note);
  }
  // app/trips/places/form.tsx: FullscreenDialog primaryTitle="Save
  // place" for a create; success walks to the list. .last(): the
  // dismissed form stays in the tree while the route resolves and it
  // renders the same verb (the travel spec's "Add travel" lesson).
  await page.getByRole("button", { name: "Save place" }).last().click();
  await page.waitForURL(`**/trips/places?id=${tripId}`, {
    timeout: SLOW_NAVIGATION_TIMEOUT,
  });
  // components/trip/PlaceCard.tsx: the grid carries the card, a
  // PhotoCard pressable with no button role — the card reads as one
  // text node (badges, byline, name), so the name's text is the card.
  // A tap on it bubbles to the card's own onPress.
  await expect(page.getByText(placeName)).toBeVisible({
    timeout: NAVIGATION_TIMEOUT,
  });
}

/** The server's names for the trip, read back through the real endpoint. */
async function savedPlaceNamesViaAPI(
  request: APIRequestContext,
  token: string,
  tripId: string,
): Promise<string[]> {
  const res = await request.get(`${API_BASE}/trips/${tripId}/saved-places`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(
      `list-saved-places failed: ${res.status()} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { savedPlaces: { name: string }[] };
  return body.savedPlaces.map((row) => row.name);
}

test.describe("Places Journey", () => {
  test("save a typed place, edit its note, and it survives a cold reload", async ({
    page,
    request,
  }) => {
    const tripName = uniqueLabel("E2E Places");
    const placeName = uniqueLabel("Beach behind the hotel");
    const note = uniqueLabel("E2E place note");
    const editedNote = `${note} at sunset`;

    let tripId: string;
    let token: string;

    await test.step("seed the organizer and their trip", async () => {
      // Seeded the way the trip suite seeds its organizers: a real
      // signup through the auth endpoints, its token armed into
      // localStorage (helpers/auth.ts) ahead of the first goto; the
      // trip through POST /api/trips, whose creator is the organizer.
      ({ token } = await seedUserViaAPI(
        request,
        generateUniquePhone(),
        "Places Host",
      ));
      await armSession(page, token);
      ({ id: tripId } = await seedTripViaAPI(request, token, tripName));
    });

    await test.step("open the Places door", async () => {
      await page.goto(`/trips/detail?id=${tripId}`);
      // app/trips/detail.tsx: the hero's row of QuietActions ends in
      // "Places", which pushes /trips/places?id=….
      await expect(page.getByText(tripName).last()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await page.getByRole("button", { name: "Places" }).click();
      await page.waitForURL(`**/trips/places?id=${tripId}`, {
        timeout: NAVIGATION_TIMEOUT,
      });
      // components/trip/SavedPlaces.tsx: the empty library invites the
      // reader to the Add button — the copy that proves the list
      // resolved empty rather than still loading.
      await expect(page.getByText("Nothing saved yet.")).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
    });

    await test.step("save a typed place with a note", async () => {
      await saveTypedPlaceViaUI(page, tripId, placeName, note);
    });

    await test.step("the card wears the Other badge and Saved by You", async () => {
      // components/trip/PlaceCard.tsx: the overlay badges read through
      // EVENT_TYPE_LABEL, so a typed place (`misc`) wears "Other"; the
      // byline compares createdBy to the viewer's user id, so the
      // organizer's own row says "You". Scoped to the card: the type
      // chips elsewhere on the screen can carry the same words.
      // The card's PhotoCard pressable carries no button role, so the
      // badges are read at page level by exact text: "Other" twice —
      // the type chip in the radiogroup plus the card's own badge — and
      // "Saved by You" once, the card's byline (nothing else on the
      // list carries either sentence).
      await expect(page.getByText(placeName)).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
      await expect(
        page
          .getByRole("radiogroup", { name: "Type of place" })
          .getByText("Other"),
      ).toBeVisible();
      await expect(page.getByText("Other", { exact: true })).toHaveCount(2);
      await expect(
        page.getByText("Saved by You", { exact: true }),
      ).toBeVisible();
    });

    await test.step("open the card and edit the note", async () => {
      await page.getByText(placeName).click();
      await page.waitForURL(`**/trips/places/detail?id=${tripId}&place=*`, {
        timeout: NAVIGATION_TIMEOUT,
      });
      // app/trips/places/detail.tsx: FullscreenDialog titled by the
      // row's name, primary "Edit place" for the author. .last(): the
      // app header echoes the same title in a hidden element (the trip
      // suite's detail lesson).
      await expect(page.getByText(placeName).last()).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
      // components/trip/PlaceDetail.tsx: the saver's note under the
      // "Notes" rule; the byline says "You" for the viewer.
      await expect(page.getByText(note)).toBeVisible();
      // .last(): the list's card stays mounted under the pushed detail
      // (the travel spec's "Add travel" lesson) and wears its own
      // byline — the sheet's is the later of the two.
      await expect(
        page.getByText("Saved by You", { exact: true }).last(),
      ).toBeVisible();
      // The dialog's bar is the only Edit: PlaceDetail keeps no second
      // verb at its foot but the organizer's pin.
      await page.getByRole("button", { name: "Edit place" }).click();
      await page.waitForURL(
        `**/trips/places/form?id=${tripId}&place=*`,
        { timeout: NAVIGATION_TIMEOUT },
      );
      // app/trips/places/form.tsx: the form prefills from the section
      // read — the prefilled note proves the edit screen mounted with
      // the row. selectText + pressSequentially: replacing rather than
      // appending, without the clear-and-refill desync.
      const noteInput = page.getByRole("textbox", { name: "Notes" });
      await expect(noteInput).toHaveValue(note, {
        timeout: ELEMENT_TIMEOUT,
      });
      await noteInput.click();
      await noteInput.selectText();
      await noteInput.pressSequentially(editedNote);
      // …primaryTitle="Save changes" for an edit; success pops back to
      // the detail sheet the form came through.
      await page.getByRole("button", { name: "Save changes" }).last().click();
      await page.waitForURL(
        `**/trips/places/detail?id=${tripId}&place=*`,
        { timeout: SLOW_NAVIGATION_TIMEOUT },
      );
      await expect(page.getByText(editedNote)).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
    });

    await test.step("the server holds the edited row", async () => {
      await expect
        .poll(
          async () => savedPlaceNamesViaAPI(request, token, tripId),
          { timeout: NAVIGATION_TIMEOUT },
        )
        .toContain(placeName);
    });

    await test.step("a cold reload still reads the edited note", async () => {
      // Reload re-reads the detail from the server (the seeded token
      // survives in localStorage), so the edited note proves a server
      // round-trip rather than an optimistic cache value.
      await page.reload();
      await expect(page.getByText(editedNote)).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      // And the list still carries the card after the same round-trip.
      await page.goto(`/trips/places?id=${tripId}`);
      await expect(page.getByText(placeName)).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
    });
  });

  test("pin a typed place: it leads the grid and narrows through the chip", async ({
    page,
    request,
  }) => {
    const tripName = uniqueLabel("E2E Pin");
    const plainName = uniqueLabel("E2E Unpinned Cove");
    const pinnedName = uniqueLabel("E2E Pinned Point");

    let tripId: string;

    await test.step("seed the organizer and their trip, and open Places", async () => {
      const { token } = await seedUserViaAPI(
        request,
        generateUniquePhone(),
        "Pin Host",
      );
      await armSession(page, token);
      ({ id: tripId } = await seedTripViaAPI(request, token, tripName));
      await page.goto(`/trips/detail?id=${tripId}`);
      await expect(page.getByText(tripName).last()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await page.getByRole("button", { name: "Places" }).click();
      await page.waitForURL(`**/trips/places?id=${tripId}`, {
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(page.getByText("Nothing saved yet.")).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
    });

    await test.step("save two typed places; no Pinned chip while nothing is pinned", async () => {
      await saveTypedPlaceViaUI(page, tripId, plainName);
      await saveTypedPlaceViaUI(page, tripId, pinnedName);
      // components/trip/SavedPlaces.tsx: the Pinned chip renders only
      // when something is pinned (`hasAnyPinned`) — two cards and no
      // chip is the half of that rule a "visible after the pin"
      // assertion alone would not prove.
      await expect(
        page.getByRole("button", { name: "Pinned", exact: true }),
      ).toHaveCount(0);
    });

    await test.step("pin one of them from its detail", async () => {
      await page.getByText(pinnedName).click();
      await page.waitForURL(`**/trips/places/detail?id=${tripId}&place=*`, {
        timeout: NAVIGATION_TIMEOUT,
      });
      // components/trip/PlaceDetail.tsx: the organizer's one verb at
      // the foot is a design-system Button — "Pin to top" — the sheet
      // holding one place, so the label names its target alone. The
      // pin invalidates the list; the sheet repaints inverted.
      await page.getByRole("button", { name: "Pin to top" }).click();
      await expect(
        page.getByRole("button", { name: "Unpin" }),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
    });

    await test.step("back on the list, the pinned card leads and wears Pinned", async () => {
      await page.goto(`/trips/places?id=${tripId}`);
      // lib/savedPlaces.ts `orderedPlaces`: pinned cards first. Read in
      // DOM order — the grid's own order — not as geometry.
      // The card's PhotoCard pressable carries no button role, so the
      // lead is read as geometry (the travel spec's hire test does the
      // same): Grid.tsx fills row-wise — two across wide, one on a
      // phone — so first in DOM is above, or on the same row and left.
      await expect(page.getByText(pinnedName)).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(page.getByText(plainName)).toBeVisible();
      const pinnedBox = await page.getByText(pinnedName).boundingBox();
      const plainBox = await page.getByText(plainName).boundingBox();
      expect(pinnedBox).not.toBeNull();
      expect(plainBox).not.toBeNull();
      const pinnedAbove = pinnedBox!.y < plainBox!.y - 8;
      const sameRowLeft =
        Math.abs(pinnedBox!.y - plainBox!.y) <= 8 &&
        pinnedBox!.x < plainBox!.x;
      expect(pinnedAbove || sameRowLeft).toBe(true);
      // …and the Pinned badge is on the card: "Pinned" twice by exact
      // text — the chip the pin summoned plus the card's own badge.
      await expect(page.getByText("Pinned", { exact: true })).toHaveCount(2);
    });

    await test.step("the Pinned chip narrows the list to that card", async () => {
      // The chip the pin summoned: an independent toggle (role
      // button), not one of the exclusive type radios.
      await page
        .getByRole("button", { name: "Pinned", exact: true })
        .click();
      await expect(page.getByText(pinnedName)).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
      await expect(page.getByText(plainName)).toHaveCount(0);
    });
  });
});
