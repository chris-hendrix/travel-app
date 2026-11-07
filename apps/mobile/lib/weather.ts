/**
 * The weather's pure layer: gate, condition words, converters, day rows,
 * hourly sampling, day stepping, and the updated-foot wording.
 *
 * No React, no fetch, no react-native imports — node-importable like
 * `lib/savedPlaces.ts` and `lib/mapping.ts`, so all of it is
 * unit-testable in plain node (the mobile suite has no renderer).
 * Units arrive as an argument (the profile's `US`/`Metric` convention,
 * fahrenheit by default per `lib/mapping.ts` `toProfile`); this module
 * never reads the store.
 */

import type {
  DailyForecastExtended,
  HourlyForecast,
  TemperatureUnit,
} from "@journiful/shared/types";
import { addDays, formatDay } from "@/lib/dateRange";

/** The trip fields the gate reads — everything else stays on the page. */
export type WeatherTripInput = {
  destinationLat: number | null | undefined;
  destinationLon: number | null | undefined;
  startDate: string | null | undefined;
  endDate: string | null | undefined;
};

/** The Open-Meteo window the service cites (`weather.service.ts`). */
const MAX_FORECAST_DAYS = 16;

/**
 * Whether the trip page may show the Weather door. A conservative,
 * one-directional mirror of the service's refusals: no coords, no
 * dates, trip past, start beyond the 16-day window.
 *
 * `today` is already the destination-clock day (`todayIn(destination)`)
 * from the caller — never converted here. `""` dates and
 * null/undefined coords count as absent. A trip whose dates live only
 * on events hides the door (false negative); the gate never admits
 * what the server would refuse.
 */
export function weatherAvailable(
  trip: WeatherTripInput,
  today: string,
): boolean {
  if (trip.destinationLat == null || trip.destinationLon == null) return false;
  if (!trip.startDate) return false;
  if (trip.endDate && trip.endDate < today) return false;
  if (trip.startDate > addDays(today, MAX_FORECAST_DAYS)) return false;
  return true;
}

/**
 * The WMO code as one word — no icons, no colors. Unknown codes read
 * as "Unknown" rather than nothing.
 */
export function conditionWord(code: number): string {
  if (code === 0) return "Sunny";
  if (code === 1) return "Mostly Sunny";
  if (code === 2) return "Partly Cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (
    (code >= 61 && code <= 67) ||
    (code >= 80 && code <= 82)
  )
    return "Rain";
  if (
    (code >= 71 && code <= 77) ||
    code === 85 ||
    code === 86
  )
    return "Snow";
  if (code >= 95 && code <= 99) return "Storm";
  return "Unknown";
}

/**
 * The sky in two buckets: what a fair band wears versus a foul one.
 *
 * `conditionHue` (by WMO code) and `conditionHueForWord` (by the word
 * `conditionWord` already printed) agree with each other — the word form
 * exists because the list rows only carry the word, not the code.
 */
export type ConditionHue = "fair" | "foul";

/**
 * House twelve-hour clock: `${h}:${mm} AM/PM`, midnight `12 AM`, noon
 * `12 PM`, on-the-hour drops `:00` (`9 PM`).
 *
 * Accepts an ISO datetime (`2026-11-08T21:00`) or a bare `HH:MM`
 * (`06:12`, the shape the API's sunrise/sunset arrive in) — the time is
 * read as-is, never converted, because weather always runs on the
 * destination's clock. An unreadable input reads back unchanged.
 */
export function formatHour12(input: string): string {
  const time = input.includes("T") ? (input.split("T")[1] ?? "") : input;
  const [hourPart, minutePart] = time.slice(0, 5).split(":");
  const hours = Number(hourPart);
  const minutes = Number(minutePart ?? "0");
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return input;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return input;
  const period = hours < 12 ? "AM" : "PM";
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  if (minutes === 0) return `${hour} ${period}`;
  return `${hour}:${String(minutes).padStart(2, "0")} ${period}`;
}

/**
 * The WMO code as a band hue: the clear-sky buckets (Sunny, Mostly
 * Sunny, Partly Cloudy) read `fair` and wear the warm band; fog,
 * drizzle, rain, snow, storm, overcast, and unknown codes read `foul`
 * and wear the cool one. The word still classifies — the hue only
 * reinforces — per the palette's label-carries-it rule.
 */
export function conditionHue(code: number): ConditionHue {
  if (code === 0 || code === 1 || code === 2) return "fair";
  return "foul";
}

/**
 * `conditionHue` by the printed word, for rows that carry the word and
 * not the code. Fair is exactly the words the fair codes print as
 * (`Clear` included for callers that name code 0 that way); every other
 * word — including `Unknown` — is foul.
 */
