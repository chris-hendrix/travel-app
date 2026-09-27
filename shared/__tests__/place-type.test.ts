// Phase 6 Task 1: Google types map onto the app's nine event types.

import { describe, it, expect } from "vitest";
import { eventTypeForPlace } from "../utils/index.js";

describe("eventTypeForPlace", () => {
  it.each([
    [["restaurant"], "food_and_drink"],
    [["museum"], "arts_and_entertainment"],
    [["hiking_area"], "outdoors"],
    [["bar"], "nightlife"],
    [["spa"], "wellness"],
    [["clothing_store"], "shopping"],
    [["lodging"], "lodging"],
    [["hotel"], "lodging"],
    [["airport"], "travel"],
    [["transit_station"], "travel"],
    [["not_a_real_type"], "misc"],
    [[], "misc"],
  ])("%j → %s", (types, expected) => {
    expect(eventTypeForPlace(types)).toBe(expected);
  });

  it("lets the highest-priority match anywhere in the list win, not types[0]", () => {
    expect(eventTypeForPlace(["park", "restaurant"])).toBe("food_and_drink");
    expect(eventTypeForPlace(["restaurant", "park"])).toBe("food_and_drink");
  });
});
