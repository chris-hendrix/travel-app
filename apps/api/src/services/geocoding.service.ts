import type { Logger } from "@/types/logger.js";

/**
 * Geocoding Service Interface
 * Defines the contract for converting location names to coordinates.
 */
export interface IGeocodingService {
  /**
   * Geocodes a location query string into latitude/longitude coordinates
   * @param query - The location name to geocode (e.g. "San Diego, CA")
   * @returns Coordinates object or null if not found / on error
   */
  geocode(query: string): Promise<{ lat: number; lon: number } | null>;
}

const GEOCODING_API_BASE =
  "https://geocoding-api.open-meteo.com/v1/search";

/**
 * Open-Meteo Geocoding Service Implementation
 * Uses the free Open-Meteo Geocoding API to resolve location names to coordinates.
 * No API key required.
 */
export class OpenMeteoGeocodingService implements IGeocodingService {
  constructor(private logger?: Logger) {}

  async geocode(query: string): Promise<{ lat: number; lon: number } | null> {
    if (!query?.trim()) return null;

    this.logger?.info({ query }, "Geocoding query");

    try {
      const url = `${GEOCODING_API_BASE}?name=${encodeURIComponent(query)}&count=1&language=en`;
      const response = await fetch(url);

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        results?: Array<{ latitude: number; longitude: number }>;
      };

      const first = data.results?.[0];
      if (!first) {
        return null;
      }

      return {
        lat: first.latitude,
        lon: first.longitude,
      };
    } catch (err) {
      this.logger?.error(err, "Geocoding failed");
      return null;
    }
  }
}
