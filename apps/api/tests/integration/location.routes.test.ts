import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users } from "@/db/schema/index.js";
import { generateUniquePhone } from "../test-utils.js";

const SESSION_TOKEN = "00000000-0000-4000-a000-000000000001";

describe("Location Routes", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  async function createAuthenticatedApp(): Promise<{
    token: string;
  }> {
    app = await buildApp();

    const [testUser] = await db
      .insert(users)
      .values({
        phoneNumber: generateUniquePhone(),
        displayName: "Location Test User",
        timezone: "UTC",
      })
      .returning();

    const token = app.jwt.sign({
      sub: testUser.id,
      name: testUser.displayName,
    });

    return { token };
  }

  // ─── Autocomplete tests ───────────────────────────────────────────

  describe("GET /api/locations/autocomplete", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns 401 if not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/locations/autocomplete?q=starbucks&sessionToken=${SESSION_TOKEN}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns AutocompleteSuggestion[] (no lat/lon) for valid query", async () => {
      const { token } = await createAuthenticatedApp();
      app.config.GOOGLE_MAPS_API_KEY = "test-key";

      const mockResponse = {
        suggestions: [
          {
            placePrediction: {
              placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
              text: { text: "Starbucks, Main Street, Chicago, IL, USA" },
              structuredFormat: {
                mainText: { text: "Starbucks" },
                secondaryText: { text: "123 Main St, Chicago, IL" },
              },
            },
          },
          {
            placePrediction: {
              placeId: "ChIJP-GJ4oSuEmsRkS-eYKC6klI",
              text: { text: "Starbucks" },
              structuredFormat: {
                mainText: { text: "Starbucks" },
                secondaryText: { text: "Chicago" },
              },
            },
          },
        ],
      };
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const response = await app.inject({
        method: "GET",
        url: `/api/locations/autocomplete?q=starbucks&sessionToken=${SESSION_TOKEN}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(2);
      expect(body[0]).toEqual({
        placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
        shortName: "Starbucks",
        displayName: "Starbucks, Main Street, Chicago, IL, USA",
        displayAddress: "123 Main St, Chicago, IL",
      });
      // Verify no lat/lon in autocomplete response
      expect(body[0].lat).toBeUndefined();
      expect(body[0].lon).toBeUndefined();
    });

    it("returns [] when GOOGLE_MAPS_API_KEY not set", async () => {
      const { token } = await createAuthenticatedApp();

      // Temporarily clear the API key (env config is a singleton shared across app instances)
      const originalKey = app.config.GOOGLE_MAPS_API_KEY;
      app.config.GOOGLE_MAPS_API_KEY = "";

      const response = await app.inject({
        method: "GET",
        url: `/api/locations/autocomplete?q=starbucks&sessionToken=${SESSION_TOKEN}`,
        cookies: { auth_token: token },
      });

      // Restore the original key so subsequent tests are not affected
      app.config.GOOGLE_MAPS_API_KEY = originalKey;

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual([]);
    });

    it("includes locationBias when lat/lon present", async () => {
      const { token } = await createAuthenticatedApp();
      app.config.GOOGLE_MAPS_API_KEY = "test-key";

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ suggestions: [] }), { status: 200 }),
      );

      await app.inject({
        method: "GET",
        url: `/api/locations/autocomplete?q=starbucks&lat=41.8781&lon=-87.6298&sessionToken=${SESSION_TOKEN}`,
        cookies: { auth_token: token },
      });

      // Verify fetch was called with locationBias in the body
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const fetchUrl = fetchCall[0] as string;
      const fetchOptions = fetchCall[1] as Record<string, unknown>;

      expect(fetchUrl).toContain("places:autocomplete");
      expect(fetchOptions.method).toBe("POST");
      const body = JSON.parse(fetchOptions.body as string);
      expect(body.input).toBe("starbucks");
      expect(body.locationBias).toEqual({
        circle: {
          center: { latitude: 41.8781, longitude: -87.6298 },
          radius: 50000,
        },
      });
    });

    it("omits locationBias when no lat/lon", async () => {
      const { token } = await createAuthenticatedApp();
      app.config.GOOGLE_MAPS_API_KEY = "test-key";

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ suggestions: [] }), { status: 200 }),
      );

      await app.inject({
        method: "GET",
        url: `/api/locations/autocomplete?q=starbucks&sessionToken=${SESSION_TOKEN}`,
        cookies: { auth_token: token },
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const fetchOptions = fetchCall[1] as Record<string, unknown>;
      const body = JSON.parse(fetchOptions.body as string);
      expect(body.input).toBe("starbucks");
      expect(body.locationBias).toBeUndefined();
    });

    it("returns 503 on Google error", async () => {
      const { token } = await createAuthenticatedApp();
      app.config.GOOGLE_MAPS_API_KEY = "test-key";

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Internal Server Error" }), {
          status: 500,
        }),
      );

      const response = await app.inject({
        method: "GET",
        url: `/api/locations/autocomplete?q=starbucks&sessionToken=${SESSION_TOKEN}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns 503 on timeout", async () => {
      const { token } = await createAuthenticatedApp();
      app.config.GOOGLE_MAPS_API_KEY = "test-key";

      vi.spyOn(global, "fetch").mockImplementationOnce((_url, options) => {
        return new Promise((_resolve, reject) => {
          const signal = (options as { signal?: AbortSignal })?.signal;
          if (signal) {
            signal.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }
          // Never resolves on its own — the abort signal will trigger the reject
        });
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/locations/autocomplete?q=starbucks&sessionToken=${SESSION_TOKEN}`,
        cookies: { auth_token: token },
      });

      // The handler catches the AbortError and returns 503
      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("deduplicates results by placeId", async () => {
      const { token } = await createAuthenticatedApp();
      app.config.GOOGLE_MAPS_API_KEY = "test-key";

      const mockResponse = {
        suggestions: [
          {
            placePrediction: {
              placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
              text: { text: "Starbucks" },
              structuredFormat: {
                mainText: { text: "Starbucks" },
                secondaryText: { text: "Chicago" },
              },
            },
          },
          {
            placePrediction: {
              placeId: "unique-id-2",
              text: { text: "Different Place" },
              structuredFormat: {
                mainText: { text: "Different Place" },
                secondaryText: { text: "Chicago" },
              },
            },
          },
          {
            placePrediction: {
              // Duplicate placeId
              placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
              text: { text: "Starbucks (again)" },
              structuredFormat: {
                mainText: { text: "Starbucks" },
                secondaryText: { text: "Chicago" },
              },
            },
          },
        ],
      };
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const response = await app.inject({
        method: "GET",
        url: `/api/locations/autocomplete?q=starbucks&sessionToken=${SESSION_TOKEN}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.length).toBe(2);
      const placeIds = body.map((s: { placeId: string }) => s.placeId);
      expect(placeIds).toEqual([
        "ChIJN1t_tDeuEmsRUsoyG83frY4",
        "unique-id-2",
      ]);
    });
  });

  // ─── Details tests ────────────────────────────────────────────────

  describe("GET /api/locations/details", () => {
    const PLACE_ID = "ChIJN1t_tDeuEmsRUsoyG83frY4";

    it("returns 401 if not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/locations/details?placeId=${PLACE_ID}&sessionToken=${SESSION_TOKEN}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns LocationSuggestion (with lat/lon) for valid placeId+sessionToken", async () => {
      const { token } = await createAuthenticatedApp();
      app.config.GOOGLE_MAPS_API_KEY = "test-key";

      const mockResponse = {
        id: PLACE_ID,
        displayName: { text: "Starbucks", languageCode: "en" },
        formattedAddress: "123 Main St, Chicago, IL 60601, USA",
        location: { latitude: 41.8781, longitude: -87.6298 },
        types: ["cafe", "restaurant"],
      };
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const response = await app.inject({
        method: "GET",
        url: `/api/locations/details?placeId=${PLACE_ID}&sessionToken=${SESSION_TOKEN}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        placeId: PLACE_ID,
        shortName: "Starbucks",
        displayName: "Starbucks",
        displayPlace: "123 Main St, Chicago, IL 60601, USA",
        displayAddress: "123 Main St, Chicago, IL 60601, USA",
        lat: 41.8781,
        lon: -87.6298,
      });
    });

    it("returns 503 when GOOGLE_MAPS_API_KEY not set", async () => {
      const { token } = await createAuthenticatedApp();

      // Temporarily clear the API key (env config is a singleton shared across app instances)
      const originalKey = app.config.GOOGLE_MAPS_API_KEY;
      app.config.GOOGLE_MAPS_API_KEY = "";

      const response = await app.inject({
        method: "GET",
        url: `/api/locations/details?placeId=${PLACE_ID}&sessionToken=${SESSION_TOKEN}`,
        cookies: { auth_token: token },
      });

      // Restore the original key so subsequent tests are not affected
      app.config.GOOGLE_MAPS_API_KEY = originalKey;

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns 503 on Google error", async () => {
      const { token } = await createAuthenticatedApp();

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Not Found" }), { status: 404 }),
      );

      const response = await app.inject({
        method: "GET",
        url: `/api/locations/details?placeId=${PLACE_ID}&sessionToken=${SESSION_TOKEN}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns 503 on timeout", async () => {
      const { token } = await createAuthenticatedApp();

      vi.spyOn(global, "fetch").mockImplementationOnce((_url, options) => {
        return new Promise((_resolve, reject) => {
          const signal = (options as { signal?: AbortSignal })?.signal;
          if (signal) {
            signal.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }
          // Never resolves on its own — the abort signal will trigger the reject
        });
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/locations/details?placeId=${PLACE_ID}&sessionToken=${SESSION_TOKEN}`,
        cookies: { auth_token: token },
      });

      // The handler catches the AbortError and returns 503
      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns 400 on missing placeId", async () => {
      const { token } = await createAuthenticatedApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/locations/details?sessionToken=${SESSION_TOKEN}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 400 on invalid sessionToken", async () => {
      const { token } = await createAuthenticatedApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/locations/details?placeId=${PLACE_ID}&sessionToken=not-a-uuid`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 400 on empty placeId", async () => {
      const { token } = await createAuthenticatedApp();

      const response = await app.inject({
        method: "GET",
        url: `/api/locations/details?placeId=&sessionToken=${SESSION_TOKEN}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