export function conditionHueForWord(word: string): ConditionHue {
  if (
    word === "Clear" ||
    word === "Sunny" ||
    word === "Mostly Sunny" ||
    word === "Partly Cloudy"
  )
    return "fair";
  return "foul";
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** Degrees (0–360) as an eight-point compass word. */
export function compassWord(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.floor((normalized + 22.5) / 45) % 8;
  return COMPASS[index] ?? "N";
}

/** Celsius to whole Fahrenheit. */
export function celsiusToFahrenheit(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32);
}

/** Fahrenheit to whole Celsius. */
export function fahrenheitToCelsius(fahrenheit: number): number {
  return Math.round(((fahrenheit - 32) * 5) / 9);
}

/**
 * The API's Celsius reading in the viewer's unit — the numeral plus
 * one degree mark, e.g. "24°" / "75°".
 */
export function formatTemp(celsius: number, unit: TemperatureUnit): string {
  const value =
    unit === "fahrenheit" ? celsiusToFahrenheit(celsius) : Math.round(celsius);
  return `${value}°`;
}

/** km/h to whole mph. */
export function kmhToMph(kmh: number): number {
  return Math.round(kmh / 1.609344);
}

/**
 * The API's km/h reading in the viewer's unit — "Calm" at 0, otherwise
 * e.g. "18 km/h" / "11 mph".
 */
export function formatWind(kmh: number, unit: TemperatureUnit): string {
  if (kmh === 0) return "Calm";
  return unit === "fahrenheit"
    ? `${kmhToMph(kmh)} mph`
    : `${Math.round(kmh)} km/h`;
}

/** One day row in the weather list dialog. */
export type WeatherDayRow = {
  date: string;
  /** `formatDay(date)` — the same format the detail title uses. */
  label: string;
  condition: string;
  /** Raw Celsius; the screen reads `formatTemp`. */
  high: number;
  /** Raw Celsius; the screen reads `formatTemp`. */
  low: number;
  precipitationProbability: number;
};

/**
 * The list dialog's rows: past days dropped (the service only refuses
 * trips wholly past), the rest in the order they arrived. A trip longer
 * than the window simply ends — no footnote.
 */
export function prepareWeatherDays(
  forecasts: readonly DailyForecastExtended[],
  today: string,
): WeatherDayRow[] {
  return forecasts
    .filter((forecast) => forecast.date >= today)
    .map((forecast) => ({
      date: forecast.date,
      label: formatDay(forecast.date),
      condition: conditionWord(forecast.weatherCode),
      high: forecast.temperatureMax,
      low: forecast.temperatureMin,
      precipitationProbability: forecast.precipitationProbability,
    }));
}

/** The day detail's six profile hours, destination-clock. */
const SAMPLE_HOURS = [6, 9, 12, 15, 18, 21] as const;

/**
 * Six rows for the day: slice by day prefix on `HourlyForecast.time`
 * (already in the destination zone — never converted here), then the
 * first row at each of 06/09/12/15/18/21. Robust to DST gaps and
 * partial mornings: a missing hour is skipped, not backfilled.
 */
export function hourlySampleForDay(
  hourly: readonly HourlyForecast[],
  day: string,
): HourlyForecast[] {
  const rows = hourly.filter((row) => row.time.slice(0, 10) === day);
  return SAMPLE_HOURS.flatMap((hour) => {
    const row = rows.find((candidate) => Number(candidate.time.slice(11, 13)) === hour);
    return row ? [row] : [];
  });
}

/**
 * The adjacent day in the list's rows for Prev/Next — `null` at the
 * ends (they disable, never wrap) and for a date outside the list.
 */
export function dayStep(
  rows: readonly { date: string }[],
  date: string,
  delta: 1 | -1,
): string | null {
  const index = rows.findIndex((row) => row.date === date);
  if (index === -1) return null;
  const next = rows[index + delta];
  return next ? next.date : null;
}

/**
 * The list foot from `fetchedAt`, rounded to hours — "Forecast from
 * 3 h ago", "Forecast just now" under an hour, "" when never fetched.
 */
export function forecastUpdatedWording(
  fetchedAt: string | null,
  nowMs: number = Date.now(),
): string {
  if (!fetchedAt) return "";
  const diffMs = nowMs - new Date(fetchedAt).getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return "";
  if (Math.round(diffMs / 3_600_000) < 1) return "Forecast just now";
  return `Forecast from ${Math.round(diffMs / 3_600_000)} h ago`;
}
