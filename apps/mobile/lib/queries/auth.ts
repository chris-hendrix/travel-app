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

import { mutationOptions } from "@tanstack/react-query";
import type {
  RequestCodeInput,
  VerifyCodeInput,
} from "@journiful/shared/schemas";
import { apiFetch } from "@/lib/api";
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
