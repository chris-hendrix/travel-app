import type { Trip } from "@/components/trip/TripCard";
import { membersFor } from "@/mocks/members";
import { zoneOffsetFor } from "@/mocks/events";

/**
 * One person's travel in one direction, shaped after the API's
 * member-travel row: both ends of the leg are columns, and which of them
 * is pertinent is decided by `travelType` — an arrival carries its
 * arrival side, a departure carries its departure side. Flight-lookup
 * autofill may also fill the counterpart side silently, which is why
 * both ends exist even when only one is asked for.
 *
 * Times are ISO datetimes on the trip's own dates, so the board always
 * has arrivals to group. Null times mean the member has shared nothing
 * yet: those rows gather at the foot of their section, never among the
 * timed ones.
 */
export type MockTravel = {
  id: string;
  memberId: string;
  memberName: string;
  travelType: "arrival" | "departure";
  departureTime: string | null;
  departureLocation: string | null;
  arrivalTime: string | null;
  arrivalLocation: string | null;
  flightNumber: string | null;
  details: string | null;
  /** The API's soft delete. Null while it is live. */
  deletedAt: string | null;
};

/**
 * A wall clock on a local day, as an instant.
 *
 * The offset matters: a naive ISO string is read in the device's zone,
 * so 23:30 would land on the wrong day everywhere except the one zone
 * the mocks were written in. Stamping the trip's own offset is what
 * makes these rows mean the same thing here as they will when the API
 * sends real instants.
 */
function at(dateIso: string, clock: string, zoneOffsetMinutes: number): string {
  const [year, month, day] = dateIso.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [hour, minute] = clock.split(":").map(Number) as [number, number];
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute) - zoneOffsetMinutes * 60_000,
  ).toISOString();
}

function shift(dateIso: string, days: number): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  date.setDate(date.getDate() + days);
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function blank(
  trip: Trip,
  memberId: string,
  memberName: string,
  travelType: "arrival" | "departure",
): MockTravel {
  return {
    id: `${trip.id}-${travelType}-${memberId}`,
    memberId,
    memberName,
    travelType,
    departureTime: null,
    departureLocation: null,
    arrivalTime: null,
    arrivalLocation: null,
    flightNumber: null,
    details: null,
    deletedAt: null,
  };
}

/**
 * Travel for the trip's going members: arrivals spread over the first
 * two days, departures on the last day, and always someone who has
 * shared nothing yet — because both states have to be visible or the
 * unscheduled footer goes unproven.
 *
 * A mix of flights, a driver, and a train, so rows read like a group
 * of friends rather than one booking reference. The overnight one has
 * both ends on different days, which is the case the form's far-day
 * flag exists for.
 */
export function travelFor(trip: Trip): MockTravel[] {
  const offset = zoneOffsetFor(trip.id);
  const going = membersFor(trip).filter((member) => member.status === "going");
  const first = trip.startDate;
  const second = shift(trip.startDate, 1);
  const last = trip.endDate;

  const arrivals: Array<{
    clock: string;
    from: string;
    fromClock: string;
    /** Left the evening before: the arrival side's far-day case. */
    overnight: boolean;
    day: string;
    location: string;
    flight: string | null;
    details: string | null;
  }> = [
    {
      clock: "15:40",
      fromClock: "07:00",
      from: "JFK T4",
      overnight: false,
      day: first,
      location: "BCN T2",
      flight: "UA 1842",
      details: "Landing T2, bags take twenty minutes.",
    },
    {
      clock: "18:15",
      fromClock: "16:05",
      from: "LIS T1",
      overnight: false,
      day: first,
      location: "BCN T1",
      flight: "VY 8421",
      details: null,
    },
    {
      clock: "10:05",
      fromClock: "",
      from: "",
      overnight: false,
      day: second,
      location: "Driving from Valencia",
      flight: null,
      details: "Two spare seats if anyone lands Saturday morning.",
    },
    {
      clock: "12:30",
      fromClock: "22:50",
      from: "DUB T1",
      // Landed at lunchtime having left the night before: 22:50 of the
      // same day would arrive before it departed.
      overnight: true,
      day: second,
      location: "BCN T1",
      flight: "FR 3204",
      details: null,
    },
  ];

  const departures: Array<{
    clock: string;
    toClock: string | null;
    to: string | null;
    /** Lands the morning after: the case the far-day flag is for. */
    overnight: boolean;
    location: string;
    flight: string | null;
    details: string | null;
  }> = [
    {
      clock: "09:05",
      toClock: "11:40",
      to: "JFK T4",
      overnight: false,
      location: "BCN T2",
      flight: "UA 1843",
      details: null,
    },
    {
      clock: "19:45",
      toClock: null,
      to: null,
      overnight: false,
      location: "Sants station",
      flight: null,
      details: "Train home, can drop bags at the flat first.",
    },
    {
      clock: "23:30",
      toClock: "07:15",
      to: "JFK T4",
      overnight: true,
      location: "BCN T2",
      flight: "DL 0148",
      details: "Red-eye. Landing in the morning, so nobody wait up.",
    },
  ];

  const records: MockTravel[] = [];

  going.forEach((member, index) => {
    // The last going member has shared nothing in either direction: the
    // unscheduled footer is a real person, not an empty state.
    if (index === going.length - 1) {
      records.push(
        blank(trip, member.id, member.name, "arrival"),
        blank(trip, member.id, member.name, "departure"),
      );
      return;
    }

    const arrival = arrivals[index % arrivals.length]!;
    records.push({
      ...blank(trip, member.id, member.name, "arrival"),
      arrivalTime: at(arrival.day, arrival.clock, offset),
      arrivalLocation: arrival.location,
      departureTime: arrival.fromClock
        ? at(
            arrival.overnight ? shift(arrival.day, -1) : arrival.day,
            arrival.fromClock,
            offset,
          )
        : null,
      departureLocation: arrival.from || null,
      flightNumber: arrival.flight,
      details: arrival.details,
    });

    const departure = departures[index % departures.length]!;
    records.push({
      ...blank(trip, member.id, member.name, "departure"),
      departureTime: at(last, departure.clock, offset),
      departureLocation: departure.location,
      // A red-eye home departs on the last day and lands the morning
      // after it: the one case the trip-bounded calendar cannot offer,
      // so the mocks carry it.
      arrivalTime: departure.toClock
        ? at(
            departure.overnight ? shift(last, 1) : last,
            departure.toClock,
            offset,
          )
        : null,
      arrivalLocation: departure.to,
      flightNumber: departure.flight,
      details: departure.details,
    });
  });

  return records;
}
