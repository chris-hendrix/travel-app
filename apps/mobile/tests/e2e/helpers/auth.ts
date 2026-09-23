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

import type { Page, APIRequestContext, APIResponse } from "@playwright/test";
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

let phoneCounter = Math.floor(Math.random() * 100);

/**
 * One worker-identity digit shared by the phone and label generators.
 * Hashes the Playwright worker/shard ids when present and always mixes
 * in the pid, so parallel shards and local workers land on different
 * digits while a single worker stays stable within its run.
 */
function workerDigit(): string {
  const raw = `${process.env.TEST_WORKER_INDEX ?? ""}:${process.env.PLAYWRIGHT_WORKER_INDEX ?? ""}:${process.env.PLAYWRIGHT_SHARD_INDEX ?? ""}:${process.pid}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return (hash % 10).toString();
}

function randomDigits(count: number): string {
  let out = "";
  for (let i = 0; i < count; i += 1) {
    out += Math.floor(Math.random() * 10).toString();
  }
  return out;
}

let labelCounter = 0;

/**
 * Collision-free label for generated trip, event, stay and place names.
 * Combines the wall clock with the worker identity, real entropy, and
 * a per-process counter, so two shards or two workers generating the
 * same prefix in the same millisecond still get distinct names and a
 * getByText assertion can never match a sibling worker's row.
 */
export function uniqueLabel(prefix: string): string {
  const worker = process.env.TEST_WORKER_INDEX ?? process.env.PLAYWRIGHT_WORKER_INDEX ?? process.pid.toString();
  const rand = Math.random().toString(36).slice(2, 8);
  labelCounter += 1;
  return `${prefix} ${Date.now()}-${worker}-${rand}-${labelCounter}`;
}

/**
 * Generate a unique E.164 phone number that the mobile client accepts.
 * Differs from the web helper's shape on purpose: the mobile login
 * screen gates Continue on `toE164` (`lib/phone.ts`, `isPossible`), and
 * a +1 number is only possible with exactly 10 digits after the country
 * code — the web's longer `+1555…` suffix parses but is never
 * possible, so Continue stays disabled. The "555" substring is required
 * by the API's test-number bypass (`phone.includes("555")`), so 555
 * stays the area code and uniqueness lives in the remaining 7 digits:
 * 1 worker-identity digit plus 4 random digits plus 2 counter digits.
 * The worker digit separates parallel shards and workers, the random
 * part separates processes sharing a worker digit, and the counter
 * (from a random start) separates rapid calls inside one process.
 * Format: +1555{w:1}{rand:4}{counter:2} = 11 chars, 10 digits after +1.
 */
export function generateUniquePhone(): string {
  const worker = workerDigit();
  const rand = randomDigits(4);
  const counter = (++phoneCounter % 100).toString().padStart(2, "0");
  return `+1555${worker}${rand}${counter}`;
}

function throwOnRateLimit(status: number, which: string): void {
  if (status === 429) {
    throw new Error(`${which}: ${RATE_LIMIT_COPY}`);
  }
}

/**
 * POST with retry on 429. Doubling the suite (chromium + phone projects
 * in parallel) pushes the API's global rate limiter (300/min per IP in
 * `apps/api/src/app.ts`, unauthenticated seeding keys by IP) into 429s
 * that have nothing to do with the spec under test. Back off and retry
 * instead of failing: parse the limiter's "retry in N seconds" hint
 * when present, else linear backoff (~1s per attempt). No spec in this
 * suite exercises the limiter itself, so retrying here masks nothing.
 */
async function postWithRetry(
  request: APIRequestContext,
  url: string,
  options: Parameters<APIRequestContext["post"]>[1],
  which: string,
  maxAttempts = 6,
): Promise<APIResponse> {
  let last: APIResponse | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    last = await request.post(url, options);
    if (last.status() !== 429) {
      return last;
    }
    if (attempt === maxAttempts) {
      break;
    }
    const body = await last.text().catch(() => "");
    const hint = body.match(/retry in (\d+(?:\.\d+)?) seconds?/i);
    const waitMs = hint ? Math.ceil(Number(hint[1]) * 1000) + 500 : attempt * 1000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  throwOnRateLimit(last?.status() ?? 429, which);
  return last as APIResponse;
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
  const requestCode = await postWithRetry(
    request,
    `${API_BASE}/auth/request-code`,
    {
      data: { phoneNumber: phone, smsConsent: true } satisfies RequestCodeBody,
    },
    "request-code",
  );
  throwOnRateLimit(requestCode.status(), "request-code");
  if (!requestCode.ok()) {
    throw new Error(
      `request-code failed: ${requestCode.status()} ${await requestCode.text()}`,
    );
  }

  const verify = await postWithRetry(
    request,
    `${API_BASE}/auth/verify-code`,
    {
      data: {
        phoneNumber: phone,
        code: FIXED_CODE,
        smsConsent: true,
      } satisfies VerifyCodeBody,
    },
    "verify-code",
  );
  throwOnRateLimit(verify.status(), "verify-code");
  if (!verify.ok()) {
    throw new Error(
      `verify-code failed: ${verify.status()} ${await verify.text()}`,
    );
  }
  const verifyBody = (await verify.json()) as VerifyCodeSeedResponse;
  let token = verifyBody.token;

  if (displayName !== null) {
    const complete = await postWithRetry(
      request,
      `${API_BASE}/auth/complete-profile`,
      {
        data: { displayName } satisfies CompleteProfileBody,
        headers: { Authorization: `Bearer ${token}` },
      },
      "complete-profile",
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
