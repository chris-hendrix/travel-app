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
  createGuest,
  updateGuest,
  setOrganizer,
  canChangeMemberRole,
  useCreateGuest,
  useUpdateGuest,
  useInviteGuest,
  useSetOrganizer,
  InviteGuestError,
  GuestPhoneTakenError,
  isGuestPhoneTaken,
  removeInvitation,
  removeMember,
  useRemoveInvitation,
  useRemoveMember,
} from "@/lib/queries/members";
import * as membersModule from "@/lib/queries/members";
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

function cachedGuest(overrides: Partial<Member> = {}): Member {
  return {
    id: "guest-1",
    userId: null,
    name: "Guest",
    status: "no_response",
    isOrganizer: false,
    phone: "+15550000009",
    guestPhone: "+15550000009",
    sharePhone: false,
    handles: null,
    ...overrides,
  };
}

/**
 * The raw guest row the guest endpoints return (`createGuestResponseSchema` /
 * `updateGuestResponseSchema` in `apps/api/src/routes/guest-member.routes.ts`):
 * a `MemberWithProfile` subset — `userId` null, `guestPhone` surfaced, no
 * `phoneNumber`/`sharePhone` columns.
 */
function guestEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: "guest-1",
    userId: null,
    displayName: "Guest",
    profilePhotoUrl: null,
    handles: null,
    guestPhone: "+15550000009",
    status: "no_response",
    isOrganizer: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("createGuest", () => {
  it("POSTs /trips/:tripId/members/guests and returns the mapped guest", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, member: guestEntity() });

    const guest = await createGuest("trip-1", {
      displayName: "Guest",
      guestPhone: "+15550000009",
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/trips/trip-1/members/guests",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: "Guest",
          guestPhone: "+15550000009",
        }),
      },
    );
    // Mapped through `toMember`: displayName→name, the guest number
    // lands on both `phone` and `guestPhone`, `userId` stays null.
    expect(guest).toMatchObject({
      id: "guest-1",
      userId: null,
      name: "Guest",
      phone: "+15550000009",
      guestPhone: "+15550000009",
      isOrganizer: false,
    });
  });

  it("appends the new guest to the roster and invalidates on settle", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, member: guestEntity() });

    const client = makeQueryClient();
    client.setQueryData<Member[]>(memberKeys.list("trip-1"), [cachedMember()]);
    const seen: { create: ReturnType<typeof useCreateGuest> | null } = {
      create: null,
    };
    function Probe() {
      seen.create = useCreateGuest("trip-1");
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
    if (!seen.create) throw new Error("useCreateGuest was not captured");

    const guest = await seen.create.mutateAsync({
      displayName: "Guest",
      guestPhone: "+15550000009",
    });

    expect(guest.name).toBe("Guest");
    expect(
      client.getQueryData<Member[]>(memberKeys.list("trip-1"))?.map((row) => row.id),
    ).toEqual(["member-1", "guest-1"]);
    expect(
      client.getQueryState(memberKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
  });

  it("surfaces a 409 DUPLICATE_MEMBER as a phone field error", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(409, "Guest is already a member", "DUPLICATE_MEMBER"),
    );

    const failure = await createGuest("trip-1", {
      displayName: "Guest",
      guestPhone: "+15550000001",
    }).catch((error: unknown) => error);

    // A phone field error, not a generic failure: the caller can tell
    // it apart and point the form at the phone field.
    expect(failure).toBeInstanceOf(GuestPhoneTakenError);
    expect(isGuestPhoneTaken(failure)).toBe(true);
    expect(isGuestPhoneTaken(new ApiError(500, "Nope"))).toBe(false);
  });
});

