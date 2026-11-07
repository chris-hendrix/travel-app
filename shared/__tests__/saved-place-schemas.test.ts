// Tests for saved-place validation schemas

import { describe, it, expect } from "vitest";
import {
  createSavedPlaceSchema,
  updateSavedPlaceSchema,
  pinSavedPlaceSchema,
  savedPlaceEntitySchema,
  savedPlaceListResponseSchema,
  savedPlaceResponseSchema,
} from "../schemas/saved-place";

const base = {
  name: "La Bodega",
} as const;

describe("createSavedPlaceSchema", () => {
  it("should accept a minimal valid saved place (defaults placeType to misc)", () => {
    const parsed = createSavedPlaceSchema.parse({ ...base });
    expect(parsed.name).toBe("La Bodega");
    expect(parsed.placeType).toBe("misc");
  });

  it("should accept a fully-populated saved place", () => {
    const place = {
      name: "La Bodega",
      address: "Carrer de la Mar 14, Sóller",
      description: "Great tapas spot for the group dinner",
      placeType: "food_and_drink" as const,
      placeProvider: "google" as const,
      placeId: "ChIJ123",
    };
    const parsed = createSavedPlaceSchema.parse(place);
    expect(parsed.placeId).toBe("ChIJ123");
    // The snapshot fields other place blocks carry are not part of this
    // domain: the base object omits them.
    expect(parsed).not.toHaveProperty("placeName");
    expect(parsed).not.toHaveProperty("placeAddress");
  });

  it("should reject a missing name", () => {
    const result = createSavedPlaceSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should reject an empty name", () => {
    const result = createSavedPlaceSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("at least 1 character");
    }
  });

  it("should reject a name longer than 255 characters", () => {
    const result = createSavedPlaceSchema.safeParse({ name: "a".repeat(256) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "not exceed 255 characters",
      );
    }
  });

  it("should accept a name at boundary lengths", () => {
    expect(() =>
      createSavedPlaceSchema.parse({ name: "A" }),
    ).not.toThrow();
    expect(() =>
      createSavedPlaceSchema.parse({ name: "a".repeat(255) }),
    ).not.toThrow();
  });

  it("should reject a description longer than 2000 characters", () => {
    const result = createSavedPlaceSchema.safeParse({
      ...base,
      description: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "not exceed 2000 characters",
      );
    }
  });

  it("should accept a description at max length", () => {
    expect(() =>
      createSavedPlaceSchema.parse({ ...base, description: "a".repeat(2000) }),
    ).not.toThrow();
  });

  it("should reject an address longer than 500 characters", () => {
    const result = createSavedPlaceSchema.safeParse({
      ...base,
      address: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("should reject a provider without an id", () => {
    const result = createSavedPlaceSchema.safeParse({
      ...base,
      placeProvider: "google",
    });
    expect(result.success).toBe(false);
  });

  it("should reject an id without a provider", () => {
    const result = createSavedPlaceSchema.safeParse({
      ...base,
      placeId: "ChIJ123",
    });
    expect(result.success).toBe(false);
  });

  it("should accept a typed-word place with no placeId", () => {
    expect(() =>
      createSavedPlaceSchema.parse({
        ...base,
        address: "Somewhere off the map",
      }),
    ).not.toThrow();
  });

  it("should accept each of the 9 place types", () => {
    const placeTypes = [
      "travel",
      "food_and_drink",
      "arts_and_entertainment",
      "outdoors",
      "nightlife",
      "wellness",
      "shopping",
      "lodging",
      "misc",
    ] as const;
    expect(placeTypes).toHaveLength(9);
    placeTypes.forEach((placeType) => {
      expect(() =>
        createSavedPlaceSchema.parse({ ...base, placeType }),
      ).not.toThrow();
    });
  });

  it("should reject an invalid place type", () => {
    const result = createSavedPlaceSchema.safeParse({
      ...base,
      placeType: "invalid",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateSavedPlaceSchema", () => {
  it("should accept an empty object (no updates)", () => {
    expect(() => updateSavedPlaceSchema.parse({})).not.toThrow();
  });

  it("should accept partial updates", () => {
    const updates = [
      { name: "Renamed spot" },
      { description: "Updated notes" },
      { address: "New address" },
      { placeType: "lodging" as const },
    ];
    updates.forEach((update) => {
      expect(() => updateSavedPlaceSchema.parse(update)).not.toThrow();
    });
  });

  it("should still validate field constraints when provided", () => {
    const invalidUpdates = [
      { name: "" },
      { name: "a".repeat(256) },
      { description: "a".repeat(2001) },
      { address: "a".repeat(501) },
      { placeType: "invalid" },
    ];
    invalidUpdates.forEach((update) => {
      expect(updateSavedPlaceSchema.safeParse(update).success).toBe(false);
    });
  });

  it("should reject a half place pair", () => {
    expect(
      updateSavedPlaceSchema.safeParse({ placeProvider: "google" }).success,
    ).toBe(false);
    expect(
      updateSavedPlaceSchema.safeParse({ placeId: "ChIJ123" }).success,
    ).toBe(false);
  });

  it("should accept a complete place pair", () => {
    expect(() =>
      updateSavedPlaceSchema.parse({
        placeProvider: "google",
        placeId: "ChIJ123",
      }),
    ).not.toThrow();
  });

  it("should accept an explicit-null pair (the edit form's unlink)", () => {
    const parsed = updateSavedPlaceSchema.parse({
      placeProvider: null,
      placeId: null,
    });
    expect(parsed.placeProvider).toBeNull();
    expect(parsed.placeId).toBeNull();
  });
});

describe("pinSavedPlaceSchema", () => {
  it("should accept pinned true and false", () => {
    expect(pinSavedPlaceSchema.parse({ pinned: true }).pinned).toBe(true);
    expect(pinSavedPlaceSchema.parse({ pinned: false }).pinned).toBe(false);
  });

  it("should reject a missing pinned flag", () => {
    expect(pinSavedPlaceSchema.safeParse({}).success).toBe(false);
  });
});

describe("saved place response schemas", () => {
  const entity = {
    id: "sp1",
    tripId: "t1",
    createdBy: "u1",
    name: "La Bodega",
    address: "Carrer de la Mar 14, Sóller",
    description: null,
    placeType: "food_and_drink" as const,
    place: null,
    isPinned: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("should round-trip a saved place entity", () => {
    expect(savedPlaceEntitySchema.parse(entity)).toEqual(entity);
  });

  it("should parse the list envelope", () => {
    expect(
      savedPlaceListResponseSchema.parse({
        success: true,
        savedPlaces: [entity],
      }).savedPlaces,
    ).toHaveLength(1);
  });

  it("should parse the single envelope", () => {
    expect(
      savedPlaceResponseSchema.parse({ success: true, savedPlace: entity })
        .savedPlace.name,
    ).toBe("La Bodega");
  });
});
