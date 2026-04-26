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

  /**
   * Looks up the IANA timezone for a location query string
   * @param query - The location name to look up (e.g. "Paris, France")
   * @returns IANA timezone string (e.g. "Europe/Paris") or null if not found / on error
   */
  getTimezone(query: string): Promise<string | null>;

  /**
   * Looks up the IANA timezone for a coordinate pair
   * @param lat - Latitude
   * @param lon - Longitude
   * @returns IANA timezone string (e.g. "Europe/Paris") or null if not found / on error
   */
  getTimezoneByCoords(lat: number, lon: number): Promise<string | null>;
}

const NOMINATIM_API_BASE = "https://nominatim.openstreetmap.org/search";
const OPEN_METEO_GEOCODING_API = "https://geocoding-api.open-meteo.com/v1/search";
const OPEN_METEO_FORECAST_API = "https://api.open-meteo.com/v1/forecast";

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

  async getTimezone(query: string): Promise<string | null> {
    if (!query?.trim()) return null;

    this.logger?.info({ query }, "Timezone lookup query");

    try {
      const url = `${OPEN_METEO_GEOCODING_API}?name=${encodeURIComponent(query.trim())}&count=1`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "journiful-app (https://github.com/chris-hendrix/tripful)",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) return null;

      const data = (await response.json()) as {
        results?: Array<{ timezone: string }>;
      };

      return data.results?.[0]?.timezone ?? null;
    } catch (err) {
      this.logger?.error(err, "Timezone lookup failed");
      return null;
    }
  }

  async getTimezoneByCoords(lat: number, lon: number): Promise<string | null> {
    this.logger?.info({ lat, lon }, "Timezone lookup by coordinates");

    try {
      const url = `${OPEN_METEO_FORECAST_API}?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=0`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) return null;

      const data = (await response.json()) as { timezone?: string };
      return data.timezone ?? null;
    } catch (err) {
      this.logger?.error(err, "Timezone lookup by coords failed");
      return null;
    }
  }
}
