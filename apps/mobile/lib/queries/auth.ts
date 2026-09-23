/**
 * Auth query options — the test seam for the wiring phase.
 *
 * Same pattern as `lib/queries/trips.ts`, copied here on purpose:
 * - Stub the network at the `@/lib/api` module boundary with
 *   `vi.mock("@/lib/api")`, then import the mocked `apiFetch` and
 *   assert it was called with the exact path (`"/auth/request-code"`).
 *   Prefer this over global `fetch` stubs: the base URL, timeout,
 *   auth header, and error shape all live in `lib/api.ts`, so
 *   queryFn tests should see only the path-level contract.
 * - Plain `requestCode()` tests call the function directly and need
 *   no React provider. A screen that fires it through
 *   `useMutation(requestCodeOptions())` renders inside a test
 *   `QueryClientProvider` with a fresh `makeQueryClient()` from
 *   `@/lib/queries/client`, wrapped in `Suspense`.
 */

import { mutationOptions, queryOptions } from "@tanstack/react-query";
import type {
  CompleteProfileInput,
  RequestCodeInput,
  VerifyCodeInput,
} from "@journiful/shared/schemas";
import type { User } from "@journiful/shared/types";
import { apiFetch } from "@/lib/api";
import { toProfile } from "@/lib/mapping";
import type { Profile } from "@/lib/profile";
import { toE164 } from "@/lib/phone";
import { setToken } from "@/lib/session";

/** Mirrors `requestCodeResponseSchema`: `{success: true, message}`. */
export type RequestCodeResponse = { success: true; message: string };

/**
 * `POST /auth/request-code` with `{phoneNumber, smsConsent}` (both
 * required by `requestCodeSchema`; `smsConsent` must be `true`).
 *
 * Client-side validation stays in front of the network: a number
 * `lib/phone.ts` cannot read as E.164 throws before `apiFetch` is
 * ever called, so a bad number never reaches the server.
 */
export async function requestCode(
  input: RequestCodeInput,
): Promise<RequestCodeResponse> {
  const e164 = toE164(input.phoneNumber);
  if (!e164) {
    throw new Error("That does not look like a number.");
  }
  if (input.smsConsent !== true) {
    throw new Error("SMS consent is required.");
  }
  return apiFetch<RequestCodeResponse>("/auth/request-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber: e164, smsConsent: true }),
  });
}

