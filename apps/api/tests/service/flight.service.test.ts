import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlightService } from "@/services/flight.service.js";
import { db } from "@/config/database.js";
import { flightCache } from "@/db/schema/index.js";
import { eq, and } from "drizzle-orm";

const TEST_API_KEY = "test-api-key";
const TEST_FLIGHT = "UA123";
const TEST_DATE = "2026-03-26";

function mockAeroDataBoxResponse(overrides: Record<string, unknown> = {}) {
  return [
    {
      departure: {
        airport: { iata: "LHR", name: "London Heathrow" },
        scheduledTime: { utc: "2026-03-26 08:00Z", local: "2026-03-26 08:00+00:00" },
      },
      arrival: {
        airport: { iata: "EWR", name: "Newark Liberty" },
        scheduledTime: { utc: "2026-03-26 16:20Z", local: "2026-03-26 12:20-04:00" },
      },
      codeshareStatus: "IsOperator",
      number: "UA 123",
      ...overrides,
    },
  ];
}

describe("FlightService", () => {
  let service: FlightService;

  const cleanup = async () => {
    await db
      .delete(flightCache)
      .where(
        and(
          eq(flightCache.flightNumber, TEST_FLIGHT),
          eq(flightCache.date, TEST_DATE),
        ),
      );
  };

  beforeEach(async () => {
    service = new FlightService(db, TEST_API_KEY);
    await cleanup();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  it("returns { available: false } when API key is null", async () => {
    const noKeyService = new FlightService(db, null);
    const result = await noKeyService.lookupFlight(TEST_FLIGHT, TEST_DATE);
    expect(result).toEqual({ available: false });
  });

  it("throws error for invalid flight number format", async () => {
    await expect(service.lookupFlight("INVALID!", TEST_DATE)).rejects.toThrow(
      "Invalid flight number format",
    );
  });

  it("returns cached result without calling fetch (cache hit)", async () => {
    // Insert fresh cache
    await db.insert(flightCache).values({
      flightNumber: TEST_FLIGHT,
      date: TEST_DATE,
      response: mockAeroDataBoxResponse(),
      fetchedAt: new Date(),
    });

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await service.lookupFlight("ua123", TEST_DATE);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toEqual({
      available: true,
      flight: {
        departureAirport: { iata: "LHR", name: "London Heathrow" },
        departureTime: "2026-03-26T08:00+00:00",
        arrivalAirport: { iata: "EWR", name: "Newark Liberty" },
        arrivalTime: "2026-03-26T12:20-04:00",
      },
    });
  });

  it("returns { flight: null } for negative cache hit (null response)", async () => {
    await db.insert(flightCache).values({
      flightNumber: TEST_FLIGHT,
      date: TEST_DATE,
      response: null,
      fetchedAt: new Date(),
    });

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await service.lookupFlight(TEST_FLIGHT, TEST_DATE);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toEqual({ available: true, flight: null });
  });

  it("calls fetch on cache miss and returns normalized result", async () => {
    const apiResponse = mockAeroDataBoxResponse();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(apiResponse),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await service.lookupFlight(TEST_FLIGHT, TEST_DATE);

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(result).toEqual({
      available: true,
      flight: {
        departureAirport: { iata: "LHR", name: "London Heathrow" },
        departureTime: "2026-03-26T08:00+00:00",
        arrivalAirport: { iata: "EWR", name: "Newark Liberty" },
        arrivalTime: "2026-03-26T12:20-04:00",
      },
    });
  });

  it("returns { flight: null } for 204 response and caches negative result", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error("No content")),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await service.lookupFlight(TEST_FLIGHT, TEST_DATE);

    expect(result).toEqual({ available: true, flight: null });

    // Verify negative cache was inserted
    const cached = await db
      .select()
      .from(flightCache)
      .where(
        and(
          eq(flightCache.flightNumber, TEST_FLIGHT),
          eq(flightCache.date, TEST_DATE),
        ),
      );
    expect(cached).toHaveLength(1);
    expect(cached[0]!.response).toBeNull();
  });

  it("throws error for non-200/204 response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: "Unauthorized" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(service.lookupFlight(TEST_FLIGHT, TEST_DATE)).rejects.toThrow(
      "Unauthorized",
    );
  });

  it("returns { flight: null } when scheduledTime is null", async () => {
    const apiResponse = [
      {
        departure: {
          airport: { iata: "LHR", name: "London Heathrow" },
          scheduledTime: null,
        },
        arrival: {
          airport: { iata: "EWR", name: "Newark Liberty" },
          scheduledTime: { local: "2026-03-26 12:20-04:00" },
        },
        codeshareStatus: "IsOperator",
      },
    ];
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(apiResponse),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await service.lookupFlight(TEST_FLIGHT, TEST_DATE);

    expect(result).toEqual({ available: true, flight: null });
  });

  it("prefers codeshareStatus 'IsOperator' over other entries", async () => {
    const apiResponse = [
      {
        departure: {
          airport: { iata: "CDG", name: "Paris Charles de Gaulle" },
          scheduledTime: { local: "2026-03-26 09:00+01:00" },
        },
        arrival: {
          airport: { iata: "JFK", name: "New York JFK" },
          scheduledTime: { local: "2026-03-26 13:00-04:00" },
        },
        codeshareStatus: "IsCodeshared",
      },
      {
        departure: {
          airport: { iata: "LHR", name: "London Heathrow" },
          scheduledTime: { local: "2026-03-26 08:00+00:00" },
        },
        arrival: {
          airport: { iata: "EWR", name: "Newark Liberty" },
          scheduledTime: { local: "2026-03-26 12:20-04:00" },
        },
        codeshareStatus: "IsOperator",
      },
    ];
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(apiResponse),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await service.lookupFlight(TEST_FLIGHT, TEST_DATE);

    expect(result).toEqual({
      available: true,
      flight: {
        departureAirport: { iata: "LHR", name: "London Heathrow" },
        departureTime: "2026-03-26T08:00+00:00",
        arrivalAirport: { iata: "EWR", name: "Newark Liberty" },
        arrivalTime: "2026-03-26T12:20-04:00",
      },
    });
  });

  it("throws 'Flight lookup timed out' on AbortError", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    const mockFetch = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", mockFetch);

    await expect(service.lookupFlight(TEST_FLIGHT, TEST_DATE)).rejects.toThrow(
      "Flight lookup timed out",
    );
  });
});
