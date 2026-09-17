import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { buildPhotoCacheKey } from "@/services/photo-cache.service.js";

const PHOTO_REF = "places/ChIJN1t_tDeuEmsRUsoyG83frY4/photos/Ab1Cd2Ef3Gh4";
const ENCODED_REF = encodeURIComponent(PHOTO_REF);
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

  function mockGooglePhoto(contentType = "image/jpeg"): void {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(IMAGE_BYTES, {
        status: 200,
        headers: { "content-type": contentType },
      }),
    );
  }

  it("first request serves bytes, preserves upstream Content-Type, and persists to storage; second request is a cache hit with zero Google calls", async () => {
    app = await buildApp();
    app.config.GOOGLE_MAPS_API_KEY = "test-key";

    const url = `/api/locations/photos/${ENCODED_REF}?maxWidthPx=400&maxHeightPx=280`;
    const expectedKey = buildPhotoCacheKey(PHOTO_REF, 400, 280);

    // Ensure a clean slate for this key.
    await app.storage.deleteObject(expectedKey);

    // (a) First request — Google fetch mocked.
    mockGooglePhoto("image/jpeg");
    const first = await app.inject({ method: "GET", url });

    expect(first.statusCode).toBe(200);
    expect(first.headers["content-type"]).toContain("image/jpeg");
    expect(first.headers["cache-control"]).toBe(
      "public, max-age=604800, immutable",
    );
    expect(responseBytes(first)).toEqual(IMAGE_BYTES);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Object persisted to local storage with content type round-trip.
    const persisted = await app.storage.getObjectBuffer(expectedKey);
    expect(persisted).not.toBeNull();
    expect(persisted!.buffer).toEqual(IMAGE_BYTES);
    expect(persisted!.contentType).toBe("image/jpeg");

    // (b) Second identical request — Google must NOT be called.
    vi.clearAllMocks();
    const fetchSpy = vi.spyOn(global, "fetch");
    const second = await app.inject({ method: "GET", url });

    expect(second.statusCode).toBe(200);
    expect(second.headers["content-type"]).toContain("image/jpeg");
    expect(second.headers["cache-control"]).toBe(
      "public, max-age=604800, immutable",
    );
    expect(responseBytes(second)).toEqual(IMAGE_BYTES);
    expect(fetchSpy).not.toHaveBeenCalled();

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
});
