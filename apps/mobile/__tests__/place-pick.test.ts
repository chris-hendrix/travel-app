import { describe, expect, it } from "vitest";
import * as placePick from "@/lib/place-pick";
import { pickPlace } from "@/lib/place-pick";
import type { PlaceSuggestion } from "@/lib/queries/places";

function suggestion(overrides: Partial<PlaceSuggestion> = {}): PlaceSuggestion {
  return {
    placeId: "ChIJ1",
    name: "La Bodega, Sóller",
    shortName: "La Bodega",
    address: "Carrer de la Mar 14, Sóller",
    types: ["restaurant", "food"],
    ...overrides,
  };
}

describe("pickPlace", () => {
  it("commits the row's FULL display text, name and address together", () => {
    // The field echoes exactly what the row carried, so nothing has to
    // be repeated on a second line beneath it.
    expect(pickPlace(suggestion(), "")).toMatchObject({
      place: "La Bodega, Sóller",
      selectedPlaceId: "ChIJ1",
    });
  });

  it("offers the typed text with no place id", () => {
    expect(pickPlace(null, "La Bod")).toMatchObject({
      place: "La Bod",
      selectedPlaceId: null,
    });
  });

  it("derives the event type from the suggestion's Google types", () => {
    expect(pickPlace(suggestion(), "").type).toBe("food_and_drink");
    expect(pickPlace(suggestion({ types: [] }), "").type).toBe("misc");
    expect(pickPlace(null, "La Bod").type).toBe("misc");
  });
});

describe("a stay pick never renames the stay", () => {
  it("exposes no name-writing helper: the name field is the user's own words", () => {
    expect("pickStaySelection" in placePick).toBe(false);
    expect("pickStayAddress" in placePick).toBe(false);
  });

  it("commits the full text to the address field", () => {
    expect(pickPlace(suggestion(), "").place).toBe("La Bodega, Sóller");
  });
});
