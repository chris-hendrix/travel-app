import { describe, expect, it, vi } from "vitest";
import { createElement, Suspense } from "react";
import { createRequire } from "node:module";

// Same probe seam as `payment-writes.test.ts`: keep the real `ApiError`
// (the 409 test asserts on the rejection's code) and stub only the network
// at the module boundary.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const require = createRequire(import.meta.url);
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: unknown) => string;
};

import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import type { Member } from "@/lib/members";
import type { SavedPlace } from "@/lib/saved-places";
import type { SavedPlace as ApiSavedPlace } from "@journiful/shared/types";
import { toSavedPlace } from "@/lib/mapping";
import { memberKeys } from "@/lib/queries/members";
import { savedPlaceKeys, invalidateTripPlaces } from "@/lib/queries/savedPlaceKeys";
import {
  createSavedPlace,
  deleteSavedPlace,
  isSavedPlaceDuplicate,
  savedPlacesOptions,
  setSavedPlacePinned,
  updateSavedPlace,
  useCreateSavedPlace,
  useDeleteSavedPlace,
  usePinSavedPlace,
  useSavedPlaces,
  useUpdateSavedPlace,
} from "@/lib/queries/savedPlaces";
import { makeQueryClient } from "@/lib/queries/client";

const mockedApiFetch = vi.mocked(apiFetch);

/** The API's own saved-place entity, as `savedPlaceResponseSchema` returns it. */
function apiSavedPlace(overrides: Partial<ApiSavedPlace> = {}): ApiSavedPlace {
  return {
    id: "sp-1",
    tripId: "trip-1",
    createdBy: "user-1",
    name: "Konoba Mate",
    address: "Hvar harbour",
    description: "Book the terrace.",
    placeType: "food_and_drink",
    place: null,
    isPinned: false,
    createdAt: new Date("2026-10-11T10:00:00.000Z"),
    updatedAt: new Date("2026-10-11T10:00:00.000Z"),
    ...overrides,
  };
}

function linkedPlace() {
  return {
    placeId: "ChIJKonoba1",
    name: "Konoba Mate",
    address: "Hvar harbour",
    photoUrl: "/api/locations/photos/konoba-ref",
    photoAttribution: {
      name: "A. Photog",
      uri: "https://maps.google.com/?cid=1",
      photoUri: null,
    },
    photoSourceUri: "https://maps.google.com/?cid=1",
    country: "HR",
    locality: "Hvar",
  };
}

function cachedPlace(overrides: Partial<SavedPlace> = {}): SavedPlace {
  return {
    id: "sp-1",
    tripId: "trip-1",
    createdBy: "user-1",
    creatorName: "Ava",
    name: "Konoba Mate",
    address: "Hvar harbour",
    type: "food_and_drink",
    description: "Book the terrace.",
    isPinned: false,
    createdAt: "2026-10-11T10:00:00.000Z",
    placeId: null,
    image: null,
    photoCredit: null,
    photoSourceUri: null,
    ...overrides,
  };
}

function cachedMember(overrides: Partial<Member> = {}): Member {
  return {
    id: "member-1",
    userId: "user-1",
    name: "Ava",
    status: "going",
    isOrganizer: true,
    phone: "",
    sharePhone: false,
    handles: null,
    ...overrides,
  };
}

function capture<H>(
  tripId: string,
  useHook: (tripId: string) => H,
): { client: QueryClient; hook: H } {
  const client = makeQueryClient();
  const seen: { hook: H | null } = { hook: null };
  function Probe() {
    seen.hook = useHook(tripId);
    return null;
  }
  function Wrapper() {
    return createElement(
      QueryClientProvider,
      { client },
      createElement(Suspense, { fallback: null }, createElement(Probe)),
    );
  }
  renderToString(createElement(Wrapper));
  if (!seen.hook) throw new Error("hook was not captured");
  return { client, hook: seen.hook };
}

