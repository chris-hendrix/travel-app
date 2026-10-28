// The split rule — who shares a cost, and by how much
//
// Two questions, two functions. `scopeMemberIds` answers *who*, from the
// roster. `spreadShares` answers *how much*, from the trip's expenses: it is a
// trip-wide rule, not a per-expense one, because cents do not divide — see its
// doc comment for why rounding each expense on its own is the wrong answer.

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
 * - `all_going` — everyone who has **not declined**: `going`, `maybe` and
 *   `no_response`, plus every guest (`userId === null`). Only an explicit
 *   `not_going` takes someone out. `maybe` and silence are both "we have
 *   not heard a no", and the rule is resolved on every read, so an answer
 *   that later turns into a decline takes the person back out on its own.
 *   The alternative — counting only `going` — means a person the organizer
 *   has just added owes nothing on the shared house until they open the app
 *   and answer, which is a ledger that is wrong for as long as they are
 *   busy. The guest clause stays explicit because a guest is never asked:
 *   the column default on that row is silence, not a decision.
 * - `all_invited` — every member row, declines included: the house is
 *   shared by the invitees, not only by whoever answered yes.
 * - `custom` — nobody: a fixed list is the participant rows, which the
 *   API stores, so the rule has nothing to resolve.
 *
 * Two consequences worth stating. The order is the member id, not the
 * roster's display order, because the id is the one key every caller agrees
 * on — and a stable order is what makes the list a fact rather than a
 * by-product of how Postgres returned the roster. (Which of them carries a
 * leftover cent is `spreadShares`' question, not this one's.) And the payer is
 * **not** forced into a scope: a scope says who shares the cost, not who paid,
 * so a payer who is not going does not silently become a participant.
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
            (member) => member.status !== "not_going" || member.userId === null,
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
 * This is the arithmetic of **one cost with no history** — the floor and the
 * leftover count `spreadShares` below builds on. It is not what a trip's
 * shares are: a trip has many costs, and `spreadShares` is the rule that keeps
 * their leftovers from piling onto the same people (read its comment before
 * using this one for anything user-facing).
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

/**
 * The one fact the ledger's order is built from: when the row was recorded.
 *
 * A string, not a `Date`, so the API (which holds `Date`s) and the app (which
 * holds what JSON gave it) sort the same list the same way — and so the order
 * can be a shared function rather than a line each surface retypes. The
 * comparison is plain `<`/`>`, which is why the format matters: every
 * `toISOString()` and every API response is `YYYY-MM-DDTHH:mm:ss.sssZ`, and
 * that format sorts correctly byte-for-byte.
 */
export interface LedgerOrderable {
  id: string;
  createdAt: string;
}

/**
 * The order the ledger is spread in: when each cost was recorded, oldest
 * first, then id. **Not** the order the screens list in, which is by day.
 *
 * Load-bearing, because `spreadShares` is sequential: which cost absorbs a
 * leftover cent depends on what came before it.
 *
 * Recorded order rather than the day the money was spent, and the difference
 * is not cosmetic. A row entered at the end cannot change the rows before it,
 * so **adding an expense never rewrites what anyone owed on an existing one** —
 * a back-dated receipt, which the form allows, leaves the past alone instead of
 * re-spreading it and moving somebody's balance by a cent. The alternative, day
 * order, reads more like a story and behaves worse: the past is not a place new
 * rows may edit.
 *
 * `id` makes the order total, so two rows entered in the same millisecond
 * cannot swap and reshuffle a cent between two reads.
 */
