import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";
import { rsvpKeys, setRsvp, setRsvpOptions } from "@/lib/queries/rsvp";
import type { UpdateRsvpResponse } from "@/lib/queries/rsvp";

const mockedApiFetch = vi.mocked(apiFetch);

function rsvpBody(overrides: Partial<UpdateRsvpResponse> = {}) {
  return {
    success: true as const,
    member: {
      id: "member-1",
      userId: "user-1",
      displayName: "Ana Kovac",
      profilePhotoUrl: null,
      status: "going" as const,
      isOrganizer: false,
    },
    ...overrides,
  };
}

describe("setRsvp", () => {
  it.each(["going", "not_going", "maybe"] as const)(
    "POSTs /trips/:tripId/rsvp with {status: %s}",
    async (status) => {
      // The route body is `updateRsvpSchema`
      // (`shared/schemas/invitation.ts:39-44`, served by POST
      // `/trips/:tripId/rsvp` in
      // `apps/api/src/routes/invitation.routes.ts:198-202`): `status`
      // is one of `going | not_going | maybe`, and the response is
      // `{success: true, member}` (`updateRsvpResponseSchema`).
      mockedApiFetch.mockReset();
      mockedApiFetch.mockResolvedValue(rsvpBody());

      await setRsvp("trip-1", status);

      expect(mockedApiFetch).toHaveBeenCalledTimes(1);
      expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    },
  );

  it("includes sharePhone only when the caller passes it", async () => {
    // `sharePhone` is `z.boolean().optional()` on the schema, so an
    // absent value is omitted rather than sent as `undefined`.
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(rsvpBody());

    await setRsvp("trip-1", "going", true);

    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1/rsvp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "going", sharePhone: true }),
    });
  });

  it("returns the server's updated member row", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(
      rsvpBody({
        member: {
          id: "member-1",
          userId: "user-1",
          displayName: "Ana Kovac",
          profilePhotoUrl: null,
          status: "maybe",
          isOrganizer: false,
        },
      }),
    );

    const body = await setRsvp("trip-1", "maybe");

    expect(body.member).toMatchObject({ id: "member-1", status: "maybe" });
  });

  it("never sends no_response: absence, not an answer", async () => {
    // `no_response` is rejected by `updateRsvpSchema` ("Status must be
    // one of: going, not_going, maybe") — it maps to "no row yet", the
    // control's unselected state, so sending it is a client bug this
    // function refuses without touching the network.
    mockedApiFetch.mockReset();

    await expect(setRsvp("trip-1", "no_response")).rejects.toThrow();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});

describe("setRsvpOptions", () => {
  it("exposes the mutation key and forwards tripId/status/sharePhone", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(rsvpBody());

    const options = setRsvpOptions();
    expect(options.mutationKey).toEqual(["rsvp", "update"]);
    expect(rsvpKeys.update("trip-1")).toEqual(["rsvp", "update", "trip-1"]);

    const mutationFn = options.mutationFn as (input: {
      tripId: string;
      status: "not_going";
      sharePhone?: boolean;
    }) => Promise<UpdateRsvpResponse>;
    await mutationFn({
      tripId: "trip-1",
      status: "not_going",
      sharePhone: false,
    });

    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1/rsvp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "not_going", sharePhone: false }),
    });
  });
});