describe("toSavedPlace", () => {
  it("maps the wire entity onto the mobile shape, typed and unpinned", () => {
    const mapped = toSavedPlace(apiSavedPlace());

    expect(mapped).toMatchObject({
      id: "sp-1",
      tripId: "trip-1",
      createdBy: "user-1",
      creatorName: "",
      name: "Konoba Mate",
      address: "Hvar harbour",
      type: "food_and_drink",
      description: "Book the terrace.",
      isPinned: false,
      createdAt: "2026-10-11T10:00:00.000Z",
      placeId: null,
      image: null,
      photoCredit: null,
      photoSourceUri: null,
    });
    // The wire carries `placeType`, never a mobile `type` of its own —
    // and there is no `pinnedAt` on the wire (Task 5), only `isPinned`.
    expect(mapped).not.toHaveProperty("pinnedAt");
    expect(mapped).not.toHaveProperty("placeType");
    expect(mapped).not.toHaveProperty("updatedAt");
  });

  it("takes the resolved creator name in args, never off the wire", () => {
    // The entity carries `createdBy` (a user id) and no name at all,
    // so the name is handed over — the roster lookup lives with the
    // caller (`useSavedPlaces`), not the pure mapper.
    expect(toSavedPlace(apiSavedPlace(), "Ava").creatorName).toBe("Ava");
  });

  it("carries the linked place's id, image and credit", () => {
    const mapped = toSavedPlace(apiSavedPlace({ place: linkedPlace() }));

    expect(mapped.placeId).toBe("ChIJKonoba1");
    expect(mapped.image).toContain("size=");
    expect(mapped.photoCredit).toEqual({
      name: "A. Photog",
      uri: "https://maps.google.com/?cid=1",
    });
    expect(mapped.photoSourceUri).toBe("https://maps.google.com/?cid=1");
  });

  it("reads isPinned straight off the wire", () => {
    expect(toSavedPlace(apiSavedPlace({ isPinned: true })).isPinned).toBe(true);
  });
});

describe("savedPlaceKeys", () => {
  it("names the trip list, and no single-row key", () => {
    expect(savedPlaceKeys.list("trip-1")).toEqual([
      "savedPlaces",
      "list",
      "trip-1",
    ]);
    // There is no single-row read, so there is no detail key to go stale.
    expect(savedPlaceKeys).not.toHaveProperty("detail");
  });
});

describe("savedPlacesOptions", () => {
  it("GETs the trip list and maps rows through toSavedPlace", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      savedPlaces: [apiSavedPlace()],
    });

    const options = savedPlacesOptions("trip-1");
    expect(options.queryKey).toEqual(savedPlaceKeys.list("trip-1"));

    const places = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1/saved-places");
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ id: "sp-1", type: "food_and_drink" });
  });
});

describe("useSavedPlaces", () => {
  // The name is a per-render map over the roster cache, not part of
  // the query row: the entity carries `createdBy` (a user id) and no
  // name at all.
  it("names the creator off the roster and blanks the unknown", () => {
    mockedApiFetch.mockReset();
    const client = makeQueryClient();
    client.setQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"), [
      cachedPlace({ id: "sp-1", createdBy: "user-1", creatorName: "" }),
      cachedPlace({ id: "sp-2", createdBy: "user-9", creatorName: "" }),
    ]);
    client.setQueryData<Member[]>(memberKeys.list("trip-1"), [cachedMember()]);

    const seen: { value: ReturnType<typeof useSavedPlaces> | null } = {
      value: null,
    };
    function Probe() {
      seen.value = useSavedPlaces("trip-1");
      return null;
    }
    function Wrapper() {
      return createElement(
        QueryClientProvider,
        { client },
        createElement(Probe),
      );
    }
    renderToString(createElement(Wrapper));

    expect(seen.value!.status).toBe("success");
    expect(
      seen.value!.places.find((p) => p.id === "sp-1")!.creatorName,
    ).toBe("Ava");
    // No roster row for `user-9`: blank, never a guessed id.
    expect(
      seen.value!.places.find((p) => p.id === "sp-2")!.creatorName,
    ).toBe("");
    expect(typeof seen.value!.retry).toBe("function");
  });

  it("reads loading with no trip, never an error flash", () => {
    mockedApiFetch.mockReset();
    const client = makeQueryClient();
    const seen: { value: ReturnType<typeof useSavedPlaces> | null } = {
      value: null,
    };
    function Probe() {
      seen.value = useSavedPlaces(undefined);
      return null;
    }
    function Wrapper() {
      return createElement(
        QueryClientProvider,
        { client },
        createElement(Probe),
      );
    }
    renderToString(createElement(Wrapper));

    expect(seen.value!.status).toBe("loading");
    expect(seen.value!.places).toEqual([]);
  });
});