describe("updateGuest", () => {
  function captureUpdateGuest() {
    const client = makeQueryClient();
    client.setQueryData<Member[]>(memberKeys.list("trip-1"), [
      cachedMember(),
      cachedGuest(),
    ]);
    const seen: { update: ReturnType<typeof useUpdateGuest> | null } = {
      update: null,
    };
    function Probe() {
      seen.update = useUpdateGuest("trip-1");
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
    if (!seen.update) throw new Error("useUpdateGuest was not captured");
    return { client, update: seen.update };
  }

  it("PATCHes /trips/:tripId/members/guests/:id and returns the mapped guest", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      member: guestEntity({ displayName: "Renamed" }),
    });

    const guest = await updateGuest("trip-1", "guest-1", {
      displayName: "Renamed",
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/trips/trip-1/members/guests/guest-1",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Renamed" }),
      },
    );
    expect(guest).toMatchObject({ id: "guest-1", name: "Renamed" });
  });

  it("patches the roster row optimistically and invalidates on settle", async () => {
    mockedApiFetch.mockReset();
    let resolveRequest!: (value: unknown) => void;
    mockedApiFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const { client, update } = captureUpdateGuest();

    const pending = update.mutateAsync({
      memberId: "guest-1",
      patch: { displayName: "Renamed" },
    });
    // The optimistic paint lands while the PATCH is still in flight.
    await vi.waitFor(() => {
      expect(
        client
          .getQueryData<Member[]>(memberKeys.list("trip-1"))
          ?.find((row) => row.id === "guest-1")?.name,
      ).toBe("Renamed");
    });

    resolveRequest({
      success: true,
      member: guestEntity({ displayName: "Renamed" }),
    });
    await pending;

    expect(
      client
        .getQueryData<Member[]>(memberKeys.list("trip-1"))
        ?.find((row) => row.id === "guest-1")?.name,
    ).toBe("Renamed");
    expect(
      client.getQueryState(memberKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
  });

  it("rolls the row back when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(500, "Failed to update guest"),
    );

    const { client, update } = captureUpdateGuest();

    await expect(
      update.mutateAsync({ memberId: "guest-1", patch: { displayName: "Lost" } }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(
      client
        .getQueryData<Member[]>(memberKeys.list("trip-1"))
        ?.find((row) => row.id === "guest-1")?.name,
    ).toBe("Guest");
  });

  it("surfaces a 409 DUPLICATE_MEMBER as a phone field error", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(409, "Guest is already a member", "DUPLICATE_MEMBER"),
    );

    const { update } = captureUpdateGuest();

    const failure = await update
      .mutateAsync({
        memberId: "guest-1",
        patch: { guestPhone: "+15550000001" },
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(GuestPhoneTakenError);
    expect(isGuestPhoneTaken(failure)).toBe(true);
  });
});

describe("useInviteGuest", () => {
  function captureInviteGuest() {
    const client = makeQueryClient();
    client.setQueryData<Member[]>(memberKeys.list("trip-1"), [
      cachedMember(),
      cachedGuest(),
    ]);
    const seen: { invite: ReturnType<typeof useInviteGuest> | null } = {
      invite: null,
    };
    function Probe() {
      seen.invite = useInviteGuest("trip-1");
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
    if (!seen.invite) throw new Error("useInviteGuest was not captured");
    return { client, invite: seen.invite };
  }

  /** The batch-invitation reply `invite()` resolves (`createInvitations`). */
  function invitationReply() {
    return {
      success: true,
      invitations: [],
      addedMembers: [],
      skipped: [],
    };
  }

  it("PATCHes a changed phone first and POSTs the invitation second, in order", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch
      .mockResolvedValueOnce({
        success: true,
        member: guestEntity({ guestPhone: "+15550000009" }),
      })
      .mockResolvedValueOnce(invitationReply());

    const { invite } = captureInviteGuest();

    await invite.mutateAsync({
      memberId: "guest-1",
      phone: "+15550000007",
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    // Ordering, not just co-occurrence: the PATCH lands at call 0,
    // the invitation POST at call 1.
    expect(mockedApiFetch.mock.calls[0]?.[0]).toBe(
      "/trips/trip-1/members/guests/guest-1",
    );
    expect(mockedApiFetch.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
    });
    expect(JSON.parse(
      (mockedApiFetch.mock.calls[0]?.[1] as { body: string }).body,
    )).toMatchObject({ guestPhone: "+15550000007" });
    expect(mockedApiFetch.mock.calls[1]?.[0]).toBe(
      "/trips/trip-1/invitations",
    );
    expect(mockedApiFetch.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
    });
    expect(JSON.parse(
      (mockedApiFetch.mock.calls[1]?.[1] as { body: string }).body,
    )).toMatchObject({ phoneNumbers: ["+15550000007"], userIds: [] });
  });

  it("skips the PATCH entirely when the phone is unchanged", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(invitationReply());

    const { invite } = captureInviteGuest();

    await invite.mutateAsync({
      memberId: "guest-1",
      phone: "+15550000009",
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/trips/trip-1/invitations",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps the saved phone when the invite fails and reports the invite stage", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch
      .mockResolvedValueOnce({
        success: true,
        member: guestEntity({ guestPhone: "+15550000007" }),
      })
      .mockRejectedValueOnce(new ApiError(500, "Failed to send invitation"));

    const { client, invite } = captureInviteGuest();

    const failure = await invite
      .mutateAsync({ memberId: "guest-1", phone: "+15550000007" })
      .catch((error: unknown) => error);

    // The invite failure is reported separately from a phone failure:
    // the stage names which half failed.
    expect(failure).toBeInstanceOf(InviteGuestError);
    expect((failure as InviteGuestError).stage).toBe("invite");
    // The PATCH already succeeded, so the saved phone must survive —
    // the failed POST rolls nothing back.
    expect(
      client
        .getQueryData<Member[]>(memberKeys.list("trip-1"))
        ?.find((row) => row.id === "guest-1")?.phone,
    ).toBe("+15550000007");
  });

  it("reports a phone failure at the phone stage without POSTing", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(409, "Guest is already a member", "DUPLICATE_MEMBER"),
    );

    const { invite } = captureInviteGuest();

    const failure = await invite
      .mutateAsync({ memberId: "guest-1", phone: "+15550000001" })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(InviteGuestError);
    expect((failure as InviteGuestError).stage).toBe("phone");
    expect(isGuestPhoneTaken((failure as InviteGuestError).cause)).toBe(true);
    // The phone half failed, so the invitation POST never fired.
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch.mock.calls[0]?.[0]).toBe(
      "/trips/trip-1/members/guests/guest-1",
    );
  });
});

