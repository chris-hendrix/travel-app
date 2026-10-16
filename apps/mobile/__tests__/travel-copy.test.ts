/**
 * The record a copy builds, which is the whole of "what a press of Copy
 * for me files". The sheet that presses it has no renderer in this suite,
 * so the composition — sheet → `addTravel` — has no automated level and
 * this file does not claim one: what it pins is the record handed over.
 *
 * The rule the block's own sentence states is the rule asserted here: the
 * leg's times, places and number, filed for the member you name, and not
 * the prose. `details` is the field that has to be *left out* rather than
 * copied, so the source below carries it and the assertion says it does
 * not travel — a helper that dropped a field silently is exactly the
 * failure a test of "copies every fact" would not catch.
 */

import { describe, expect, it } from "vitest";
import type { MockTravel } from "@/mocks/travel";
import { copyTravelFor, type TravelCopySource } from "@/lib/travelCopy";

/**
 * The leg being copied: the mocks' first arrival — Bo landing at BCN T2
 * at 15:40 having left JFK T4 that morning — prose and all. A whole
 * record, because a whole record is what the sheet holds.
 */
const SOURCE: MockTravel = {
  id: "trip-1-arrival-member-bo",
  memberId: "member-bo",
  memberName: "Bo",
  travelType: "arrival",
  transportMode: "flight",
  departureTime: "2026-09-18T07:00:00.000Z",
  departureLocation: "JFK T4",
  arrivalTime: "2026-09-18T15:40:00.000Z",
  arrivalLocation: "BCN T2",
  flightNumber: "UA 1842",
  details: "Landing T2, bags take twenty minutes.",
  deletedAt: null,
};

/** Who the copy is filed for: the viewer, on a record of their own. */
const TARGET = {
  id: "custom-arrival-1",
  memberId: "member-ana",
  memberName: "Ana",
};

describe("copyTravelFor", () => {
  it("files the leg's facts, and nothing else, under the target", () => {
    // The whole record, compared whole: every fact lands in the column it
    // came from, the copy is the target's, the prose is gone, and the row
    // it builds is live. A single `toMatchObject` on a handful of keys
    // would pass on a copy that carried the source's member as well.
    expect(copyTravelFor(SOURCE, TARGET)).toEqual({
      id: "custom-arrival-1",
      memberId: "member-ana",
      memberName: "Ana",
      travelType: "arrival",
      transportMode: "flight",
      arrivalTime: "2026-09-18T15:40:00.000Z",
      arrivalLocation: "BCN T2",
      departureTime: "2026-09-18T07:00:00.000Z",
      departureLocation: "JFK T4",
      flightNumber: "UA 1842",
      details: null,
      deletedAt: null,
    });
  });

  it("leaves the prose behind", () => {
    // The one fact the copy refuses: `details` is often about the other
    // person's own trip — "Bags take twenty minutes" is their landing and
    // their bags — and the block's sentence commits to the facts above.
    expect(copyTravelFor(SOURCE, TARGET).details).toBeNull();
  });

  it("targets the member it is given, never the leg's own", () => {
    const copied = copyTravelFor(SOURCE, TARGET);
    expect(copied.memberId).toBe("member-ana");
    expect(copied.memberName).toBe("Ana");
    expect(copied.id).toBe("custom-arrival-1");
  });

  it("carries the direction and the mode", () => {
    const departure: TravelCopySource = {
      ...SOURCE,
      travelType: "departure",
      transportMode: "train",
    };
    const copied = copyTravelFor(departure, TARGET);
    expect(copied.travelType).toBe("departure");
    expect(copied.transportMode).toBe("train");
    // Both ends still ride, named by their own side: the direction says
    // which half the board files, not which half was copied.
    expect(copied.arrivalTime).toBe(SOURCE.arrivalTime);
    expect(copied.departureTime).toBe(SOURCE.departureTime);
  });

  it("keeps a far end that was never filled in empty", () => {
    // A driver with no other end filed: the copy is the same leg, so the
    // half nobody answered stays unanswered rather than being invented.
    const copied = copyTravelFor(
      {
        ...SOURCE,
        transportMode: "car",
        departureTime: null,
        departureLocation: null,
      },
      TARGET,
    );
    expect(copied.departureTime).toBeNull();
    expect(copied.departureLocation).toBeNull();
    expect(copied.arrivalLocation).toBe("BCN T2");
  });
});
