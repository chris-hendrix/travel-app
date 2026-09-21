import { describe, expect, it, vi } from "vitest";
import { createElement, Suspense } from "react";
import { createRequire } from "node:module";

// Same pattern as `events.test.ts` / `event-writes.test.ts`: stub the
// network at the module boundary, keep the real `ApiError` (rollback
// tests assert `instanceof`).
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

// Same probe seam as `event-writes.test.ts`: `react-dom` ships no
// server types in this workspace, so the renderer is loaded through
// `require` (typed as `any`).
const require = createRequire(import.meta.url);
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: unknown) => string;
};

import { QueryClientProvider } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import { placeholderPhoto } from "@/lib/mapping";
import type { Stay } from "@/lib/stays";
import { staySpan, stayTime, staysInOrder } from "@/lib/stays";
import type { Accommodation } from "@journiful/shared/types";
import {
  createStay,
  createStayOptions,
  deleteStay,
  deleteStayOptions,
  stayKeys,
  staysOptions,
  updateStay,
  updateStayOptions,
  type GetStaysResponse,
} from "@/lib/queries/stays";
import { makeQueryClient } from "@/lib/queries/client";
import { StaysProvider, useStays as useStaysStore } from "@/lib/staysStore";

const mockedApiFetch = vi.mocked(apiFetch);

/**
 * The full accommodation entity the list/create/update endpoints return
 * (`accommodationResponseSchema` / `accommodationListResponseSchema` in
 * `shared/schemas/accommodation.ts`). Times are ISO strings on the wire
 * (Fastify serializes the `z.date()` columns), links ride as
 * `{url, name?}` items, `null` times are the untimed stay.
 */
function row(overrides: Record<string, unknown> = {}): Accommodation {
  return {
    id: "stay-1",
    tripId: "trip-1",
    createdBy: "user-1",
    name: "Ca'n Puig",
    address: "Carrer de la Mar 14, 07100 Sóller",
    addressLat: null,
    addressLon: null,
    description: "Lockbox left of the blue gate — 4417.",
    checkIn: "2026-06-04T15:00:00.000Z",
    checkOut: "2026-06-06T10:00:00.000Z",
    links: [{ url: "https://example.com/can-puig", name: "Listing" }],
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  } as Accommodation;
}

function cachedStay(overrides: Partial<Stay> = {}): Stay {
  return {
    id: "stay-1",
    name: "Ca'n Puig",
    address: "Carrer de la Mar 14, 07100 Sóller",
    addressLat: null,
    addressLon: null,
    description: "Lockbox left of the blue gate — 4417.",
    checkIn: "2026-06-04T15:00:00.000Z",
    checkOut: "2026-06-06T10:00:00.000Z",
    image: placeholderPhoto("stay-1"),
    links: [{ url: "https://example.com/can-puig", name: "Listing" }],
    deletedAt: null,
    ...overrides,
  };
}

