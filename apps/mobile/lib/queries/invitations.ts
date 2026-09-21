import { mutationOptions, queryOptions } from "@tanstack/react-query";
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
};

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
