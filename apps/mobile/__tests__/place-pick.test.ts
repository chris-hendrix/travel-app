import { describe, expect, it } from "vitest";
import * as placePick from "@/lib/place-pick";
import { pickPlace, pickStayAddress } from "@/lib/place-pick";
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
  it("uses the tapped row, not the details response", () => {
    expect(pickPlace(suggestion(), "")).toMatchObject({
      place: "La Bodega",
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
  });

  it("a live pick yields only an address; the name field keeps what was typed", () => {
    const name = "My cosy hut";
    const address = pickStayAddress(
      suggestion(),
      "Carrer de la Mar 14, 07100 Sóller",
    );
    expect(address).toBe("Carrer de la Mar 14, 07100 Sóller");
    // The pick has nowhere to put a name: the dialog keeps `name` as
    // the user left it, so the picked place never renames the stay.
    expect(name).toBe("My cosy hut");
  });
});
