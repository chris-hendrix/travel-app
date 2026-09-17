import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/config/database.js";
import { geocodeCache } from "@/db/schema/index.js";
import {
  CachedGeocodingService,
  GoogleGeocodingService,
} from "@/services/geocoding.service.js";

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as never;

let querySeq = 0;
function uniqueQuery(label: string): string {
  querySeq += 1;
  return `Cache Probe ${label} ${Date.now()}-${querySeq}`;
}

function geocodePayload(lat = 48.8566, lng = 2.3522, name = "Paris, France") {
  return {
    status: "OK",
    results: [
      {
        geometry: { location: { lat, lng } },
        formatted_address: name,
      },
    ],
  };
}

function timezonePayload(tz = "Europe/Paris") {
  return { status: "OK", timeZoneId: tz };
}

describe("geocoding.service cache (Task 5.2)", () => {
  const queries: string[] = [];
  let fetchSpy: ReturnType<typeof vi.fn>;
  let service: CachedGeocodingService;

  const track = (q: string) => {
    queries.push(q);
    return q;
  };
  const geocodeCalls = () =>
    fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes("/geocode/json"),
    ).length;
  const timezoneCalls = () =>
    fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes("/timezone/json"),
    ).length;

  beforeEach(async () => {
    // Cache tests exercise the real lookup path: stub explicitly unset.
    vi.stubEnv("GEOCODING_STUB", "");
    fetchSpy = vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).includes("/timezone/json")
          ? timezonePayload()
          : geocodePayload(),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    service = new CachedGeocodingService(
      db,
      new GoogleGeocodingService("test-google-key", log),
      log,
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    for (const q of queries.splice(0)) {
      await db.delete(geocodeCache).where(eq(geocodeCache.query, q.trim()));
    }
  });

  it("(a) same query twice → geocode endpoint called once, second result from cache", async () => {
    const q = track(uniqueQuery("Paris"));

    const first = await service.geocode(q);
    const second = await service.geocode(q);

    expect(first).toMatchObject({ lat: 48.8566, lon: 2.3522 });
    expect(second).toEqual(first);
    expect(geocodeCalls()).toBe(1);
  });

  it("(b) row older than 30 days → re-geocodes, row refreshed", async () => {
    const q = track(uniqueQuery("Paris"));
    await db.insert(geocodeCache).values({
      query: q.trim(),
      lat: 0,
      lon: 0,
      displayName: "Stale Entry",
      cachedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    });

    const result = await service.geocode(q);

    expect(geocodeCalls()).toBe(1);
    expect(result).toMatchObject({
      lat: 48.8566,
      lon: 2.3522,
      displayName: "Paris, France",
    });
    const [row] = await db
      .select()
      .from(geocodeCache)
      .where(eq(geocodeCache.query, q.trim()));
    expect(row.displayName).toBe("Paris, France");
    expect(Date.now() - row.cachedAt.getTime()).toBeLessThan(60_000);
  });

  it("(c) getTimezone after geocode on same string → no second geocode fetch", async () => {
    const q = track(uniqueQuery("Paris"));

    await service.geocode(q);
    expect(geocodeCalls()).toBe(1);

    const tz = await service.getTimezone(q);

    expect(tz).toBe("Europe/Paris");
    expect(geocodeCalls()).toBe(1);
    expect(timezoneCalls()).toBe(1);
    const [row] = await db
      .select()
      .from(geocodeCache)
      .where(eq(geocodeCache.query, q.trim()));
    expect(row.timezone).toBe("Europe/Paris");
  });
});

describe("geocoding.service stub pin (drive-by)", () => {
  beforeEach(() => {
    vi.stubEnv("GEOCODING_STUB", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("pins current stub behavior, incl. getTimezoneByCoords coords-always-UTC fallback", async () => {
    const stub = new GoogleGeocodingService("unused-in-stub-mode", log);

    await expect(stub.geocode("Paris")).resolves.toMatchObject({
      lat: 48.8566,
      lon: 2.3522,
      displayName: "Paris",
    });
    await expect(stub.getTimezone("Paris")).resolves.toBe("Europe/Paris");
    await expect(stub.getTimezone("Somewhere Unknown XYZ")).resolves.toBe(
      "UTC",
    );
    // Known wart: stub getTimezoneByCoords stringifies the coords and runs the
    // city-name lookup on them, so it ALWAYS falls through to UTC — real
    // coordinates are ignored. Documented here; no behavior change.
    await expect(stub.getTimezoneByCoords(48.8566, 2.3522)).resolves.toBe(
      "UTC",
    );
  });
});
