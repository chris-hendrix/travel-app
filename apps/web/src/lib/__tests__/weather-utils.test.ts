import { describe, it, expect, vi, afterEach } from "vitest";
import type { HourlyForecast } from "@journiful/shared/types";
import {
  windDegreesToCompass,
  uvIndexLevel,
  getHourlyForDay,
  getAnchorHourIndex,
} from "../weather-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal HourlyForecast stub with the given ISO time string. */
function hourly(time: string): HourlyForecast {
  return {
    time,
    temperature: 20,
    weatherCode: 0,
    windSpeed: 10,
    humidity: 50,
    uvIndex: 3,
    dewPoint: 12,
    precipitationProbability: 10,
  };
}

// ---------------------------------------------------------------------------
// windDegreesToCompass
// ---------------------------------------------------------------------------

describe("windDegreesToCompass", () => {
  it.each([
    [0, "N"],
    [90, "E"],
    [180, "S"],
    [270, "W"],
    [45, "NE"],
    [135, "SE"],
    [225, "SW"],
    [315, "NW"],
  ])("maps %d degrees to %s", (degrees, expected) => {
    expect(windDegreesToCompass(degrees)).toBe(expected);
  });

  it("treats 360 the same as 0 (North)", () => {
    expect(windDegreesToCompass(360)).toBe("N");
  });

  it("handles values greater than 360 via modulo", () => {
    expect(windDegreesToCompass(450)).toBe("E"); // 450 % 360 = 90
  });

  it("handles negative degrees", () => {
    expect(windDegreesToCompass(-90)).toBe("W"); // -90 → 270
  });
});

// ---------------------------------------------------------------------------
// uvIndexLevel
// ---------------------------------------------------------------------------

describe("uvIndexLevel", () => {
  it.each([
    [0, "Low"],
    [1, "Low"],
    [2, "Low"],
    [3, "Moderate"],
    [4, "Moderate"],
    [5, "Moderate"],
    [6, "High"],
    [7, "High"],
    [8, "Very High"],
    [9, "Very High"],
    [10, "Very High"],
    [11, "Extreme"],
    [15, "Extreme"],
  ])("returns %s for UV index %d", (index, expected) => {
    expect(uvIndexLevel(index)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// getHourlyForDay
// ---------------------------------------------------------------------------

describe("getHourlyForDay", () => {
  // Build a full two-day hourly dataset (every hour for 2026-04-16 and 2026-04-17)
  const allHours: HourlyForecast[] = [];
  for (let day = 16; day <= 17; day++) {
    for (let h = 0; h < 24; h++) {
      const hh = String(h).padStart(2, "0");
      allHours.push(hourly(`2026-04-${day}T${hh}:00`));
    }
  }

  it("returns 9 entries (every 3h + trailing midnight) when nextDate is provided", () => {
    const result = getHourlyForDay(allHours, "2026-04-16", "2026-04-17");
    expect(result).toHaveLength(9);
  });

  it("samples the correct 3-hour intervals", () => {
    const result = getHourlyForDay(allHours, "2026-04-16", "2026-04-17");
    const times = result.map((e) => e.time);
    expect(times).toEqual([
      "2026-04-16T00:00",
      "2026-04-16T03:00",
      "2026-04-16T06:00",
      "2026-04-16T09:00",
      "2026-04-16T12:00",
      "2026-04-16T15:00",
      "2026-04-16T18:00",
      "2026-04-16T21:00",
      "2026-04-17T00:00", // trailing midnight from next day
    ]);
  });

  it("returns 8 entries when nextDate is undefined (last forecast day)", () => {
    const result = getHourlyForDay(allHours, "2026-04-17");
    expect(result).toHaveLength(8);
    const lastTime = result[result.length - 1]!.time;
    expect(lastTime).toBe("2026-04-17T21:00");
  });

  it("returns empty array when no hourly data matches the date", () => {
    const result = getHourlyForDay(allHours, "2026-04-20");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getAnchorHourIndex
// ---------------------------------------------------------------------------

describe("getAnchorHourIndex", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const dayHours = [
    hourly("2026-04-16T00:00"),
    hourly("2026-04-16T03:00"),
    hourly("2026-04-16T06:00"),
    hourly("2026-04-16T09:00"),
    hourly("2026-04-16T12:00"),
    hourly("2026-04-16T15:00"),
    hourly("2026-04-16T18:00"),
    hourly("2026-04-16T21:00"),
    hourly("2026-04-17T00:00"),
  ];

  it("returns the index of the first slot at or after now", () => {
    vi.useFakeTimers();
    // 10:30 AM — the next 3h slot is 12:00 (index 4)
    vi.setSystemTime(new Date("2026-04-16T10:30:00"));
    expect(getAnchorHourIndex(dayHours, new Date())).toBe(4);
  });

  it("returns exact slot index when now falls exactly on a slot", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T06:00:00"));
    expect(getAnchorHourIndex(dayHours, new Date())).toBe(2);
  });

  it("returns 0 when now is before all slots", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T23:00:00"));
    expect(getAnchorHourIndex(dayHours, new Date())).toBe(0);
  });

  it("returns 0 when now is after all slots (fallback)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T02:00:00"));
    expect(getAnchorHourIndex(dayHours, new Date())).toBe(0);
  });

  it("returns last index when now is just before the last slot", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T23:59:00"));
    // The next slot at or after 23:59 is 2026-04-17T00:00 (index 8)
    expect(getAnchorHourIndex(dayHours, new Date())).toBe(8);
  });
});
