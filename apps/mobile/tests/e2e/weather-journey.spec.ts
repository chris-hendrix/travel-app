/**
 * E2E Journey: weather (mobile).
 *
 * Critical flow: core value-delivery — the trip's forecast, read from
 * the real Open-Meteo-backed endpoint through the Weather door: trip
 * page → list dialog → day-detail dialog → Prev/Next cycling → cold
 * day-URL load. One test, one flow: the door's visibility gate and the
 * Prev/Next stepping are what the renderer-less Vitest suite cannot
 * check (the places-journey #9 precedent class: a new domain whose
 * user-observable read spans page, dialog, and server cache).
 *
 * Seeding follows the journeys' own idiom (helpers/auth.ts for the
 * organizer, POST /api/trips like helpers/trip.ts `seedTripViaAPI`
 * but with near-term dates inside the 16-day window plus explicit
 * destinationLat/Lon so the Weather gate passes); the forecast itself
 * comes from the real `/trips/:id/weather` endpoint — no mocks.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
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

function isoIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Mirrors `formatDay` (`lib/dateRange.ts`): "Fri Mar 14". Replicated
 * here so the spec can name the rows the dialogs render without
 * importing app code into the Playwright run.
 */
function formatDay(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(year!, month! - 1, day!).getDay()];
  return `${weekday} ${MONTHS[month! - 1]} ${day}`;
}

/**
 * Seed a trip inside the forecast window with coordinates on it, so
 * the Weather door's gate passes. Same shape as `seedTripViaAPI`
 * (helpers/trip.ts — POST /api/trips, creator is the organizer), but
 * near-term dates plus explicit lat/lon: the shared seeder posts
 * +30/+35-day dates with no coords, which the gate refuses.
 */