describe("createSavedPlace", () => {
  it("POSTs the picked pair and returns the mapped row", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      savedPlace: apiSavedPlace({ place: linkedPlace() }),
    });

    const place = await createSavedPlace("trip-1", {
      name: "Konoba Mate",
      address: "Hvar harbour",
      placeType: "food_and_drink",
      placeProvider: "google",
      placeId: "ChIJKonoba1",
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1/saved-places", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Konoba Mate",
        address: "Hvar harbour",
        placeType: "food_and_drink",
        placeProvider: "google",
        placeId: "ChIJKonoba1",
      }),
    });
    expect(place.placeId).toBe("ChIJKonoba1");
    expect(place.type).toBe("food_and_drink");
  });

  it("sends no pair keys for a typed word with no placeId", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      savedPlace: apiSavedPlace({ place: null }),
    });

    const place = await createSavedPlace("trip-1", {
      name: "That cove with the rope swing",
    });

    const [, init] = mockedApiFetch.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body).toEqual({ name: "That cove with the rope swing" });
    expect(place.placeId).toBeNull();
    expect(place.image).toBeNull();
  });

  // The entity has no snapshot columns for the picked place — the row's
  // own name/address ARE the snapshot — and the server strips unknown
  // body keys, so the pair travels with the strings the row keeps.
  it("sends no snapshot keys the wire no longer carries", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      savedPlace: apiSavedPlace({ place: linkedPlace() }),
    });

    const [, init] = (await createSavedPlace("trip-1", {
      name: "Konoba Mate",
      address: "Hvar harbour",
      placeType: "food_and_drink",
      placeProvider: "google",
      placeId: "ChIJKonoba1",
    }).then(() => mockedApiFetch.mock.calls[0])) as [string, { body: string }];
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(Object.keys(body)).not.toContain("placeName");
    expect(Object.keys(body)).not.toContain("placeAddress");
  });

  it("a 409 reaches the caller as a CODE, not a sentence", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(409, "This place is already saved", "SAVED_PLACE_DUPLICATE"),
    );

    const failure = await createSavedPlace("trip-1", {
      name: "Konoba Mate",
      placeProvider: "google",
      placeId: "ChIJKonoba1",
    }).catch((error: unknown) => error);

    // The raw `ApiError`, code-first — no custom error class with a
    // sentence for the form to unpick.
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe("SAVED_PLACE_DUPLICATE");
    expect(isSavedPlaceDuplicate(failure)).toBe(true);
    expect(isSavedPlaceDuplicate(new ApiError(500, "Server exploded"))).toBe(
      false,
    );
  });
});