describe("staysOptions", () => {
  it("maps GET /trips/:tripId/accommodations into Stay rows", async () => {
    const body = { success: true, accommodations: [row()] } as unknown as {
      success: true;
      accommodations: Accommodation[];
    };
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(body);

    const options = staysOptions("trip-1");
    expect(options.queryKey).toEqual(stayKeys.list("trip-1"));

    const stays = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/trips/trip-1/accommodations",
    );
    expect(stays).toHaveLength(1);
    // address stays the address, image is the placeholder stub, links
    // carry through with their names.
    expect(stays[0]).toMatchObject({
      id: "stay-1",
      name: "Ca'n Puig",
      address: "Carrer de la Mar 14, 07100 Sóller",
      image: placeholderPhoto("stay-1"),
      links: [{ url: "https://example.com/can-puig", name: "Listing" }],
    });
  });

  it("passes times through as the mobile clock strings", async () => {
    const body = { success: true, accommodations: [row()] } as unknown as {
      success: true;
      accommodations: Accommodation[];
    };
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(body);

    const options = staysOptions("trip-1");
    const stays = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(stays[0]).toMatchObject({
      checkIn: "2026-06-04T15:00:00.000Z",
      checkOut: "2026-06-06T10:00:00.000Z",
    });
    // And the clock helpers read them: a timed stay prints times.
    expect(stayTime(stays[0]!.checkIn, null)).not.toBeNull();
    expect(stayTime(stays[0]!.checkOut, null)).not.toBeNull();
  });

  it("maps null times as the untimed stay", async () => {
    const body = {
      success: true,
      accommodations: [row({ id: "stay-2", checkIn: null, checkOut: null })],
    } as unknown as GetStaysResponse;
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(body);

    const options = staysOptions("trip-1");
    const stays = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(stays[0]).toMatchObject({ id: "stay-2", checkIn: null, checkOut: null });
    // No times means no clock and no span: the sheet prints the day
    // and stops (lib/stays.ts `stayTime` / `staySpan`).
    expect(stayTime(stays[0]!.checkIn, null)).toBeNull();
    expect(stayTime(stays[0]!.checkOut, null)).toBeNull();
    expect(staySpan(stays[0]!, null)).toBeNull();
    // And it sorts last: undated stays belong to no day.
    expect(
      staysInOrder([stays[0]!, cachedStay()]).map((stay) => stay.id),
    ).toEqual(["stay-1", "stay-2"]);
  });

  it("leaves includeDeleted off (no UI for it yet)", async () => {
    const body = { success: true, accommodations: [] } as GetStaysResponse;
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(body);

    const options = staysOptions("trip-1");
    await options.queryFn!({ queryKey: options.queryKey } as never);

    const url = mockedApiFetch.mock.calls[0]?.[0] as string;
    expect(url).toBe("/trips/trip-1/accommodations");
    expect(url).not.toContain("includeDeleted");
  });

  it("preserves server order (sorting stays with staysInOrder)", async () => {
    const body = {
      success: true,
      accommodations: [
        row({
          id: "stay-late",
          checkIn: "2026-06-06T15:00:00.000Z",
          checkOut: "2026-06-07T10:00:00.000Z",
        }),
        row({
          id: "stay-early",
          checkIn: "2026-06-04T15:00:00.000Z",
          checkOut: "2026-06-05T10:00:00.000Z",
        }),
      ],
    } as unknown as GetStaysResponse;
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(body);

    const options = staysOptions("trip-1");
    const stays = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(stays.map((stay) => stay.id)).toEqual([
      "stay-late",
      "stay-early",
    ]);
  });
});

const createInput = {
  name: "Ca'n Puig",
  address: "Carrer de la Mar 14, 07100 Sóller",
  description: "Lockbox left of the blue gate — 4417.",
  checkIn: "2026-06-04T15:00:00.000Z",
  checkOut: "2026-06-06T10:00:00.000Z",
};

describe("createStay", () => {
  it("POSTs /trips/:tripId/accommodations and returns the mapped stay", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, accommodation: row() });

    const options = createStayOptions();
    expect(options.mutationKey).toEqual(["stays", "create"]);

    const stay = await createStay("trip-1", createInput);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/trips/trip-1/accommodations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createInput),
      },
    );
    // Mapped through `toStay`: address stays, image→placeholder. The
    // response carries the full entity, so no placeholder merge is
    // needed (unlike the trips writes).
    expect(stay).toMatchObject({
      id: "stay-1",
      name: "Ca'n Puig",
      address: "Carrer de la Mar 14, 07100 Sóller",
      image: placeholderPhoto("stay-1"),
    });
  });
});

describe("updateStay", () => {
  it("PUTs /accommodations/:id with the partial patch and returns the mapped stay", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      accommodation: row({ name: "Ca'n Puig, side annex" }),
    });

    const options = updateStayOptions();
    expect(options.mutationKey).toEqual(["stays", "update"]);

    // The update schema is partial (`baseAccommodationSchema.partial()`),
    // so an edit sends only what changed.
    const patch = { name: "Ca'n Puig, side annex" };
    const stay = await updateStay("stay-1", patch);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/accommodations/stay-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    expect(stay).toMatchObject({
      id: "stay-1",
      name: "Ca'n Puig, side annex",
    });
  });
});

