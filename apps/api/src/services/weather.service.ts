import { eq, gt, and } from "drizzle-orm";
import { trips, weatherCache } from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";
import type { ITripService } from "@/services/trip.service.js";
import type {
  TripWeatherResponse,
  DailyForecastExtended,
  HourlyForecast,
} from "@journiful/shared/types";

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
  sunrise: string[];
  sunset: string[];
  wind_speed_10m_max: number[];
  wind_direction_10m_dominant: number[];
  uv_index_max: number[];
  apparent_temperature_max: number[];
  apparent_temperature_min: number[];
}

interface OpenMeteoHourly {
  time: string[];
  temperature_2m: number[];
  weather_code: number[];
  wind_speed_10m: number[];
  relative_humidity_2m: number[];
  uv_index: number[];
  dew_point_2m: number[];
  precipitation_probability: number[];
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
      return { available: false, forecasts: [], hourly: [], fetchedAt: null };
    }

    // 2. Check coordinates
    if (trip.destinationLat == null || trip.destinationLon == null) {
      return {
        available: false,
        message: "Set a destination to see weather",
        forecasts: [],
        hourly: [],
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
        hourly: [],
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
        return { available: false, forecasts: [], hourly: [], fetchedAt: null };
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
        hourly: [],
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
          gt(weatherCache.fetchedAt, new Date(Date.now() - CACHE_MAX_AGE_MS)),
        ),
      );

    if (cachedRows.length > 0) {
      const cached = cachedRows[0]!;
      // TODO: Remove after 2026-05-15 — all cache entries will have hourly data by then
      const hasHourly = !!(cached.response as { hourly?: unknown })?.hourly;
      if (hasHourly) {
        const forecasts = this.parseForecasts(cached.response);
        const hourly = this.parseHourlyForecasts(cached.response);
        return {
          available: true,
          ...(trip.destinationDisplayName
            ? { location: trip.destinationDisplayName }
            : {}),
          forecasts: this.filterToDateRange(forecasts, start, end),
          hourly: this.filterHourlyToDateRange(hourly, start, end),
          fetchedAt: cached.fetchedAt.toISOString(),
        };
      }
      // Old cache format without hourly — fall through to re-fetch
    }

    // 7. Fetch from Open-Meteo
    let rawResponse: unknown;
    try {
      const url = `${FORECAST_API_BASE}?latitude=${trip.destinationLat}&longitude=${trip.destinationLon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,wind_speed_10m_max,wind_direction_10m_dominant,uv_index_max,apparent_temperature_max,apparent_temperature_min&hourly=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,uv_index,dew_point_2m,precipitation_probability&timezone=${encodeURIComponent(trip.preferredTimezone)}&forecast_days=${MAX_FORECAST_DAYS}`;
      const response = await fetch(url);

      if (!response.ok) {
        return {
          available: false,
          message: "Weather temporarily unavailable",
          forecasts: [],
          hourly: [],
          fetchedAt: null,
        };
      }

      rawResponse = await response.json();
    } catch {
      return {
        available: false,
        message: "Weather temporarily unavailable",
        forecasts: [],
        hourly: [],
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
    const hourly = this.parseHourlyForecasts(rawResponse);

    return {
      available: true,
      ...(trip.destinationDisplayName
        ? { location: trip.destinationDisplayName }
        : {}),
      forecasts: this.filterToDateRange(forecasts, start, end),
      hourly: this.filterHourlyToDateRange(hourly, start, end),
      fetchedAt: now.toISOString(),
    };
  }

  /**
   * Parse Open-Meteo daily parallel arrays into DailyForecastExtended objects
   */
  private parseForecasts(rawResponse: unknown): DailyForecastExtended[] {
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
      sunrise: (daily.sunrise?.[i] ?? "").slice(11, 16),
      sunset: (daily.sunset?.[i] ?? "").slice(11, 16),
      windSpeedMax: daily.wind_speed_10m_max?.[i] ?? 0,
      windDirectionDominant: daily.wind_direction_10m_dominant?.[i] ?? 0,
      uvIndexMax: daily.uv_index_max?.[i] ?? 0,
      apparentTemperatureMax: daily.apparent_temperature_max?.[i] ?? 0,
      apparentTemperatureMin: daily.apparent_temperature_min?.[i] ?? 0,
    }));
  }

  /**
   * Parse Open-Meteo hourly parallel arrays into HourlyForecast objects
   */
  private parseHourlyForecasts(rawResponse: unknown): HourlyForecast[] {
    const data = rawResponse as { hourly?: OpenMeteoHourly };
    const hourly = data?.hourly;
    if (!hourly?.time) {
      return [];
    }

    return hourly.time.map((time, i) => ({
      time,
      temperature: hourly.temperature_2m[i] ?? 0,
      weatherCode: hourly.weather_code[i] ?? 0,
      windSpeed: hourly.wind_speed_10m[i] ?? 0,
      humidity: hourly.relative_humidity_2m[i] ?? 0,
      uvIndex: hourly.uv_index[i] ?? 0,
      dewPoint: hourly.dew_point_2m[i] ?? 0,
      precipitationProbability: hourly.precipitation_probability[i] ?? 0,
    }));
  }

  /**
   * Filter forecasts to dates within the trip's date range
   */
  private filterToDateRange(
    forecasts: DailyForecastExtended[],
    start: Date | null,
    end: Date | null,
  ): DailyForecastExtended[] {
    const startStr = start ? start.toISOString().slice(0, 10) : null;
    const endStr = end ? end.toISOString().slice(0, 10) : null;

    return forecasts.filter((f) => {
      if (startStr && f.date < startStr) return false;
      if (endStr && f.date > endStr) return false;
      return true;
    });
  }

  /**
   * Filter hourly entries to the trip's date range
   */
  private filterHourlyToDateRange(
    hourly: HourlyForecast[],
    start: Date | null,
    end: Date | null,
  ): HourlyForecast[] {
    const startStr = start ? start.toISOString().slice(0, 10) : null;
    const endStr = end ? end.toISOString().slice(0, 10) : null;

    return hourly.filter((h) => {
      const dateStr = h.time.slice(0, 10);
      if (startStr && dateStr < startStr) return false;
      if (endStr && dateStr > endStr) return false;
      return true;
    });
  }
}
