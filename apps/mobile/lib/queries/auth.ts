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
import type { RequestCodeInput } from "@journiful/shared/schemas";
import { apiFetch } from "@/lib/api";
import { toE164 } from "@/lib/phone";

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