async function seedWeatherTripViaAPI(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<{ id: string; startDate: string; endDate: string }> {
  const startDate = isoIn(1);
  const endDate = isoIn(5);
  const res = await request.post(`${API_BASE}/trips`, {
    data: {
      name,
      destination: "Miami, Florida",
      timezone: "America/New_York",
      startDate,
      endDate,
      destinationLat: 25.7617,
      destinationLon: -80.1918,
    },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`create-trip failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { trip: { id: string } };
  return { id: body.trip.id, startDate, endDate };
}

type WeatherEnvelope = {
  success: boolean;
  weather: {
    available: boolean;
    message?: string | null;
    forecasts: { date: string }[];
  };
};

/** The server's forecast dates through the real weather endpoint. */
async function forecastDatesViaAPI(
  request: APIRequestContext,
  token: string,
  tripId: string,
): Promise<string[]> {
  const res = await request.get(`${API_BASE}/trips/${tripId}/weather`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(
      `get-weather failed: ${res.status()} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as WeatherEnvelope;
  if (!body.weather.available) {
    throw new Error(
      `weather unavailable for seeded trip: ${body.weather.message ?? "no message"}`,
    );
  }
  return body.weather.forecasts.map((row) => row.date).sort();
}

test.describe("Weather Journey", () => {
  test("door opens the list, a row opens the day, Prev/Next cycles, a cold day URL lands", async ({
    page,
    request,
  }) => {
    const tripName = uniqueLabel("E2E Weather");

    let tripId: string;
    let token: string;
    let dates: string[] = [];

    await test.step("seed the organizer and a trip inside the forecast window", async () => {
      // Seeded the way the trip suite seeds its organizers: a real
      // signup through the auth endpoints, its token armed into
      // localStorage (helpers/auth.ts) ahead of the first goto; the
      // trip through POST /api/trips, whose creator is the organizer.
      ({ token } = await seedUserViaAPI(
        request,
        generateUniquePhone(),
        "Weather Host",
      ));
      await armSession(page, token);
      ({ id: tripId } = await seedWeatherTripViaAPI(
        request,
        token,
        tripName,
      ));
      // The real endpoint (Open-Meteo backed, 3 h cache): its dates are
      // the rows the list must render, and the days Prev/Next must step.
      dates = await forecastDatesViaAPI(request, token, tripId);
      expect(dates.length).toBeGreaterThanOrEqual(2);
    });

    const firstDate = dates[0]!;
    const secondDate = dates[1]!;
    const lastDate = dates[dates.length - 1]!;
    const firstLabel = formatDay(firstDate);
    const secondLabel = formatDay(secondDate);
    const lastLabel = formatDay(lastDate);

    await test.step("the Weather door opens the list of day rows", async () => {
      await page.goto(`/trips/detail?id=${tripId}`);
      // app/trips/detail.tsx: the hero's row of QuietActions ends in
      // "Weather" once the gate passes (coords + dates in the window).
      await expect(page.getByText(tripName).last()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await page.getByRole("button", { name: "Weather" }).click();
      await page.waitForURL(`**/trips/weather?id=${tripId}`, {
        timeout: NAVIGATION_TIMEOUT,
      });
      // app/trips/weather.tsx: one row per available day ("Fri Mar 14
      // · Sunny · 24°/17° · 10%"), footed by the fetchedAt wording.
      await expect(page.getByText(firstLabel)).toBeVisible({
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
      await expect(page.getByText(secondLabel)).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
      await expect(page.getByText(/Forecast (from|just now)/)).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
    });

    await test.step("a row press opens its day, Previous disabled at the start", async () => {
      // The row is a Pressable with accessibilityLabel "label,
      // condition" (app/trips/weather.tsx), so the label names it.
      await page.getByRole("button", { name: firstLabel }).click();
      await page.waitForURL(
        `**/trips/weather/detail?id=${tripId}&day=${firstDate}`,
        { timeout: NAVIGATION_TIMEOUT },
      );
      // app/trips/weather/detail.tsx: the title is the day's label
      // (.last(): the app header echoes the same title in a hidden
      // element — the trip suite's detail lesson), the hero reads the
      // high, the facts carry High, the hourly block is titled.
      await expect(page.getByText(firstLabel).last()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(
        page.getByText("High", { exact: true }),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      await expect(page.getByText("Hourly", { exact: true })).toBeVisible();
      await expect(page.getByText(/\d{2}:\d{2} · /).first()).toBeVisible();
      // The stepper disables at the ends by rendering plain text, not
      // a button (a wrap would read as an infinite list): on the first
      // day Previous is text, Next is a QuietAction.
      await expect(
        page.getByRole("button", { name: "Previous day" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Next day" }),
      ).toBeVisible();
    });

    await test.step("Next and Previous cycle the &day= param", async () => {
      await page.getByRole("button", { name: "Next day" }).click();
      await page.waitForURL(
        `**/trips/weather/detail?id=${tripId}&day=${secondDate}`,
        { timeout: NAVIGATION_TIMEOUT },
      );
      await expect(page.getByText(secondLabel).last()).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
      // Mid-list both ends step: Previous now resolves to a button.
      await expect(
        page.getByRole("button", { name: "Previous day" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Previous day" }).click();
      await page.waitForURL(
        `**/trips/weather/detail?id=${tripId}&day=${firstDate}`,
        { timeout: NAVIGATION_TIMEOUT },
      );
      await expect(page.getByText(firstLabel).last()).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
    });

    await test.step("stepping to the end disables Next", async () => {
      // Walk forward to the last forecast day through the same Next
      // the reader uses — each step replaces the &day= param.
      for (const date of dates.slice(1)) {
        await page.getByRole("button", { name: "Next day" }).click();
        await page.waitForURL(
          `**/trips/weather/detail?id=${tripId}&day=${date}`,
          { timeout: NAVIGATION_TIMEOUT },
        );
      }
      await expect(page.getByText(lastLabel).last()).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
      await expect(
        page.getByRole("button", { name: "Next day" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Previous day" }),
      ).toBeVisible();
    });

    await test.step("a cold load of a &day= detail URL lands on that day", async () => {
      // A full navigation straight at the record's address — no list
      // visit first — still reads the day from the server cache.
      const middleDate = dates[Math.floor(dates.length / 2)]!;
      const middleLabel = formatDay(middleDate);
      await page.goto(
        `/trips/weather/detail?id=${tripId}&day=${middleDate}`,
      );
      await expect(page.getByText(middleLabel).last()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(
        page.getByText("High", { exact: true }),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      await expect(page.getByText("Hourly", { exact: true })).toBeVisible();
    });
  });
});