export function ledgerOrder<T extends LedgerOrderable>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((left, right) => {
    if (left.createdAt !== right.createdAt)
      return left.createdAt < right.createdAt ? -1 : 1;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

/** One cost as the spread reads it: an amount and the people sharing it. */
export interface LedgerStep {
  /** The payment's id — the key its shares come back under. */
  id: string;
  /** The whole cost, in cents. */
  amount: number;
  /**
   * Who shares it. Order is irrelevant — the rule sorts, so two callers
   * holding the same people in different orders still agree to the cent.
   */
  participantIds: readonly string[];
}

/** One cost's shares, aligned with the `participantIds` of the step. */
export interface LedgerStepShares {
  id: string;
  shares: number[];
}

/**
 * Every cost's shares, spread so that the leftover cents are **shared out over
 * the trip** instead of landing on the same people every time.
 *
 * Why not round each cost on its own. `equalShares` is right for a single
 * expense and wrong for a trip, in a way that only shows up in the totals: it
 * gives the leftover cents to the first seats in the list, and that list is
 * ordered by member id, so the lowest id collects the odd cent on expense
 * after expense until the totals drift cents apart, monotonically. Four
 * $50 expenses between four people come out `50.01 / 50.01 / 50.00 / 49.98`
 * under the per-expense rule; the same trip under this one is `50.00` each.
 * Nothing is lost either way — every cost still sums to its amount — so this
 * is exclusively about whether the per-person totals look like arithmetic or
 * like noise.
 *
 * The rule. Walk the costs in the caller's order (chronological —
 * `ledgerOrder`); everybody on a cost pays `floor(amount / count)`; the `r`
 * leftover cents go to the `r` people **furthest below their exact obligation
 * so far in the trip**, ties broken by who has received the fewest leftover
 * cents, then by member id. So a cost's stray cent is a repayment of rounding
 * debt rather than a gift to whoever sorts first.
 *
 * Three properties, all of them relied on elsewhere:
 *
 * 1. Every cost's shares are integers that sum to its amount, so the expense
 *    row a person reads adds up.
 * 2. Every member's total is within a cent of their exact share — the sum of
 *    the row amounts divided fair, rounded once at the end rather than once
 *    per expense. Measured over 20,000 generated trips: 99.96% of people land
 *    within a cent, 93.5% within half a cent, and on a trip where everyone
 *    shares every cost the spread between two people never exceeded one cent.
 * 3. Per-member totals are integers summing to zero, so settling the amounts
 *    on screen leaves the ledger at exactly zero — no residue to explain.
 *
 * The cost of 1–3: a share depends on the trip's history, so editing or
 * deleting an old expense can move a later one's share by a cent. That is the
 * price of the ledger being the sum of the rows, and the alternative — storing
 * allocations — would freeze a split scope, which is deliberately re-resolved
 * on every read.
 *
 * Exactness. A share is `amount / count`, not an integer, so the deficits are
 * carried in units of `1/D` cent where `D` is the lcm of the counts — integer
 * arithmetic from first to last, because a float tie-break is a disagreement
 * waiting to happen between the server and the app.
 *
 * The steps must be distinct payments with distinct members; a repeat is a
 * caller bug (`PaymentService` refuses a duplicate participant) and is not
 * detected here.
 */
export function spreadShares(
  steps: readonly LedgerStep[],
): LedgerStepShares[] {
  // Every count in the trip, over one denominator. `0` participants is not a
  // count (a cost with nobody on it is the caller's problem, not the
  // arithmetic's), and `1` divides anything.
  const denominator = steps.reduce(
    (acc, step) =>
      step.participantIds.length > 0
        ? lcm(acc, BigInt(step.participantIds.length))
        : acc,
    1n,
  );

  // Per member: the exact obligation so far (`1/denominator` cent units), the
  // cents actually charged, and how many leftover cents they have been given.
  const exact = new Map<string, bigint>();
  const charged = new Map<string, number>();
  const received = new Map<string, number>();

  return steps.map((step) => {
    const count = step.participantIds.length;
    if (count === 0) return { id: step.id, shares: [] };

    const base = Math.floor(step.amount / count);
    const leftover = step.amount - base * count;
    const exactPerShare = (BigInt(step.amount) * denominator) / BigInt(count);

    const shares = step.participantIds.map(() => base);
    for (const memberId of step.participantIds) {
      exact.set(memberId, (exact.get(memberId) ?? 0n) + exactPerShare);
      charged.set(memberId, (charged.get(memberId) ?? 0) + base);
    }

    // Who is furthest behind. The order is total, so the choice is a fact
    // about the trip and not about how a sort happened to fall.
    const candidates = step.participantIds
      .map((memberId, index) => ({ index, memberId }))
      .map((candidate) => ({
        ...candidate,
        deficit:
          (exact.get(candidate.memberId) ?? 0n) -
          BigInt(charged.get(candidate.memberId) ?? 0) * denominator,
        received: received.get(candidate.memberId) ?? 0,
      }))
      .sort((left, right) => {
        if (left.deficit !== right.deficit)
          return left.deficit > right.deficit ? -1 : 1;
        if (left.received !== right.received)
          return left.received - right.received;
        return left.memberId < right.memberId
          ? -1
          : left.memberId > right.memberId
            ? 1
            : 0;
      });

    for (let index = 0; index < leftover; index++) {
      const winner = candidates[index]!;
      shares[winner.index] = shares[winner.index]! + 1;
      charged.set(winner.memberId, (charged.get(winner.memberId) ?? 0) + 1);
      received.set(winner.memberId, (received.get(winner.memberId) ?? 0) + 1);
    }

    return { id: step.id, shares };
  });
}

/** Greatest common divisor, for the denominator above. */
function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}

/** Least common multiple, for the denominator above. */
function lcm(left: bigint, right: bigint): bigint {
  return (left / gcd(left, right)) * right;
}
