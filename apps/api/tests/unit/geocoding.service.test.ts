import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NominatimGeocodingService } from "@/services/geocoding.service.js";
import type { Logger } from "@/types/logger.js";

describe("NominatimGeocodingService", () => {
  let service: NominatimGeocodingService;
  const mockLogger = { info: vi.fn(), error: vi.fn() };

  beforeEach(() => {
    service = new NominatimGeocodingService(mockLogger as unknown as Logger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("geocode", () => {
    it("should return coordinates for a valid query", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            { lat: "-33.8679", lon: "151.2073", display_name: "Sydney" },
          ]),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await service.geocode("Sydney Australia");
      expect(result).toEqual({
        lat: -33.8679,
        lon: 151.2073,
        displayName: "Sydney",
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("nominatim.openstreetmap.org"),
        expect.objectContaining({
          headers: {
            "User-Agent":
              "journiful-app (https://github.com/chris-hendrix/tripful)",
          },
        }),
      );
    });

    it("should return null when no results found", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve([]),
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
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              lat: "9.9281",
              lon: "-84.0907",
              display_name: "San José, Costa Rica",
            },
          ]),
      });
      vi.stubGlobal("fetch", mockFetch);

      await service.geocode("San José, Costa Rica");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("San%20Jos%C3%A9%2C%20Costa%20Rica"),
        expect.anything(),
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

    it("should parse string lat/lon to numbers", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                lat: "25.7907",
                lon: "-80.1300",
                display_name: "Miami Beach, Florida, United States",
              },
            ]),
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
  });

  describe("getTimezone", () => {
    it("should return IANA timezone string for a valid query", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ timezone: "Europe/Paris" }],
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await service.getTimezone("Paris, France");
      expect(result).toBe("Europe/Paris");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("geocoding-api.open-meteo.com"),
        expect.objectContaining({
          headers: {
            "User-Agent":
              "journiful-app (https://github.com/chris-hendrix/tripful)",
          },
        }),
      );
    });

    it("should return null when results array is empty", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ results: [] }),
        }),
      );

      const result = await service.getTimezone("xyznonexistent");
      expect(result).toBeNull();
    });

    it("should return null when response has no results key", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({}),
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
      expect(mockLogger.error).toHaveBeenCalledWith(
        networkError,
        "Timezone lookup failed",
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

    it("should return null on non-OK response", async () => {
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
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ timezone: "America/Costa_Rica" }],
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await service.getTimezone("San José, Costa Rica");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("San%20Jos%C3%A9%2C%20Costa%20Rica"),
        expect.anything(),
      );
    });
  });
});
