import { wallClock } from "@/lib/timezone";
import { getPertinentLocation, getPertinentTime } from "@journiful/shared/utils";
import type { MockTravel } from "@/mocks/travel";

/**
 * One person's travel as the board reads it. The row carries what
 * coordination always needs — when, who, which flight, where — and the
 * accordion holds what it sometimes needs: the details prose.
 */
export type TravelRow = {
  id: string;
  memberId: string;
  memberName: string;
  travelType: "arrival" | "departure";
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

/**
 * The half of a record the board files: the arrival's arrival, the
 * departure's departure, as an instant. Null when that side was never
 * filled in — a row without a time is still owed.
 */
export function pertinentIso(record: MockTravel): string | null {
  const pertinent = getPertinentTime(record);
  return pertinent ? new Date(pertinent).toISOString() : null;
}

function toRow(record: MockTravel): TravelRow {
  const location = getPertinentLocation(record);
  return {
    id: record.id,
    memberId: record.memberId,
    memberName: record.memberName,
    travelType: record.travelType,
    time: pertinentIso(record),
    location,
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
  direction: "arrival" | "departure",
  members: Array<{ id: string; name: string }>,
  timeZone: string | null,
): TravelDirection {
  const byDay = new Map<string, TravelRow[]>();
  const unscheduled: TravelRow[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    seen.add(record.memberId);
    const pertinent = pertinentIso(record);
    if (!pertinent) {
      unscheduled.push(toRow(record));
      continue;
    }
    const date = wallClock(pertinent, timeZone).date;
    const day = byDay.get(date);
    if (day) day.push(toRow(record));
    else byDay.set(date, [toRow(record)]);
  }

  // The whole roster reads here, not just whoever filed: a member with
  // no record in this direction waits at the foot with the rest of the
  // unscheduled, so the organizer sees who still owes times at a glance.
  for (const member of members) {
    if (seen.has(member.id)) continue;
    unscheduled.push({
      id: `pending-${direction}-${member.id}`,
      memberId: member.id,
      memberName: member.name,
      travelType: direction,
      time: null,
      location: null,
      flightNumber: null,
      details: null,
    });
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
 * same shape a day later. Members ride along so nobody is missing: a
 * member with no record waits unscheduled, not absent.
 */
export function travelBoard(
  records: MockTravel[],
  timeZone: string | null = null,
  members: Array<{ id: string; name: string }> = [],
): TravelBoard {
  const arrivals = records.filter((record) => record.travelType === "arrival");
  const departures = records.filter(
    (record) => record.travelType === "departure",
  );
  return {
    arrivals: groupDirection(arrivals, "arrival", members, timeZone),
    departures: groupDirection(departures, "departure", members, timeZone),
  };
}

/**
 * The row in its fewest words: clock, name, where. Flight number and
 * details live behind the accordion, so this is the only string the
 * row ever needs.
 */
export function travelRowLabel(row: TravelRow, timeZone: string | null): string {
  const time = row.time ? wallClock(row.time, timeZone).time : "No time yet";
  const where = row.location ? ` · ${row.location}` : "";
  return `${row.memberName} · ${time}${where}`;
}
