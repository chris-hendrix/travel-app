import { mutationOptions, queryOptions, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/**
 * One invite suggestion, mirroring `mutualEntitySchema`
 * (`shared/schemas/mutuals.ts`): an id, a name, an optional photo, and
 * how many trips you already share. zod is not a mobile dep, so the
 * shape is declared inline (the trips/auth precedent).
 */
export type MutualSuggestion = {
  id: string;
  displayName: string;
  profilePhotoUrl: string | null;
  sharedTripCount: number;
  sharedTrips: Array<{ id: string; name: string }>;
};

/**
 * Inline mirror of `getMutualsResponseSchema`
 * (`shared/schemas/mutuals.ts`): both mutuals endpoints return the same
 * paginated shape.
 */
export type MutualSuggestionsResponse = {
  success: true;
  mutuals: MutualSuggestion[];
  nextCursor: string | null;
};

/** Key factory for the invitations domain. */
export const invitationKeys = {
  all: ["invitations"] as const,
  suggestions: (tripId: string, search = "") =>
    [...invitationKeys.all, "suggestions", tripId, search] as const,
  preview: (id: string) => [...invitationKeys.all, "preview", id] as const,
  trip: (tripId: string) =>
    [...invitationKeys.all, "trip", tripId] as const,
};

/**
 * One invitation preview, mirroring what `getInvitationPreview` in
 * `apps/api/src/services/invitation.service.ts:1491-1548` selects:
 * the trip's name, destination, dates, the inviter's name, the
 * invitee phone masked to its last four digits, and the trip id the
 * signed-in card navigates to. There is no shared preview schema, so
 * the shape is declared inline (the trips/auth precedent). Dates are
 * ISO yyyy-mm-dd, null when nobody has set them yet.
 */
export type InvitationPreview = {
  tripName: string;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  inviterName: string;
  inviteePhone: string;
  tripId: string;
};

/**
 * Inline mirror of the preview response body: the controller
 * (`invitation.controller.ts:getInvitationPreview`) spreads the
 * service row flat under `{success: true}` — no `data` wrapper — or
 * returns the `{status: "accepted", tripId}` redirect hint for an
 * already-accepted row.
 */
export type InvitationPreviewResponse =
  | ({ success: true } & InvitationPreview)
  | { success: true; status: "accepted"; tripId: string };

/**
 * `GET /invitations/:id/preview`
 * (`apps/api/src/routes/invitation.routes.ts:56-61`).
 *
 * Public on purpose: the route carries no `authenticate` preHandler,
 * and `apiFetch` sends a bearer token only when one is staged, so
 * this query fetches signed out. `enabled` follows the id alone —
 * never auth state — so the signed-out card cannot be gated behind a
 * sign-in it is meant to precede.
 *
 * A pending invitation maps to the invite card. An accepted one maps
 * to null (the screen has no card facts for it, and the gone copy
 * already covers it: "someone has already used it"). A 404 rejects
 * with the `ApiError`, which the screen matches to the gone state
 * directly, never via `toErrorCopy`.
 */
export const invitationPreviewOptions = (id: string | undefined) =>
  queryOptions({
    queryKey: invitationKeys.preview(typeof id === "string" ? id : ""),
    queryFn: async (): Promise<InvitationPreview | null> => {
      if (!id) return null;
      const body = await apiFetch<InvitationPreviewResponse>(
        `/invitations/${id}/preview`,
      );
      if ("status" in body) return null;
      return {
        tripName: body.tripName,
        destination: body.destination,
        startDate: body.startDate,
        endDate: body.endDate,
        inviterName: body.inviterName,
        inviteePhone: body.inviteePhone,
        tripId: body.tripId,
      };
    },
    enabled: typeof id === "string" && id.length > 0,
  });

/**
 * Inline mirror of the accept response body: the controller
 * (`invitation.controller.ts:acceptInvitation`) replies
 * `{success: true, tripId}`. The route takes no body, so none is
 * sent.
 */
export type AcceptInvitationResponse = {
  success: true;
  tripId: string;
};

/**
 * `POST /invitations/:id/accept`
 * (`apps/api/src/routes/invitation.routes.ts:72-77`, authenticated).
 *
 * A phone mismatch surfaces as 404 `INVITATION_NOT_FOUND` — the
 * service returns null for not-found, not-pending, and mismatch
 * alike, and the controller folds all three into one 404 — with its
 * own copy in `lib/queries/errors.ts`, distinct from the generic 403.
 */
export async function acceptInvitation(
  id: string,
): Promise<AcceptInvitationResponse> {
  return apiFetch<AcceptInvitationResponse>(`/invitations/${id}/accept`, {
    method: "POST",
  });
}

/** Mutation wrapper for callers that fire `acceptInvitation` via TanStack Query. */
export const acceptInvitationOptions = () =>
  mutationOptions({
    mutationKey: ["invitations", "accept"],
    mutationFn: ({ id }: { id: string }) => acceptInvitation(id),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { acceptInvitationOptions as acceptInvitationMutation };

/**
 * Suggestions query: `GET /trips/:tripId/mutual-suggestions`
 * (`apps/api/src/routes/mutuals.routes.ts:44-52`, served by
 * `mutualsController.getMutualSuggestions`).
 *
 * The trip-scoped endpoint is the one the dialog wants, not `GET
 * /mutuals`: the server subtracts the trip's members for us, so a
 * suggestion already on the trip is a row that can never appear. The
 * `search` prefix rides the endpoint's own `search` query param (a
 * `LIKE search%` on the display name per
 * `getMutualSuggestionsQuerySchema`), defaulting to the endpoint's
 * page of twenty ordered most-trips-shared first — the order the
 * dialog opens on.
 */
export const mutualSuggestionsOptions = (tripId: string, search = "") =>
  queryOptions({
    queryKey: invitationKeys.suggestions(tripId, search),
    queryFn: async () => {
      const qs = search.trim()
        ? `?search=${encodeURIComponent(search.trim())}`
        : "";
      return (
        await apiFetch<MutualSuggestionsResponse>(
          `/trips/${tripId}/mutual-suggestions${qs}`,
        )
      ).mutuals;
    },
  });

/**
 * Mirrors `createInvitationsSchema` (`shared/schemas/invitation.ts`):
 * `{phoneNumbers?, userIds?}`, each defaulting to `[]`, with at least
 * one of the two required. zod is not a mobile dep, so the shape is
 * declared inline (the trips/auth precedent).
 */
export type CreateInvitationsRequest = {
  phoneNumbers?: string[];
  userIds?: string[];
};

/** One created invitation, mirroring `invitationEntitySchema`. */
export type CreatedInvitation = {
  id: string;
  tripId: string;
  inviterId: string;
  inviteePhone: string;
  status: "pending" | "accepted" | "declined" | "failed";
};

/**
 * Inline mirror of `createInvitationsResponseSchema`
 * (`shared/schemas/invitation.ts`): `{success, invitations,
 * addedMembers, skipped}`.
 */
export type CreateInvitationsResponse = {
  success: true;
  invitations: CreatedInvitation[];
  addedMembers: Array<{ userId: string; displayName: string }>;
  skipped: string[];
};

/**
 * `POST /trips/:tripId/invitations`
 * (`apps/api/src/routes/invitation.routes.ts:150-154` — "Create batch
 * invitations", body `createInvitationsSchema`, served by
 * `invitationController.createInvitations`, which destructures
 * `{phoneNumbers, userIds}` from the body).
 *
 * The body is the batch shape — `{phoneNumbers, userIds}` — never a
 * single `{phoneNumber}`: a number typed by hand goes in
 * `phoneNumbers`, a picked suggestion's user id goes in `userIds`, and
 * the server tells the two outcomes apart (invitation text vs. instant
 * join) in the response.
 */
export async function createInvitations(
  tripId: string,
  input: CreateInvitationsRequest,
): Promise<CreateInvitationsResponse> {
  return apiFetch<CreateInvitationsResponse>(
    `/trips/${tripId}/invitations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phoneNumbers: input.phoneNumbers ?? [],
        userIds: input.userIds ?? [],
      }),
    },
  );
}

/**
 * One number by hand: the batch shape with a single-element
 * `phoneNumbers` array. The route schema requires the batch object
 * (see `createInvitations` above), so there is no singular body to
 * send — this is the plan's `invite(tripId, phone)` spelled against
 * the schema as written.
 */
export async function invite(
  tripId: string,
  phone: string,
): Promise<CreateInvitationsResponse> {
  return createInvitations(tripId, { phoneNumbers: [phone] });
}

/** Mutation wrapper for callers that fire `createInvitations` via TanStack Query. */
export const createInvitationsOptions = () =>
  mutationOptions({
    mutationKey: ["invitations", "create"],
    mutationFn: ({
      tripId,
      input,
    }: {
      tripId: string;
      input: CreateInvitationsRequest;
    }) => createInvitations(tripId, input),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { createInvitationsOptions as createInvitationsMutation };

/**
 * One trip-invitation row in the app's shape, mirroring the
 * `GET /trips/:tripId/invitations` response
 * (`apps/api/src/routes/invitation.routes.ts:92-103`, organizer-only
 * via `canInviteMembers`, envelope `{success, invitations}`): the id,
 * the invitee phone, the status, when it was sent, and the display
 * name — the guest row's chosen name first, the matched account's
 * display name next, null when neither exists. zod is not a mobile
 * dep, so the shape is declared inline (the trips/auth precedent).
 */
export type TripInvitationRow = {
  id: string;
  phone: string;
  status: "pending" | "accepted" | "declined" | "failed";
  sentAt: string;
  name: string | null;
};

/**
 * Inline mirror of the trip-invitations response body: each row is
 * the DB row plus the two optional enrichments built at
 * `apps/api/src/services/invitation.service.ts:802-818` —
 * `inviteeName` (the matched registered user's display name) and
 * `invitedGuestName` (the guest row's display name for that phone).
 * All four statuses arrive; the app decides which it renders.
 */
export type TripInvitationsResponse = {
  success: true;
  invitations: Array<{
    id: string;
    tripId: string;
    inviterId: string;
    inviteePhone: string;
    status: TripInvitationRow["status"];
    sentAt: string;
    respondedAt: string | null;
    createdAt: string;
    updatedAt: string;
    inviteeName?: string;
    invitedGuestName?: string;
  }>;
};

/**
 * Trip-invitations query: `GET /trips/:tripId/invitations`, mapped to
 * the app's `{ id, phone, status, sentAt, name }` rows. The guest
 * row's chosen name beats the account's display name when both
 * exist — the guest row is what the organizer named.
 *
 * `enabled` is the caller's flag, never derived here: the endpoint
 * is organizer-only, so the roll call passes `viewerIsOrganizer` and
 * a non-organizer never fires the request (the preview
 * `enabled`-by-id precedent, gated here by the caller's flag
 * instead).
 */
export const tripInvitationsOptions = (tripId: string, enabled: boolean) =>
  queryOptions({
    queryKey: invitationKeys.trip(tripId),
    queryFn: async (): Promise<TripInvitationRow[]> => {
      const body = await apiFetch<TripInvitationsResponse>(
        `/trips/${tripId}/invitations`,
      );
      return body.invitations.map((invitation) => ({
        id: invitation.id,
        phone: invitation.inviteePhone,
        status: invitation.status,
        sentAt: invitation.sentAt,
        name:
          invitation.invitedGuestName ?? invitation.inviteeName ?? null,
      }));
    },
    enabled,
  });

/**
 * The read half for a trip's invitations: the trip-invitations query,
 * disabled unless the caller asks for it. Plain `useQuery`, never
 * Suspense (the events/travel precedent): the roll call renders under
 * the trip gate already, and a non-organizer viewer simply reads an
 * empty list without suspending.
 */
export function useTripInvitations(
  tripId: string | undefined,
  enabled: boolean,
): {
  invitations: TripInvitationRow[];
} {
  const query = useQuery({
    ...tripInvitationsOptions(tripId ?? "", enabled),
    enabled: enabled && typeof tripId === "string" && tripId.length > 0,
  });
  return { invitations: query.data ?? [] };
}
