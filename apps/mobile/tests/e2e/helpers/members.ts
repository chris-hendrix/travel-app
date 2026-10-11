/**
 * Member seeding for E2E: the second party a money spec cannot do
 * without.
 *
 * `helpers/trip.ts`'s `seedTripViaAPI` makes a **one-member** trip — the
 * creator — and a trip whose only member is its creator nets to zero:
 * `computeNetBalances` credits and debits the same member key
 * (`balance.service.ts:123-138`) and `simplifyDebts` drops zero balances
 * (`:153-163`), so a ledger over that trip has no debt row to read. The
 * second party is what puts two people on opposite sides of one number.
 *
 * The guest is the only second party a single seeded phone can add:
 * `POST /trips/:tripId/members/guests` (organizer-only, body per
 * `createGuestSchema` — `{displayName}` plus an optional `guestPhone`;
 * `guest-member.routes.ts:74`) mints a `members` row with `userId: null`
 * and the roster's own word for it, no second phone and no invitation
 * round-trip. The 201 body is `{success, member}`; the id is returned so
 * a caller can name the row it just made.
 *
 * The route carries the **write** rate limit (`guest-member.routes.ts:79`
 * — 30/min, keyed by the authenticated user), so the POST retries on 429
 * exactly as the seeding in `helpers/auth.ts:160-190` does: two projects
 * in parallel over one API is what trips a limiter, and no spec in this
 * suite exercises the limiter itself.
 */

import type { APIRequestContext, APIResponse } from "@playwright/test";
import { API_BASE } from "./timeouts";

/**
 * POST with retry on 429. Parses the limiter's "retry in N seconds" hint
 * when present, else backs off linearly (~1s per attempt) — the same
 * shape as `helpers/auth.ts`'s `postWithRetry`, kept here rather than
 * imported because that one is private to the auth seeding.
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
  throw new Error(
    `${which}: still rate limited after ${maxAttempts} attempts (${last?.status() ?? 429})`,
  );
}

/**
 * Add one guest member to a trip through the real endpoint. Returns the
 * new **member** id — the id space a payment's payer and participants
 * live in, never the account's user id.
 */
export async function seedGuestViaAPI(
  request: APIRequestContext,
  organizerToken: string,
  tripId: string,
  displayName: string,
): Promise<string> {
  const res = await postWithRetry(
    request,
    `${API_BASE}/trips/${tripId}/members/guests`,
    {
      data: { displayName },
      headers: { Authorization: `Bearer ${organizerToken}` },
    },
    "create-guest",
  );
  if (!res.ok()) {
    throw new Error(`create-guest failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { member: { id: string } };
  return body.member.id;
}
