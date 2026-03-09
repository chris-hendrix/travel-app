import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WeatherService } from "@/services/weather.service.js";
import type { ITripService } from "@/services/trip.service.js";
import { db } from "@/config/database.js";
import { trips, users, weatherCache, members } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";

// Mock Open-Meteo response
const mockOpenMeteoResponse = {
  daily: {
    time: ["2026-03-10", "2026-03-11", "2026-03-12"],
    weather_code: [0, 1, 61],
    temperature_2m_max: [22.5, 21.0, 18.3],
    temperature_2m_min: [14.2, 13.5, 12.1],
    precipitation_probability_max: [0, 10, 80],
  },
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
  } as unknown as ITripService & { getEffectiveDateRange: ReturnType<typeof vi.fn> };
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

    // Create test trip with coordinates
    const [trip] = await db
      .insert(trips)
      .values({
        name: "Weather Test Trip",
        destination: "San Diego, CA",
        destinationLat: 32.7157,
        destinationLon: -117.1611,
        startDate: "2026-03-10",
        endDate: "2026-03-12",
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
    // Set up date range within forecast window
    mockTripService.getEffectiveDateRange.mockResolvedValue({
      start: new Date("2026-03-10"),
      end: new Date("2026-03-12"),
    });

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
    });

    expect(result.forecasts[1]).toEqual({
      date: "2026-03-11",
      weatherCode: 61,
      temperatureMax: 19.0,
      temperatureMin: 11.5,
      precipitationProbability: 90,
    });
  });
});
