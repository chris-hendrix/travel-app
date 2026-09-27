// Phase 1 Tasks 1+2: the place pair reaches the three create/update schemas;
// placeSummarySchema / cachedPlaceDetailsSchema round-trip and reject strays.

import { describe, it, expect } from "vitest";
import {
  placeProviderSchema,
  placePairSchema,
  placeBoxSchema,
  placeSummarySchema,
  cachedPlaceDetailsSchema,
  createTripSchema,
  updateTripSchema,
  createEventSchema,
  updateEventSchema,
  createAccommodationSchema,
  updateAccommodationSchema,
} from "../schemas/index.js";

const pair = { placeProvider: "google", placeId: "ChIJ123" } as const;

describe("place pair schemas", () => {
  it("accepts a valid provider + id pair", () => {
    expect(placePairSchema.parse(pair)).toEqual(pair);
  });

  it("rejects a provider without an id", () => {
    expect(() =>
      placePairSchema.parse({ placeProvider: "google" }),
    ).toThrow();
  });

  it("rejects an id without a provider", () => {
    expect(() =>
      placePairSchema.parse({ placeId: "ChIJ123" }),
    ).toThrow();
  });

  it("rejects an unknown provider", () => {
    expect(() =>
      placeProviderSchema.parse("apple"),
    ).toThrow();
  });

  it("accepts only the card|hero boxes", () => {
    expect(placeBoxSchema.parse("card")).toBe("card");
    expect(placeBoxSchema.parse("hero")).toBe("hero");
    expect(() => placeBoxSchema.parse("thumb")).toThrow();
  });
});

const tripBase = {
  name: "Mallorca",
  destination: "Sóller",
  timezone: "Europe/Madrid",
};
const eventBase = {
  name: "Dinner",
  eventType: "food_and_drink",
  startTime: "2026-07-15T19:00:00Z",
  allDay: false,
} as const;
const stayBase = { name: "Hotel" };

describe("place pair on create/update schemas", () => {
  it.each([
    ["createTripSchema", createTripSchema, tripBase],
    ["updateTripSchema", updateTripSchema, {}],
    ["createEventSchema", createEventSchema, eventBase],
    ["updateEventSchema", updateEventSchema, {}],
    ["createAccommodationSchema", createAccommodationSchema, stayBase],
    ["updateAccommodationSchema", updateAccommodationSchema, {}],
  ])("%s accepts the pair and rejects a half pair", (_name, schema, base) => {
    expect(schema.parse({ ...base, ...pair }).placeProvider).toBe("google");
    expect(() =>
      schema.parse({ ...base, placeProvider: "google" }),
    ).toThrow();
    expect(() =>
      schema.parse({ ...base, placeId: "ChIJ123" }),
    ).toThrow();
    // absent pair still parses
    expect(() => schema.parse({ ...base })).not.toThrow();
  });
});

const fullSummary = {
  placeId: "ChIJ123",
  name: "La Bodega",
  address: "Carrer de la Mar 14, Sóller",
  photoUrl: "https://api.example/api/locations/photos/places%2Fa%2Fphotos%2Fr",
  photoAttribution: {
    name: "Marta R.",
    uri: "https://maps.google.com/?cid=1",
    photoUri: null,
  },
  photoSourceUri: "https://maps.google.com/?cid=1",
  country: "ES",
};

describe("placeSummarySchema", () => {
  it("round-trips a fully-populated summary", () => {
    expect(placeSummarySchema.parse(fullSummary)).toEqual(fullSummary);
  });

  it("round-trips a null-photo summary", () => {
    const noPhoto = {
      ...fullSummary,
      photoUrl: null,
      photoAttribution: null,
      photoSourceUri: null,
    };
    expect(placeSummarySchema.parse(noPhoto)).toEqual(noPhoto);
  });
});

describe("cachedPlaceDetailsSchema", () => {
  const details = {
    v: 1,
    name: "La Bodega",
    address: "Carrer de la Mar 14, Sóller",
    shortAddress: "Carrer de la Mar 14",
    lat: 39.77,
    lon: 2.71,
    photos: [
      {
        ref: "places/ChIJ123/photos/REF",
        widthPx: 4000,
        heightPx: 3000,
        authorName: "Marta R.",
        authorUri: "https://maps.google.com/?cid=1",
        authorPhotoUri: null,
        mapsUri: "https://maps.google.com/?cid=1",
      },
    ],
    country: "ES",
  };

  it("round-trips a populated snapshot", () => {
    expect(cachedPlaceDetailsSchema.parse(details)).toEqual(details);
  });

  it("rejects an object carrying the removed `category` key", () => {
    expect(() =>
      cachedPlaceDetailsSchema.parse({ ...details, category: "restaurant" }),
    ).toThrow();
  });
});
