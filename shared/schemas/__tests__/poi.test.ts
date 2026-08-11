import { describe, it, expect } from "vitest";
import { poiSuggestionSchema } from "../poi.js";

describe("poiSuggestionSchema", () => {
  it("accepts null for photoName, photoAttribution, googleMapsUri, businessStatus", () => {
    const result = poiSuggestionSchema.safeParse({
      sourceId: "ChIJ123",
      name: "Test Place",
      address: null,
      lat: 1,
      lon: 2,
      distance: 100,
      category: "food_and_drink",
      popularity: null,
      price: null,
      rating: null,
      website: null,
      tel: null,
      subcategory: null,
      eventId: null,
      photoName: null,
      photoAttribution: null,
      googleMapsUri: null,
      businessStatus: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.photoName).toBeNull();
      expect(result.data.photoAttribution).toBeNull();
      expect(result.data.googleMapsUri).toBeNull();
      expect(result.data.businessStatus).toBeNull();
    }
  });

  it("accepts string values for photo fields", () => {
    const result = poiSuggestionSchema.safeParse({
      sourceId: "ChIJ123",
      name: "Test Place",
      address: "123 Main St",
      lat: 1,
      lon: 2,
      distance: 100,
      category: "food_and_drink",
      popularity: null,
      price: null,
      rating: null,
      website: null,
      tel: null,
      subcategory: null,
      eventId: null,
      photoName: "places/x/photos/y",
      photoAttribution: "Jane Doe",
      googleMapsUri: "https://maps.google.com/?cid=123",
      businessStatus: "OPERATIONAL",
    });

    expect(result.success).toBe(true);
  });

  it("rejects non-string photo fields", () => {
    const result = poiSuggestionSchema.safeParse({
      sourceId: "ChIJ123",
      name: "Test Place",
      address: null,
      lat: 1,
      lon: 2,
      distance: 100,
      category: "food_and_drink",
      popularity: null,
      price: null,
      rating: null,
      website: null,
      tel: null,
      subcategory: null,
      eventId: null,
      photoName: 123,
    });

    expect(result.success).toBe(false);
  });
});
