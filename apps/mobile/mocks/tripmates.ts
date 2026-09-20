import type { Trip } from "@/components/trip/TripCard";
import { FRIENDS, membersFor, phoneFor } from "@/mocks/members";

/**
 * Someone you have been on a trip with, shaped after the API's
 * `Mutual`: an id, a name, a number, and how many trips you already
 * share.
 *
 * The number is here because the invite endpoint has one field for
 * "people who have an account" and another for "numbers", and in the lab
 * the two have to be able to collide the way they do in life — typing a
 * tripmate's own number should not send them a text. The API does that
 * matching on the server; the lab does it here.
 */
export type Tripmate = {
  id: string;
  name: string;
  phone: string;
  /** How many trips you already share. One is the ordinary case. */
  sharedTripCount: number;
};

/**
 * Who to suggest: everyone you have travelled with, minus the people
 * already on this trip.
 *
 * That subtraction is the API's own (`getMutualSuggestions` is the
 * mutuals query with the trip's members removed), and it is the reason
 * the section is worth showing at all: a suggestion you have already
 * invited is a row that can only be a mistake.
 *
 * Deterministic, so a trip always suggests the same people, and the
 * handful the mocks add by number come back as tripmates because they
 * were built off the same pool — which is what makes "this number
 * already has an account" demonstrable rather than described.
 */
export function tripmatesFor(trip: Trip): Tripmate[] {
  const onThisTrip = new Set(membersFor(trip).map((member) => member.name));

  return FRIENDS.map((name, index) => ({ name, index }))
    .filter((person) => !onThisTrip.has(person.name))
    .map(({ name, index }) => ({
      id: `tripmate-${index}`,
      name,
      phone: phoneFor(index),
      // One to four, so the column has more than one value in it.
      sharedTripCount: 1 + (index % 4),
    }));
}
