import { eq, and, gt } from "drizzle-orm";
import { flightCache } from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";
import type {
  FlightLookupResponse,
  FlightLookupResult,
} from "@journiful/shared/types";

const CACHE_MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3 hours
const FLIGHT_NUMBER_REGEX = /^[A-Z\d]{2,3}\d{1,4}$/i;

export interface IFlightService {
  lookupFlight(
    flightNumber: string,
    date: string,
  ): Promise<FlightLookupResponse>;
}

interface AeroDataBoxAirport {
  icao?: string;
  iata?: string | null;
  name?: string;
  shortName?: string;
  municipalityName?: string;
  countryCode?: string;
  timeZone?: string;
}

interface AeroDataBoxScheduledTime {
  utc?: string;
  local?: string;
}

interface AeroDataBoxLeg {
  airport?: AeroDataBoxAirport;
  scheduledTime?: AeroDataBoxScheduledTime | null;
  terminal?: string;
}

interface AeroDataBoxFlight {
  departure?: AeroDataBoxLeg;
  arrival?: AeroDataBoxLeg;
  codeshareStatus?: string;
  number?: string;
  status?: string;
  isCargo?: boolean;
}

export class FlightService implements IFlightService {
  constructor(
    private db: AppDatabase,
    private apiKey: string | null,
  ) {}

  async lookupFlight(
    flightNumber: string,
    date: string,
  ): Promise<FlightLookupResponse> {
    // 1. Return unavailable if no API key
    if (!this.apiKey) {
      return { available: false };
    }

    // 2. Validate flight number format
    if (!FLIGHT_NUMBER_REGEX.test(flightNumber)) {
      throw new Error(
        "Invalid flight number format. Expected airline code + number (e.g., UA123)",
      );
    }

    // 3. Uppercase for cache key consistency
    const normalizedFlightNumber = flightNumber.toUpperCase();

    // 4. Check cache
    const cachedRows = await this.db
      .select()
      .from(flightCache)
      .where(
        and(
          eq(flightCache.flightNumber, normalizedFlightNumber),
          eq(flightCache.date, date),
          gt(flightCache.fetchedAt, new Date(Date.now() - CACHE_MAX_AGE_MS)),
        ),
      );

    if (cachedRows.length > 0) {
      const cached = cachedRows[0]!;
      // 5. Negative cache (null response)
      if (cached.response === null) {
        return { available: true, flight: null };
      }
      // 6. Cache hit with response — normalize and return
      const flight = this.normalizeResponse(
        cached.response as AeroDataBoxFlight[],
      );
      return { available: true, flight };
    }

    // 7. Cache miss — call AeroDataBox API
    let response: Response;
    try {
      const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(normalizedFlightNumber)}/${date}`;
      response = await fetch(url, {
        headers: {
          "x-rapidapi-key": this.apiKey,
          "x-rapidapi-host": "aerodatabox.p.rapidapi.com",
        },
        signal: AbortSignal.timeout(5000),
      });
    } catch (error: unknown) {
      if (
        error instanceof DOMException ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        throw new Error("Flight lookup timed out", { cause: error });
      }
      throw error;
    }

    // 8. Handle 204 — flight not found
    if (response.status === 204) {
      await this.upsertCache(normalizedFlightNumber, date, null);
      return { available: true, flight: null };
    }

    // Handle 429 — rate limited by AeroDataBox/RapidAPI
    if (response.status === 429) {
      return { available: false };
    }

    // 15. Handle non-200/204
    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Unknown error" }));
      throw new Error(
        (errorBody as { message?: string }).message || "Unknown error",
      );
    }

    // 9. Parse JSON array
    const flights = (await response.json()) as AeroDataBoxFlight[];

    // 14. Upsert full response into cache
    await this.upsertCache(normalizedFlightNumber, date, flights);

    // 10-13. Normalize and return
    const flight = this.normalizeResponse(flights);
    return { available: true, flight };
  }

  private normalizeResponse(
    flights: AeroDataBoxFlight[],
  ): FlightLookupResult | null {
    if (!flights || flights.length === 0) {
      return null;
    }

    // 10. Prefer entry with codeshareStatus === "IsOperator", fall back to [0]
    const entry =
      flights.find((f) => f.codeshareStatus === "IsOperator") || flights[0]!;

    // 11. Check scheduledTime not null
    const depTime = entry.departure?.scheduledTime?.local;
    const arrTime = entry.arrival?.scheduledTime?.local;

    if (!depTime || !arrTime) {
      return null;
    }

    // 12-13. Build FlightLookupResult with normalized times
    return {
      departureAirport: {
        iata: entry.departure?.airport?.iata ?? null,
        name: entry.departure?.airport?.name ?? "Unknown",
      },
      departureTime: depTime.replace(" ", "T"),
      arrivalAirport: {
        iata: entry.arrival?.airport?.iata ?? null,
        name: entry.arrival?.airport?.name ?? "Unknown",
      },
      arrivalTime: arrTime.replace(" ", "T"),
    };
  }

  private async upsertCache(
    flightNumber: string,
    date: string,
    response: AeroDataBoxFlight[] | null,
  ): Promise<void> {
    const now = new Date();
    await this.db
      .insert(flightCache)
      .values({
        flightNumber,
        date,
        response,
        fetchedAt: now,
      })
      .onConflictDoUpdate({
        target: [flightCache.flightNumber, flightCache.date],
        set: { response, fetchedAt: now },
      });
  }
}
