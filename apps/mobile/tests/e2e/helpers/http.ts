/**
 * The one POST-with-retry the seed helpers share.
 *
 * Doubling the suite (chromium + phone projects in parallel) pushes the API's
 * global rate limiter (300/min per IP in `apps/api/src/app.ts`, and
 * unauthenticated seeding keys by IP) into 429s that have nothing to do with
 * the spec under test. Back off and retry instead of failing: parse the
 * limiter's "retry in N seconds" hint when present, else linear backoff (~1s
 * per attempt). No spec exercises the limiter itself, so retrying here masks
 * nothing — and a 429 that outlives the attempts is a real failure, so it
 * throws rather than handing back a response the caller would misread.
 *
 * It lives here, in one module, because three seeders need it (auth, members,
 * payments) and three copies of a retry policy drift: the second copy had
 * already dropped the fractional-seconds hint.
 */

import type { APIRequestContext, APIResponse } from "@playwright/test";

/** The sentence a limiter that outlived the retries reports. */
const RATE_LIMIT_COPY =
  "the API is rate limiting this suite; re-run the spec rather than the assertion";

function throwOnRateLimit(status: number, which: string): void {
  if (status === 429) {
    throw new Error(`${which}: ${RATE_LIMIT_COPY}`);
  }
}

export async function postWithRetry(
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
