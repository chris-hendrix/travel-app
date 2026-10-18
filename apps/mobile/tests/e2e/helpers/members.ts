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
 * A guest is not *going* (`status: "no_response"`), and that is the
 * difference `seedGoingMemberViaAPI` exists for: the travel form's
 * picker offers the going roster plus whoever already holds a record, so
 * a trip whose only second party is a guest with nothing filed cannot be
 * filed for at all. The two seeders are the two kinds of member, not two
 * spellings of one.
 *
 * The route carries the **write** rate limit (`guest-member.routes.ts:79`
 * — 30/min, keyed by the authenticated user), so the POST retries on 429
 * exactly as the seeding in `helpers/auth.ts:160-190` does: two projects
 * in parallel over one API is what trips a limiter, and no spec in this
 * suite exercises the limiter itself.
 */

import type { APIRequestContext, APIResponse } from "@playwright/test";
import { API_BASE } from "./timeouts";
import { generateUniquePhone, seedUserViaAPI } from "./auth";

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

/**
 * Add one **going** member to a trip: an invited number that signs in
 * (which accepts the pending invitation and puts them on the roster) and
 * then answers Going.
 *
 * The three requests are the app's own three, in the app's own order:
 * the organizer's batch invite (`POST /trips/:tripId/invitations`, the
 * shape `lib/queries/invitations.ts:invite` sends), the guest's sign-in
 * (`seedUserViaAPI` — acceptance is server-side at verify,
 * `processPendingInvitations`, so there is no Accept button to press),
 * and the guest's own RSVP (`POST /trips/:tripId/rsvp`, body per
 * `updateRsvpSchema`). The member id is read back off the roster rather
 * than taken from any response, because the invite answers with an
 * *invitation* id and the two id spaces are not the same one.
 *
 * Returns the member id, the id space a travel row's `memberId` lives
 * in, plus the second phone's token, for a spec that needs to look at the
 * trip through the second member's own eyes.
 */
export async function seedGoingMemberViaAPI(
  request: APIRequestContext,
  organizerToken: string,
  tripId: string,
  displayName: string,
): Promise<{ memberId: string; token: string; phone: string }> {
  const phone = generateUniquePhone();
  const invite = await postWithRetry(
    request,
    `${API_BASE}/trips/${tripId}/invitations`,
    {
      data: { phoneNumbers: [phone], userIds: [] },
      headers: { Authorization: `Bearer ${organizerToken}` },
    },
    "create-invitations",
  );
  if (!invite.ok()) {
    throw new Error(
      `create-invitations failed: ${invite.status()} ${await invite.text()}`,
    );
  }
  const { token } = await seedUserViaAPI(request, phone, displayName);
  const rsvp = await postWithRetry(
    request,
    `${API_BASE}/trips/${tripId}/rsvp`,
    { data: { status: "going" }, headers: { Authorization: `Bearer ${token}` } },
    "rsvp",
  );
  if (!rsvp.ok()) {
    throw new Error(`rsvp failed: ${rsvp.status()} ${await rsvp.text()}`);
  }
  const members = await request.get(`${API_BASE}/trips/${tripId}/members`, {
    headers: { Authorization: `Bearer ${organizerToken}` },
  });
  if (!members.ok()) {
    throw new Error(`list-members failed: ${members.status()}`);
  }
  const body = (await members.json()) as {
    members: Array<{ id: string; displayName: string }>;
  };
  const added = body.members.find((member) => member.displayName === displayName);
  if (!added) {
    throw new Error(
      `list-members named no ${displayName} on trip ${tripId}`,
    );
  }
  return { memberId: added.id, token, phone };
}
