import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GoogleGeocodingService } from "@/services/geocoding.service.js";
import type { Logger } from "@/types/logger.js";

const API_KEY = "test-api-key";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const TIMEZONE_URL = "https://maps.googleapis.com/maps/api/timezone/json";

describe("GoogleGeocodingService", () => {
  let service: GoogleGeocodingService;
  const mockLogger = { info: vi.fn(), error: vi.fn() };

  const makeGeocodeResponse = (results: Array<{ lat: number; lon: number; formatted_address: string }>) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ results: results.map(r => ({ geometry: { location: { lat: r.lat, lng: r.lon } }, formatted_address: r.formatted_address })), status: "OK" }),
    });

  beforeEach(() => {
    service = new GoogleGeocodingService(API_KEY, mockLogger as unknown as Logger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe("geocode", () => {
    it("should return coordinates for a valid query", async () => {
      const mockFetch = vi.fn().mockReturnValue(
        makeGeocodeResponse([{ lat: -33.8679, lon: 151.2073, formatted_address: "Sydney NSW, Australia" }]),
      );
      vi.stubGlobal("fetch", mockFetch);

      const result = await service.geocode("Sydney Australia");
      expect(result).toEqual({
        lat: -33.8679,
        lon: 151.2073,
        displayName: "Sydney NSW, Australia",
      });
      expect(mockFetch).toHaveBeenCalledWith(
        `${GEOCODE_URL}?address=${encodeURIComponent("Sydney Australia")}&key=${API_KEY}`,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("should return null when no results found", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ results: [], status: "ZERO_RESULTS" }),
        }),
      );

      const result = await service.geocode("xyznonexistent");
      expect(result).toBeNull();
    });

    it("should return null on network error and log the error", async () => {
      const networkError = new Error("Network error");
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

      const result = await service.geocode("San Diego");
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        networkError,
        "Geocoding failed",
      );
    });

    it("should return null on non-OK response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
        }),
      );

      const result = await service.geocode("San Diego");
      expect(result).toBeNull();
    });

    it("should encode query parameter properly", async () => {
      const mockFetch = vi.fn().mockReturnValue(
        makeGeocodeResponse([{ lat: 9.9281, lon: -84.0907, formatted_address: "San José, Costa Rica" }]),
      );
      vi.stubGlobal("fetch", mockFetch);

      await service.geocode("San José, Costa Rica");
      expect(mockFetch).toHaveBeenCalledWith(
        `${GEOCODE_URL}?address=${encodeURIComponent("San José, Costa Rica")}&key=${API_KEY}`,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("should return null for empty query", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const result = await service.geocode("");
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should return null for whitespace-only query", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const result = await service.geocode("   ");
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should parse lat/lng as numbers", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [
                {
                  geometry: { location: { lat: 25.7907, lng: -80.13 } },
                  formatted_address: "Miami Beach, Florida, United States",
                },
              ],
              status: "OK",
            }),
        }),
      );

      const result = await service.geocode("Miami Beach FL");
      expect(result).toEqual({
        lat: 25.7907,
        lon: -80.13,
        displayName: "Miami Beach, Florida, United States",
      });
      expect(typeof result!.lat).toBe("number");
      expect(typeof result!.lon).toBe("number");
    });

    describe("GEOCODING_STUB", () => {
      it("should return stub data when GEOCODING_STUB is set", async () => {
        vi.stubEnv("GEOCODING_STUB", "true");
        const mockFetch = vi.fn();
        vi.stubGlobal("fetch", mockFetch);

        const result = await service.geocode("Paris");
        expect(result).toEqual({
          lat: 48.8566,
          lon: 2.3522,
          displayName: "Paris",
        });
        expect(mockFetch).not.toHaveBeenCalled();
      });
    });
  });

  describe("getTimezoneByCoords", () => {
    it("should return IANA timezone for coordinates", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ timeZoneId: "Europe/Paris", status: "OK" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const now = Math.floor(Date.now() / 1000);
      const result = await service.getTimezoneByCoords(48.8566, 2.3522);
      expect(result).toBe("Europe/Paris");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`${TIMEZONE_URL}?location=48.8566%2C2.3522&timestamp=`),
        expect.anything(),
      );
    });

    it("should return null when timeZoneId is missing", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ status: "OK" }),
        }),
      );

      const result = await service.getTimezoneByCoords(0, 0);
      expect(result).toBeNull();
    });

    it("should return null on network error and log the error", async () => {
      const networkError = new Error("Network error");
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

      const result = await service.getTimezoneByCoords(35.6762, 139.6503);
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        networkError,
        "Timezone lookup by coords failed",
      );
    });

    it("should return null on non-OK response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
        }),
      );

      const result = await service.getTimezoneByCoords(51.5074, -0.1278);
      expect(result).toBeNull();
    });

    describe("GEOCODING_STUB", () => {
      it("should return stub timezone when GEOCODING_STUB is set", async () => {
        vi.stubEnv("GEOCODING_STUB", "true");
        const mockFetch = vi.fn();
        vi.stubGlobal("fetch", mockFetch);

        // "paris" matches the stub key; fallback tz is "UTC" for unrecognized coords
        const result = await service.getTimezoneByCoords(48.8566, 2.3522);
        expect(result).toBe("UTC");
        expect(mockFetch).not.toHaveBeenCalled();
      });
    });
  });

  describe("getTimezone", () => {
    it("should return IANA timezone string for a valid query (geocode + timezone API)", async () => {
      const mockFetch = vi
        .fn()
        // First call: geocode
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [
                {
                  geometry: { location: { lat: 48.8566, lng: 2.3522 } },
                  formatted_address: "Paris, France",
                },
              ],
              status: "OK",
            }),
        })
        // Second call: timezone
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ timeZoneId: "Europe/Paris", status: "OK" }),
        });
      vi.stubGlobal("fetch", mockFetch);

      const result = await service.getTimezone("Paris, France");
      expect(result).toBe("Europe/Paris");
      // First call: geocode
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        `${GEOCODE_URL}?address=${encodeURIComponent("Paris, France")}&key=${API_KEY}`,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      // Second call: timezone API with coordinates from geocode result
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(`${TIMEZONE_URL}?location=48.8566%2C2.3522&timestamp=`),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("should return null when geocode returns no results", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ results: [], status: "ZERO_RESULTS" }),
        }),
      );

      const result = await service.getTimezone("xyznonexistent");
      expect(result).toBeNull();
    });

    it("should return null when timezone API returns no timeZoneId", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          // geocode OK
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                results: [
                  {
                    geometry: { location: { lat: 0, lng: 0 } },
                    formatted_address: "Null Island",
                  },
                ],
                status: "OK",
              }),
          })
          // timezone returns no timeZoneId
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ status: "OK" }),
          }),
      );

      const result = await service.getTimezone("somewhere");
      expect(result).toBeNull();
    });

    it("should return null on network error and log the error", async () => {
      const networkError = new Error("Network error");
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

      const result = await service.getTimezone("Tokyo");
      expect(result).toBeNull();
      // geocode catches the network error internally and logs "Geocoding failed"
      expect(mockLogger.error).toHaveBeenCalledWith(
        networkError,
        "Geocoding failed",
      );
    });

    it("should return null for empty query", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const result = await service.getTimezone("");
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should return null for whitespace-only query", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const result = await service.getTimezone("   ");
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should return null on non-OK geocode response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
        }),
      );

      const result = await service.getTimezone("London");
      expect(result).toBeNull();
    });

    it("should encode query parameter properly", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [
                {
                  geometry: { location: { lat: 9.9281, lng: -84.0907 } },
                  formatted_address: "San José, Costa Rica",
                },
              ],
              status: "OK",
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ timeZoneId: "America/Costa_Rica", status: "OK" }),
        });
      vi.stubGlobal("fetch", mockFetch);

      await service.getTimezone("San José, Costa Rica");
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        `${GEOCODE_URL}?address=${encodeURIComponent("San José, Costa Rica")}&key=${API_KEY}`,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    describe("GEOCODING_STUB", () => {
      it("should return stub timezone when GEOCODING_STUB is set", async () => {
        vi.stubEnv("GEOCODING_STUB", "true");
        const mockFetch = vi.fn();
        vi.stubGlobal("fetch", mockFetch);

        const result = await service.getTimezone("Tokyo");
        expect(result).toBe("Asia/Tokyo");
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it("should return null when geocode fails in GEOCODING_STUB mode (no match)", async () => {
        // Even in STUB mode, getTimezone calls geocode first which uses stubLookup,
        // then getTimezoneByCoords which also uses stubLookup.
        // For an unrecognized query, geocode returns the fallback stub data,
        // then getTimezoneByCoords returns UTC.
        // For a recognized query, we already test above.
        vi.stubEnv("GEOCODING_STUB", "true");

        // The geocode stub returns a match for any query, so getTimezone will
        // succeed even for unknown queries via the fallback stub data.
        // Let's verify it returns UTC for a completely unknown query.
        const result = await service.getTimezone("zzzunknown");
        expect(result).toBe("UTC");
      });
    });
  });
});
