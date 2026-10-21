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
 * through `helpers/http.ts`: two projects in parallel over one API is what
 * trips a limiter, and no spec in this suite exercises the limiter itself.
 */

import type { APIRequestContext } from "@playwright/test";
import { postWithRetry } from "./http";
import { API_BASE } from "./timeouts";
import { generateUniquePhone, seedUserViaAPI } from "./auth";

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
 * in — the same one thing `seedGuestViaAPI` answers with. The second
 * phone's token stays in here: nothing reads the trip as them yet, and a
 * helper that hands back what no caller uses is a second thing to keep in
 * step with the roster it was read from.
 */
export async function seedGoingMemberViaAPI(
  request: APIRequestContext,
  organizerToken: string,
  tripId: string,
  displayName: string,
): Promise<string> {
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
    members: Array<{ id: string; phoneNumber?: string }>;
  };
  // Matched on the number this helper minted rather than on the display
  // name it was handed: a name is not an identity (a trip may hold two
  // people called Bob, and the organizer is on this list too), while the
  // number is the one thing here that was generated rather than chosen.
  // It is visible because the caller is the organizer, which
  // `memberWithProfileSchema` gates server-side.
  const added = body.members.find((member) => member.phoneNumber === phone);
  if (!added) {
    throw new Error(
      `list-members named no member holding ${phone} on trip ${tripId}`,
    );
  }
  return added.id;
}
