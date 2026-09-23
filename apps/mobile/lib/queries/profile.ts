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
 *
 * `timezone` is not among them and no longer has a row on the screen
 * either. It is the web app's complete-profile form that writes that
 * column — it offers a picker with an auto-detect default — and nothing
 * on the server reads it: trip behaviour is `trips.preferredTimezone`,
 * and what the app reads times on is the device's own zone, which the
 * header states. So mobile neither sends it nor shows it, rather than
 * showing a null as "Not set · automatic".
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

function photoMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

/**
 * Build the multipart body for `POST /users/me/photo` from the
 * picker's URI. The trips cover sibling (`buildCoverFormData` in
 * `lib/queries/trips.ts`), copied verbatim: the URI is read into a
 * blob first (on Expo web the picker hands back a `blob:` URI
 * `fetch` resolves, and on native `fetch` resolves `file://` URIs
 * through the Expo networking stack), falling back to the React
 * Native `{uri, name, type}` file object the native uploader
 * accepts. The field name is `"file"` (the controller reads the
 * first multipart file either way). Never set `Content-Type` —
 * `apiFetch` passes the `FormData` through untouched and the
 * boundary is generated at send time.
 */
export async function buildPhotoFormData(uri: string): Promise<FormData> {
  const filename =
    uri.split("/").pop()?.split("?")[0]?.split("#")[0] || "photo.jpg";
  const form = new FormData();
  try {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, filename);
  } catch {
    form.append("file", {
      uri,
      name: filename,
      type: photoMime(filename),
    } as unknown as Blob);
  }
  return form;
}

/**
 * `POST /users/me/photo`
 * (`apps/api/src/routes/user.routes.ts:50-61`, registered under
 * `/api/users` in `apps/api/src/app.ts:282`; controller
 * `uploadProfilePhoto` in
 * `apps/api/src/controllers/user.controller.ts:106` — reads the
 * first multipart file, uploads through the image service, writes
 * `profilePhotoUrl`, and answers `{success: true, user}` — the same
 * `userProfileResponseSchema` as the update endpoint, so it maps
 * back through `toProfile` into the shared `authKeys.me()` cache).
 */
export async function uploadPhoto(uri: string): Promise<Profile> {
  const body = await apiFetch<UpdateProfileResponse>("/users/me/photo", {
    method: "POST",
    body: await buildPhotoFormData(uri),
  });
  return toProfile(body.user);
}

/** Mutation wrapper for callers that fire `uploadPhoto` via TanStack Query. */
export const uploadPhotoOptions = () =>
  mutationOptions({
    mutationKey: ["profile", "uploadPhoto"],
    mutationFn: ({ uri }: { uri: string }) => uploadPhoto(uri),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { uploadPhotoOptions as uploadPhotoMutation };

/**
 * `DELETE /users/me/photo`
 * (`apps/api/src/routes/user.routes.ts:65-74`; controller
 * `removeProfilePhoto` in
 * `apps/api/src/controllers/user.controller.ts:245` — deletes the
 * stored image, nulls `profilePhotoUrl`, same `{success, user}`
 * response shape as `uploadPhoto`). A nulled photo maps to `null`
 * in the profile, and the screen renders `initials(displayName)` —
 * never a broken image.
 */
export async function removePhoto(): Promise<Profile> {
  const body = await apiFetch<UpdateProfileResponse>("/users/me/photo", {
    method: "DELETE",
  });
  return toProfile(body.user);
}

/** Mutation wrapper for callers that fire `removePhoto` via TanStack Query. */
export const removePhotoOptions = () =>
  mutationOptions({
    mutationKey: ["profile", "removePhoto"],
    mutationFn: () => removePhoto(),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { removePhotoOptions as removePhotoMutation };
