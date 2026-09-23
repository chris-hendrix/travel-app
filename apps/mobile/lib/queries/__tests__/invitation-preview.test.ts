import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { ApiError } from "@/lib/api";
import { apiFetch } from "@/lib/api";
import { toErrorCopy } from "@/lib/queries/errors";
import {
  acceptInvitation,
  acceptInvitationOptions,
  invitationKeys,
  invitationPreviewOptions,
} from "@/lib/queries/invitations";

const mockedApiFetch = vi.mocked(apiFetch);

const INVITE_ID = "123e4567-e89b-12d3-a456-426614174000";

/**
 * The server's preview body is flat — `{success: true, tripName,
 * destination, startDate, endDate, inviterName, inviteePhone, tripId}`
 * (`invitationController.getInvitationPreview` spreads the service row
 * into the reply; there is no shared preview schema, so the shape is
 * declared inline in `lib/queries/invitations.ts`). Dates are ISO
 * yyyy-mm-dd or null; the phone arrives masked (`+1555****890`).
 */
function previewBody(overrides: Record<string, unknown> = {}) {
  return {
    success: true as const,
    tripName: "Croatia",
    destination: "Dubrovnik",
    startDate: "2026-06-04",
    endDate: "2026-06-09",
    inviterName: "Ana Kovac",
    inviteePhone: "+1555****4567",
    tripId: "trip-1",
    ...overrides,
  };
}

describe("invitationPreviewOptions", () => {
  it("GETs the public preview and maps it to the invite card", async () => {
    // `GET /invitations/:id/preview` is public
    // (`apps/api/src/routes/invitation.routes.ts:56-61` — no
    // `authenticate` in the preHandler): `apiFetch` sends no bearer
    // token when none is staged, so this query works signed out.
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(previewBody());

    const options = invitationPreviewOptions(INVITE_ID);
    expect(options.queryKey).toEqual(invitationKeys.preview(INVITE_ID));

    const preview = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      `/invitations/${INVITE_ID}/preview`,
    );
    expect(preview).toMatchObject({
      inviterName: "Ana Kovac",
      tripName: "Croatia",
      destination: "Dubrovnik",
      startDate: "2026-06-04",
      endDate: "2026-06-09",
      tripId: "trip-1",
    });
  });

  it("maps an already-accepted invitation to the gone state", async () => {
    // The service returns `{status: "accepted", tripId}` for an
    // accepted row
    // (`apps/api/src/services/invitation.service.ts:1522-1524`); the
    // screen has no card facts for it, and the gone copy already
    // covers it ("someone has already used it"), so the query maps it
    // to null like a 404.
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      status: "accepted",
      tripId: "trip-1",
    });

    const options = invitationPreviewOptions(INVITE_ID);
    const preview = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(preview).toBeNull();
  });

  it("lets a 404 through so the screen can render the gone state", async () => {
    // Unknown, withdrawn, and expired ids are one answer: the
    // controller 404s with `INVITATION_NOT_FOUND`. The query does not
    // translate it — the screen matches 404 to "This invitation is
    // gone" directly, never via `toErrorCopy`.
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(404, "Invitation not found", "INVITATION_NOT_FOUND"),
    );

    const options = invitationPreviewOptions(INVITE_ID);
    await expect(
      options.queryFn!({ queryKey: options.queryKey } as never),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("runs without an auth gate: enabled by id presence, never by sign-in", () => {
    // The preview must fetch signed out, so the option is enabled by
    // the id alone — no auth state in the key, no auth state in the
    // gate.
    expect(invitationPreviewOptions(INVITE_ID).enabled).toBe(true);
    expect(invitationPreviewOptions(undefined).enabled).toBe(false);
  });
});

describe("acceptInvitation", () => {
  it("POSTs /invitations/:id/accept with no body and returns the trip", async () => {
    // `POST /invitations/:id/accept`
    // (`apps/api/src/routes/invitation.routes.ts:72-77`): no body
    // schema, so no body sent; the controller replies
    // `{success: true, tripId}`.
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, tripId: "trip-1" });

    const result = await acceptInvitation(INVITE_ID);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      `/invitations/${INVITE_ID}/accept`,
      { method: "POST" },
    );
    expect(result).toMatchObject({ tripId: "trip-1" });
  });

  it("exposes the mutation key and forwards the id", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, tripId: "trip-1" });

    const options = acceptInvitationOptions();
    expect(options.mutationKey).toEqual(["invitations", "accept"]);

    const mutationFn = options.mutationFn as (input: {
      id: string;
    }) => Promise<{ success: true; tripId: string }>;
    await mutationFn({ id: INVITE_ID });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      `/invitations/${INVITE_ID}/accept`,
      { method: "POST" },
    );
  });

  it("surfaces a phone mismatch as its own copy, not the generic 403", async () => {
    // Deviation from the plan's wording, verified against the
    // controller: a phone mismatch is NOT a 403. `acceptInvitation`
    // in the service returns null for not-found, not-pending, AND
    // phone-mismatch alike
    // (`apps/api/src/services/invitation.service.ts:1571-1584`), and
    // the controller folds all three into 404 `INVITATION_NOT_FOUND`
    // (`invitation.controller.ts:495-503`). So the code-specific
    // branch is on `INVITATION_NOT_FOUND`, and its copy names the
    // number — distinct from the generic 403 "You can't do that here".
    const mismatch = new ApiError(
      404,
      "Invitation not found",
      "INVITATION_NOT_FOUND",
    );
    expect(toErrorCopy(mismatch)).toEqual({
      message:
        "This invitation isn't for this number. Sign in with the number it was sent to.",
      retry: false,
      offline: false,
    });

    expect(toErrorCopy(new ApiError(403, "Forbidden"))).toEqual({
      message: "You can't do that here",
      retry: false,
      offline: false,
    });
  });
});
