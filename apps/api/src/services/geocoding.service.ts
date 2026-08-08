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

const GOOGLE_GEOCODING_API = "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_TIMEZONE_API = "https://maps.googleapis.com/maps/api/timezone/json";

export const STUB_TIMEZONES: Record<string, { tz: string; lat: number; lon: number }> = {
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

export function stubLookup(query: string) {
  const lower = query.toLowerCase();
  for (const [key, val] of Object.entries(STUB_TIMEZONES)) {
    if (lower.includes(key)) return val;
  }
  return { tz: "UTC", lat: 47.6062, lon: -122.3321 }; // fallback
}

/**
 * Google Geocoding Service Implementation
 * Uses Google Maps Geocoding API and Time Zone API to resolve
 * location names to coordinates and IANA timezone identifiers.
 * Requires a Google Maps API key.
 */
export class GoogleGeocodingService implements IGeocodingService {
  private apiKey: string;

  constructor(
    apiKey: string,
    private logger?: Logger,
  ) {
    this.apiKey = apiKey;
  }

  async geocode(query: string): Promise<GeocodingResult | null> {
    if (!query?.trim()) return null;
    this.logger?.info({ query }, "Geocoding query");

    if (process.env.GEOCODING_STUB === "true") {
      const match = stubLookup(query);
      return { lat: match.lat, lon: match.lon, displayName: query };
    }

    try {
      const url = `${GOOGLE_GEOCODING_API}?address=${encodeURIComponent(query.trim())}&key=${this.apiKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) return null;

      const data = (await response.json()) as {
        results?: Array<{
          geometry: { location: { lat: number; lng: number } };
          formatted_address: string;
        }>;
        status: string;
      };

      const first = data.results?.[0];
      if (!first) return null;

      return {
        lat: first.geometry.location.lat,
        lon: first.geometry.location.lng,
        displayName: first.formatted_address,
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
      // Geocode first to get coordinates
      const geoResult = await this.geocode(query);
      if (!geoResult) return null;

      return this.getTimezoneByCoords(geoResult.lat, geoResult.lon);
    } catch (err) {
      this.logger?.error(err, "Timezone lookup failed");
      return null;
    }
  }

  async getTimezoneByCoords(lat: number, lon: number): Promise<string | null> {
    this.logger?.info({ lat, lon }, "Timezone lookup by coordinates");

    if (process.env.GEOCODING_STUB === "true") {
      return stubLookup(String(lat) + "," + String(lon)).tz;
    }

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const url = `${GOOGLE_TIMEZONE_API}?location=${encodeURIComponent(`${lat},${lon}`)}&timestamp=${timestamp}&key=${this.apiKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) return null;

      const data = (await response.json()) as {
        timeZoneId?: string;
        status: string;
      };

      return data.timeZoneId ?? null;
    } catch (err) {
      this.logger?.error(err, "Timezone lookup by coords failed");
      return null;
    }
  }
}
