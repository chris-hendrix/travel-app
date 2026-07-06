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

const STUB_TIMEZONES: Record<string, { tz: string; lat: number; lon: number }> = {
  seattle:     { tz: "America/Los_Angeles", lat: 47.6062, lon: -122.3321 },
  portland:    { tz: "America/Los_Angeles", lat: 45.5152, lon: -122.6784 },
  austin:      { tz: "America/Chicago",      lat: 30.2672, lon: -97.7431 },
  chicago:     { tz: "America/Chicago",      lat: 41.8781, lon: -87.6298 },
  miami:       { tz: "America/New_York",     lat: 25.7617, lon: -80.1918 },
  "new york":  { tz: "America/New_York",     lat: 40.7128, lon: -74.0060 },
  london:      { tz: "Europe/London",        lat: 51.5074, lon: -0.1278 },
  paris:       { tz: "Europe/Paris",         lat: 48.8566, lon: 2.3522 },
  barcelona:   { tz: "Europe/Madrid",        lat: 41.3874, lon: 2.1686 },
  tokyo:       { tz: "Asia/Tokyo",           lat: 35.6762, lon: 139.6503 },
  sydney:      { tz: "Australia/Sydney",     lat: -33.8688, lon: 151.2093 },
  maui:        { tz: "Pacific/Honolulu",     lat: 20.7984, lon: -156.3319 },
  honolulu:    { tz: "Pacific/Honolulu",     lat: 21.3069, lon: -157.8583 },
  "san francisco": { tz: "America/Los_Angeles", lat: 37.7749, lon: -122.4194 },
  "los angeles":   { tz: "America/Los_Angeles", lat: 34.0522, lon: -118.2437 },
};

function stubLookup(query: string) {
  const lower = query.toLowerCase();
  for (const [key, val] of Object.entries(STUB_TIMEZONES)) {
    if (lower.includes(key)) return val;
  }
  return { tz: "UTC", lat: 47.6062, lon: -122.3321 }; // fallback
}

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

    if (process.env.GEOCODING_STUB === "true") {
      const match = stubLookup(query);
      return { lat: match.lat, lon: match.lon, displayName: query };
    }

    try {
      const url = `${NOMINATIM_API_BASE}?q=${encodeURIComponent(query.trim())}&format=json&limit=1`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "journiful-app (https://github.com/chris-hendrix/tripful)",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

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

    if (process.env.GEOCODING_STUB === "true") {
      return stubLookup(query).tz;
    }

    try {
      const url = `${OPEN_METEO_GEOCODING_API}?name=${encodeURIComponent(query.trim())}&count=1`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
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

    if (process.env.GEOCODING_STUB === "true") {
      // Fall back to string lookup — most coordinate pairs won't match city names,
      // so this returns "UTC" for unrecognized coordinates.
      return stubLookup(String(lat) + "," + String(lon)).tz;
    }

    try {
      const url = `${OPEN_METEO_FORECAST_API}?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=0`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
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
