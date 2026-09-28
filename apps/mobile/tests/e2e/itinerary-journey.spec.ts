/**
 * E2E Journey: Itinerary event CRUD (mobile).
 *
 * The one critical flow: seed a trip via API, create a meal event
 * through the UI (typed place, all-day), edit its name, delete it,
 * reload and confirm it is gone (soft delete + list refetch proves a
 * server round-trip, not cache).
 *
 * The trip is seeded via API (`POST /api/trips` — the invitation
 * spec's seed flow) rather than the trip spec's UI creation, to keep
 * this spec to the one event flow the plan names ("create a trip,
 * create a meal event…"). Auth is seeded via `seedUserViaAPI` +
 * `seedPageWithToken` (helpers/auth.ts + the invitation spec's
 * token-arming mechanic). Selectors are `getByRole`/`getByText` only;
 * every selector names the screen file and line-shape it matches in a
 * comment.
 *
 * Place entry is typed text committed through the typed row, never a
 * static suggestion pick: CI carries no Places key (plan Assumptions),
 * so the picker degrades to the typed row with no network — that
 * degradation is the path asserted here, not a flake. `EventDialog`'s
 * `Dropdown` (`components/trip/EventDialog.tsx`) also sets `freeText`,
 * so typing alone would commit via `onChange`
 * (`components/ui/Dropdown.tsx` — `if (freeText) onChange(v)`), but the
 * spec picks the typed row explicitly to prove it exists: if the typed
 * row is missing, the spec failing is the signal wanted. The typed
 * string contains no live place name, so no Google row can steal the
 * tap.
 *
 * Times are the All-day answer (`ChipToggle label="All day"` in
 * `EventDialog.tsx`): a timed event would need the `TimeField` slot
 * column (`components/ui/TimeField.tsx`), which is scroll-position
 * dependent — the all-day path exercises the same create/edit/delete
 * round-trip without it.
 *
 * TODO (parked): Deleted-items
 * restore has no UI surface (`includeDeleted` stays off —
 * `lib/queries/events.ts`), so there is no restore spec here — add one
 * once the UI exists.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  generateUniquePhone,
  seedUserViaAPI,
  uniqueLabel,
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

/** Seed a trip through the real create endpoint. Returns id + start. */
async function seedTripViaAPI(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<{ id: string; startDate: string }> {
  // POST /api/trips — body mirrors createTripSchema
  // (shared/schemas/trip.ts): name, destination, timezone required.
  // Response is CreateTripResponse: {success, trip: {id, ...}} (the
  // shape lib/queries/trips.ts:createTrip reads as body.trip).
  const startDate = isoIn(30);
  const res = await request.post(`${API_BASE}/trips`, {
    data: {
      name,
      destination: "Mallorca, Spain",
      timezone: "America/Chicago",
      startDate,
      endDate: isoIn(35),
    },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`create-trip failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { trip: { id: string } };
  return { id: body.trip.id, startDate };
}

/** Find a live event id by name (create response id is optimistic-only). */
async function findEventId(
  request: APIRequestContext,
  token: string,
  tripId: string,
  name: string,
): Promise<string> {
  // GET /trips/:tripId/events — {success, events: [{id, name, ...}]}
  // (lib/queries/events.ts:GetEventsResponse).
  const res = await request.get(`${API_BASE}/trips/${tripId}/events`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`list-events failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    events: Array<{ id: string; name: string }>;
  };
  const row = body.events.find((e) => e.name === name);
  if (!row) {
    throw new Error(`event ${JSON.stringify(name)} not in list`);
  }
  return row.id;
}

test.describe("Itinerary Journey", () => {
  test("create meal event → edit name → delete → reload confirms gone", async ({
    page,
    request,
  }) => {
    const tripName = uniqueLabel("E2E Itinerary");
    const eventName = uniqueLabel("Harbour dinner");
    const editedName = `${eventName} feast`;
    // Free text committed through the typed row (see header): a string
    // no live row contains, so no suggestion row can steal the tap.
    // The typed row's label is the query in quotes
    // (placePickerRows in lib/queries/places.ts).
    const placeText = uniqueLabel("Konoba Free Text");
    let tripId: string;
    let tripStart: string;
    let token: string;

    await test.step("seed a session and a trip via API", async () => {
      // Documented in-spec per the plan: the trip is seeded, not
      // UI-created, so this spec runs the one event flow only.
      ({ token } = await seedUserViaAPI(
        request,
        generateUniquePhone(),
        "Itinerary Host",
      ));
      ({ id: tripId, startDate: tripStart } = await seedTripViaAPI(
        request,
        token,
        tripName,
      ));
    });

    await test.step("open the add-event form from the trip detail", async () => {
      // The seeded token is written into localStorage before boot
      // (helpers/auth.ts AUTH_TOKEN_KEY + the invitation spec's
      // addInitScript arming), then the app restores via GET /auth/me.
      await page.addInitScript(
        ({ key, value }) => {
          try {
            if (!localStorage.getItem(key)) {
              localStorage.setItem(key, value);
            }
          } catch {
            // Private-mode storage failure: the app treats a missing
            // token as signed-out, so the spec fails at its guard
            // assertion rather than here.
          }
        },
        { key: "journiful.authToken", value: token },
      );
      await page.goto(`/trips/detail?id=${tripId}`);
      // app/trips/detail.tsx: the header renders the trip title as
      // display text. .last(): the app header echoes the same title
      // in a hidden element (the trip spec's established pattern).
      await expect(page.getByText(tripName).last()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      // The trip was seeded by this user, who is the organizer
      // server-side, so the trip page's action block renders with its
      // organizer contents. Its verbs are shut inside the trigger
      // (components/ui/DisclosureButton.tsx), so that is pressed first:
      // Button titled "Add event" routes to /trips/events/new?id=….
      await page.getByRole("button", { name: "Trip actions" }).click();
      await page.getByRole("button", { name: "Add event" }).click();
      await page.waitForURL("**/trips/events/new?id=*", {
        timeout: NAVIGATION_TIMEOUT,
      });
      // app/trips/events/new.tsx: EventDialog with TextField
      // label="Event name". The FullscreenDialog title text matches
      // a hidden app-header echo on web (seen in the failure DOM:
      // the first "Add event" match is hidden), so the name field
      // is the mount proof instead.
    });

    await test.step("fill name, typed place, day, all-day", async () => {
      // components/trip/EventDialog.tsx: TextField label="Event name".
      // pressSequentially, not fill: the trip/auth specs' input lesson
      // — fill() desynchronizes controlled RN inputs.
      const nameInput = page.getByRole("textbox", { name: "Event name" });
      await expect(nameInput).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      await nameInput.click();
      await nameInput.pressSequentially(eventName);

      // components/trip/EventDialog.tsx: Dropdown label="Location" with
      // live suggestions plus the typed row (placePickerRows) and
      // freeText — typing commits the value through onChange
      // (components/ui/Dropdown.tsx), and picking the typed row
      // commits the same typed prose explicitly. CI has no Places key,
      // so the lookup degrades to the typed row with no network.
      const locationInput = page.getByRole("textbox", { name: "Location" });
      await locationInput.click();
      await locationInput.pressSequentially(placeText);
      await page
        .getByRole("button", { name: `"${placeText}"`, exact: true })
        .click();

      // components/trip/EventDialog.tsx: ChipToggle label="All day"
      // beside the Day head — a badge-backed Pressable
      // (components/ui/ChipToggle.tsx), so its name is its text.
      // All-day means validateNewEvent needs no clock times
      // (lib/newEvent.ts), so the TimeField slot columns stay shut.
      await page.getByText("All day").click();

      // components/trip/EventDialog.tsx: DatePicker single, bounded
      // by the trip's own dates (min=trip.startDate). The cursor opens
      // on the min month (components/ui/DatePicker.tsx — monthOf(min)),
      // so the trip's start day cell is already on screen.
      // components/ui/DatePicker.tsx Day: role="button" named by its
      // ISO date (aria-label={iso}).
      await page.getByRole("button", { name: tripStart }).click();
    });

    await test.step("submit and see the event on the trip", async () => {
      // components/trip/EventDialog.tsx via FullscreenDialog:
      // primaryTitle="Add event" (ActionBar → Button). Success
      // dismisses to the trip detail. .last(): the dialog title text
      // matches the header echo too.
      await page.getByRole("button", { name: "Add event" }).last().click();
      await page.waitForURL("**/trips/detail?id=*", {
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
      // The new event card carries its name (EventCard); exact:true —
      // role/text matching is substring by default and the edited name
      // below extends this one.
      await expect(
        page.getByText(eventName, { exact: true }).first(),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
    });

    await test.step("edit the event name", async () => {
      const eventId = await findEventId(request, token, tripId, eventName);
      // app/trips/events/edit.tsx reads ?id= (trip) + ?event= (event)
      // (useLocalSearchParams); editing through the route rather than
      // the card tap keeps this spec on the form, not on card hit
      // areas.
      await page.goto(`/trips/events/edit?id=${tripId}&event=${eventId}`);
      // components/trip/EventDialog.tsx title="Edit event" matches a
      // hidden app-header echo on web (same as the add form above),
      // so the prefilled field is the mount proof.
      // TextField label="Event name" prefilled from draftFromEvent —
      // the prefilled value proves the form mounted with the event.
      // Append rather than replace: avoids clear-and-refill desync on
      // the controlled input (the trip spec's edit lesson).
      const editInput = page.getByRole("textbox", { name: "Event name" });
      await expect(editInput).toHaveValue(eventName, {
        timeout: ELEMENT_TIMEOUT,
      });
      await editInput.click();
      // Phone width (390px) narrows the field, so the click can land
      // mid-string; End puts the caret where the append means it.
      await editInput.press("End");
      await editInput.pressSequentially(" feast");
      // EventDialog primaryTitle="Save changes"; success dismisses
      // via useDismiss (hooks/useDismiss.ts) — router.back() when
      // history exists, so from this spec's direct goto it lands on
      // the trip detail, not the event detail.
      await page.getByRole("button", { name: "Save changes" }).click();
      // Success dismisses via useDismiss (router.back()): the landing
      // page depends on history depth (the failure screenshot caught
      // it on /trips), so wait only for leaving the form, then drive
      // to the detail explicitly and assert there.
      await page.waitForURL(
        (url) => !url.pathname.includes("events/edit"),
        { timeout: SLOW_NAVIGATION_TIMEOUT },
      );
      await page.goto(`/trips/detail?id=${tripId}`);
      await expect(
        page.getByText(editedName, { exact: true }).first(),
      ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
    });

    await test.step("delete the event", async () => {
      const eventId = await findEventId(request, token, tripId, editedName);
      await page.goto(`/trips/events/edit?id=${tripId}&event=${eventId}`);
      // Mount proof is the prefilled field (title echo is hidden —
      // see the add-form note above).
      await expect(
        page.getByRole("textbox", { name: "Event name" }),
      ).toHaveValue(editedName, { timeout: NAVIGATION_TIMEOUT });
      // components/trip/EventDialog.tsx: dangerTitle="Delete event"
      // (FullscreenDialog foot). Soft delete, no confirmation — the
      // edit screen replaces to the trip detail (edit.tsx tripHref).
      await page.getByRole("button", { name: "Delete event" }).click();
      await page.waitForURL("**/trips/detail?id=*", {
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
      // The card is gone from the itinerary section.
      await expect(
        page.getByText(editedName, { exact: true }),
      ).toHaveCount(0, { timeout: ELEMENT_TIMEOUT });
    });

    await test.step("reload and confirm it is still gone", async () => {
      // Reload re-fetches the events list from the server (the seeded
      // token survives in localStorage), so the absence proves a
      // server round-trip rather than an optimistic cache value.
      await page.reload();
      await expect(page.getByText(tripName).last()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(
        page.getByText(editedName, { exact: true }),
      ).toHaveCount(0, { timeout: ELEMENT_TIMEOUT });
    });
  });
});
