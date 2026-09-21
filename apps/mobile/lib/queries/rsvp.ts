import { mutationOptions } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { RsvpStatus } from "@/lib/rsvp";

/**
 * The three answers the server accepts, mirroring `updateRsvpSchema`
 * (`shared/schemas/invitation.ts:39-44`): `going | not_going | maybe`.
 * `no_response` is deliberately absent here — it is rejected by the
 * schema ("Status must be one of: going, not_going, maybe"), so it is
 * not a value this module can send. zod is not a mobile dep, so the
 * shape is declared inline (the trips/auth/invitations precedent).
 */
export type RsvpAnswer = Exclude<RsvpStatus, "no_response">;

/** One member row, mirroring `memberWithProfileSchema`. */
export type RsvpMember = {
  id: string;
  userId: string | null;
  displayName: string;
  profilePhotoUrl: string | null;
  status: RsvpStatus;
  isOrganizer: boolean;
  sharePhone?: boolean;
};

/**
 * Inline mirror of `updateRsvpResponseSchema`
 * (`shared/schemas/invitation.ts`): `{success, member}`.
 */
export type UpdateRsvpResponse = {
  success: true;
  member: RsvpMember;
};

/** Key factory for the RSVP domain. */
export const rsvpKeys = {
  all: ["rsvp"] as const,
  update: (tripId: string) => [...rsvpKeys.all, "update", tripId] as const,
};

/**
 * `POST /trips/:tripId/rsvp`
 * (`apps/api/src/routes/invitation.routes.ts:198-202`, body
 * `updateRsvpSchema`, served by `invitationController.updateRsvp`
 * at `apps/api/src/controllers/invitation.controller.ts:275`, which
 * destructures `{status, sharePhone}` and returns
 * `{success: true, member}`).
 *
 * `sharePhone` rides the body only when the caller passes it — the
 * schema declares it optional, so an absent value is omitted rather
 * than sent as `undefined`. `no_response` is never sent: it means "no
 * row yet" (the control's unselected state), and this function rejects
 * it without touching the network.
 */
export async function setRsvp(
  tripId: string,
  status: RsvpStatus,
  sharePhone?: boolean,
): Promise<UpdateRsvpResponse> {
  if (status === "no_response") {
    throw new Error("no_response is absence, not an answer: nothing to send");
  }
  return apiFetch<UpdateRsvpResponse>(`/trips/${tripId}/rsvp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      sharePhone === undefined ? { status } : { status, sharePhone },
    ),
  });
}

/** Mutation wrapper for callers that fire `setRsvp` via TanStack Query. */
export const setRsvpOptions = () =>
  mutationOptions({
    mutationKey: ["rsvp", "update"],
    mutationFn: ({
      tripId,
      status,
      sharePhone,
    }: {
      tripId: string;
      status: RsvpAnswer;
      sharePhone?: boolean;
    }) => setRsvp(tripId, status, sharePhone),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { setRsvpOptions as setRsvpMutation };
