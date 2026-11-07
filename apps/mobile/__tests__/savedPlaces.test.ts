import { describe, expect, it } from "vitest";
import {
  EMPTY_SAVED_PLACES_FILTERS,
  hasAnyPinned,
  matchesFilters,
  orderedPlaces,
  savedPlaceCard,
  typeChipsFor,
} from "@/lib/savedPlaces";
import type { EventType } from "@/lib/itinerary";
import type { SavedPlace } from "@/lib/saved-places";

let counter = 0;

/** A saved place with only the named fields standing out. */
function place(overrides: Partial<SavedPlace> = {}): SavedPlace {
  counter += 1;
  return {
    id: `place-${counter}`,
    tripId: "trip-1",
    createdBy: "user-a",
    creatorName: "Ada",
    name: `Place ${counter}`,
    address: `${counter} Main St`,
    type: "misc",
    description: null,
    isPinned: false,
    createdAt: "2026-09-19T12:00:00.000Z",
    placeId: null,
    image: null,
    photoSourceUri: null,
    photoCredit: null,
    ...overrides,
  };
}

describe("typeChipsFor", () => {
  it("always includes All, even for an empty list", () => {
    expect(typeChipsFor([])).toEqual(["All"]);
  });

  it("includes a chip per present type, in canonical event-type order", () => {
    const chips = typeChipsFor([
      place({ type: "nightlife" }),
      place({ type: "food_and_drink" }),
      place({ type: "food_and_drink" }),
    ]);
    expect(chips).toEqual(["All", "food_and_drink", "nightlife"]);
  });

  it("derives from the whole list passed in, never the filtered list", () => {
    const whole = [
      place({ type: "food_and_drink" }),
      place({ type: "outdoors" }),
    ];
    // A caller filtering to food first must still see the outdoors chip:
    // the chips are thrown by the whole-list snapshot, not the filtered
    // list, so a chip can never vanish under the filter that chose it.
    const filtered = whole.filter((p) =>
      matchesFilters(p, { type: "food_and_drink" }, "user-a"),
    );
    expect(typeChipsFor(filtered)).toEqual(["All", "food_and_drink"]);
    expect(typeChipsFor(whole)).toEqual([
      "All",
      "food_and_drink",
      "outdoors",
    ]);
  });

  it("never vanishes a chip: the whole list keeps every present type", () => {
    const whole = [
      place({ type: "wellness" }),
      place({ type: "shopping" }),
    ];
    expect(typeChipsFor(whole)).toContain("shopping");
    expect(typeChipsFor(whole)).toContain("wellness");
  });
});

describe("hasAnyPinned", () => {
  it("is false when nothing is pinned, so the screen hides the Pinned chip", () => {
    expect(hasAnyPinned([place(), place()])).toBe(false);
    expect(hasAnyPinned([])).toBe(false);
  });

  it("is true when any place is pinned", () => {
    expect(
      hasAnyPinned([place(), place({ isPinned: true })]),
    ).toBe(true);
  });
});

