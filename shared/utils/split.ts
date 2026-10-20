// The split rule — who shares a cost, and by how much

/**
 * The three things "Split with" can mean, in the order the form offers
 * them. Declared once because four surfaces read it: the API's
 * `payments.split_scope` check constraint, the request schemas
 * (`shared/schemas/payment.ts` builds its enum from this array), the
 * form's control, and the resolver below. No two of them can disagree
 * about the three or their order.
 *
 * `custom` leads because it is the column default and the only one that
 * stores participant rows.
 */
export const SPLIT_SCOPES = ["custom", "all_going", "all_invited"] as const;

/** One of the three ways a cost can be shared. */
export type SplitScope = (typeof SPLIT_SCOPES)[number];

/**
 * The API's `rsvp_status` — the four states a member row can hold.
 *
 * Written out here rather than imported because `shared/types/` states
 * the same union inline in three places (`TripMember.rsvpStatus`,
 * `GuestMember.status`, `GetTripResponse.userRsvpStatus`) and exports no
 * name for it. A split member has to carry the status to be resolved, so
 * this is the one place the resolver needs a name for it.
 */
export type MemberRsvpStatus = "going" | "not_going" | "maybe" | "no_response";

/**
 * The three facts about a roster row a split scope is resolved from —
 * nothing else, so the API (a full member row) and the form (a read's
 * members) can both hand their own objects over.
 *
 * `userId` is what tells a guest apart: a member row without an account
 * never answers an RSVP, so it is never "going" or "not going" in the
 * sense the scope means — see `scopeMemberIds`.
 */
export interface SplitMember {
  id: string;
  status: MemberRsvpStatus;
  userId: string | null;
}

/**
 * The member ids a scope resolves to, in ascending member-id order.
 *
 * - `all_going` — every member who said `going`, plus every guest
 *   (`userId === null`). A guest is seeded without a status, so the
 *   column default `no_response` would otherwise read as silence from
 *   someone who was never asked; the guest clause is the rule rather
 *   than a fallback, so a guest is in `all_going` whatever status the
 *   organizer gave the row.
 * - `all_invited` — every member row, declines included: the house is
 *   shared by the invitees, not only by whoever answered yes.
 * - `custom` — nobody: a fixed list is the participant rows, which the
 *   API stores, so the rule has nothing to resolve.
 *
 * Two consequences worth stating. The order is the member id, not the
 * roster's display order, because the id is the one key every caller
 * agrees on (and it is what the shares are handed out in). And the payer
 * is **not** forced into a scope: a scope says who shares the cost, not
 * who paid, so a payer who is not going does not silently become a
 * participant.
 */
export function scopeMemberIds(
  scope: SplitScope,
  members: readonly SplitMember[],
): string[] {
  const scoped =
    scope === "all_invited"
      ? members
      : scope === "all_going"
        ? members.filter(
            (member) => member.status === "going" || member.userId === null,
          )
        : [];

  return [...scoped]
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map((member) => member.id);
}

/**
 * The floor under every read: a split is never empty, so an empty one is the
 * payer owing the whole amount.
 *
 * Why it cannot be "nobody owes anything": the ledger nets a payment as
 * "payer paid the amount, each participant owes their share"
 * (`apps/api/src/services/balance.service.ts`). With no participants the
 * payer's credit stands and nothing offsets it, so a debt simplification that
 * skips a person it cannot pair would drop the row instead of showing the
 * payer owed. One person owing the lot is the honest reading of "the roster
 * this cost named is gone".
 *
 * It is a read rule, not a write rule. A create refuses an empty resolution
 * (`EmptySplitError`) because a cost shared by nobody is not a cost; an
 * update and every read apply this floor, so a scoped row whose scope has
 * since emptied out reads back as the payer alone. That asymmetry is why the
 * form needs it too: an edit previews what the server will store and read,
 * and a create still refuses.
 */
export function withPayerFallback(
  memberIds: string[],
  payerMemberId: string,
): string[] {
  return memberIds.length > 0 ? memberIds : [payerMemberId];
}

/**
 * Each participant's share of an amount in cents, in the order given.
 *
 * The largest-remainder rule: every share is the integer division, and
 * the leftover cents go **one each to the first `remainder` entries** —
 * not all of them to the first. The two readings agree whenever the
 * remainder is 0 or 1, which is why the difference is easy to miss:
 * $100 between three people is `[34, 33, 33]` either way, but $100.01
 * between three is `[34, 34, 33]` here and `[35, 33, 33]` under the
 * wrong one. The shares always sum to the amount, which is the property
 * the ledger depends on.
 *
 * No participants is `[]`, not a division by zero. A split that resolves
 * to nobody is caught above this function (a create is refused, a read
 * falls back to the payer through `withPayerFallback`); this is the
 * arithmetic only.
 */
export function equalShares(total: number, count: number): number[] {
  if (count <= 0) return [];

  const base = Math.floor(total / count);
  const remainder = total - base * count;

  return Array.from({ length: count }, (_, index) =>
    index < remainder ? base + 1 : base,
  );
}
