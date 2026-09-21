/**
 * Mobile auth seeding for E2E. Shape ported from
 * apps/web/tests/e2e/helpers/auth.ts, mechanics replaced: the web helper
 * injects an `auth_token` cookie, which does not transfer — the mobile
 * app keeps its bearer token in `localStorage` under `journiful.authToken`
 * on web (`lib/session.ts`, `const KEY`) and restores it via
 * `GET /auth/me`. So this helper seeds a token through the real
 * request-code → verify-code endpoints (fixed dev code) and writes it
 * into `localStorage` with `page.addInitScript`, which runs before the
 * app's scripts on every navigation.
 *
 * Guard inside the init script (`if (!localStorage.getItem(key))`) is
 * load-bearing: without it the seed would re-arm itself on every
 * navigation and sign-out could never clear the session.
 */

import type { Page, APIRequestContext } from "@playwright/test";
import { API_BASE } from "./timeouts";
import type {
  CompleteProfileBody,
  CompleteProfileSeedResponse,
  RequestCodeBody,
  SeededAuth,
  VerifyCodeBody,
  VerifyCodeSeedResponse,
} from "./api";

/** Must match `const KEY` in `lib/session.ts`. */
export const AUTH_TOKEN_KEY = "journiful.authToken";

/** The dev fixed code (`ENABLE_FIXED_VERIFICATION_CODE=true`). */
export const FIXED_CODE = "123456";

/**
 * The 429 copy from `toErrorCopy` (`lib/queries/errors.ts`). Surfaced as
 * a thrown error so a tripped verify-code limiter reads as the cooldown,
 * not as a cryptic seed failure.
 */
export const RATE_LIMIT_COPY = "Too many tries. Wait a minute.";

let phoneCounter = 0;

/**
 * Generate a unique E.164 phone number that the mobile client accepts.
 * Differs from the web helper's shape on purpose: the mobile login
 * screen gates Continue on `toE164` (`lib/phone.ts`, `isPossible`), and
 * a +1 number is only possible with exactly 10 digits after the country
 * code — the web's 12-digit `+1555…` suffix parses but is never
 * possible, so Continue stays disabled (seen in the failure screenshot:
 * number typed, consent ticked, hint line up, button disabled).
 * The "555" substring is required by the API's test-number bypass
 * (`phone.includes("555")`), so 555 stays the area code and uniqueness
 * lives in the remaining 7 digits: 1 worker digit (`pid % 10`) + 4
 * timestamp digits + 2 counter digits. Two calls in the same process
 * and millisecond still differ by the counter; cross-worker collision
 * needs the same worker digit, millisecond, and counter at once.
 * Format: +1555{w:1}{ts:4}{counter:2} = 11 chars, 10 digits after +1.
 */
export function generateUniquePhone(): string {
  const worker = (process.pid % 10).toString();
  const ts = Date.now().toString().slice(-4);
  const counter = (++phoneCounter % 100).toString().padStart(2, "0");
  return `+1555${worker}${ts}${counter}`;
}

function throwOnRateLimit(status: number, which: string): void {
  if (status === 429) {
    throw new Error(`${which}: ${RATE_LIMIT_COPY}`);
  }
}

/**
 * Seed one user through the real auth endpoints: request-code →
 * verify-code → complete-profile. Returns the number and its token.
 * `displayName` defaults to "Test User"; pass `null` to leave the
 * profile incomplete (the account then `requiresProfile`).
 */
export async function seedUserViaAPI(
  request: APIRequestContext,
  phone: string,
  displayName: string | null = "Test User",
): Promise<SeededAuth> {
  const requestCode = await request.post(`${API_BASE}/auth/request-code`, {
    data: { phoneNumber: phone, smsConsent: true } satisfies RequestCodeBody,
  });
  throwOnRateLimit(requestCode.status(), "request-code");
  if (!requestCode.ok()) {
    throw new Error(
      `request-code failed: ${requestCode.status()} ${await requestCode.text()}`,
    );
  }

  const verify = await request.post(`${API_BASE}/auth/verify-code`, {
    data: {
      phoneNumber: phone,
      code: FIXED_CODE,
      smsConsent: true,
    } satisfies VerifyCodeBody,
  });
  throwOnRateLimit(verify.status(), "verify-code");
  if (!verify.ok()) {
    throw new Error(
      `verify-code failed: ${verify.status()} ${await verify.text()}`,
    );
  }
  const verifyBody = (await verify.json()) as VerifyCodeSeedResponse;
  let token = verifyBody.token;

  if (displayName !== null) {
    const complete = await request.post(
      `${API_BASE}/auth/complete-profile`,
      {
        data: { displayName } satisfies CompleteProfileBody,
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!complete.ok()) {
      throw new Error(
        `complete-profile failed: ${complete.status()} ${await complete.text()}`,
      );
    }
    // The endpoint rotates the token — the seed must carry the
    // refreshed one, not the pre-profile token.
    token = ((await complete.json()) as CompleteProfileSeedResponse).token;
  }

  return { phone, token };
}

/**
 * Seed a token via `seedUserViaAPI`, then arm `page.addInitScript` to
 * write `journiful.authToken` into `localStorage` before the app boots.
 * Call before the first `page.goto`: the script runs ahead of every
 * page load, and the app restores the session through `GET /auth/me`.
 * Returns the phone number used.
 */
export async function authenticateViaAPI(
  page: Page,
  request: APIRequestContext,
  displayName: string | null = "Test User",
): Promise<string> {
  const phone = generateUniquePhone();
  const { token } = await seedUserViaAPI(request, phone, displayName);
  await page.addInitScript(
    ({ key, value }) => {
      try {
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, value);
        }
      } catch {
        // Private-mode storage failure: the app treats a missing token
        // as signed-out, so the spec fails at its guard assertion
        // rather than here.
      }
    },
    { key: AUTH_TOKEN_KEY, value: token },
  );
  return phone;
}
