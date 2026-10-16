import { wallClock } from "@/lib/timezone";
import {
  getPertinentLocation,
  getPertinentTime,
  type TransportMode,
} from "@journiful/shared/utils";
import type { MockTravel } from "@/mocks/travel";

/**
 * One person's travel as the board reads it: who, how they are coming,
 * where, and when. The travel screen behind the row holds the rest — the
 * far end, the number, the prose.
 *
 * The row is the members list's row (`components/ui/PersonRow.tsx`): a
 * person, a chip beside their name, one line of detail under it, and one
 * fact at the far edge. What the far edge holds is the day *and* the
 * clock, joined, because a row read across has one column for the when
 * rather than a column of its own for the date.
 *
 * The day is still on every row rather than on a heading above a run of
 * them: a heading repeats one fact per group, pushes the rows apart, and
 * stops saying which day it is the moment the run scrolls off the screen.
 * What that gives up is the tally — you can read that three people land on
 * Friday by adjacency, not by a count.
 */
export type TravelRow = {
  id: string;
  memberId: string;
  memberName: string;
  travelType: "arrival" | "departure";
  /**
   * How they are travelling, as the record filed it. Null on a row nobody
   * has filed: an owed row has no mode to wear, the same way it has no day
   * — the chip says what a member answered, never what the column would
   * default them to.
   */
  transportMode: TransportMode | null;
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
    transportMode: record.transportMode,
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
      transportMode: null,
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
 * Whether anybody still owes a time, in either direction.
 *
 * The trip page's Add travel is a nudge, and whose travel it nudges
 * depends on who is looking: your own, or — for the organizer, who is
 * the one who files for everybody — the whole travelling roster's. The
 * board already answers it: it lists every member in both directions,
 * and a row without a time is a row that is owed. So this asks the
 * board rather than re-deriving who counts.
 */
export function anyTravelOwed(
  records: MockTravel[],
  members: Array<{ id: string; name: string }> = [],
): boolean {
  const board = travelBoard(records, null, members);
  return (
    board.arrivals.some((row) => row.time === null) ||
    board.departures.some((row) => row.time === null)
  );
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
