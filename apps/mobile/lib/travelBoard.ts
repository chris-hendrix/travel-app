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
 * The id a row still owed carries: the member and the direction it is
 * owed in, and nothing else — there is no record behind it to name.
 *
 * Written here and read back by `parsePendingRowId` below, because the
 * two are one format: the board builds it, the address it is handed out
 * as carries it (`/trips/travel/detail?id=…&travel=…`), and the sheet
 * behind that address reads it back to find out who it is about.
 */
export function pendingRowId(
  direction: "arrival" | "departure",
  memberId: string,
): string {
  return `pending-${direction}-${memberId}`;
}

/**
 * The member and direction an owed row's id names, or null for any other
 * id — a record's own, which is opaque here.
 *
 * The member id is everything after the direction, so a member id that
 * itself carries dashes (they are uuids) survives the read: the prefix
 * is matched, never split.
 */
export function parsePendingRowId(
  rowId: string,
): { direction: "arrival" | "departure"; memberId: string } | null {
  const match = /^pending-(arrival|departure)-(.+)$/.exec(rowId);
  if (!match) return null;
  return {
    direction: match[1] as "arrival" | "departure",
    memberId: match[2] as string,
  };
}

/**
 * Whether this board row is one nobody has filed yet.
 *
 * The third question about the same format, beside the writer and the
 * reader: `pendingRowId` builds the id, `parsePendingRowId` reads it back,
 * and this asks whether a row carries one. Three call sites in the record
 * sheet need it — the two action blocks that require a record behind the
 * row, and the edit door that falls back to the member and the direction
 * instead of a record id — and they all spelled it `row.id.startsWith(
 * "pending-")` while the format had no owner.
 *
 * A row rather than an id, because that is what every caller has, and
 * because the question is about the row's kind rather than about a
 * string: `TravelRow.time === null` is the board's own test for owed, and
 * it is wider than this one (a record can be timeless without being
 * `pending-`), so a caller asking "is this row owed" should say which of
 * the two it means.
 */
export function isOwedRow(row: TravelRow): boolean {
  return parsePendingRowId(row.id) !== null;
}

/**
 * The row an address names, read forward onto what that member holds now.
 *
 * A board row's id is stable while it is a record's own, and **not**
 * stable while it is the `pending-…` a row still owes — that one stops
 * existing the moment somebody files. Which is the ordinary path, not an
 * edge: the board lists the rows you owe, an owed row's sheet opens the
 * form on the member and the direction (`app/trips/travel/detail.tsx`),
 * and the save lands back on that sheet with the id the row had before
 * it was filed. Read by id alone, the sheet then answered "that travel
 * is not on this trip any more" over the record the reader had just
 * written — a dead end after a successful save, and the one screen that
 * could be reached by filing your own travel for the first time.
 *
 * So an owed id is not a lookup key, it is a **reference**: it names a
 * member and a direction, and it resolves to whatever that member holds
 * in that direction now. That is why it survives the save, and why a
 * reload, a bookmark or a link handed to somebody else keeps resolving
 * rather than going stale. A filed id stays an exact match, and an id
 * that resolves to neither is still nothing — the row it named is gone
 * (`app/trips/travel/form.tsx` answers the same question for a delete,
 * by rewriting the address it stays on).
 */
export function travelRowFor(
  board: TravelBoard,
  rowId: string,
): TravelRow | undefined {
  const rows = [...board.arrivals, ...board.departures];
  const exact = rows.find((row) => row.id === rowId);
  if (exact) return exact;
  const owed = parsePendingRowId(rowId);
  if (!owed) return undefined;
  return rows.find(
    (row) =>
      row.memberId === owed.memberId && row.travelType === owed.direction,
  );
}

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
      id: pendingRowId(direction, member.id),
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
