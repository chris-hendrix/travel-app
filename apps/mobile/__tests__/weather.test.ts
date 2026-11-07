import { describe, expect, it } from "vitest";
import type {
  DailyForecastExtended,
  HourlyForecast,
} from "@journiful/shared/types";
import { formatDay } from "@/lib/dateRange";
import {
  celsiusToFahrenheit,
  compassWord,
  conditionWord,
  dayStep,
  fahrenheitToCelsius,
  forecastUpdatedWording,
  formatTemp,
  formatWind,
  hourlySampleForDay,
  kmhToMph,
  prepareWeatherDays,
  weatherAvailable,
  type WeatherTripInput,
} from "@/lib/weather";

const TODAY = "2026-10-11";

function trip(overrides: Partial<WeatherTripInput> = {}): WeatherTripInput {
  return {
    destinationLat: 41.9,
    destinationLon: 12.5,
    startDate: TODAY,
    endDate: "2026-10-18",
    ...overrides,
  };
}

function daily(
  date: string,
  overrides: Partial<DailyForecastExtended> = {},
): DailyForecastExtended {
  return {
    date,
    weatherCode: 0,
    temperatureMax: 24,
    temperatureMin: 17,
    precipitationProbability: 10,
    sunrise: "06:12",
    sunset: "19:48",
    windSpeedMax: 18,
    windDirectionDominant: 315,
    uvIndexMax: 6,
    apparentTemperatureMax: 26,
    apparentTemperatureMin: 15,
    ...overrides,
  };
}

function hourly(
  time: string,
  overrides: Partial<HourlyForecast> = {},
): HourlyForecast {
  return {
    time,
    temperature: 20,
    weatherCode: 1,
    windSpeed: 10,
    humidity: 55,
    uvIndex: 3,
    dewPoint: 12,
    precipitationProbability: 5,
    ...overrides,
  };
}

describe("weatherAvailable", () => {
  it("passes for a trip with coords and in-window dates", () => {
    expect(weatherAvailable(trip(), TODAY)).toBe(true);
  });

  it("refuses when latitude is null", () => {
    expect(weatherAvailable(trip({ destinationLat: null }), TODAY)).toBe(
      false,
    );
  });

  it("refuses when longitude is undefined", () => {
    expect(weatherAvailable(trip({ destinationLon: undefined }), TODAY)).toBe(
      false,
    );
  });

  it("refuses when coords are both missing", () => {
    expect(
      weatherAvailable(
        trip({ destinationLat: null, destinationLon: null }),
        TODAY,
      ),
    ).toBe(false);
  });

  it("refuses when the start date is an empty string", () => {
    expect(weatherAvailable(trip({ startDate: "" }), TODAY)).toBe(false);
  });

  it("refuses when the start date is null", () => {
    expect(weatherAvailable(trip({ startDate: null }), TODAY)).toBe(false);
  });

  it("refuses when the start date is undefined", () => {
    expect(weatherAvailable(trip({ startDate: undefined }), TODAY)).toBe(
      false,
    );
  });

  it("refuses a trip wholly in the past", () => {
    expect(
      weatherAvailable(
        trip({ startDate: "2026-10-01", endDate: "2026-10-05" }),
        TODAY,
      ),
    ).toBe(false);
  });

  it("refuses when the start is more than 16 days out", () => {
    expect(
      weatherAvailable(
        trip({ startDate: "2026-10-29", endDate: "2026-11-05" }),
        TODAY,
      ),
    ).toBe(false);
  });

  it("admits a start exactly 16 days out", () => {
    // Oct 11 + 16 days = Oct 27.
    expect(
      weatherAvailable(
        trip({ startDate: "2026-10-27", endDate: "2026-11-02" }),
        TODAY,
      ),
    ).toBe(true);
  });

  it("refuses a start 17 days out", () => {
    expect(
      weatherAvailable(
        trip({ startDate: "2026-10-28", endDate: "2026-11-03" }),
        TODAY,
      ),
    ).toBe(false);
  });

  it("passes without an end date when the start is in window", () => {
    expect(weatherAvailable(trip({ endDate: null }), TODAY)).toBe(true);
  });
});

describe("conditionWord", () => {
  it.each([
    [0, "Sunny"],
    [1, "Mostly Sunny"],
    [2, "Partly Cloudy"],
    [3, "Overcast"],
    [45, "Fog"],
    [48, "Fog"],
    [51, "Drizzle"],
    [55, "Drizzle"],
    [57, "Drizzle"],
    [61, "Rain"],
    [65, "Rain"],
    [66, "Rain"],
    [80, "Rain"],
    [82, "Rain"],
    [71, "Snow"],
    [75, "Snow"],
    [77, "Snow"],
    [85, "Snow"],
    [86, "Snow"],
    [95, "Storm"],
    [96, "Storm"],
    [99, "Storm"],
  ])("maps WMO code %i to %s", (code, word) => {
    expect(conditionWord(code)).toBe(word);
  });

  it("falls back for an unknown code", () => {
    expect(conditionWord(999)).toBe("Unknown");
    expect(conditionWord(4)).toBe("Unknown");
  });
});

describe("compassWord", () => {
  it.each([
    [0, "N"],
    [45, "NE"],
    [90, "E"],
    [135, "SE"],
    [180, "S"],
    [225, "SW"],
    [270, "W"],
    [315, "NW"],
  ])("maps %i° to %s", (degrees, word) => {
    expect(compassWord(degrees)).toBe(word);
  });

  it("holds N just inside its bounds", () => {
    expect(compassWord(22.4)).toBe("N");
    expect(compassWord(337.5)).toBe("N");
    expect(compassWord(360)).toBe("N");
  });

  it("tips to NE and NW just outside N's bounds", () => {
    expect(compassWord(22.5)).toBe("NE");
    expect(compassWord(337.4)).toBe("NW");
  });

  it("wraps negative degrees", () => {
    expect(compassWord(-45)).toBe("NW");
  });
});

