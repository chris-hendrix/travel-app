import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";
import {
  createInvitations,
  invitationKeys,
  invite,
  mutualSuggestionsOptions,
  tripInvitationsOptions,
} from "@/lib/queries/invitations";
import type {
  CreateInvitationsResponse,
  MutualSuggestionsResponse,
} from "@/lib/queries/invitations";

const mockedApiFetch = vi.mocked(apiFetch);

function suggestionsBody(
  overrides: Partial<MutualSuggestionsResponse> = {},
): MutualSuggestionsResponse {
  return {
    success: true,
    mutuals: [
      {
        id: "user-1",
        displayName: "Ana Kovac",
        profilePhotoUrl: null,
        sharedTripCount: 3,
        sharedTrips: [{ id: "trip-a", name: "Croatia" }],
      },
    ],
    nextCursor: null,
    ...overrides,
  };
}

function invitationsBody(
  overrides: Partial<CreateInvitationsResponse> = {},
): CreateInvitationsResponse {
  return {
    success: true,
    invitations: [],
    addedMembers: [],
    skipped: [],
    ...overrides,
  };
}

describe("invite", () => {
  it("POSTs /trips/:tripId/invitations with the batch {phoneNumbers} body", async () => {
    // The route schema is `createInvitationsSchema`
    // (`shared/schemas/invitation.ts`, served by POST
    // `/trips/:tripId/invitations` in
    // `apps/api/src/routes/invitation.routes.ts:150-154` — "Create batch
    // invitations" — and destructured as `{phoneNumbers, userIds}` in
    // `invitation.controller.ts:createInvitations`). There is no singular
    // `{phoneNumber}` body: one number by hand is a single-element
    // `phoneNumbers` array.
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(invitationsBody());

    await invite("trip-1", "+15551234567");

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/trips/trip-1/invitations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumbers: ["+15551234567"], userIds: [] }),
      },
    );
  });
});

describe("createInvitations", () => {
  it("sends picked user ids in {userIds} alongside typed numbers", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(invitationsBody());

    await createInvitations("trip-1", {
      phoneNumbers: ["+15551234567"],
      userIds: ["user-1"],
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/trips/trip-1/invitations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumbers: ["+15551234567"],
          userIds: ["user-1"],
        }),
      },
    );
  });

  it("returns the server's three outcomes (invitations, addedMembers, skipped)", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(
      invitationsBody({
        invitations: [
          {
            id: "inv-1",
            tripId: "trip-1",
            inviterId: "user-9",
            inviteePhone: "+15557654321",
            status: "pending",
          },
        ],
        addedMembers: [{ userId: "user-1", displayName: "Ana Kovac" }],
        skipped: ["+15550000001"],
      }),
    );

    const body = await createInvitations("trip-1", {
      phoneNumbers: ["+15557654321"],
      userIds: ["user-1"],
    });

    expect(body.invitations).toHaveLength(1);
    expect(body.addedMembers).toMatchObject([
      { userId: "user-1", displayName: "Ana Kovac" },
    ]);
    expect(body.skipped).toEqual(["+15550000001"]);
  });
});

describe("mutualSuggestionsOptions", () => {
  it("reads the trip-scoped suggestions, not GET /mutuals", async () => {
    // `GET /trips/:tripId/mutual-suggestions`
    // (`apps/api/src/routes/mutuals.routes.ts:44-52`, response
    // `getMutualsResponseSchema` in `shared/schemas/mutuals.ts`) does
    // the member subtraction on the server, so the dialog never offers
    // somebody already on the trip. The trip endpoint is scoped enough
    // on its own — no `GET /mutuals` fallback.
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(suggestionsBody());

    const options = mutualSuggestionsOptions("trip-1");
    expect(options.queryKey).toEqual(
      invitationKeys.suggestions("trip-1", ""),
    );

    const mutuals = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/trips/trip-1/mutual-suggestions",
    );
    expect(mutuals).toMatchObject([
      { id: "user-1", displayName: "Ana Kovac", sharedTripCount: 3 },
    ]);
  });

  it("passes the typed prefix as the endpoint's own search param", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(suggestionsBody({ mutuals: [] }));

    const options = mutualSuggestionsOptions("trip-1", "An");
    await options.queryFn!({ queryKey: options.queryKey } as never);

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/trips/trip-1/mutual-suggestions?search=An",
    );
  });
});