describe("setOrganizer", () => {
  function captureSetOrganizer() {
    const client = makeQueryClient();
    client.setQueryData<Member[]>(memberKeys.list("trip-1"), [
      cachedMember(),
      cachedMember({ id: "member-2", isOrganizer: false, name: "Bo" }),
    ]);
    const seen: { set: ReturnType<typeof useSetOrganizer> | null } = {
      set: null,
    };
    function Probe() {
      seen.set = useSetOrganizer("trip-1");
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
    if (!seen.set) throw new Error("useSetOrganizer was not captured");
    return { client, set: seen.set };
  }

  /** The role-update reply (`updateRsvpResponseSchema` carries the member). */
  function roleEntity(overrides: Record<string, unknown> = {}) {
    return {
      id: "member-2",
      userId: "user-2",
      displayName: "Bo",
      profilePhotoUrl: null,
      handles: null,
      phoneNumber: "+15550000002",
      status: "going",
      isOrganizer: true,
      sharePhone: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("PATCHes /trips/:tripId/members/:memberId with { isOrganizer }", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, member: roleEntity() });

    const member = await setOrganizer("trip-1", "member-2", true);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/trips/trip-1/members/member-2",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOrganizer: true }),
      },
    );
    expect(member).toMatchObject({ id: "member-2", isOrganizer: true });
  });

  it("flips the flag optimistically and invalidates on settle", async () => {
    mockedApiFetch.mockReset();
    let resolveRequest!: (value: unknown) => void;
    mockedApiFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const { client, set } = captureSetOrganizer();

    const pending = set.mutateAsync({ memberId: "member-2", isOrganizer: true });
    // The optimistic paint lands while the PATCH is still in flight.
    await vi.waitFor(() => {
      expect(
        client
          .getQueryData<Member[]>(memberKeys.list("trip-1"))
          ?.find((row) => row.id === "member-2")?.isOrganizer,
      ).toBe(true);
    });

    resolveRequest({ success: true, member: roleEntity() });
    await pending;

    expect(
      client
        .getQueryData<Member[]>(memberKeys.list("trip-1"))
        ?.find((row) => row.id === "member-2")?.isOrganizer,
    ).toBe(true);
    expect(
      client.getQueryState(memberKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
  });

  it("rolls the flag back when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(500, "Failed to update role"),
    );

    const { client, set } = captureSetOrganizer();

    await expect(
      set.mutateAsync({ memberId: "member-2", isOrganizer: true }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(
      client
        .getQueryData<Member[]>(memberKeys.list("trip-1"))
        ?.find((row) => row.id === "member-2")?.isOrganizer,
    ).toBe(false);
  });

  it("offers no role change for a guest row", () => {
    // Guests are never organizers (enforced server-side in
    // `updateMemberRole`), so the action set never offers them a role —
    // pinned in this pure helper rather than in a render.
    expect(canChangeMemberRole(cachedGuest())).toBe(false);
    expect(canChangeMemberRole(cachedMember())).toBe(true);
  });
});

describe("guest deletion", () => {
  it("is deliberately not wired — guests leave through removeMember", () => {
    // There is a `DELETE /trips/:tripId/members/guests/:memberId` route in
    // the API, but the app calls the members route for either kind of row
    // (see `removeMember`), so no guest-delete writer may exist here.
    // Pinned so a later reader does not "fix" the missing export.
    expect("deleteGuest" in membersModule).toBe(false);
    expect("useDeleteGuest" in membersModule).toBe(false);
  });
});

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