describe("temperature converters", () => {
  it("converts freezing and boiling exactly", () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(100)).toBe(212);
    expect(fahrenheitToCelsius(32)).toBe(0);
    expect(fahrenheitToCelsius(212)).toBe(100);
  });

  it("rounds to integers", () => {
    expect(celsiusToFahrenheit(21.6)).toBe(71);
    expect(fahrenheitToCelsius(70)).toBe(21);
  });

  it("formats in the viewer's unit", () => {
    expect(formatTemp(0, "celsius")).toBe("0°");
    expect(formatTemp(0, "fahrenheit")).toBe("32°");
    expect(formatTemp(24, "celsius")).toBe("24°");
  });
});

describe("wind converters", () => {
  it("converts km/h to mph as integers", () => {
    expect(kmhToMph(0)).toBe(0);
    expect(kmhToMph(10)).toBe(6);
    expect(kmhToMph(18)).toBe(11);
  });

  it("reads 0 as Calm in either unit", () => {
    expect(formatWind(0, "celsius")).toBe("Calm");
    expect(formatWind(0, "fahrenheit")).toBe("Calm");
  });

  it("formats in the viewer's unit", () => {
    expect(formatWind(18, "celsius")).toBe("18 km/h");
    expect(formatWind(18, "fahrenheit")).toBe("11 mph");
  });
});

describe("prepareWeatherDays", () => {
  it("drops past days but keeps today", () => {
    const rows = prepareWeatherDays(
      [daily("2026-10-10"), daily("2026-10-11"), daily("2026-10-12")],
      TODAY,
    );
    expect(rows.map((row) => row.date)).toEqual([
      "2026-10-11",
      "2026-10-12",
    ]);
  });

  it("fields each row with the shared day label and condition", () => {
    const rows = prepareWeatherDays(
      [daily("2026-10-11", { weatherCode: 61 })],
      TODAY,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      date: "2026-10-11",
      label: "Sun Oct 11",
      condition: "Rain",
      high: 24,
      low: 17,
      precipitationProbability: 10,
    });
    expect(rows[0]?.label).toBe(formatDay("2026-10-11"));
  });
});

describe("hourlySampleForDay", () => {
  const day = "2026-10-11";
  const fullDay = [6, 9, 12, 15, 18, 21, 0, 3].map((hour) =>
    hourly(`${day}T${String(hour).padStart(2, "0")}:00`),
  );

  it("returns exactly the six profile hours", () => {
    const rows = hourlySampleForDay(fullDay, day);
    expect(rows.map((row) => row.time)).toEqual([
      `${day}T06:00`,
      `${day}T09:00`,
      `${day}T12:00`,
      `${day}T15:00`,
      `${day}T18:00`,
      `${day}T21:00`,
    ]);
  });

  it("slices by day prefix and never leaks the neighbour day", () => {
    const rows = hourlySampleForDay(
      [...fullDay, hourly("2026-10-12T06:00")],
      "2026-10-12",
    );
    expect(rows.map((row) => row.time)).toEqual(["2026-10-12T06:00"]);
  });

  it("takes the first row at each hour when duplicates exist", () => {
    const rows = hourlySampleForDay(
      [
        hourly(`${day}T12:00`, { temperature: 21 }),
        hourly(`${day}T12:30`, { temperature: 22 }),
        hourly(`${day}T06:00`),
      ],
      day,
    );
    expect(rows.map((row) => row.time)).toEqual([
      `${day}T06:00`,
      `${day}T12:00`,
    ]);
    expect(rows[1]?.temperature).toBe(21);
  });

  it("renders what exists after a partial morning", () => {
    const afternoon = [12, 15, 18, 21].map((hour) =>
      hourly(`${day}T${String(hour).padStart(2, "0")}:00`),
    );
    const rows = hourlySampleForDay(afternoon, day);
    expect(rows.map((row) => row.time)).toEqual([
      `${day}T12:00`,
      `${day}T15:00`,
      `${day}T18:00`,
      `${day}T21:00`,
    ]);
  });
});

describe("dayStep", () => {
  const rows = [
    { date: "2026-10-11" },
    { date: "2026-10-12" },
    { date: "2026-10-13" },
  ];

  it("steps to the next day", () => {
    expect(dayStep(rows, "2026-10-11", 1)).toBe("2026-10-12");
  });

  it("steps to the previous day", () => {
    expect(dayStep(rows, "2026-10-13", -1)).toBe("2026-10-12");
  });

  it("returns null at the ends", () => {
    expect(dayStep(rows, "2026-10-13", 1)).toBeNull();
    expect(dayStep(rows, "2026-10-11", -1)).toBeNull();
  });

  it("returns null for an unknown date", () => {
    expect(dayStep(rows, "2026-10-20", 1)).toBeNull();
  });
});

describe("forecastUpdatedWording", () => {
  it("reads nothing when there is no fetch time", () => {
    expect(forecastUpdatedWording(null)).toBe("");
  });

  it("reads hours ago from fetchedAt", () => {
    const now = new Date("2026-10-11T12:00:00Z").getTime();
    expect(
      forecastUpdatedWording("2026-10-11T09:00:00Z", now),
    ).toBe("Forecast from 3 h ago");
  });

  it("reads a fresh fetch as just now", () => {
    const now = new Date("2026-10-11T12:00:00Z").getTime();
    expect(
      forecastUpdatedWording("2026-10-11T11:50:00Z", now),
    ).toBe("Forecast just now");
  });
});
