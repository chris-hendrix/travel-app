import { eq, gt, and } from "drizzle-orm";
import { trips, weatherCache } from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";
import type { ITripService } from "@/services/trip.service.js";
import type { TripWeatherResponse, DailyForecast } from "@tripful/shared/types";

const FORECAST_API_BASE = "https://api.open-meteo.com/v1/forecast";
const CACHE_MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3 hours
const MAX_FORECAST_DAYS = 16;

/**
 * Weather Service Interface
 * Defines the contract for fetching weather forecasts for trips.
 */
export interface IWeatherService {
  getForecast(tripId: string): Promise<TripWeatherResponse>;
}

interface OpenMeteoDaily {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_probability_max: number[];
}

/**
 * Weather Service Implementation
 * Fetches weather forecasts from Open-Meteo, caches results per trip,
 * and filters forecasts to the trip's date range.
 */
export class WeatherService implements IWeatherService {
  constructor(
    private db: AppDatabase,
    private tripService: ITripService,
  ) {}

  async getForecast(tripId: string): Promise<TripWeatherResponse> {
    // 1. Query trip for coordinates and timezone
    const [trip] = await this.db
      .select({
        destinationLat: trips.destinationLat,
        destinationLon: trips.destinationLon,
        destinationDisplayName: trips.destinationDisplayName,
        preferredTimezone: trips.preferredTimezone,
      })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    if (!trip) {
      return { available: false, forecasts: [], fetchedAt: null };
    }

    // 2. Check coordinates
    if (trip.destinationLat == null || trip.destinationLon == null) {
      return {
        available: false,
        message: "Set a destination to see weather",
        forecasts: [],
        fetchedAt: null,
      };
    }

    // 3. Get effective date range
    const { start, end } = await this.tripService.getEffectiveDateRange(tripId);

    if (!start) {
      return {
        available: false,
        message: "Set trip dates to see weather",
        forecasts: [],
        fetchedAt: null,
      };
    }

    // 4. Check if trip is in the past
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    if (end) {
      const endStr =
        end instanceof Date ? end.toISOString().slice(0, 10) : String(end);
      if (endStr < todayStr) {
        return { available: false, forecasts: [], fetchedAt: null };
      }
    }

    // 5. Check if trip start is more than 16 days away
    const startStr =
      start instanceof Date ? start.toISOString().slice(0, 10) : String(start);
    const maxForecastDate = new Date(today);
    maxForecastDate.setDate(maxForecastDate.getDate() + MAX_FORECAST_DAYS);
    const maxForecastStr = maxForecastDate.toISOString().slice(0, 10);
    if (startStr > maxForecastStr) {
      return {
        available: false,
        message: "Weather forecast available within 16 days of your trip",
        forecasts: [],
        fetchedAt: null,
      };
    }

    // 6. Check cache for fresh data
    const cachedRows = await this.db
      .select()
      .from(weatherCache)
      .where(
        and(
          eq(weatherCache.tripId, tripId),
          gt(
            weatherCache.fetchedAt,
            new Date(Date.now() - CACHE_MAX_AGE_MS),
          ),
        ),
      );

    if (cachedRows.length > 0) {
      const cached = cachedRows[0]!;
      const forecasts = this.parseForecasts(cached.response);
      return {
        available: true,
        ...(trip.destinationDisplayName ? { location: trip.destinationDisplayName } : {}),
        forecasts: this.filterToDateRange(forecasts, start, end),
        fetchedAt: cached.fetchedAt.toISOString(),
      };
    }

    // 7. Fetch from Open-Meteo
    let rawResponse: unknown;
    try {
      const url = `${FORECAST_API_BASE}?latitude=${trip.destinationLat}&longitude=${trip.destinationLon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=${encodeURIComponent(trip.preferredTimezone)}&forecast_days=${MAX_FORECAST_DAYS}`;
      const response = await fetch(url);

      if (!response.ok) {
        return {
          available: false,
          message: "Weather temporarily unavailable",
          forecasts: [],
          fetchedAt: null,
        };
      }

      rawResponse = await response.json();
    } catch {
      return {
        available: false,
        message: "Weather temporarily unavailable",
        forecasts: [],
        fetchedAt: null,
      };
    }

    // 8. Upsert into cache
    const now = new Date();
    await this.db
      .insert(weatherCache)
      .values({
        tripId,
        response: rawResponse,
        fetchedAt: now,
      })
      .onConflictDoUpdate({
        target: weatherCache.tripId,
        set: { response: rawResponse, fetchedAt: now },
      });

    // 9. Parse and filter forecasts
    const forecasts = this.parseForecasts(rawResponse);

    return {
      available: true,
      ...(trip.destinationDisplayName ? { location: trip.destinationDisplayName } : {}),
      forecasts: this.filterToDateRange(forecasts, start, end),
      fetchedAt: now.toISOString(),
    };
  }

  /**
   * Parse Open-Meteo parallel arrays into DailyForecast objects
   */
  private parseForecasts(rawResponse: unknown): DailyForecast[] {
    const data = rawResponse as { daily?: OpenMeteoDaily };
    const daily = data?.daily;
    if (!daily?.time) {
      return [];
    }

    return daily.time.map((date, i) => ({
      date,
      weatherCode: daily.weather_code[i] ?? 0,
      temperatureMax: daily.temperature_2m_max[i] ?? 0,
      temperatureMin: daily.temperature_2m_min[i] ?? 0,
      precipitationProbability: daily.precipitation_probability_max[i] ?? 0,
    }));
  }

  /**
   * Filter forecasts to dates within the trip's date range
   */
  private filterToDateRange(
    forecasts: DailyForecast[],
    start: Date | null,
    end: Date | null,
  ): DailyForecast[] {
    const startStr = start ? start.toISOString().slice(0, 10) : null;
    const endStr = end ? end.toISOString().slice(0, 10) : null;

    return forecasts.filter((f) => {
      if (startStr && f.date < startStr) return false;
      if (endStr && f.date > endStr) return false;
      return true;
    });
  }
}
