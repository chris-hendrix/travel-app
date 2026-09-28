import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("places.service (RED: module does not exist yet)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("autocomplete builds the documented request and maps types + distanceMeters", async () => {
    const mod = await import("@/services/places.service.js");
    expect(typeof mod.autocompletePlaces).toBe("function");
    expect(mod.AUTOCOMPLETE_FIELD_MASK).toContain(
      "suggestions.placePrediction.types",
    );
    expect(mod.AUTOCOMPLETE_MAX_DISTANCE_METERS).toBe(250_000);

    vi.spyOn(global, "fetch").mockImplementationOnce(async (url, init) => {
      const body = JSON.parse((init as { body: string }).body);
      // origin + bias sent together when lat/lon given
      expect(body.origin).toEqual({ latitude: 41.8781, longitude: -87.6298 });
      expect(body.locationBias.circle.radius).toBe(50000);
      expect(body.includedRegionCodes).toEqual(["ES"]);
      return new Response(
        JSON.stringify({
          suggestions: [
            {
              placePrediction: {
                placeId: "A",
                text: { text: "La Bodega, Soller" },
                structuredFormat: {
                  mainText: { text: "La Bodega" },
                  secondaryText: { text: "Carrer de la Mar 14, Soller" },
                },
                types: ["restaurant", "food"],
                distanceMeters: 90000,
              },
            },
            {
              placePrediction: {
                placeId: "B",
                text: { text: "Far Away" },
                structuredFormat: { mainText: { text: "Far Away" } },
                types: ["museum"],
                distanceMeters: 1_400_000,
              },
            },
            {
              placePrediction: {
                placeId: "C",
                text: { text: "No Distance" },
                structuredFormat: { mainText: { text: "No Distance" } },
                types: [],
              },
            },
          ],
        }),
        { status: 200 },
      );
    });

    const out = await mod.autocompletePlaces({
      input: "La Bod",
      sessionToken: "00000000-0000-4000-a000-000000000001",
      lat: 41.8781,
      lon: -87.6298,
      country: "ES",
      apiKey: "test-key",
    });
    // 1_400_000m dropped, 90_000 kept, missing distance kept
    expect(out.map((s) => s.placeId)).toEqual(["A", "C"]);
    expect(out[0].types).toEqual(["restaurant", "food"]);
    expect(out[0].distanceMeters).toBe(90000);
    expect(out[1].distanceMeters).toBeNull();
  });

  it("details mask is exact, types absent, photos map to CachedPhoto", async () => {
    const mod = await import("@/services/places.service.js");
    expect(mod.DETAILS_FIELD_MASK).toBe(
      "id,photos,formattedAddress,location,addressComponents,attributions",
    );
    expect(mod.DETAILS_FIELD_MASK).not.toContain("types");
    expect(mod.DETAILS_FIELD_MASK).not.toContain("displayName");

    vi.spyOn(global, "fetch").mockImplementationOnce(async (_url, init) => {
      const headers = init as { headers: Record<string, string> };
      expect(headers.headers["X-Goog-FieldMask"]).toBe(mod.DETAILS_FIELD_MASK);
      return new Response(
        JSON.stringify({
          id: "ChIJ1",
          formattedAddress: "Carrer de la Mar 14, Sóller, ES",
          location: { latitude: 39.7, longitude: 2.7 },
          addressComponents: [
            { longText: "Spain", shortText: "ES", types: ["country", "political"], languageCode: "en" },
          ],
          photos: [
            {
              name: "places/ChIJ1/photos/REF1",
              widthPx: 4000,
              heightPx: 3000,
              authorAttributions: [
                { displayName: "Marta R.", uri: "https://maps.google.com/a", photoUri: "https://pic/x" },
              ],
              googleMapsUri: "https://maps.google.com/photo",
            },
          ],
        }),
        { status: 200 },
      );
    });

    const d = await mod.fetchPlaceDetails({
      placeId: "ChIJ1",
      sessionToken: "00000000-0000-4000-a000-000000000001",
      apiKey: "test-key",
    });
    expect(d.photos).toEqual([
      {
        ref: "places/ChIJ1/photos/REF1",
        widthPx: 4000,
        heightPx: 3000,
        authorName: "Marta R.",
        authorUri: "https://maps.google.com/a",
        authorPhotoUri: "https://pic/x",
        mapsUri: "https://maps.google.com/photo",
      },
    ]);
    expect(d.country).toBe("ES");
    // displayName is excluded from the mask (billing), so the cached
    // name is honestly empty (unknown) — never the formatted address,
    // which lives in `address`. Never render `name`.
    expect(d.name).toBe("");
    expect(d.address).toBe("Carrer de la Mar 14, Sóller, ES");
  });

  it("non-200 surfaces as a typed PlacesError, not a raw throw", async () => {
    const mod = await import("@/services/places.service.js");
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("boom", { status: 500 }),
    );
    await expect(
      mod.autocompletePlaces({
        input: "x",
        sessionToken: "00000000-0000-4000-a000-000000000001",
        apiKey: "k",
      }),
    ).rejects.toBeInstanceOf(mod.PlacesError);
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("nf", { status: 404 }),
    );
    await expect(
      mod.fetchPlaceDetails({
        placeId: "ChIJ1",
        sessionToken: "00000000-0000-4000-a000-000000000001",
        apiKey: "k",
      }),
    ).rejects.toBeInstanceOf(mod.PlacesError);
  });

  it("details reads locality out of addressComponents", async () => {
    const mod = await import("@/services/places.service.js");
    vi.spyOn(global, "fetch").mockImplementationOnce(async () =>
      new Response(
        JSON.stringify({
          id: "ChIJmiami",
          formattedAddress: "123 Main St, Miami, FL 33101, USA",
          location: { latitude: 25.7, longitude: -80.2 },
          addressComponents: [
            { longText: "Miami", shortText: "Miami", types: ["locality", "political"], languageCode: "en" },
            { longText: "Florida", shortText: "FL", types: ["administrative_area_level_1", "political"], languageCode: "en" },
            { longText: "United States", shortText: "US", types: ["country", "political"], languageCode: "en" },
          ],
          photos: [],
        }),
        { status: 200 },
      ),
    );
    const d = await mod.fetchPlaceDetails({
      placeId: "ChIJmiami",
      sessionToken: "00000000-0000-4000-a000-000000000001",
      apiKey: "test-key",
    });
    expect(d.locality).toBe("Miami");
  });

  it("details locality falls back postal_town > sublocality_level_1 > admin_level_2, null for country-only", async () => {
    const mod = await import("@/services/places.service.js");
    const run = async (components: Array<{ longText: string; shortText: string; types: string[] }>) => {
      vi.spyOn(global, "fetch").mockImplementationOnce(async () =>
        new Response(
          JSON.stringify({
            id: "ChIJx",
            formattedAddress: "somewhere",
            location: { latitude: 1, longitude: 2 },
            addressComponents: components.map((c) => ({ ...c, languageCode: "en" })),
            photos: [],
          }),
          { status: 200 },
        ),
      );
      return mod.fetchPlaceDetails({
        placeId: "ChIJx",
        sessionToken: "00000000-0000-4000-a000-000000000001",
        apiKey: "test-key",
      });
    };
    const postalTown = await run([
      { longText: "Slough", shortText: "Slough", types: ["postal_town"] },
      { longText: "England", shortText: "England", types: ["administrative_area_level_1", "political"] },
      { longText: "United Kingdom", shortText: "GB", types: ["country", "political"] },
    ]);
    expect(postalTown.locality).toBe("Slough");
    const sub = await run([
      { longText: "Brooklyn", shortText: "Brooklyn", types: ["sublocality_level_1", "political"] },
      { longText: "United States", shortText: "US", types: ["country", "political"] },
    ]);
    expect(sub.locality).toBe("Brooklyn");
    const admin2 = await run([
      { longText: "Miami-Dade County", shortText: "Miami-Dade County", types: ["administrative_area_level_2", "political"] },
      { longText: "United States", shortText: "US", types: ["country", "political"] },
    ]);
    expect(admin2.locality).toBe("Miami-Dade County");
    const countryOnly = await run([
      { longText: "United States", shortText: "US", types: ["country", "political"] },
    ]);
    expect(countryOnly.locality).toBeNull();
  });

  it("details locality resolves longText over shortText", async () => {
    const mod = await import("@/services/places.service.js");
    vi.spyOn(global, "fetch").mockImplementationOnce(async () =>
      new Response(
        JSON.stringify({
          id: "ChIJy",
          formattedAddress: "123 Main St, Miami, FL, USA",
          location: { latitude: 25.7, longitude: -80.2 },
          addressComponents: [
            { longText: "Miami", shortText: "MIA", types: ["locality", "political"], languageCode: "en" },
            { longText: "United States", shortText: "US", types: ["country", "political"], languageCode: "en" },
          ],
          photos: [],
        }),
        { status: 200 },
      ),
    );
    const d = await mod.fetchPlaceDetails({
      placeId: "ChIJy",
      sessionToken: "00000000-0000-4000-a000-000000000001",
      apiKey: "test-key",
    });
    expect(d.locality).toBe("Miami");
  });

  it("media fetches bytes with content type", async () => {
    const mod = await import("@/services/places.service.js");
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(Buffer.from("img"), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );
    const out = await mod.fetchPlacePhotoMedia({
      photoRef: "places/X/photos/Y",
      maxWidthPx: 1920,
      maxHeightPx: 1920,
      apiKey: "k",
    });
    expect(out.contentType).toContain("image/jpeg");
    expect(Buffer.from(await out.buffer)).toEqual(Buffer.from("img"));
  });
});
