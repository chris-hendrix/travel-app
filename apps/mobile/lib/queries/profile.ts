/**
 * Profile write query — the test seam for the Phase 7 Task 3 wiring.
 *
 * Same pattern as `lib/queries/trips.ts`, copied here on purpose:
 * - Stub the network at the `@/lib/api` module boundary with
 *   `vi.mock("@/lib/api")`, then import the mocked `apiFetch` and
 *   assert it was called with the exact path (`"/users/me"`).
 *   Prefer this over global `fetch` stubs: the base URL, timeout,
 *   auth header, and error shape all live in `lib/api.ts`, so
 *   queryFn tests should see only the path-level contract.
 * - Plain `updateProfile()` tests call the function directly and need
 *   no React provider. A screen that fires it through
 *   `useMutation(updateProfileOptions())` renders inside a test
 *   `QueryClientProvider` with a fresh `makeQueryClient()` from
 *   `@/lib/queries/client`.
 */

import { mutationOptions } from "@tanstack/react-query";
import type { User } from "@journiful/shared/types";
import { apiFetch } from "@/lib/api";
import { toProfile } from "@/lib/mapping";
import type { Profile, ProfileDraft } from "@/lib/profile";

/**
 * Inline mirror of `userProfileResponseSchema`
 * (`apps/api/src/routes/user.routes.ts:14-17`):
 * `{success: true, user}`. zod is not a mobile dep, so the shape is
 * declared inline (the notifications precedent).
 */
export type UpdateProfileResponse = {
  success: true;
  user: User;
};

/**
 * `PUT /users/me` (`apps/api/src/routes/user.routes.ts:31-44`,
 * registered under `/api/users` in `apps/api/src/app.ts:282`; body
 * `updateProfileSchema` in `shared/schemas/user.ts:33`).
 *
 * The schema takes nested `handles` (`{venmo?, instagram?}`), never
 * flat `venmo`/`instagram` keys — so the flattening happens here, in
 * the client: the form's flat draft strings are folded into `handles`
 * on the way out, and the response user's nested `handles` come back
 * through `toProfile` (nested `handles` ↔ flat venmo/instagram in
 * `draftFromProfile`, same as the read path).
 *
 * Writable here: `displayName`, `handles`, `temperatureUnit`.
 * `timezone` is display-only on the profile screen (detected,
 * automatic), so it is never sent.
 *
 * The read stays `meOptions()` (`GET /auth/me` — there is no
 * `GET /users/me`): one source of truth, no second me query, no
 * `profileKeys` factory. The store paints this mutation's result into
 * the `authKeys.me()` cache.
 */
export async function updateProfile(draft: ProfileDraft): Promise<Profile> {
  // Same rule as `applyDraft` in `lib/profile.ts`: an empty handle is
  // an absent handle, not an empty string. Both empty clears the row
  // (`handles: null` — the schema is nullable).
  const venmo = draft.venmo.trim();
  const instagram = draft.instagram.trim();
  const handles: { venmo?: string; instagram?: string } = {};
  if (venmo) handles.venmo = venmo;
  if (instagram) handles.instagram = instagram;

  const body = await apiFetch<UpdateProfileResponse>("/users/me", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      displayName: draft.displayName.trim(),
      handles: Object.keys(handles).length > 0 ? handles : null,
      temperatureUnit: draft.temperatureUnit,
    }),
  });
  return toProfile(body.user);
}

/** Mutation wrapper for callers that fire `updateProfile` via TanStack Query. */
export const updateProfileOptions = () =>
  mutationOptions({
    mutationKey: ["profile", "update"],
    mutationFn: updateProfile,
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { updateProfileOptions as updateProfileMutation };
