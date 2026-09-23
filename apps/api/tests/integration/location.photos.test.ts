import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { buildPhotoCacheKey, TOMBSTONE_CONTENT_TYPE } from "@/services/photo-cache.service.js";

const PHOTO_REF_BASE = "places/ChIJN1t_tDeuEmsRUsoyG83frY4/photos/Ab1Cd2Ef3Gh4";
const IMAGE_BYTES = Buffer.from("fake-image-bytes-12345");

/** Extracts response bytes regardless of light-my-request rawBody availability. */
function responseBytes(res: { rawBody?: unknown; body: string }): Buffer {
  if (Buffer.isBuffer(res.rawBody)) {
    return res.rawBody;
  }
  if (typeof res.rawBody === "string") {
    return Buffer.from(res.rawBody, "binary");
  }
  return Buffer.from(res.body, "binary");
}

/**
 * Whatever `fetch` takes first — spelled as `Parameters` so the test does
 * not reach for a DOM-only type alias the api eslint config has no global
 * for.
 */
type FetchInput = Parameters<typeof fetch>[0];

/** The request URL, whichever of the three shapes `fetch` was handed. */
function urlOf(input: FetchInput): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return (input as { url: string }).url;
}

/**
 * Answer one photo reference, and pass every other request through to
 * the real `fetch`.
 *
 * The suite runs its files in parallel inside one process
 * (`isolate: false` in `vitest.config.ts`), so there is one
 * `global.fetch` for all of them: a blanket mock would answer other
 * files' requests, and a blanket rejection would fail them. Scoping the
 * answer to this test's reference keeps the mock inside its own test,
 * and `callsFor` keeps the counts just as narrow.
 */
function mockPhotoFetch(
  ref: string,
  answer: () => Promise<Response>,
): MockInstance {
  const original = global.fetch;
  return vi
    .spyOn(global, "fetch")
    .mockImplementation((input, init) =>
      urlOf(input).includes(ref) ? answer() : original(input, init),
    );
}

/**
 * How many of this spy's calls asked for one reference. The process-wide
 * count is not this test's business: neighbouring files fetch too, and
 * `toHaveBeenCalledTimes` counts every one of them.
 */
function callsFor(spy: MockInstance, ref: string): number {
  return spy.mock.calls.filter((call) =>
    urlOf(call[0] as FetchInput).includes(ref),
  ).length;
}

describe("GET /api/locations/photos/:photoRef (photo proxy cache)", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (app) {
      await app.close();
    }
  });

  it("first request serves bytes, preserves upstream Content-Type, and persists to storage; second request is a cache hit with zero Google calls", async () => {
    app = await buildApp();
    app.config.GOOGLE_MAPS_API_KEY = "test-key";

    // A ref unique to this test so parallel files sharing one storage dir cannot collide.
    const photoRef = `${PHOTO_REF_BASE}-cache-hit`;
    const url = `/api/locations/photos/${encodeURIComponent(photoRef)}?maxWidthPx=400&maxHeightPx=280`;
    const expectedKey = buildPhotoCacheKey(photoRef, 400, 280);

    // Ensure a clean slate for this key.
    await app.storage.deleteObject(expectedKey);

    // (a) First request — Google fetch mocked, for this ref alone.
    const google = mockPhotoFetch(
      photoRef,
      async () =>
        new Response(IMAGE_BYTES, {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
    );
    const first = await app.inject({ method: "GET", url });

    expect(first.statusCode).toBe(200);
    expect(first.headers["content-type"]).toContain("image/jpeg");
    expect(first.headers["cache-control"]).toBe(
      "public, max-age=604800, immutable",
    );
    expect(responseBytes(first)).toEqual(IMAGE_BYTES);
    expect(callsFor(google, photoRef)).toBe(1);

    // Object persisted to local storage with content type round-trip.
    const persisted = await app.storage.getObjectBuffer(expectedKey);
    expect(persisted).not.toBeNull();
    expect(persisted!.buffer).toEqual(IMAGE_BYTES);
    expect(persisted!.contentType).toBe("image/jpeg");

    // (b) Second identical request — Google must NOT be asked for this
    // ref. Fail closed: if the cache misses, the request errors instead
    // of reaching Google.
    vi.restoreAllMocks();
    const noGoogle = mockPhotoFetch(photoRef, async () => {
      throw new Error("Google must not be called (cache hit)");
    });
    const second = await app.inject({ method: "GET", url });

    expect(second.statusCode).toBe(200);
    expect(second.headers["content-type"]).toContain("image/jpeg");
    expect(second.headers["cache-control"]).toBe(
      "public, max-age=604800, immutable",
    );
    expect(responseBytes(second)).toEqual(IMAGE_BYTES);
    expect(callsFor(noGoogle, photoRef)).toBe(0);

    // Cleanup so other suites are unaffected.
    await app.storage.deleteObject(expectedKey);
  });

  it("returns 400 for an invalid photo reference", async () => {
    app = await buildApp();
    app.config.GOOGLE_MAPS_API_KEY = "test-key";

    const response = await app.inject({
      method: "GET",
      url: "/api/locations/photos/not-a-valid-ref?maxWidthPx=400&maxHeightPx=280",
    });

    expect(response.statusCode).toBe(400);
  });

  it("negatively caches a failed Google fetch", async () => {
    app = await buildApp();
    app.config.GOOGLE_MAPS_API_KEY = "test-key";

    // A ref unique to this test so parallel files sharing one storage dir cannot collide.
    const photoRef = `${PHOTO_REF_BASE}-negative`;
    const url = `/api/locations/photos/${encodeURIComponent(photoRef)}?maxWidthPx=400&maxHeightPx=280`;
    const expectedKey = buildPhotoCacheKey(photoRef, 400, 280);

    // Ensure a clean slate for this key.
    await app.storage.deleteObject(expectedKey);

    try {
      // First request — Google returns 404.
      const googleMiss = mockPhotoFetch(
        photoRef,
        async () => new Response("not found", { status: 404 }),
      );
      const first = await app.inject({ method: "GET", url });

      expect(first.statusCode).toBe(404);
      expect(callsFor(googleMiss, photoRef)).toBe(1);

      // The failure must have persisted a tombstone, so a missing write
      // reads as a write failure rather than a read miss below.
      const tombstone = await app.storage.getObjectBuffer(expectedKey);
      expect(tombstone).not.toBeNull();
      expect(tombstone!.contentType).toBe(TOMBSTONE_CONTENT_TYPE);

      // Second request — served from the tombstone; Google must NOT be
      // asked for this ref. Fail closed: if the tombstone misses, the
      // request errors instead of reaching Google.
      vi.restoreAllMocks();
      const noGoogle = mockPhotoFetch(photoRef, async () => {
        throw new Error("Google must not be called (tombstone hit)");
      });
      const second = await app.inject({ method: "GET", url });

      expect(second.statusCode).toBe(404);
      expect(callsFor(noGoogle, photoRef)).toBe(0);
    } finally {
      // Cleanup so other suites are unaffected.
      await app.storage.deleteObject(expectedKey);
    }
  });
});
