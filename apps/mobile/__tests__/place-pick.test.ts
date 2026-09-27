import { describe, expect, it } from "vitest";
import { pickPlace, pickStaySelection } from "@/lib/place-pick";
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

describe("pickStaySelection", () => {
  it("a live pick yields the place name and the details address", () => {
    expect(
      pickStaySelection(suggestion(), "", "Carrer de la Mar 14, 07100 Sóller"),
    ).toEqual({
      name: "La Bodega",
      address: "Carrer de la Mar 14, 07100 Sóller",
    });
  });

  it("a live pick falls back to the suggestion address while details are in flight", () => {
    expect(pickStaySelection(suggestion(), "", null)).toEqual({
      name: "La Bodega",
      address: "Carrer de la Mar 14, Sóller",
    });
  });

  it("a typed pick yields no name change", () => {
    expect(pickStaySelection(null, "My cosy hut", null)).toEqual({
      name: null,
      address: "My cosy hut",
    });
  });
});
