import { describe, expect, it, vi } from "vitest";
import { createElement, Suspense } from "react";
import { createRequire } from "node:module";

// Same probe seam as `event-writes.test.ts`: `react-dom` ships no
// server types in this workspace, so the renderer is loaded through
// `require` (typed as `any`).
const require = createRequire(import.meta.url);
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: unknown) => string;
};

// Keep the real `ApiError` (the rollback tests assert `instanceof`)
// and stub only the network at the module boundary.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { QueryClientProvider } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import type { Member } from "@/lib/members";
import {
  invalidateTripPeople,
  memberKeys,
  removeInvitation,
  removeMember,
  useRemoveInvitation,
  useRemoveMember,
} from "@/lib/queries/members";
import { invitationKeys, type TripInvitationRow } from "@/lib/queries/invitations";
import { travelKeys } from "@/lib/queries/travel";
import { tripKeys } from "@/lib/queries/trips";
import { makeQueryClient } from "@/lib/queries/client";

const mockedApiFetch = vi.mocked(apiFetch);

function cachedMember(overrides: Partial<Member> = {}): Member {
  return {
    id: "member-1",
    userId: "user-1",
    name: "Ava",
    status: "going",
    isOrganizer: true,
    phone: "+15550000001",
    sharePhone: true,
    handles: null,
    ...overrides,
  };
}

function cachedInvitation(
  overrides: Partial<TripInvitationRow> = {},
): TripInvitationRow {
  return {
    id: "invite-1",
    phone: "+15550000002",
    status: "pending",
    sentAt: "2026-01-01T00:00:00.000Z",
    name: null,
    ...overrides,
  };
}

describe("invalidateTripPeople", () => {
  it("invalidates the roster, invitations, travel board and trip detail in one call", async () => {
    mockedApiFetch.mockReset();
    const client = makeQueryClient();
    client.setQueryData(memberKeys.list("trip-1"), [cachedMember()]);
    client.setQueryData(invitationKeys.trip("trip-1"), [cachedInvitation()]);
    client.setQueryData(travelKeys.list("trip-1"), []);
    client.setQueryData(tripKeys.detail("trip-1"), null);
    // No query ever sits exactly on `tripKeys.all`; the trips list
    // query below stands in for the domain the prefix covers.
    client.setQueryData(tripKeys.list(), []);

    await invalidateTripPeople(client, "trip-1");

    // A removal changes the roster, the invitations, the travel board
    // and the trip's own counts, so a single call covers all four.
    expect(
      client.getQueryState(memberKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(invitationKeys.trip("trip-1"))?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(travelKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(tripKeys.detail("trip-1"))?.isInvalidated,
    ).toBe(true);
    expect(client.getQueryState(tripKeys.list())?.isInvalidated).toBe(true);
  });
});

describe("removeMember", () => {
  function captureRemoveMember() {
    const client = makeQueryClient();
    client.setQueryData<Member[]>(memberKeys.list("trip-1"), [
      cachedMember(),
      cachedMember({ id: "member-2", userId: null, name: "Guest" }),
    ]);
    // Seeded so the settle's shared invalidation has rows to mark.
    client.setQueryData(invitationKeys.trip("trip-1"), [cachedInvitation()]);

    const seen: {
      remove: ReturnType<typeof useRemoveMember> | null;
    } = { remove: null };
    function Probe() {
      seen.remove = useRemoveMember("trip-1");
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
    if (!seen.remove) throw new Error("useRemoveMember was not captured");
    return { client, remove: seen.remove };
  }

  it("DELETEs /trips/:tripId/members/:memberId and resolves void", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(undefined);

    await expect(removeMember("trip-1", "member-2")).resolves.toBeUndefined();

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/trips/trip-1/members/member-2",
      { method: "DELETE" },
    );
  });

  it("removes the row before the request resolves and invalidates on settle", async () => {
    mockedApiFetch.mockReset();
    let resolveRequest!: (value: unknown) => void;
    mockedApiFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const { client, remove } = captureRemoveMember();

    const pending = remove.mutateAsync({ memberId: "member-2" });
    // The optimistic paint lands while the DELETE is still in flight.
    await vi.waitFor(() => {
      expect(
        client.getQueryData<Member[]>(memberKeys.list("trip-1")),
      ).toEqual([cachedMember()]);
    });

    resolveRequest(undefined);
    await pending;

    expect(
      client.getQueryData<Member[]>(memberKeys.list("trip-1")),
    ).toEqual([cachedMember()]);
    // The settle funnels through the shared invalidation, so the
    // roster, invitations, travel and trip counts all go stale.
    expect(
      client.getQueryState(memberKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(invitationKeys.trip("trip-1"))?.isInvalidated,
    ).toBe(true);
  });

  it("restores the previous list when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(500, "Failed to remove member"),
    );

    const { client, remove } = captureRemoveMember();

    await expect(
      remove.mutateAsync({ memberId: "member-2" }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(
      client.getQueryData<Member[]>(memberKeys.list("trip-1")),
    ).toEqual([
      cachedMember(),
      cachedMember({ id: "member-2", userId: null, name: "Guest" }),
    ]);
  });
});

describe("removeInvitation", () => {
  function captureRemoveInvitation() {
    const client = makeQueryClient();
    client.setQueryData<TripInvitationRow[]>(invitationKeys.trip("trip-1"), [
      cachedInvitation(),
      cachedInvitation({ id: "invite-2", phone: "+15550000003" }),
    ]);

    const seen: {
      remove: ReturnType<typeof useRemoveInvitation> | null;
    } = { remove: null };
    function Probe() {
      seen.remove = useRemoveInvitation("trip-1");
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
    if (!seen.remove) throw new Error("useRemoveInvitation was not captured");
    return { client, remove: seen.remove };
  }

  it("DELETEs /invitations/:id and resolves void", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true });

    await expect(removeInvitation("invite-2")).resolves.toBeUndefined();

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/invitations/invite-2", {
      method: "DELETE",
    });
  });

  it("removes the invitee row optimistically and invalidates on settle", async () => {
    mockedApiFetch.mockReset();
    let resolveRequest!: (value: unknown) => void;
    mockedApiFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const { client, remove } = captureRemoveInvitation();

    const pending = remove.mutateAsync({ id: "invite-2" });
    await vi.waitFor(() => {
      expect(
        client.getQueryData<TripInvitationRow[]>(
          invitationKeys.trip("trip-1"),
        ),
      ).toEqual([cachedInvitation()]);
    });

    resolveRequest({ success: true });
    await pending;

    expect(
      client.getQueryData<TripInvitationRow[]>(invitationKeys.trip("trip-1")),
    ).toEqual([cachedInvitation()]);
    expect(
      client.getQueryState(invitationKeys.trip("trip-1"))?.isInvalidated,
    ).toBe(true);
  });

  it("restores the previous invitations when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(500, "Failed to remove invitation"),
    );

    const { client, remove } = captureRemoveInvitation();

    await expect(
      remove.mutateAsync({ id: "invite-2" }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(
      client.getQueryData<TripInvitationRow[]>(invitationKeys.trip("trip-1")),
    ).toEqual([
      cachedInvitation(),
      cachedInvitation({ id: "invite-2", phone: "+15550000003" }),
    ]);
  });
});
