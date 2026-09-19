import { wallClock } from "@/lib/timezone";
import { getPertinentLocation, getPertinentTime } from "@journiful/shared/utils";
import type { MockTravel } from "@/mocks/travel";

/**
 * One person's travel as the board reads it: the day it happens, the
 * clock, who, and where. The accordion behind the row holds the rest.
 *
 * The day is on the row rather than in a heading above a run of them.
 * A heading repeats one fact per group and pushes the rows apart; a date
 * column says the same thing once per row and stays true however far the
 * list is scrolled. What it gives up is the tally — you can read that
 * three people land on Friday by adjacency, not by a count.
 */
export type TravelRow = {
  id: string;
  memberId: string;
  memberName: string;
  travelType: "arrival" | "departure";
  /** Local date, yyyy-mm-dd. Null until the member shares a time. */
  date: string | null;
  /** ISO instant; null until the member shares it. */
  time: string | null;
  location: string | null;
  flightNumber: string | null;
  details: string | null;
};

export type TravelBoard = {
  arrivals: TravelRow[];
  departures: TravelRow[];
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

function toRow(record: MockTravel, timeZone: string | null): TravelRow {
  const time = pertinentIso(record);
  return {
    id: record.id,
    memberId: record.memberId,
    memberName: record.memberName,
    travelType: record.travelType,
    date: time ? wallClock(time, timeZone).date : null,
    time,
    location: getPertinentLocation(record),
    flightNumber: record.flightNumber,
    details: record.details,
  };
}

/**
 * One direction, in the order a person coordinates it: by day, then by
 * the clock, then by name so two people landing together keep a stable
 * order. Whoever has shared nothing waits at the foot — still on the
 * roster, visibly owed rather than missing.
 *
 * It is a flat list, not days of rows: the grouping lives on each row,
 * so a day that runs past the bottom of the screen is still named on
 * every line of it.
 */
function orderDirection(
  records: MockTravel[],
  direction: "arrival" | "departure",
  members: Array<{ id: string; name: string }>,
  timeZone: string | null,
): TravelRow[] {
  const rows = records.map((record) => toRow(record, timeZone));
  const seen = new Set(rows.map((row) => row.memberId));

  // The whole roster reads here, not just whoever filed: a member with
  // no record in this direction is owed one, and an empty row says so.
  for (const member of members) {
    if (seen.has(member.id)) continue;
    rows.push({
      id: `pending-${direction}-${member.id}`,
      memberId: member.id,
      memberName: member.name,
      travelType: direction,
      date: null,
      time: null,
      location: null,
      flightNumber: null,
      details: null,
    });
  }

  const filed = rows.filter((row) => row.time !== null);
  const owed = rows.filter((row) => row.time === null);

  filed.sort(
    (a, b) =>
      (a.time ?? "").localeCompare(b.time ?? "") ||
      a.memberName.localeCompare(b.memberName),
  );
  owed.sort((a, b) => a.memberName.localeCompare(b.memberName));

  return [...filed, ...owed];
}

/**
 * What the travel screen shows: arrivals and departures, each in the
 * order above. Members ride along so nobody is missing: a member with no
 * record waits at the foot, not absent.
 */
export function travelBoard(
  records: MockTravel[],
  timeZone: string | null = null,
  members: Array<{ id: string; name: string }> = [],
): TravelBoard {
  return {
    arrivals: orderDirection(
      records.filter((record) => record.travelType === "arrival"),
      "arrival",
      members,
      timeZone,
    ),
    departures: orderDirection(
      records.filter((record) => record.travelType === "departure"),
      "departure",
      members,
      timeZone,
    ),
  };
}