describe("useCreateSavedPlace", () => {
  it("paints a temporary card and swaps it for the server row on settle", async () => {
    mockedApiFetch.mockReset();
    let resolveFetch!: (value: unknown) => void;
    mockedApiFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const { client, hook: create } = capture("trip-1", useCreateSavedPlace);
    client.setQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"), [
      cachedPlace({ id: "existing" }),
    ]);

    const pending = create.mutateAsync({ name: "The lighthouse" });

    await vi.waitFor(() => {
      expect(
        client.getQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1")),
      ).toHaveLength(2);
    });

    const painted = client
      .getQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"))!
      .find((row) => row.id.startsWith("pending-"))!;
    expect(painted.name).toBe("The lighthouse");
    expect(painted.isPinned).toBe(false);
    expect(painted.placeId).toBeNull();

    resolveFetch({
      success: true,
      savedPlace: apiSavedPlace({ id: "sp-9", name: "The lighthouse" }),
    });
    await pending;

    expect(
      client
        .getQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"))
        ?.map((row) => row.id)
        .sort(),
    ).toEqual(["existing", "sp-9"]);
  });

  it("gives two rapid typed creates distinct temp keys", async () => {
    // The typed case carries no placeId, so a temp key derived from
    // the pair would collide — every placeless create would share it.
    // Time-based ids never do.
    mockedApiFetch.mockReset();
    let resolvers: Array<(value: unknown) => void> = [];
    mockedApiFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const { client, hook: create } = capture("trip-1", useCreateSavedPlace);
    client.setQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"), []);

    const first = create.mutateAsync({ name: "First cove" });
    const second = create.mutateAsync({ name: "Second cove" });

    await vi.waitFor(() => {
      expect(
        client.getQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1")),
      ).toHaveLength(2);
    });

    const temps = client.getQueryData<SavedPlace[]>(
      savedPlaceKeys.list("trip-1"),
    )!;
    expect(new Set(temps.map((row) => row.id)).size).toBe(2);

    resolvers.forEach((resolve, index) =>
      resolve({
        success: true,
        savedPlace: apiSavedPlace({ id: `sp-${index}` }),
      }),
    );
    await Promise.all([first, second]);
    expect(
      client
        .getQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"))
        ?.map((row) => row.id)
        .sort(),
    ).toEqual(["sp-0", "sp-1"]);
    resolvers = [];
  });

  it("removes the painted card on failure, restoring what was there", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(new ApiError(500, "Server exploded"));

    const { client, hook: create } = capture("trip-1", useCreateSavedPlace);
    client.setQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"), [
      cachedPlace({ id: "existing" }),
    ]);

    await expect(
      create.mutateAsync({ name: "The lighthouse" }),
    ).rejects.toThrow();

    expect(
      client
        .getQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"))
        ?.map((row) => row.id),
    ).toEqual(["existing"]);
  });

  it("settles by invalidating the trip list, and no other trip", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      savedPlace: apiSavedPlace(),
    });

    const { client, hook: create } = capture("trip-1", useCreateSavedPlace);
    client.setQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"), []);
    client.setQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-2"), []);

    await create.mutateAsync({ name: "The lighthouse" });

    expect(
      client.getQueryState(savedPlaceKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(savedPlaceKeys.list("trip-2"))?.isInvalidated,
    ).toBe(false);
  });
});

describe("updateSavedPlace", () => {
  it("PUTs only the fields it was given", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      savedPlace: apiSavedPlace({ description: "New words" }),
    });

    const place = await updateSavedPlace("sp-1", {
      description: "New words",
    });

    expect(mockedApiFetch).toHaveBeenCalledWith("/saved-places/sp-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "New words" }),
    });
    expect(place.description).toBe("New words");
  });

  // The server refuses a repeated pair on an edit too ("update tried
  // pair duplicate"), so the same code-first contract holds: the form's
  // submit handler reads the code through `isSavedPlaceDuplicate` for
  // both verbs and answers under Where either way.
  it("an edit's duplicate pair 409 reaches the caller as a CODE too", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(409, "This place is already saved", "SAVED_PLACE_DUPLICATE"),
    );

    const failure = await updateSavedPlace("sp-1", {
      placeProvider: "google",
      placeId: "ChIJKonoba1",
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe("SAVED_PLACE_DUPLICATE");
    expect(isSavedPlaceDuplicate(failure)).toBe(true);
  });
});