describe("matchesFilters", () => {
  const food = place({ type: "food_and_drink", createdBy: "user-a" });
  const outdoors = place({ type: "outdoors", createdBy: "user-b" });

  it("matches everything with empty filters", () => {
    expect(matchesFilters(food, EMPTY_SAVED_PLACES_FILTERS, "user-a")).toBe(
      true,
    );
    expect(matchesFilters(outdoors, EMPTY_SAVED_PLACES_FILTERS, "user-a")).toBe(
      true,
    );
  });

  it("treats undefined and All as any type", () => {
    expect(matchesFilters(food, { type: undefined }, "user-a")).toBe(true);
    expect(matchesFilters(food, { type: null }, "user-a")).toBe(true);
    expect(
      matchesFilters(food, { type: "All" as unknown as EventType }, "user-a"),
    ).toBe(true);
  });

  it("filters by type", () => {
    expect(
      matchesFilters(food, { type: "food_and_drink" }, "user-a"),
    ).toBe(true);
    expect(
      matchesFilters(outdoors, { type: "food_and_drink" }, "user-a"),
    ).toBe(false);
  });

  it("ANDs pinnedOnly with the type filter", () => {
    const pinnedFood = { ...food, isPinned: true };
    expect(
      matchesFilters(
        pinnedFood,
        { type: "food_and_drink", pinnedOnly: true },
        "user-a",
      ),
    ).toBe(true);
    expect(
      matchesFilters(
        food,
        { type: "food_and_drink", pinnedOnly: true },
        "user-a",
      ),
    ).toBe(false);
  });

  it("ANDs yoursOnly with the type filter: Yours + Food", () => {
    const mineFood = { ...food, createdBy: "viewer-1" };
    const theirsFood = { ...food, createdBy: "user-b" };
    expect(
      matchesFilters(
        mineFood,
        { type: "food_and_drink", yoursOnly: true },
        "viewer-1",
      ),
    ).toBe(true);
    expect(
      matchesFilters(
        theirsFood,
        { type: "food_and_drink", yoursOnly: true },
        "viewer-1",
      ),
    ).toBe(false);
  });

  it("ANDs all three: type, pinnedOnly, and yoursOnly", () => {
    const minePinnedFood = {
      ...food,
      createdBy: "viewer-1",
      isPinned: true,
    };
    const filters = {
      type: "food_and_drink" as EventType,
      pinnedOnly: true,
      yoursOnly: true,
    };
    expect(matchesFilters(minePinnedFood, filters, "viewer-1")).toBe(true);
    expect(
      matchesFilters({ ...minePinnedFood, isPinned: false }, filters, "viewer-1"),
    ).toBe(false);
    expect(
      matchesFilters(
        { ...minePinnedFood, createdBy: "user-b" },
        filters,
        "viewer-1",
      ),
    ).toBe(false);
    expect(
      matchesFilters(
        { ...minePinnedFood, type: "outdoors" },
        filters,
        "viewer-1",
      ),
    ).toBe(false);
  });
});

describe("orderedPlaces", () => {
  it("leads pinned first with a mixed list, stable within groups", () => {
    const a = place({ name: "a", isPinned: false });
    const b = place({ name: "b", isPinned: true });
    const c = place({ name: "c", isPinned: false });
    const d = place({ name: "d", isPinned: true });
    expect(orderedPlaces([a, b, c, d]).map((p) => p.name)).toEqual([
      "b",
      "d",
      "a",
      "c",
    ]);
  });

  it("keeps received order when nothing is pinned", () => {
    const rows = [place({ name: "a" }), place({ name: "b" })];
    expect(orderedPlaces(rows).map((p) => p.name)).toEqual(["a", "b"]);
  });

  it("does not mutate the list it was handed", () => {
    const rows = [place({ name: "a" }), place({ name: "b", isPinned: true })];
    orderedPlaces(rows);
    expect(rows.map((p) => p.name)).toEqual(["a", "b"]);
  });
});

describe("savedPlaceCard", () => {
  it("fills the card's four slots: badge, meta, title, footnote", () => {
    const card = savedPlaceCard(
      place({
        type: "food_and_drink",
        creatorName: "Ada",
        name: "Cova Santa",
        address: "Carretera San José",
      }),
    );
    expect(card.badge).toBe("food_and_drink");
    expect(card.meta).toBe("Ada");
    expect(card.title).toBe("Cova Santa");
    expect(card.footnote).toBe("Carretera San José");
    expect(card.kind).toBe("food_and_drink");
  });

  it("reads a missing address as an empty footnote", () => {
    expect(savedPlaceCard(place({ address: null })).footnote).toBe("");
  });

  // A whitespace-only address reads the same as missing — the card's
  // `footnote || undefined` and the detail sheet's `address?.trim()`
  // guard agree: neither draws a line over nothing.
  it("reads a whitespace-only address as an empty footnote", () => {
    expect(savedPlaceCard(place({ address: "   " })).footnote).toBe("");
  });

  it("passes creatorName through untouched: no You at this layer", () => {
    // "You" is the component's word (createdBy === viewerUserId); the
    // pure card carries whatever name the roster resolved, verbatim.
    const card = savedPlaceCard(
      place({ creatorName: "Ada", createdBy: "viewer-1" }),
    );
    expect(card.meta).toBe("Ada");
    expect(savedPlaceCard(place({ creatorName: "" })).meta).toBe("");
  });
});
