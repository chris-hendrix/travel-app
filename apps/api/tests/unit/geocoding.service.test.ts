import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenMeteoGeocodingService } from "@/services/geocoding.service.js";

describe("OpenMeteoGeocodingService", () => {
  let service: OpenMeteoGeocodingService;
  const mockLogger = { info: vi.fn(), error: vi.fn() };

  beforeEach(() => {
    service = new OpenMeteoGeocodingService(mockLogger as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("geocode", () => {
    it("should return coordinates for a valid query", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              { latitude: 32.7157, longitude: -117.1611, name: "San Diego" },
            ],
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await service.geocode("San Diego");
      expect(result).toEqual({ lat: 32.7157, lon: -117.1611 });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("geocoding-api.open-meteo.com"),
      );
    });

    it("should return null when no results found", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({}),
        }),
      );

      const result = await service.geocode("xyznonexistent");
      expect(result).toBeNull();
    });

    it("should return null when results array is empty", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ results: [] }),
        }),
      );

      const result = await service.geocode("xyznonexistent");
      expect(result).toBeNull();
    });

    it("should return null on network error and log the error", async () => {
      const networkError = new Error("Network error");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(networkError),
      );

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
          Promise.resolve({
            results: [
              { latitude: 48.8566, longitude: 2.3522, name: "Paris" },
            ],
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await service.geocode("San José, Costa Rica");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("San%20Jos%C3%A9%2C%20Costa%20Rica"),
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
  });
});
