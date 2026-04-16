import type { HourlyForecast } from "@journiful/shared/types";

const COMPASS_DIRECTIONS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
] as const;

/** Map a wind direction in degrees (0-360) to a 16-point compass label. */
export function windDegreesToCompass(degrees: number): string {
  const index = Math.round(((degrees % 360) + 360) % 360 / 22.5) % 16;
  return COMPASS_DIRECTIONS[index] ?? "N";
}

/** Return the UV index risk level label. */
export function uvIndexLevel(index: number): string {
  if (index <= 2) return "Low";
  if (index <= 5) return "Moderate";
  if (index <= 7) return "High";
  if (index <= 10) return "Very High";
  return "Extreme";
}

/**
 * Find the index of the nearest upcoming 3h slot in a list of hourly entries.
 * Returns 0 if no match is found (e.g. all hours are in the past).
 */
export function getAnchorHourIndex(
  hours: HourlyForecast[],
  now: Date,
): number {
  const nowMs = now.getTime();
  for (let i = 0; i < hours.length; i++) {
    const entry = hours[i]!;
    const hourMs = new Date(entry.time).getTime();
    if (hourMs >= nowMs) return i;
  }
  return 0;
}

const EVERY_3H = new Set([0, 3, 6, 9, 12, 15, 18, 21]);

/**
 * Filter hourly entries for a single day, sampling every 3 hours
 * (00, 03, 06, 09, 12, 15, 18, 21) plus hour 00 of the next day.
 *
 * If `nextDate` is undefined (last forecast day), returns 8 cards ending at 21:00.
 */
export function getHourlyForDay(
  hourly: HourlyForecast[],
  date: string,
  nextDate?: string,
): HourlyForecast[] {
  const result: HourlyForecast[] = [];

  for (const entry of hourly) {
    const [datePart, timePart] = entry.time.split("T") as [string, string];
    const hour = Number(timePart.split(":")[0]);

    if (datePart === date && EVERY_3H.has(hour)) {
      result.push(entry);
    } else if (nextDate && datePart === nextDate && hour === 0) {
      result.push(entry);
    }
  }

  return result;
}