/** Mutation wrapper for screens that fire `requestCode` via TanStack Query. */
export const requestCodeOptions = () =>
  mutationOptions({
    mutationKey: ["auth", "request-code"],
    mutationFn: requestCode,
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { requestCodeOptions as requestCodeMutation };

/** The user row inside `verifyCodeResponseSchema`, trimmed to what the
 *  auth store keeps. The full row rides along untouched. */
export type VerifyUser = {
  id: string;
  phoneNumber: string;
  displayName: string;
  profilePhotoUrl?: string | null;
  timezone?: string | null;
  [key: string]: unknown;
};

/** Mirrors `verifyCodeResponseSchema` minus the envelope: the caller gets
 *  the user and the profile flag; the token is persisted, not returned. */
export type VerifyCodeResult = {
  user: VerifyUser;
  requiresProfile: boolean;
};

/** Where the verify screen goes next, decided by the server's
 *  `requiresProfile` flag — never by a client-side guess. */
export function destinationForRequiresProfile(
  requiresProfile: boolean,
): "/complete-profile" | "/trips" {
  return requiresProfile ? "/complete-profile" : "/trips";
}

/**
 * `POST /auth/verify-code` with `{phoneNumber, code, smsConsent}` (all
 * three required by `verifyCodeSchema`; `smsConsent` must be `true`).
 *
 * On success the bearer token is persisted via `setToken` (SecureStore
 * natively, `localStorage` on web) and the caller receives the user plus
 * the server's `requiresProfile` flag, which decides the next route.
 *
 * Client-side validation stays in front of the network, as with
 * `requestCode`: an unreadable number or a malformed code throws before
 * `apiFetch` is ever called, so neither reaches the server.
 */
export async function verifyCode(
  input: VerifyCodeInput,
): Promise<VerifyCodeResult> {
  const e164 = toE164(input.phoneNumber);
  if (!e164) {
    throw new Error("That does not look like a number.");
  }
  if (!/^\d{6}$/.test(input.code)) {
    throw new Error("That code is not right, or it has expired.");
  }
  if (input.smsConsent !== true) {
    throw new Error("SMS consent is required.");
  }
  const body = await apiFetch<{
    success: true;
    user: VerifyUser;
    token: string;
    requiresProfile: boolean;
  }>("/auth/verify-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber: e164, code: input.code, smsConsent: true }),
  });
  await setToken(body.token);
  return { user: body.user, requiresProfile: body.requiresProfile };
}

/** Mutation wrapper for screens that fire `verifyCode` via TanStack Query. */
export const verifyCodeOptions = () =>
  mutationOptions({
    mutationKey: ["auth", "verify-code"],
    mutationFn: verifyCode,
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { verifyCodeOptions as verifyCodeMutation };

/** Key factory for the auth domain: `all` / `me`. */
export const authKeys = {
  all: ["auth"] as const,
  me: () => [...authKeys.all, "me"] as const,
};

/**
 * `GET /auth/me` mapped through `toProfile` — the one source of truth
 * for who is signed in. The complete-profile mutation reads the user
 * back through this same path instead of keeping a local flag.
 */
export const meOptions = () =>
  queryOptions({
    queryKey: authKeys.me(),
    queryFn: async (): Promise<Profile> =>
      toProfile((await apiFetch<{ success: true; user: User }>("/auth/me")).user),
  });

/** Mirrors `completeProfileResponseSchema` minus the envelope: the caller
 *  gets the `me` profile; the refreshed token is persisted, not returned. */
export type CompleteProfileResult = Profile;

/**
 * `POST /auth/complete-profile` with `{displayName, timezone?}`
 * (`completeProfileSchema`: displayName is 3–50 chars).
 *
 * On success the REFRESHED token is persisted via `setToken`, then the
 * user is read back from `GET /auth/me` and mapped through `toProfile` —
 * one source of truth, not a local flag.
 *
 * Client-side validation stays in front of the network, as with
 * `requestCode`/`verifyCode`: a too-short name throws before `apiFetch`
 * is ever called, so it never reaches the server.
 */
export async function completeProfile(
  input: CompleteProfileInput,
): Promise<CompleteProfileResult> {
  const displayName = input.displayName.trim();
  if (displayName.length < 3 || displayName.length > 50) {
    throw new Error("At least three characters, so the group knows who you are.");
  }
  const body = await apiFetch<{
    success: true;
    user: User;
    token: string;
  }>("/auth/complete-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      input.timezone !== undefined
        ? { displayName, timezone: input.timezone }
        : { displayName },
    ),
  });
  await setToken(body.token);
  return toProfile(
    (await apiFetch<{ success: true; user: User }>("/auth/me")).user,
  );
}

/** Mutation wrapper for screens that fire `completeProfile` via TanStack Query. */
export const completeProfileOptions = () =>
  mutationOptions({
    mutationKey: ["auth", "complete-profile"],
    mutationFn: completeProfile,
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { completeProfileOptions as completeProfileMutation };

/** Mirrors `logoutResponseSchema`: `{success: true, message}`. */
export type SignOutServerResponse = { success: true; message: string };

/**
 * `POST /auth/logout` — the server half of sign-out only. It never
 * touches the token or the query cache, on purpose.
 *
 * Cache-clear placement (kept consistent for later phases): `lib/queries/*`
 * stays node-importable — plain functions plus `queryOptions`/
 * `mutationOptions`, no React, no `useQueryClient`. The `QueryClient`
 * itself lives per-mount in `app/_layout.tsx` (`useState(() =>
 * makeQueryClient())`, no module singleton to import), and `AuthProvider`
 * already renders beneath that provider, so the store owns the
 * composition: `performSignOut` in `lib/authStore.tsx` calls this,
 * then `clearToken`, then `queryClient.clear()`. Screens never clear
 * the cache at their own call site.
 */
export async function signOutServer(): Promise<SignOutServerResponse> {
  return apiFetch<SignOutServerResponse>("/auth/logout", {
    method: "POST",
  });
}

/** Mutation wrapper for callers that fire sign-out via TanStack Query. */
export const signOutOptions = () =>
  mutationOptions({
    mutationKey: ["auth", "sign-out"],
    mutationFn: signOutServer,
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { signOutOptions as signOutMutation };