describe("useUpdateSavedPlace", () => {
  it("patches the row it owns and leaves the others — and the photo — alone", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      savedPlace: apiSavedPlace({ name: "Renamed" }),
    });

    const { client, hook: update } = capture("trip-1", useUpdateSavedPlace);
    client.setQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"), [
      cachedPlace({
        id: "sp-1",
        placeId: "ChIJKonoba1",
        image: "https://photos.example/konoba?size=card",
      }),
      cachedPlace({ id: "sp-2", name: "Elsewhere" }),
    ]);

    await update.mutateAsync({
      savedPlaceId: "sp-1",
      input: { name: "Renamed" },
    });

    const rows = client.getQueryData<SavedPlace[]>(
      savedPlaceKeys.list("trip-1"),
    )!;
    // The scalar paint lands at once; the place-linked fields stay
    // exactly as the refetch will replace them — the image is the
    // server's resolution, never a guess.
    expect(rows.find((row) => row.id === "sp-1")).toMatchObject({
      name: "Renamed",
      placeId: "ChIJKonoba1",
      image: "https://photos.example/konoba?size=card",
    });
    expect(rows.find((row) => row.id === "sp-2")).toEqual(
      cachedPlace({ id: "sp-2", name: "Elsewhere" }),
    );
  });

  it("reverts only the list it replaced when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(new ApiError(403, "Nope"));

    const { client, hook: update } = capture("trip-1", useUpdateSavedPlace);
    const original = [cachedPlace({ id: "sp-1" })];
    client.setQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"), original);

    await expect(
      update.mutateAsync({ savedPlaceId: "sp-1", input: { name: "Renamed" } }),
    ).rejects.toThrow();

    expect(
      client.getQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1")),
    ).toEqual(original);
  });

  it("settles by invalidating the trip list", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      savedPlace: apiSavedPlace({ name: "Renamed" }),
    });

    const { client, hook: update } = capture("trip-1", useUpdateSavedPlace);
    client.setQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"), [
      cachedPlace({ id: "sp-1" }),
    ]);

    await update.mutateAsync({
      savedPlaceId: "sp-1",
      input: { name: "Renamed" },
    });

    expect(
      client.getQueryState(savedPlaceKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
  });
});

describe("deleteSavedPlace", () => {
  it("DELETEs the row", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true });

    await deleteSavedPlace("sp-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/saved-places/sp-1", {
      method: "DELETE",
    });
  });
});

describe("useDeleteSavedPlace", () => {
  it("drops the row immediately, because the delete is permanent", async () => {
    mockedApiFetch.mockReset();
    let resolveFetch!: (value: unknown) => void;
    mockedApiFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const { client, hook: remove } = capture("trip-1", useDeleteSavedPlace);
    client.setQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"), [
      cachedPlace({ id: "sp-1" }),
    ]);

    const pending = remove.mutateAsync({ savedPlaceId: "sp-1" });

    await vi.waitFor(() => {
      expect(
        client.getQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1")),
      ).toHaveLength(0);
    });

    resolveFetch({ success: true });
    await pending;

    expect(
      client.getQueryState(savedPlaceKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
  });

  it("restores the row when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(new ApiError(403, "Nope"));

    const { client, hook: remove } = capture("trip-1", useDeleteSavedPlace);
    client.setQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"), [
      cachedPlace({ id: "sp-1" }),
    ]);

    await expect(
      remove.mutateAsync({ savedPlaceId: "sp-1" }),
    ).rejects.toThrow();

    expect(
      client.getQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1")),
    ).toHaveLength(1);
  });
});

describe("setSavedPlacePinned", () => {
  it("pins with POST {pinned:true} and maps the server row", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      savedPlace: apiSavedPlace({ isPinned: true }),
    });

    const place = await setSavedPlacePinned("sp-1", true);

    expect(mockedApiFetch).toHaveBeenCalledWith("/saved-places/sp-1/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: true }),
    });
    expect(place.isPinned).toBe(true);
  });

  it("unpins with DELETE and no body", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      savedPlace: apiSavedPlace({ isPinned: false }),
    });

    const place = await setSavedPlacePinned("sp-1", false);

    expect(mockedApiFetch).toHaveBeenCalledWith("/saved-places/sp-1/pin", {
      method: "DELETE",
    });
    expect(place.isPinned).toBe(false);
  });
});

