import type { Trip } from "@/components/trip/TripCard";
import type { Member } from "@/lib/members";
import type { RsvpStatus } from "@/lib/rsvp";

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
 * Handles derived from the name, so they read like someone's actual
 * accounts rather than placeholders — and cycled through the four states
 * a roster really holds: both, Instagram only, Venmo only, neither.
 */
function handlesFor(
  name: string,
  index: number,
): { venmo?: string; instagram?: string } | null {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, "-");
  const dotted = slug.replace(/-/g, ".");

  switch (index % 4) {
    case 0:
      return { venmo: slug, instagram: dotted };
    case 1:
      return { instagram: dotted };
    case 2:
      return { venmo: slug };
    default:
      return null;
  }
}

/** A number that formats, and that only ever belongs to one person. */
function phoneFor(index: number): string {
  return `+1555${`${1000000 + index * 137}`.slice(0, 7)}`;
}

/**
 * Who is on a trip. The going count comes off the trip itself, so the
 * roster and the header's "6 going" can never disagree — which is the
 * first thing anyone notices in a mock.
 *
 * Everyone else who was asked shows up in the API's remaining states, so
 * the undecided and the refusals are visible rather than implied.
 *
 * The first person going is the organizer: one per mock trip, because
 * the lab has no signed-in identity to make into one and a made-up
 * co-organizer would be inventing a fact. The type allows more.
 *
 * Half the roster shares its number and half does not, because both
 * states have to be visible or the organizer's view and the traveler's
 * look identical and the rule goes unproven.
 */
export function membersFor(trip: Trip): Member[] {
  const offset = offsetFor(trip.id);
  const name = (index: number) => FRIENDS[(offset + index) % FRIENDS.length]!;

  const going: Member[] = Array.from({ length: trip.going }, (_, index) => ({
    id: `${trip.id}-${index}`,
    name: name(index),
    status: "going",
    isOrganizer: index === 0,
    phone: phoneFor(offset + index),
    sharePhone: index % 2 === 0,
    handles: handlesFor(name(index), offset + index),
  }));

  const rest: RsvpStatus[] = ["maybe", "no_response", "not_going"];
  const undecided: Member[] = rest
    .slice(0, 1 + (offset % rest.length))
    .map((status, index) => ({
      id: `${trip.id}-${index}-${status}`,
      name: name(trip.going + index),
      status,
      isOrganizer: false,
      phone: phoneFor(offset + trip.going + index),
      sharePhone: (trip.going + index) % 2 === 0,
      handles: handlesFor(name(trip.going + index), offset + trip.going + index),
    }));

  // The organizer first, then everyone in the order they were asked. A
  // sort rather than a construction trick, so the roster still reads
  // organizer-first if the rows ever arrive in another order.
  return [...going, ...undecided].sort(
    (a, b) => Number(b.isOrganizer) - Number(a.isOrganizer),
  );
}
