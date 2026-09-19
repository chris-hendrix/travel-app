import type { Trip } from "@/components/trip/TripCard";
import { membersFor } from "@/mocks/members";

/**
 * One person's travel in one direction, shaped after the API's
 * member-travel row — the pertinent pair for its direction, plus the
 * flight number and free-text details when there are any.
 *
 * Times are ISO datetimes on the trip's own dates, so the board always
 * has arrivals to group. Null time means the member has shared nothing
 * yet: those rows gather at the foot of their section, never among the
 * timed ones.
 */
export type MockTravel = {
  id: string;
  memberId: string;
  memberName: string;
  travelType: "arrival" | "departure";
  /** ISO datetime, null until the member shares it. */
  time: string | null;
  /** Where, as the member wrote it. */
  location: string | null;
  flightNumber: string | null;
  details: string | null;
  /** The API's soft delete. Null while it is live. */
  deletedAt: string | null;
};

function at(dateIso: string, clock: string): string {
  return `${dateIso}T${clock}:00`;
}

function shift(dateIso: string, days: number): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  date.setDate(date.getDate() + days);
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Travel for the trip's going members: arrivals spread over the first
 * two days, departures on the last day, and always someone who has
 * shared nothing yet — because both states have to be visible or the
 * unscheduled footer goes unproven.
 *
 * A mix of flights, a driver, and a train, so rows read like a group
 * of friends rather than one booking reference.
 */
export function travelFor(trip: Trip): MockTravel[] {
  const going = membersFor(trip).filter((member) => member.status === "going");
  const first = trip.startDate;
  const second = shift(trip.startDate, 1);
  const last = trip.endDate;

  const arrivals: Array<{
    clock: string;
    day: string;
    location: string;
    flight: string | null;
    details: string | null;
  }> = [
    { clock: "15:40", day: first, location: "BCN T2", flight: "UA 1842", details: "Landing T2, bags take twenty minutes." },
    { clock: "18:15", day: first, location: "BCN T1", flight: "VY 8421", details: null },
    { clock: "10:05", day: second, location: "Driving from Valencia", flight: null, details: "Two spare seats if anyone lands Saturday morning." },
    { clock: "12:30", day: second, location: "BCN T1", flight: "FR 3204", details: null },
  ];

  const departures: Array<{
    clock: string;
    location: string;
    flight: string | null;
    details: string | null;
  }> = [
    { clock: "09:05", location: "BCN T2", flight: "UA 1843", details: null },
    { clock: "19:45", location: "Sants station", flight: null, details: "Train home, can drop bags at the flat first." },
  ];

  const records: MockTravel[] = [];

  going.forEach((member, index) => {
    // The last going member has shared nothing in either direction: the
    // unscheduled footer is a real person, not an empty state.
    if (index === going.length - 1) {
      records.push(
        { id: `${trip.id}-arrival-${member.id}`, memberId: member.id, memberName: member.name, travelType: "arrival", time: null, location: null, flightNumber: null, details: null, deletedAt: null },
        { id: `${trip.id}-departure-${member.id}`, memberId: member.id, memberName: member.name, travelType: "departure", time: null, location: null, flightNumber: null, details: null, deletedAt: null },
      );
      return;
    }

    const arrival = arrivals[index % arrivals.length]!;
    records.push({
      id: `${trip.id}-arrival-${member.id}`,
      memberId: member.id,
      memberName: member.name,
      travelType: "arrival",
      time: at(arrival.day, arrival.clock),
      location: arrival.location,
      flightNumber: arrival.flight,
      details: arrival.details,
      deletedAt: null,
    });

    const departure = departures[index % departures.length]!;
    records.push({
      id: `${trip.id}-departure-${member.id}`,
      memberId: member.id,
      memberName: member.name,
      travelType: "departure",
      time: at(last, departure.clock),
      location: departure.location,
      flightNumber: departure.flight,
      details: departure.details,
      deletedAt: null,
    });
  });

  return records;
}