describe("deleteStay", () => {
  it("DELETEs /accommodations/:id (soft server-side) and resolves void", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true });

    const options = deleteStayOptions();
    expect(options.mutationKey).toEqual(["stays", "delete"]);

    await expect(deleteStay("stay-1")).resolves.toBeUndefined();

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/accommodations/stay-1", {
      method: "DELETE",
    });
  });
});

describe("useStays() writes (staysStore)", () => {
  function captureStays() {
    const client = makeQueryClient();
    client.setQueryData<Stay[]>(stayKeys.list("trip-1"), [cachedStay()]);

    const seen: {
      actions: ReturnType<typeof useStaysStore> | null;
    } = { actions: null };
    function Probe() {
      seen.actions = useStaysStore();
      return null;
    }
    function Wrapper() {
      return createElement(
        QueryClientProvider,
        { client },
        createElement(
          StaysProvider,
          null,
          createElement(Suspense, { fallback: null }, createElement(Probe)),
        ),
      );
    }
    renderToString(createElement(Wrapper));
    if (!seen.actions) throw new Error("useStays was not captured");
    return { client, actions: seen.actions };
  }

  it("addStay paints the optimistic row and swaps in the server stay", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      accommodation: row({ id: "stay-9", name: "Son Moragues" }),
    });

    const { client, actions } = captureStays();

    const optimistic: Stay = {
      ...cachedStay(),
      id: "custom-1",
      name: "Son Moragues",
    };
    const stay = await actions.addStay("trip-1", optimistic);
    expect(stay).toMatchObject({ id: "stay-9", name: "Son Moragues" });

    // The optimistic row is gone, replaced by the server stay.
    const rows = client.getQueryData<Stay[]>(stayKeys.list("trip-1"));
    expect(rows?.map((row) => row.id)).toEqual(["stay-1", "stay-9"]);
    expect(rows?.find((row) => row.id === "stay-9")).toMatchObject({
      name: "Son Moragues",
      address: "Carrer de la Mar 14, 07100 Sóller",
    });

    // The list invalidates, so the next mount reads server truth.
    expect(
      client.getQueryState(stayKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
  });

  it("addStay rolls the optimistic row back when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(new ApiError(500, "Failed to create stay"));

    const { client, actions } = captureStays();

    // The section exposes the failure: the action rejects, so the
    // screen can feed its InlineError instead of dismissing.
    await expect(
      actions.addStay("trip-1", { ...cachedStay(), id: "custom-2" }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(client.getQueryData<Stay[]>(stayKeys.list("trip-1"))).toEqual([
      cachedStay(),
    ]);
  });

  it("updateStay paints the patch and rolls back on failure", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      accommodation: row({ name: "Ca'n Puig, side annex" }),
    });

    const { client, actions } = captureStays();

    const stay = await actions.updateStay("trip-1", "stay-1", {
      name: "Ca'n Puig, side annex",
    });
    expect(stay.name).toBe("Ca'n Puig, side annex");
    expect(
      client.getQueryData<Stay[]>(stayKeys.list("trip-1"))?.[0],
    ).toMatchObject({ id: "stay-1", name: "Ca'n Puig, side annex" });
    expect(
      client.getQueryState(stayKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);

    mockedApiFetch.mockRejectedValueOnce(
      new ApiError(500, "Failed to update stay"),
    );
    await expect(
      actions.updateStay("trip-1", "stay-1", { name: "Never lands" }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(
      client.getQueryData<Stay[]>(stayKeys.list("trip-1"))?.[0],
    ).toMatchObject({ name: "Ca'n Puig, side annex" });
  });

  it("deleteStay marks the row deleted optimistically and invalidates", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true });

    const { client, actions } = captureStays();

    await actions.deleteStay("trip-1", "stay-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/accommodations/stay-1", {
      method: "DELETE",
    });
    // Soft server-side with includeDeleted off: the row disappears on
    // refetch, which the invalidation triggers.
    expect(
      client.getQueryState(stayKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
  });

  it("deleteStay rolls the row back when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(new ApiError(500, "Failed to delete stay"));

    const { client, actions } = captureStays();

    await expect(actions.deleteStay("trip-1", "stay-1")).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(client.getQueryData<Stay[]>(stayKeys.list("trip-1"))).toEqual([
      cachedStay(),
    ]);
  });
});