describe("tripInvitationsOptions", () => {
  function invitationsListBody() {
    return {
      success: true,
      invitations: [
        {
          id: "inv-1",
          tripId: "trip-1",
          inviterId: "user-9",
          inviteePhone: "+15557654321",
          status: "pending",
          sentAt: "2026-09-01T00:00:00.000Z",
          respondedAt: null,
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
          invitedGuestName: "Camp Guest",
          inviteeName: "Account Name",
        },
        {
          id: "inv-2",
          tripId: "trip-1",
          inviterId: "user-9",
          inviteePhone: "+15558889999",
          status: "declined",
          sentAt: "2026-09-02T00:00:00.000Z",
          respondedAt: "2026-09-03T00:00:00.000Z",
          createdAt: "2026-09-02T00:00:00.000Z",
          updatedAt: "2026-09-03T00:00:00.000Z",
          inviteeName: "Account Name",
        },
        {
          id: "inv-3",
          tripId: "trip-1",
          inviterId: "user-9",
          inviteePhone: "+15550001111",
          status: "pending",
          sentAt: "2026-09-04T00:00:00.000Z",
          respondedAt: null,
          createdAt: "2026-09-04T00:00:00.000Z",
          updatedAt: "2026-09-04T00:00:00.000Z",
        },
      ],
    };
  }

  it("reads GET /trips/:tripId/invitations into the app's { id, phone, status, sentAt, name } rows", async () => {
    // `GET /trips/:tripId/invitations`
    // (`apps/api/src/routes/invitation.routes.ts:92-103`, organizer-only
    // via `canInviteMembers`, envelope `{success, invitations}`). The
    // roll call folds these rows into its people list: an invitation
    // whose phone has no member row behind it is still a person the
    // organizer invited.
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(invitationsListBody());

    const options = tripInvitationsOptions("trip-1", true);
    expect(options.queryKey).toEqual(invitationKeys.trip("trip-1"));

    const rows = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1/invitations");
    expect(rows).toEqual([
      {
        id: "inv-1",
        phone: "+15557654321",
        status: "pending",
        sentAt: "2026-09-01T00:00:00.000Z",
        name: "Camp Guest",
      },
      {
        id: "inv-2",
        phone: "+15558889999",
        status: "declined",
        sentAt: "2026-09-02T00:00:00.000Z",
        name: "Account Name",
      },
      {
        id: "inv-3",
        phone: "+15550001111",
        status: "pending",
        sentAt: "2026-09-04T00:00:00.000Z",
        name: null,
      },
    ]);
  });

  it("prefers the guest row's chosen name over the account display name", async () => {
    // Both enrichments present: `invitedGuestName` (what the organizer
    // named on the guest row) beats `inviteeName` (the matched
    // registered user's display name); each alone falls back in turn,
    // and neither means null. Asserted row-by-row above; this pins the
    // precedence on a single row carrying both.
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      invitations: [
        {
          id: "inv-9",
          tripId: "trip-1",
          inviterId: "user-9",
          inviteePhone: "+15557654321",
          status: "pending",
          sentAt: "2026-09-01T00:00:00.000Z",
          respondedAt: null,
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
          invitedGuestName: "Camp Guest",
          inviteeName: "Account Name",
        },
      ],
    });

    const options = tripInvitationsOptions("trip-1", true);
    const rows = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(rows).toMatchObject([{ id: "inv-9", name: "Camp Guest" }]);
  });

  it("stays disabled unless asked for: only organizers may call it", () => {
    // The endpoint is organizer-only, so the roll call passes
    // `viewerIsOrganizer` as `enabled` — a non-organizer never fires
    // the request (the preview `enabled`-by-id precedent, gated here
    // by the caller's flag instead).
    expect(tripInvitationsOptions("trip-1", false).enabled).toBe(false);
    expect(tripInvitationsOptions("trip-1", true).enabled).toBe(true);
  });
});
