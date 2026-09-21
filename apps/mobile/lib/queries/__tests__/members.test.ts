import { describe, expect, it, vi } from "vitest";
import { createElement, Suspense } from "react";
import { createRequire } from "node:module";

// Same probe seam as `__tests__/trip-detail.test.ts`: `react-dom`
// ships no server types in this workspace, so the renderer is loaded
// through `require` (typed as `any`).
const require = createRequire(import.meta.url);
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: unknown) => string;
};

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { QueryClientProvider } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { memberKeys, membersOptions, useMembers } from "@/lib/queries/members";
import { makeQueryClient } from "@/lib/queries/client";
import type {
  GetMembersResponse,
  MemberWithProfile,
} from "@journiful/shared/types";

const mockedApiFetch = vi.mocked(apiFetch);

function row(overrides: Record<string, unknown> = {}): MemberWithProfile {
  return {
    id: "member-1",
    userId: "user-1",
    displayName: "Dana Mercer",
    profilePhotoUrl: null,
    handles: null,
    phoneNumber: "+15551234567",
    status: "going",
    isOrganizer: false,
    sharePhone: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as MemberWithProfile;
}

describe("membersOptions", () => {
  it("maps GET /trips/:tripId/members to the mobile Member", async () => {
    const body = {
      success: true,
      members: [
        row({
          id: "member-1",
          displayName: "Dana Mercer",
          status: "going",
          isOrganizer: true,
          phoneNumber: "+15551234567",
          sharePhone: true,
          handles: { venmo: "dana-mercer" },
        }),
      ],
    } as GetMembersResponse;
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(body);

    const options = membersOptions("trip-1");
    expect(options.queryKey).toEqual(memberKeys.list("trip-1"));

    const members = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1/members");
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      id: "member-1",
      name: "Dana Mercer",
      status: "going",
      isOrganizer: true,
      phone: "+15551234567",
      sharePhone: true,
      handles: { venmo: "dana-mercer" },
    });
  });

  it("tolerates an absent phoneNumber (visibility is server-side)", async () => {
    // A traveler reading the roster sees only opted-in numbers: the
    // column arrives only when the viewer may see it, so an absent
    // number maps to "" rather than a guess (the `toMember`
    // convention, asserted at the query boundary).
    const body = {
      success: true,
      members: [row({ id: "member-2", sharePhone: false })],
    } as unknown as GetMembersResponse;
    delete (body.members[0] as Partial<MemberWithProfile>).phoneNumber;
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(body);

    const options = membersOptions("trip-1");
    const members = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(members[0]).toMatchObject({ id: "member-2", phone: "" });
  });

  it("keeps the organizer-first sort whatever order the server returns", async () => {
    const body = {
      success: true,
      members: [
        row({ id: "member-traveler", displayName: "Rafa Moreno", isOrganizer: false }),
        row({ id: "member-org", displayName: "Dana Mercer", isOrganizer: true }),
      ],
    } as GetMembersResponse;
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(body);

    const options = membersOptions("trip-1");
    const members = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(members.map((member) => member.id)).toEqual([
      "member-org",
      "member-traveler",
    ]);
  });
});

describe("useMembers", () => {
  it("exposes the same {members} shape from the roster query", async () => {
    mockedApiFetch.mockReset();
    const body = {
      success: true,
      members: [row()],
    } as GetMembersResponse;
    mockedApiFetch.mockResolvedValue(body);

    // Prefetch into a fresh test client so the Suspense hook resolves
    // synchronously under `renderToString` (fresh data, no refetch).
    const client = makeQueryClient();
    await client.fetchQuery(membersOptions("trip-1"));

    const seen: { current: { members: unknown } | null } = {
      current: null,
    };
    function Probe() {
      const value = useMembers("trip-1");
      seen.current = { members: value.members };
      return null;
    }
    renderToString(
      createElement(
        QueryClientProvider,
        { client },
        createElement(Suspense, { fallback: null }, createElement(Probe)),
      ),
    );

    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1/members");
    expect(seen.current?.members).toMatchObject([
      { id: "member-1", name: "Dana Mercer" },
    ]);
  });
});
