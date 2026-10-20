// The split, resolved against the trip's roster
//
// A payment records *how* it is shared (`payments.split_scope`), not only
// *among whom*: `custom` stores a fixed list in `payment_participants`, while
// `all_going` and `all_invited` store no rows at all and are re-resolved here
// on every read. That is the whole design — a member added after the expense
// joins a shared cost, and a member removed leaves it, with no edit per
// expense and no sync path to drift.
//
// The rule itself lives in `shared/utils/split.ts` (`scopeMemberIds` for who,
// `equalShares` for how much) and is used by the API, the form preview and the
// demo alike, because three surfaces quoting a split must agree to the cent.
// This module is the API's adapter: one roster read, one lookup for names.
import { eq, sql } from "drizzle-orm";
import {
  equalShares,
  scopeMemberIds,
  withPayerFallback,
  type MemberRsvpStatus,
  type SplitScope,
} from "@journiful/shared/utils";
import { members, users } from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";

/** The part of the executor a roster read needs — `db` or a caller's `tx`. */
type SplitDb = Pick<AppDatabase, "select">;

/**
 * A roster row reduced to what a split needs: the three facts the rule reads
 * plus the display name, so the caller never needs a second lookup to answer
 * "who is in this split?".
 */
export interface SplitRosterMember {
  id: string;
  status: MemberRsvpStatus;
  userId: string | null;
  name: string;
}

/**
 * One resolved participant. Deliberately shape-compatible with the row view
 * the service returns for a `custom` payment — minus `id`, `paymentId` and
 * `createdAt`, which only a stored row can have. A resolved participant is a
 * fact about the roster, not a record of its own.
 */
export interface ResolvedParticipant {
  memberId: string;
  shareAmount: number;
  name: string;
}

/**
 * The other members of a trip, loaded once per call.
 *
 * Ordered by id, so the roster is the same list no matter what Postgres
 * returns and the shares below follow `scopeMemberIds`' order without a
 * second sort. `name` is the same coalesce the ledger uses
 * (`payment.service.ts`'s `buildMemberNameMap`): an account's display name,
 * else the organizer's label for a guest.
 */
export async function loadSplitMembers(
  db: SplitDb,
  tripId: string,
): Promise<SplitRosterMember[]> {
  const rows = await db
    .select({
      id: members.id,
      status: members.status,
      userId: members.userId,
      name: sql<string>`coalesce(${users.displayName}, ${members.guestDisplayName}, 'Unknown')`,
    })
    .from(members)
    .leftJoin(users, eq(members.userId, users.id))
    .where(eq(members.tripId, tripId))
    .orderBy(members.id);

  return rows;
}

/**
 * Read a stored `split_scope` back as the union.
 *
 * The column is a `varchar` with a CHECK, so the type Postgres hands back is
 * `string`. Anything that is not one of the two roster scopes reads as
 * `custom`, which is both the column default and the only scope whose rows the
 * read paths know how to trust — so a row that slipped past the CHECK still
 * reads as the snapshot it most nearly is rather than throwing on a list read.
 */
export function asSplitScope(value: string): SplitScope {
  return value === "all_going" || value === "all_invited" ? value : "custom";
}

/** Turn member ids into participants with equal shares and resolved names. */
function sharesFor(
  memberIds: readonly string[],
  roster: readonly SplitRosterMember[],
  amount: number,
): ResolvedParticipant[] {
  const nameById = new Map(roster.map((member) => [member.id, member.name]));
  const shares = equalShares(amount, memberIds.length);

  return memberIds.map((memberId, index) => ({
    memberId,
    shareAmount: shares[index]!,
    name: nameById.get(memberId) ?? "Unknown",
  }));
}

/**
 * What a scope resolves to right now, in member-id order with equal shares.
 *
 * `[]` is a real answer, not an error: nobody satisfies the rule. The write
 * path refuses it (`EmptySplitError`, because a cost shared by nobody is not
 * a cost); the read path lets the shared `withPayerFallback` put the payer
 * back in.
 */
export function splitForScope(
  scope: SplitScope,
  roster: readonly SplitRosterMember[],
  amount: number,
): ResolvedParticipant[] {
  return sharesFor(scopeMemberIds(scope, roster), roster, amount);
}

/**
 * A scoped payment's participants for a read: the rule, the payer floor, and
 * the shares — in one call, because every read path wants exactly this.
 *
 * `withPayerFallback` is the shared rule (`shared/utils/split.ts`), not this
 * module's: the form shows the same floor on an edit, because a preview that
 * disagreed with the read would offer to save a row the server would hand
 * back differently.
 */
export function resolveScopedSplit(
  scope: SplitScope,
  roster: readonly SplitRosterMember[],
  amount: number,
  payerMemberId: string,
): ResolvedParticipant[] {
  const memberIds = withPayerFallback(
    scopeMemberIds(scope, roster),
    payerMemberId,
  );

  return sharesFor(memberIds, roster, amount);
}
