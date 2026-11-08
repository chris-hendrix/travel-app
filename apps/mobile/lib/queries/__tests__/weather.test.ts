/**
 * Specs for the trip weather query. CI carries no live forecast, so
 * everything stubs at the `@/lib/api` module boundary (the
 * `lib/queries/trips.ts` precedent) and asserts exact paths — never
 * live Open-Meteo.
 */

import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRequire } from "node:module";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const require = createRequire(import.meta.url);
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: unknown) => string;
};

import { QueryClientProvider } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { makeQueryClient } from "@/lib/queries/client";
import type { TripWeatherResponse } from "@journiful/shared/types";
import {
  tripWeatherOptions,
  useTripWeather,
  weatherKeys,
} from "@/lib/queries/weather";

const mockedApiFetch = vi.mocked(apiFetch);

/** The API's own weather payload, as `GET /trips/:id/weather` returns it. */
function apiWeather(): TripWeatherResponse {
  return {
    available: true,
    location: "Lisbon, Portugal",
    forecasts: [],
    hourly: [],
    fetchedAt: "2026-11-07T12:00:00.000Z",
  };
}

describe("tripWeatherOptions", () => {
  it("calls /trips/:id/weather and passes the weather through", async () => {
    mockedApiFetch.mockReset();
    const weather = apiWeather();
    mockedApiFetch.mockResolvedValue({ success: true, weather });

    const options = tripWeatherOptions("trip-1");
    expect(options.queryKey).toEqual(weatherKeys("trip-1"));

    const data = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1/weather");
    expect(data).toEqual(weather);
  });

  it("scopes the cache key per trip so one trip's forecast is never served to another", () => {
    expect(tripWeatherOptions("trip-1").queryKey).not.toEqual(
      tripWeatherOptions("trip-2").queryKey,
    );
  });
});

describe("useTripWeather", () => {
  it("reads loading with no trip, never an error flash", () => {
    mockedApiFetch.mockReset();
    const client = makeQueryClient();
    const seen: { value: ReturnType<typeof useTripWeather> | null } = {
      value: null,
    };
    function Probe() {
      seen.value = useTripWeather(undefined);
      return null;
    }
    function Wrapper() {
      return createElement(QueryClientProvider, { client }, createElement(Probe));
    }
    renderToString(createElement(Wrapper));

    expect(seen.value!.status).toBe("loading");
    expect(seen.value!.data).toBeUndefined();
    expect(typeof seen.value!.retry).toBe("function");
  });
});
