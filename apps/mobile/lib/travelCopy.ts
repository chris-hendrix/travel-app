import type { TransportMode } from "@journiful/shared/utils";
import type { TravelDirection } from "@/lib/newTravel";
import type { MockTravel } from "@/mocks/travel";

/**
 * The leg a copy carries: the seven facts the travel sheet's Copy for me
 * files onto your own travel, and the one it refuses.
 *
 * Written as its own type rather than as `MockTravel` for one reason: the
 * field set *is* the contract. The block's own sentence promises the
 * times, the places and the number — nothing there mentions the prose —
 * and a helper whose input were the whole record would make copying
 * `details` a one-word mistake. A `MockTravel` is assignable to this, so
 * the sheet hands over the record it already holds; what the type adds is
 * that the record's `id`, its member and its `deletedAt` are not facts of
 * the leg, and are therefore the target's to state and the copy's to
 * clear.
 */
export type TravelCopySource = {
  /**
   * Which way the leg goes, as the board's row states it. The copy is the
   * same leg in the same direction: the pair of direction and member is
   * the record's identity, so a copy that flipped it would file the other
   * half of somebody's trip rather than this one.
   */
  travelType: TravelDirection;
  /**
   * How the leg is taken. Not a default and not the form's pre-selection:
   * a train copied is a train, and the column is `NOT NULL` — a copy that
   * left the mode to the database would turn a member's train into a
   * flight on the board.
   */
  transportMode: TransportMode;
  arrivalTime: string | null;
  arrivalLocation: string | null;
  departureTime: string | null;
  departureLocation: string | null;
  flightNumber: string | null;
  /**
   * The leg's prose, named here because it is the fact the copy drops,
   * and not named in the output at all. `details` is often about the
   * other person's own trip — "Bags take twenty minutes" is their landing
   * and their bags — so a copy that carried it would put somebody else's
   * sentence on your record, under a button that promised times, places
   * and a number. Present on the type so a whole record can be handed in
   * without a caller having to strip it first: the sentence travels
   * nowhere from here by construction, rather than by the caller's care.
   */
  details?: string | null;
};

/** Who the copy is filed for, and the id it wears while it is in flight. */
export type TravelCopyTarget = {
  /**
   * The optimistic row's id, built by the caller (`custom-…`, the same
   * convention the form's own save uses) because it has a clock in it and
   * this helper is pure.
   */
  id: string;
  /** Your own roster row: the copy is your travel, never the leg's own. */
  memberId: string;
  memberName: string;
};

/**
 * One member's leg, as another member's own record: the same times, the
 * same places, the same number and the same mode, filed under the member
 * the caller names.
 *
 * The direction, the mode and the four ends are copied verbatim — there is
 * no reading of a wall clock, no zone and no trip bound in here, because
 * the source is a record whose times are already instants on the trip's
 * own clock. That is also why this is a helper rather than four lines in
 * the sheet: the sheet has no renderer in the mobile suite, so a rule that
 * lives there is a rule nothing can test, and the record handed to
 * `addTravel` is exactly the thing worth pinning.
 *
 * The prose is not copied, and neither is anything that identifies the
 * source: a leg is copied *from* somebody and filed *for* the target. The
 * id, the member and the soft delete are the target's — a row being filed
 * is live — and they are the three fields the copy states rather than
 * reads.
 */
export function copyTravelFor(
  source: TravelCopySource,
  target: TravelCopyTarget,
): MockTravel {
  return {
    id: target.id,
    memberId: target.memberId,
    memberName: target.memberName,
    travelType: source.travelType,
    transportMode: source.transportMode,
    arrivalTime: source.arrivalTime,
    arrivalLocation: source.arrivalLocation,
    departureTime: source.departureTime,
    departureLocation: source.departureLocation,
    flightNumber: source.flightNumber,
    // The prose, dropped — see `TravelCopySource.details`.
    details: null,
    deletedAt: null,
  } satisfies MockTravel;
}