describe("usePinSavedPlace", () => {
  it("flips isPinned and leads the pinned card, resolving to the server row", async () => {
    mockedApiFetch.mockReset();
    let resolveFetch!: (value: unknown) => void;
    mockedApiFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const { client, hook: pin } = capture("trip-1", usePinSavedPlace);
    client.setQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"), [
      cachedPlace({ id: "sp-1", name: "First" }),
      cachedPlace({ id: "sp-2", name: "Second" }),
    ]);

    const pending = pin.mutateAsync({ savedPlaceId: "sp-2", pinned: true });

    await vi.waitFor(() => {
      const rows = client.getQueryData<SavedPlace[]>(
        savedPlaceKeys.list("trip-1"),
      )!;
      expect(rows.find((row) => row.id === "sp-2")!.isPinned).toBe(true);
    });

    // The pinned card leads while the server is still writing.
    expect(
      client
        .getQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"))!
        .map((row) => row.id),
    ).toEqual(["sp-2", "sp-1"]);

    resolveFetch({
      success: true,
      savedPlace: apiSavedPlace({ id: "sp-2", isPinned: true }),
    });
    await pending;

    const rows = client.getQueryData<SavedPlace[]>(
      savedPlaceKeys.list("trip-1"),
    )!;
    expect(rows.find((row) => row.id === "sp-2")!.isPinned).toBe(true);
    expect(rows.map((row) => row.id)).toEqual(["sp-2", "sp-1"]);
  });

  it("unpin flips the flag back without touching the rest", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      savedPlace: apiSavedPlace({ id: "sp-1", isPinned: false }),
    });

    const { client, hook: pin } = capture("trip-1", usePinSavedPlace);
    client.setQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"), [
      cachedPlace({ id: "sp-1", isPinned: true }),
      cachedPlace({ id: "sp-2", name: "Elsewhere" }),
    ]);

    await pin.mutateAsync({ savedPlaceId: "sp-1", pinned: false });

    expect(
      client
        .getQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"))!
        .find((row) => row.id === "sp-1")!.isPinned,
    ).toBe(false);
  });

  it("rolls the flag back when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(new ApiError(403, "Nope"));

    const { client, hook: pin } = capture("trip-1", usePinSavedPlace);
    client.setQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"), [
      cachedPlace({ id: "sp-1", isPinned: false }),
    ]);

    await expect(
      pin.mutateAsync({ savedPlaceId: "sp-1", pinned: true }),
    ).rejects.toThrow();

    expect(
      client
        .getQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"))!
        .find((row) => row.id === "sp-1")!.isPinned,
    ).toBe(false);
  });

  it("settles by invalidating the trip list", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      savedPlace: apiSavedPlace({ id: "sp-1", isPinned: true }),
    });

    const { client, hook: pin } = capture("trip-1", usePinSavedPlace);
    client.setQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"), [
      cachedPlace({ id: "sp-1" }),
    ]);

    await pin.mutateAsync({ savedPlaceId: "sp-1", pinned: true });

    expect(
      client.getQueryState(savedPlaceKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
  });
});

describe("invalidateTripPlaces", () => {
  it("marks the trip list stale and leaves other trips alone", async () => {
    const client = makeQueryClient();
    client.setQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-1"), []);
    client.setQueryData<SavedPlace[]>(savedPlaceKeys.list("trip-2"), []);

    await invalidateTripPlaces(client, "trip-1");

    expect(
      client.getQueryState(savedPlaceKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(savedPlaceKeys.list("trip-2"))?.isInvalidated,
    ).toBe(false);
  });
});
