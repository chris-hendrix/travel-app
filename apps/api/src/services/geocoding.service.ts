import type { Logger } from "@/types/logger.js";

/**
 * Geocoding Service Interface
 * Defines the contract for converting location names to coordinates.
 */
export interface GeocodingResult {
  lat: number;
  lon: number;
  displayName: string;
}

export interface IGeocodingService {
  /**
   * Geocodes a location query string into coordinates and a canonical display name
   * @param query - The location name to geocode (e.g. "San Diego, CA")
   * @returns Geocoding result or null if not found / on error
   */
  geocode(query: string): Promise<GeocodingResult | null>;
}

const NOMINATIM_API_BASE = "https://nominatim.openstreetmap.org/search";

/**
 * Nominatim (OpenStreetMap) Geocoding Service Implementation
 * Uses the free Nominatim API to resolve location names to coordinates.
 * No API key required. Handles flexible input formats like
 * "Sydney Australia", "Miami Beach FL", "Tokyo, Japan", etc.
 */
export class NominatimGeocodingService implements IGeocodingService {
  constructor(private logger?: Logger) {}

  async geocode(query: string): Promise<GeocodingResult | null> {
    if (!query?.trim()) return null;

    this.logger?.info({ query }, "Geocoding query");

    try {
      const url = `${NOMINATIM_API_BASE}?q=${encodeURIComponent(query.trim())}&format=json&limit=1`;
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "journiful-app (https://github.com/chris-hendrix/tripful)",
        },
      });

      if (!response.ok) return null;

      const data = (await response.json()) as Array<{
        lat: string;
        lon: string;
        display_name: string;
      }>;

      const first = data[0];
      if (!first) return null;

      return {
        lat: parseFloat(first.lat),
        lon: parseFloat(first.lon),
        displayName: first.display_name,
      };
    } catch (err) {
      this.logger?.error(err, "Geocoding failed");
      return null;
    }
  }
}
