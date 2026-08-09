import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WeatherService } from "@/services/weather.service.js";
import type { ITripService } from "@/services/trip.service.js";
import { db } from "@/config/database.js";
import { trips, users, weatherCache, members } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";

// Helper to generate future dates relative to today
function futureDateStr(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

// Mock Open-Meteo response (dates set dynamically in beforeEach)
let mockOpenMeteoResponse: {
  daily: {
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
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    wind_speed_10m: number[];
    relative_humidity_2m: number[];
    uv_index: number[];
    dew_point_2m: number[];
    precipitation_probability: number[];
  };
};

// Create a mock ITripService with controllable getEffectiveDateRange
function createMockTripService() {
  return {
    getEffectiveDateRange: vi.fn(),
    createTrip: vi.fn(),
    getTripById: vi.fn(),
    getUserTrips: vi.fn(),
    updateTrip: vi.fn(),
    cancelTrip: vi.fn(),
    updateMemberStatus: vi.fn(),
    removeMember: vi.fn(),
    updateMemberRole: vi.fn(),
    getTripMembers: vi.fn(),
  } as unknown as ITripService & {
    getEffectiveDateRange: ReturnType<typeof vi.fn>;
  };
}

describe("WeatherService", () => {
  let testUserId: string;
  let testTripId: string;
  let testPhone: string;
  let mockTripService: ReturnType<typeof createMockTripService>;
  let service: WeatherService;

  const cleanup = async () => {
    if (testTripId) {
      await db.delete(weatherCache).where(eq(weatherCache.tripId, testTripId));
    }
    if (testUserId) {
      await db.delete(members).where(eq(members.userId, testUserId));
      await db.delete(trips).where(eq(trips.createdBy, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
  };

  beforeEach(async () => {
    testPhone = generateUniquePhone();
    mockTripService = createMockTripService();
    service = new WeatherService(db, mockTripService);

    // Set up mock response with future dates
    mockOpenMeteoResponse = {
      daily: {
        time: [futureDateStr(1), futureDateStr(2), futureDateStr(3)],
        weather_code: [0, 1, 61],
        temperature_2m_max: [22.5, 21.0, 18.3],
        temperature_2m_min: [14.2, 13.5, 12.1],
        precipitation_probability_max: [0, 10, 80],
        sunrise: [
          `${futureDateStr(1)}T06:30`,
          `${futureDateStr(2)}T06:28`,
          `${futureDateStr(3)}T06:26`,
        ],
        sunset: [
          `${futureDateStr(1)}T19:45`,
          `${futureDateStr(2)}T19:46`,
          `${futureDateStr(3)}T19:47`,
        ],
        wind_speed_10m_max: [15.2, 10.5, 22.0],
        wind_direction_10m_dominant: [180, 270, 45],
        uv_index_max: [5.5, 3.2, 7.8],
        apparent_temperature_max: [24.0, 22.5, 16.0],
        apparent_temperature_min: [12.0, 11.5, 10.0],
      },
      hourly: {
        time: [
          `${futureDateStr(1)}T00:00`,
          `${futureDateStr(1)}T01:00`,
          `${futureDateStr(2)}T00:00`,
          `${futureDateStr(2)}T01:00`,
          `${futureDateStr(3)}T00:00`,
          `${futureDateStr(3)}T01:00`,
        ],
        temperature_2m: [14.2, 13.8, 13.5, 13.0, 12.1, 11.8],
        weather_code: [0, 0, 1, 1, 61, 61],
        wind_speed_10m: [8.5, 7.2, 5.3, 4.8, 15.0, 14.5],
        relative_humidity_2m: [72, 75, 68, 70, 85, 88],
        uv_index: [0, 0, 0, 0, 0, 0],
        dew_point_2m: [9.5, 9.2, 7.8, 7.5, 9.8, 10.0],
        precipitation_probability: [0, 0, 10, 10, 80, 80],
      },
    };

    await cleanup();

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        phoneNumber: testPhone,
        displayName: "Weather Test User",
        timezone: "UTC",
      })
      .returning();
    testUserId = user.id;

    // Create test trip with coordinates (dates in the future)
    const [trip] = await db
      .insert(trips)
      .values({
        name: "Weather Test Trip",
        destination: "San Diego, CA",
        destinationLat: 32.7157,
        destinationLon: -117.1611,
        startDate: futureDateStr(1),
        endDate: futureDateStr(3),
        preferredTimezone: "America/Los_Angeles",
        createdBy: testUserId,
      })
      .returning();
    testTripId = trip.id;

    // Add user as member
    await db.insert(members).values({
      tripId: testTripId,
      userId: testUserId,
      isOrganizer: true,
      status: "going",
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  it("should return cached data when cache is fresh", async () => {
    // Set up date range within forecast window (future dates)
    const start = new Date();
    start.setDate(start.getDate() + 1);
    const end = new Date();
    end.setDate(end.getDate() + 3);
    mockTripService.getEffectiveDateRange.mockResolvedValue({ start, end });

    // Insert fresh cache
    await db.insert(weatherCache).values({
      tripId: testTripId,
      response: mockOpenMeteoResponse,
      fetchedAt: new Date(),
    });

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await service.getForecast(testTripId);

    expect(result.available).toBe(true);
    expect(result.forecasts.length).toBeGreaterThan(0);
    expect(result.fetchedAt).not.toBeNull();
    // fetch should NOT have been called — cache is fresh
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should fetch from API when no cache exists", async () => {
    // Use dates that are within 16 days from now
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 3);

    mockTripService.getEffectiveDateRange.mockResolvedValue({
      start: tomorrow,
      end: dayAfter,
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOpenMeteoResponse),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await service.getForecast(testTripId);

    expect(result.available).toBe(true);
    expect(result.fetchedAt).not.toBeNull();
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("api.open-meteo.com"),
    );
  });

  it("should re-fetch when cache is stale (older than 3 hours)", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 3);

    mockTripService.getEffectiveDateRange.mockResolvedValue({
      start: tomorrow,
      end: dayAfter,
    });

    // Insert stale cache (4 hours old)
    const staleTime = new Date(Date.now() - 4 * 60 * 60 * 1000);
    await db.insert(weatherCache).values({
      tripId: testTripId,
      response: mockOpenMeteoResponse,
      fetchedAt: staleTime,
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOpenMeteoResponse),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await service.getForecast(testTripId);

    expect(result.available).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("should return unavailable with message when trip has no coordinates", async () => {
    // Create a trip without coordinates
    const [noCoordTrip] = await db
      .insert(trips)
      .values({
        name: "No Coord Trip",
        destination: "Unknown",
        preferredTimezone: "UTC",
        createdBy: testUserId,
      })
      .returning();

    const result = await service.getForecast(noCoordTrip.id);

    expect(result.available).toBe(false);
    expect(result.message).toBe("Set a destination to see weather");
    expect(result.forecasts).toEqual([]);
    expect(result.fetchedAt).toBeNull();

    // Cleanup the extra trip
    await db.delete(trips).where(eq(trips.id, noCoordTrip.id));
  });

  it("should return unavailable with message when trip has no dates", async () => {
    mockTripService.getEffectiveDateRange.mockResolvedValue({
      start: null,
      end: null,
    });

    const result = await service.getForecast(testTripId);

    expect(result.available).toBe(false);
    expect(result.message).toBe("Set trip dates to see weather");
    expect(result.forecasts).toEqual([]);
    expect(result.fetchedAt).toBeNull();
  });

  it("should return unavailable without message for past trips", async () => {
    mockTripService.getEffectiveDateRange.mockResolvedValue({
      start: new Date("2024-01-01"),
      end: new Date("2024-01-05"),
    });

    const result = await service.getForecast(testTripId);

    expect(result.available).toBe(false);
    expect(result.message).toBeUndefined();
    expect(result.forecasts).toEqual([]);
    expect(result.fetchedAt).toBeNull();
  });

  it("should return unavailable with message when trip is more than 16 days away", async () => {
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 30);
    const farFutureEnd = new Date();
    farFutureEnd.setDate(farFutureEnd.getDate() + 35);

    mockTripService.getEffectiveDateRange.mockResolvedValue({
      start: farFuture,
      end: farFutureEnd,
    });

    const result = await service.getForecast(testTripId);

    expect(result.available).toBe(false);
    expect(result.message).toBe(
      "Weather forecast available within 16 days of your trip",
    );
    expect(result.forecasts).toEqual([]);
    expect(result.fetchedAt).toBeNull();
  });

  it("should return unavailable with message when API request fails", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 3);

    mockTripService.getEffectiveDateRange.mockResolvedValue({
      start: tomorrow,
      end: dayAfter,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );

    const result = await service.getForecast(testTripId);

    expect(result.available).toBe(false);
    expect(result.message).toBe("Weather temporarily unavailable");
    expect(result.forecasts).toEqual([]);
    expect(result.fetchedAt).toBeNull();
  });

  it("should correctly parse Open-Meteo parallel arrays into DailyForecast objects", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekLater = new Date();
    weekLater.setDate(weekLater.getDate() + 7);

    mockTripService.getEffectiveDateRange.mockResolvedValue({
      start: new Date("2026-01-01"),
      end: new Date("2026-12-31"),
    });

    const detailedResponse = {
      daily: {
        time: ["2026-03-10", "2026-03-11"],
        weather_code: [3, 61],
        temperature_2m_max: [25.5, 19.0],
        temperature_2m_min: [15.0, 11.5],
        precipitation_probability_max: [5, 90],
        sunrise: ["2026-03-10T06:45", "2026-03-11T06:43"],
        sunset: ["2026-03-10T18:30", "2026-03-11T18:31"],
        wind_speed_10m_max: [12.0, 20.5],
        wind_direction_10m_dominant: [180, 315],
        uv_index_max: [4.5, 2.0],
        apparent_temperature_max: [27.0, 17.5],
        apparent_temperature_min: [13.0, 9.0],
      },
      hourly: {
        time: ["2026-03-10T00:00", "2026-03-10T01:00", "2026-03-11T00:00"],
        temperature_2m: [15.0, 14.5, 11.5],
        weather_code: [3, 3, 61],
        wind_speed_10m: [8.0, 7.5, 15.0],
        relative_humidity_2m: [70, 72, 85],
        uv_index: [0, 0, 0],
        dew_point_2m: [9.5, 9.0, 9.0],
        precipitation_probability: [5, 5, 90],
      },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(detailedResponse),
      }),
    );

    const result = await service.getForecast(testTripId);

    expect(result.available).toBe(true);
    expect(result.forecasts).toHaveLength(2);

    expect(result.forecasts[0]).toEqual({
      date: "2026-03-10",
      weatherCode: 3,
      temperatureMax: 25.5,
      temperatureMin: 15.0,
      precipitationProbability: 5,
      sunrise: "06:45",
      sunset: "18:30",
      windSpeedMax: 12.0,
      windDirectionDominant: 180,
      uvIndexMax: 4.5,
      apparentTemperatureMax: 27.0,
      apparentTemperatureMin: 13.0,
    });

    expect(result.forecasts[1]).toEqual({
      date: "2026-03-11",
      weatherCode: 61,
      temperatureMax: 19.0,
      temperatureMin: 11.5,
      precipitationProbability: 90,
      sunrise: "06:43",
      sunset: "18:31",
      windSpeedMax: 20.5,
      windDirectionDominant: 315,
      uvIndexMax: 2.0,
      apparentTemperatureMax: 17.5,
      apparentTemperatureMin: 9.0,
    });

    // Verify hourly data is also returned
    expect(result.hourly).toHaveLength(3);
    expect(result.hourly[0]).toEqual({
      time: "2026-03-10T00:00",
      temperature: 15.0,
      weatherCode: 3,
      windSpeed: 8.0,
      humidity: 70,
      uvIndex: 0,
      dewPoint: 9.5,
      precipitationProbability: 5,
    });
  });

  it("should return hourly: [] when API response has no hourly key", async () => {
    mockTripService.getEffectiveDateRange.mockResolvedValue({
      start: new Date("2026-01-01"),
      end: new Date("2026-12-31"),
    });

    // Response without hourly data (simulates old Open-Meteo format)
    const noHourlyResponse = {
      daily: {
        time: ["2026-03-10"],
        weather_code: [3],
        temperature_2m_max: [25.5],
        temperature_2m_min: [15.0],
        precipitation_probability_max: [5],
        sunrise: ["2026-03-10T06:45"],
        sunset: ["2026-03-10T18:30"],
        wind_speed_10m_max: [12.0],
        wind_direction_10m_dominant: [180],
        uv_index_max: [4.5],
        apparent_temperature_max: [27.0],
        apparent_temperature_min: [13.0],
      },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(noHourlyResponse),
      }),
    );

    const result = await service.getForecast(testTripId);

    expect(result.available).toBe(true);
    expect(result.forecasts).toHaveLength(1);
    expect(result.hourly).toEqual([]);
  });

  it("should re-fetch when cached response lacks hourly key (cache compat guard)", async () => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    const end = new Date();
    end.setDate(end.getDate() + 3);
    mockTripService.getEffectiveDateRange.mockResolvedValue({ start, end });

    // Insert fresh cache WITHOUT hourly key (old cache format)
    const oldCacheResponse = {
      daily: {
        time: [futureDateStr(1), futureDateStr(2), futureDateStr(3)],
        weather_code: [0, 1, 61],
        temperature_2m_max: [22.5, 21.0, 18.3],
        temperature_2m_min: [14.2, 13.5, 12.1],
        precipitation_probability_max: [0, 10, 80],
        sunrise: [
          `${futureDateStr(1)}T06:30`,
          `${futureDateStr(2)}T06:28`,
          `${futureDateStr(3)}T06:26`,
        ],
        sunset: [
          `${futureDateStr(1)}T19:45`,
          `${futureDateStr(2)}T19:46`,
          `${futureDateStr(3)}T19:47`,
        ],
        wind_speed_10m_max: [15.2, 10.5, 22.0],
        wind_direction_10m_dominant: [180, 270, 45],
        uv_index_max: [5.5, 3.2, 7.8],
        apparent_temperature_max: [24.0, 22.5, 16.0],
        apparent_temperature_min: [12.0, 11.5, 10.0],
      },
      // No hourly key — old cache format
    };

    await db.insert(weatherCache).values({
      tripId: testTripId,
      response: oldCacheResponse,
      fetchedAt: new Date(), // fresh timestamp
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOpenMeteoResponse),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await service.getForecast(testTripId);

    // Should have fallen through to re-fetch despite fresh cache
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(result.available).toBe(true);
    expect(result.hourly.length).toBeGreaterThan(0);
  });

  it("should include hourly array in getForecast response from fresh fetch", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 3);

    mockTripService.getEffectiveDateRange.mockResolvedValue({
      start: tomorrow,
      end: dayAfter,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOpenMeteoResponse),
      }),
    );

    const result = await service.getForecast(testTripId);

    expect(result.available).toBe(true);
    expect(result).toHaveProperty("hourly");
    expect(Array.isArray(result.hourly)).toBe(true);
    expect(result.hourly.length).toBeGreaterThan(0);

    // Verify each hourly entry has the correct HourlyForecast shape
    for (const h of result.hourly) {
      expect(h).toHaveProperty("time");
      expect(h).toHaveProperty("temperature");
      expect(h).toHaveProperty("weatherCode");
      expect(h).toHaveProperty("windSpeed");
      expect(h).toHaveProperty("humidity");
      expect(h).toHaveProperty("uvIndex");
      expect(h).toHaveProperty("dewPoint");
      expect(h).toHaveProperty("precipitationProbability");
    }
  });

  it("should include hourly array in cached response", async () => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    const end = new Date();
    end.setDate(end.getDate() + 3);
    mockTripService.getEffectiveDateRange.mockResolvedValue({ start, end });

    // Insert fresh cache WITH hourly data
    await db.insert(weatherCache).values({
      tripId: testTripId,
      response: mockOpenMeteoResponse,
      fetchedAt: new Date(),
    });

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await service.getForecast(testTripId);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.available).toBe(true);
    expect(result).toHaveProperty("hourly");
    expect(Array.isArray(result.hourly)).toBe(true);
    expect(result.hourly.length).toBeGreaterThan(0);

    // Verify hourly entries are correctly parsed from cache
    for (const h of result.hourly) {
      expect(h).toHaveProperty("time");
      expect(h).toHaveProperty("temperature");
      expect(h).toHaveProperty("weatherCode");
      expect(h).toHaveProperty("windSpeed");
      expect(h).toHaveProperty("humidity");
      expect(h).toHaveProperty("uvIndex");
      expect(h).toHaveProperty("dewPoint");
      expect(h).toHaveProperty("precipitationProbability");
    }
  });

  it("should include hourly: [] in all unavailable responses", async () => {
    // No trip found
    const noTripResult = await service.getForecast(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(noTripResult.available).toBe(false);
    expect(noTripResult.hourly).toEqual([]);

    // No coordinates
    const [noCoordTrip] = await db
      .insert(trips)
      .values({
        name: "No Coord Trip 2",
        destination: "Unknown",
        preferredTimezone: "UTC",
        createdBy: testUserId,
      })
      .returning();

    const noCoordResult = await service.getForecast(noCoordTrip.id);
    expect(noCoordResult.available).toBe(false);
    expect(noCoordResult.hourly).toEqual([]);
    await db.delete(trips).where(eq(trips.id, noCoordTrip.id));

    // No dates
    mockTripService.getEffectiveDateRange.mockResolvedValue({
      start: null,
      end: null,
    });
    const noDatesResult = await service.getForecast(testTripId);
    expect(noDatesResult.available).toBe(false);
    expect(noDatesResult.hourly).toEqual([]);

    // Past trip
    mockTripService.getEffectiveDateRange.mockResolvedValue({
      start: new Date("2024-01-01"),
      end: new Date("2024-01-05"),
    });
    const pastResult = await service.getForecast(testTripId);
    expect(pastResult.available).toBe(false);
    expect(pastResult.hourly).toEqual([]);

    // Too far in the future
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 30);
    const farFutureEnd = new Date();
    farFutureEnd.setDate(farFutureEnd.getDate() + 35);
    mockTripService.getEffectiveDateRange.mockResolvedValue({
      start: farFuture,
      end: farFutureEnd,
    });
    const farResult = await service.getForecast(testTripId);
    expect(farResult.available).toBe(false);
    expect(farResult.hourly).toEqual([]);

    // API network error
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 3);
    mockTripService.getEffectiveDateRange.mockResolvedValue({
      start: tomorrow,
      end: dayAfter,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );
    const errorResult = await service.getForecast(testTripId);
    expect(errorResult.available).toBe(false);
    expect(errorResult.hourly).toEqual([]);

    // API non-OK response
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    const serverErrorResult = await service.getForecast(testTripId);
    expect(serverErrorResult.available).toBe(false);
    expect(serverErrorResult.hourly).toEqual([]);
  });
});
