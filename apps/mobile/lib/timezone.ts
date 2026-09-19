import { toIso } from "@/lib/dateRange";

/**
 * A wall clock: what a moment reads as on a wall, somewhere.
 *
 * `Intl` does the conversion when the runtime knows the zone, and the
 * device's own zone is the fallback when it does not — Hermes ships
 * without full ICU on some builds, and a trip whose zone the runtime
 * cannot parse should still show times rather than nothing. Guarding it
 * here means one place throws, not every card.
 *
 * Zod — no: the alternative to `Intl` is date-fns-tz or luxon, a
 * dependency for one toggle. If the fallback ever fires on a device,
 * that is the moment to take one.
 */
const FORMATTERS = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  const cached = FORMATTERS.get(timeZone);
  if (cached !== undefined) return cached;

  let formatter: Intl.DateTimeFormat | null = null;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    formatter = null;
  }

  FORMATTERS.set(timeZone, formatter);
  return formatter;
}

/** Twelve-hour clock off a Date, which is already in the device's zone. */
function deviceClock(date: Date): string {
  const hours = date.getHours();
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

export function wallClock(
  iso: string,
  timeZone: string | null,
): { date: string; time: string } {
  const moment = new Date(iso);
  const formatter = timeZone ? formatterFor(timeZone) : null;

  if (!formatter) {
    return { date: toIso(moment), time: deviceClock(moment) };
  }

  const parts = formatter.formatToParts(moment);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((piece) => piece.type === type)?.value ?? "";

  const hour = Number(part("hour"));

  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${hour === 0 ? 12 : hour}:${part("minute")} ${part("dayPeriod")}`,
  };
}

/** What day it is, somewhere. The grouping and the labels agree on this. */
export function todayIn(timeZone: string | null, now: Date = new Date()): string {
  return wallClock(now.toISOString(), timeZone).date;
}
