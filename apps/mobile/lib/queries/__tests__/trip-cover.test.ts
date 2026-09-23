import { describe, expect, it, vi, afterEach } from "vitest";
import { createElement, Suspense } from "react";
import { createRequire } from "node:module";

// Same probe seam as `trip-update.test.ts`: `react-dom` ships no
// server types in this workspace, so the renderer is loaded through
// `require` (typed as `any`).
const require = createRequire(import.meta.url);
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: unknown) => string;
};

// Keep the real `ApiError` (the rollback test asserts `instanceof`)
// and stub only the network at the module boundary.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { QueryClientProvider } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import type { Trip } from "@/components/trip/TripCard";
import { placeholderPhoto, toTrip } from "@/lib/mapping";
import type { TripDetail } from "@journiful/shared/types";
import {
  removeCover,
  removeCoverOptions,
  tripKeys,
  uploadCover,
  uploadCoverOptions,
} from "@/lib/queries/trips";
import { makeQueryClient } from "@/lib/queries/client";
import { TripsProvider, useTripsActions } from "@/lib/tripsStore";

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The base trip entity the cover endpoints return (no `memberCount`). */
function coverEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: "trip-1",
    name: "Dolomites",
    destination: "Bolzano",
    destinationLat: null,
    destinationLon: null,
    startDate: "2026-07-01",
    endDate: "2026-07-05",
    preferredTimezone: "Europe/Rome",
    description: null,
    coverImageUrl: "https://cdn.example/covers/trip-1.jpg",
    createdBy: "user-1",
    allowMembersToAddEvents: false,
    showAllMembers: false,
    themeId: null,
    themeFont: null,
    cancelled: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

function cachedTrip(): Trip {
  return {
    id: "trip-1",
    title: "Dolomites",
    location: "Bolzano",
    image: placeholderPhoto("trip-1"),
    going: 4,
    startDate: "2026-07-01",
    endDate: "2026-07-05",
    description: null,
    preferredTimezone: "Europe/Rome",
  };
}

/**
 * `uploadCover` reads the picker URI into a blob via the global
 * `fetch`, so stub it: the blob bytes never touch the network in
 * unit tests (`apiFetch` is already mocked above).
 */
function stubUriFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(["bytes"], { type: "image/jpeg" })),
    }),
  );
}

describe("uploadCover", () => {
  it("POSTs FormData to /trips/:id/cover-image and returns the mapped trip", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, trip: coverEntity() });
    stubUriFetch();

    const options = uploadCoverOptions();
    expect(options.mutationKey).toEqual(["trips", "uploadCover"]);

    const trip = await uploadCover("trip-1", "file:///cache/cover.jpg");

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = mockedApiFetch.mock.calls[0] as [
      string,
      NonNullable<Parameters<typeof fetch>[1]>,
    ];
    expect(path).toBe("/trips/trip-1/cover-image");
    expect(init.method).toBe("POST");
    // Multipart: a FormData body, never JSON — `apiFetch` must not
    // set a Content-Type (the boundary is generated at send time).
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toBeUndefined();
    expect((init.body as FormData).get("file")).toBeInstanceOf(Blob);
    expect(trip).toMatchObject({
      id: "trip-1",
      image: "https://cdn.example/covers/trip-1.jpg",
    });
  });
});

describe("removeCover", () => {
  it("DELETEs /trips/:id/cover-image and maps the nulled cover to the placeholder", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      trip: coverEntity({ coverImageUrl: null }),
    });

    const options = removeCoverOptions();
    expect(options.mutationKey).toEqual(["trips", "removeCover"]);

    const trip = await removeCover("trip-1");

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/trips/trip-1/cover-image",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(trip.image).toBe(placeholderPhoto("trip-1"));
  });
});

describe("null cover mapping", () => {
  it("maps coverImageUrl: null to placeholderPhoto(trip.id)", () => {
    const trip = toTrip({
      ...coverEntity({ coverImageUrl: null }),
      memberCount: 2,
      organizers: [],
    } as unknown as TripDetail);
    expect(trip.image).toBe(placeholderPhoto("trip-1"));
  });
});

describe("useTripsActions() cover mutations", () => {
  function captureCoverActions() {
    const client = makeQueryClient();
    client.setQueryData<Trip[]>(tripKeys.list(), [cachedTrip()]);
    client.setQueryData<Trip>(tripKeys.detail("trip-1"), cachedTrip());

    const seen: {
      uploadCover: ((id: string, uri: string) => Promise<Trip>) | null;
      removeCover: ((id: string) => Promise<Trip>) | null;
    } = { uploadCover: null, removeCover: null };
    function Probe() {
      const actions = useTripsActions();
      seen.uploadCover = actions.uploadCover;
      seen.removeCover = actions.removeCover;
      return null;
    }
    function Wrapper() {
      return createElement(
        QueryClientProvider,
        { client },
        createElement(
          TripsProvider,
          null,
          createElement(Suspense, { fallback: null }, createElement(Probe)),
        ),
      );
    }
    renderToString(createElement(Wrapper));
    if (!seen.uploadCover || !seen.removeCover) {
      throw new Error("cover actions were not captured");
    }
    return {
      client,
      uploadCover: seen.uploadCover,
      removeCover: seen.removeCover,
    };
  }

  it("writes the uploaded coverImageUrl into detail + list caches", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, trip: coverEntity() });
    stubUriFetch();

    const { client, uploadCover } = captureCoverActions();

    const trip = await uploadCover("trip-1", "file:///cache/cover.jpg");
    expect(trip.image).toBe("https://cdn.example/covers/trip-1.jpg");

    // The detail cache carries the server URL, keeping the roster
    // count the cover response cannot know.
    expect(client.getQueryData<Trip>(tripKeys.detail("trip-1"))).toMatchObject({
      id: "trip-1",
      image: "https://cdn.example/covers/trip-1.jpg",
      going: 4,
    });
    // The list row follows the upload too.
    expect(client.getQueryData<Trip[]>(tripKeys.list())?.[0]).toMatchObject({
      id: "trip-1",
      image: "https://cdn.example/covers/trip-1.jpg",
    });

    // Both caches invalidate, so the next mount reads server truth.
    expect(
      client.getQueryState(tripKeys.detail("trip-1"))?.isInvalidated,
    ).toBe(true);
    expect(client.getQueryState(tripKeys.list())?.isInvalidated).toBe(true);
  });

  it("rolls back both caches when the upload rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(new ApiError(500, "Upload failed"));
    stubUriFetch();

    const { client, uploadCover } = captureCoverActions();

    await expect(uploadCover("trip-1", "file:///cache/cover.jpg")).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(client.getQueryData<Trip>(tripKeys.detail("trip-1"))).toEqual(
      cachedTrip(),
    );
    expect(client.getQueryData<Trip[]>(tripKeys.list())).toEqual([
      cachedTrip(),
    ]);
  });

  it("clears the cover in both caches on remove", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      trip: coverEntity({ coverImageUrl: null }),
    });

    const { client, removeCover } = captureCoverActions();

    await removeCover("trip-1");
    expect(client.getQueryData<Trip>(tripKeys.detail("trip-1"))).toMatchObject({
      id: "trip-1",
      image: placeholderPhoto("trip-1"),
      going: 4,
    });
    expect(client.getQueryData<Trip[]>(tripKeys.list())?.[0]).toMatchObject({
      id: "trip-1",
      image: placeholderPhoto("trip-1"),
    });
  });
});
