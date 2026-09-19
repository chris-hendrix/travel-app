import type { Trip } from "@/components/trip/TripCard";
import type { RsvpStatus } from "@/lib/rsvp";

export type Member = {
  id: string;
  name: string;
  status: RsvpStatus;
};

/**
 * One friend group across every trip — the same people keep turning up,
 * which is what makes the mocks read like a group of friends rather than
 * seven unrelated rosters.
 *
 * Sixteen names so that the longest trip here (eleven going) plus its
 * undecided still fits without repeating anyone.
 */
const FRIENDS = [
  "Dana Mercer",
  "Rafa Moreno",
  "Sofia Reyes",
  "Marcus Bell",
  "Priya Anand",
  "Chidi Okafor",
  "Tom Lindqvist",
  "Nadia Haddad",
  "Jules Romano",
  "Amara Boateng",
  "Felix Tan",
  "Robin Vale",
  "Elena Costa",
  "Bo Nakamura",
  "Ines Duarte",
  "Sam Whitfield",
];

/** Deterministic, so a trip always shows the same faces. */
function offsetFor(tripId: string): number {
  let sum = 0;
  for (const char of tripId) sum += char.charCodeAt(0);
  return sum % FRIENDS.length;
}

/**
 * Who is on a trip. The going count comes off the trip itself, so the
 * roster and the header's "6 going" can never disagree — which is the
 * first thing anyone notices in a mock.
 *
 * Everyone else who was asked shows up in the API's remaining states, so
 * the undecided and the refusals are visible rather than implied.
 */
export function membersFor(trip: Trip): Member[] {
  const offset = offsetFor(trip.id);
  const name = (index: number) => FRIENDS[(offset + index) % FRIENDS.length]!;

  const going: Member[] = Array.from({ length: trip.going }, (_, index) => ({
    id: `${trip.id}-${index}`,
    name: name(index),
    status: "going",
  }));

  const rest: RsvpStatus[] = ["maybe", "no_response", "not_going"];
  const undecided: Member[] = rest
    .slice(0, 1 + (offset % rest.length))
    .map((status, index) => ({
      id: `${trip.id}-${index}-${status}`,
      name: name(trip.going + index),
      status,
    }));

  return [...going, ...undecided];
}
