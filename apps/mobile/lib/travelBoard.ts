import { wallClock } from "@/lib/timezone";
import type { MockTravel } from "@/mocks/travel";

/**
 * One person's travel as the board reads it. The row carries what
 * coordination always needs — when, who, which flight, where — and the
 * accordion holds what it sometimes needs: the details prose.
 */
export type TravelRow = {
  id: string;
  memberName: string;
  /** ISO datetime; null until the member shares it. */
  time: string | null;
  location: string | null;
  flightNumber: string | null;
  details: string | null;
};

export type TravelDay = {
  /** Local date, yyyy-mm-dd. */
  date: string;
  rows: TravelRow[];
};

export type TravelDirection = {
  days: TravelDay[];
  /** Shared nothing yet — the foot of the section, never among the days. */
  unscheduled: TravelRow[];
};

export type TravelBoard = {
  arrivals: TravelDirection;
  departures: TravelDirection;
};

function toRow(record: MockTravel): TravelRow {
  return {
    id: record.id,
    memberName: record.memberName,
    time: record.time,
    location: record.location,
    flightNumber: record.flightNumber,
    details: record.details,
  };
}

/**
 * One direction's rows, bucketed by day in the trip's zone and running
 * morning to night within each day. Untimed rows are held back for the
 * foot of the section: they have no day to belong to.
 *
 * No flight grouping — one row per person, always. Sharing a flight is
 * visible from adjacent rows with the same number, not from a merged
 * one.
 */
function groupDirection(
  records: MockTravel[],
  timeZone: string | null,
): TravelDirection {
  const byDay = new Map<string, TravelRow[]>();
  const unscheduled: TravelRow[] = [];

  for (const record of records) {
    if (!record.time) {
      unscheduled.push(toRow(record));
      continue;
    }
    const date = wallClock(record.time, timeZone).date;
    const day = byDay.get(date);
    if (day) day.push(toRow(record));
    else byDay.set(date, [toRow(record)]);
  }

  const days = [...byDay]
    .map(([date, rows]) => ({
      date,
      rows: rows.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    days,
    unscheduled: unscheduled.sort((a, b) =>
      a.memberName.localeCompare(b.memberName),
    ),
  };
}

/**
 * What the travel screen shows: arrivals first, departures after, each
 * grouped by day. Arrivals are the coordination job; departures are the
 * same shape a day later.
 */
export function travelBoard(
  records: MockTravel[],
  timeZone: string | null = null,
): TravelBoard {
  return {
    arrivals: groupDirection(
      records.filter((record) => record.travelType === "arrival"),
      timeZone,
    ),
    departures: groupDirection(
      records.filter((record) => record.travelType === "departure"),
      timeZone,
    ),
  };
}

/**
 * The row in its fewest words: clock, flight, where. The accordion
 * holds the rest, so this is the only string the row ever needs.
 */
export function travelRowLabel(row: TravelRow, timeZone: string | null): string {
  const time = row.time ? wallClock(row.time, timeZone).time : "No time yet";
  const flight = row.flightNumber ? ` · ${row.flightNumber}` : "";
  const where = row.location ? ` · ${row.location}` : "";
  return `${time} · ${row.memberName}${flight}${where}`;
}
