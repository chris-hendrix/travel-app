/**
 * The demo's money, in one module: the ledger the fixture ships, and the
 * server half the adapter serves it through.
 *
 * It is a leaf. `lib/demo/adapter.ts` value-imports this module for its
 * six money routes and `lib/demo.ts` value-imports it for the fixture's
 * own ledgers, so this module imports neither of them — only the
 * fixture's writing (`lib/demo/fixture.ts`), the store's shape
 * (`lib/demo/store.ts`) and the repo's own split rule
 * (`lib/payments.ts`). A cycle back into either caller would fail at the
 * first call with an undefined binding rather than at compile time.
 *
 * Two halves, in the order they belong: the fixture rows first, because
 * everything below them is arithmetic over what they state; then the
 * server's own restatement of `PaymentService` and `BalanceService` —
 * the row builders, the balances and the six routes' bodies.
 */

import { atClock, DEMO_VIEWER_MEMBER_ID, userIdOf } from "@/lib/demo/fixture";
import { findRowAnywhere, notFound, nowIso } from "@/lib/demo/store";
import type { DemoBody, DemoStore } from "@/lib/demo/store";
import { splitForScope, splitPreview } from "@/lib/payments";
import type { SplitScope } from "@/lib/payments";
import type {
  BalanceEntry,
  MemberWithProfile,
  MyBalanceDetail,
  Payment,
  PaymentParticipant,
} from "@journiful/shared/types";

/*
 * The fixture half: what a trip's ledger states, and nothing more.
 */

/**
 * One expense in a trip's ledger, in the fixture's own shorthand.
 *
 * The shares are deliberately **not** written down here: they are the
 * server's own rule (`PaymentService.computeEqualShares`, mirrored by
 * `splitPreview`), and `paymentRow` below applies it when it builds the
 * row. So a fixture row cannot state shares that disagree with its own
 * amount, and every balance the demo serves is arithmetic over these rows
 * rather than a number written beside them.
 *
 * A trip's ledger is invisible unless it is split across more than one
 * person: the balance service credits the payer and debits each
 * participant, and the simplifier drops a zero, so a ledger whose only
 * member is the reader nets to exactly nothing and the sheet has no row
 * to draw at all. Every trip below therefore involves several members,
 * and each carries one **guest** — a member row with no account behind
 * it, which the API allows as a payer and as a participant and the app
 * must not hide.
 */
export type DemoPayment = {
  id: string;
  description: string;
  /** "how was it paid" — null when unset, which is different from "". */
  note: string | null;
  /** The whole expense, in integer cents. */
  amount: number;
  /** Who paid: a **member** id. */
  payerMemberId: string;
  /**
   * Everyone splitting it, in the order the remainder cents are handed
   * out: **member** ids, and the order is load-bearing — the first
   * `amount % count` people in this list get one cent more than the
   * rest (`splitPreview`).
   */
  participants: string[];
  /**
   * Who filed it: a **user** id (`userIdOf`), which is a different space
   * from the two above — `createdBy` matches a `member.userId` and never
   * a `member.id`, and the detail's Edit predicate is exactly that
   * comparison.
   */
  createdBy: string;
  /** Noon-anchored, and inside the trip's own window (`atClock`). */
  date: string;
};

/**
 * One ledger row. The shares are not a parameter: `paymentRow` below derives
 * them from `amount` and `participants` with the server's own rule (see
 * `DemoPayment`), so this can only ever state the payer, the people and
 * the total.
 */
function payment(
  id: string,
  description: string,
  note: string | null,
  amount: number,
  payerMemberId: string,
  participants: string[],
  /** A day inside the trip's window; the row is stamped at local noon on it. */
  dayIso: string,
  /** A **user** id — `userIdOf(memberId)`, never the member id itself. */
  createdBy: string,
): DemoPayment {
  return {
    id,
    description,
    note,
    amount,
    payerMemberId,
    participants,
    createdBy,
    date: atClock(dayIso, "12:00"),
  };
}

/**
 * Cabo's ledger, on the days its own itinerary runs.
 *
 * The ledger, dated on the days the itinerary already runs: the boat
 * deposit on the boat day, the tacos on the tacos night, and a
 * settlement two days in. Two rows carry a note and three do not,
 * because the sheet drops an absent note rather than printing a blank
 * one; one row is a settlement (a payment whose only participant is
 * somebody other than the payer), which is the row the sheet reads as
 * "Settled up"; and the tacos are deliberately $50.00 across three
 * people, where the remainder is 2 — the only kind of row that tells
 * the two readings of the split rule apart ([1667, 1667, 1666], one
 * cent each to the first two, not [1668, 1666, 1666]).
 *
 * The days arrive off the trip's builder rather than being derived here:
 * they are the same four the events, the stay and the arrivals are dated
 * on, and the ledger is dated on those days on purpose.
 */
export function caboLedger({
  startDate,
  saturday,
  sunday,
  monday,
}: {
  startDate: string;
  saturday: string;
  sunday: string;
  monday: string;
}): DemoPayment[] {
  return [
    payment(
      "demo-payment-boat",
      "Boat day",
      "Paid by card",
      48000,
      "demo-sam",
      [DEMO_VIEWER_MEMBER_ID, "demo-liz", "demo-marco", "demo-sam"],
      sunday,
      userIdOf("demo-sam"),
    ),
    // A guest paid, and the viewer is the one who filed it — so this row
    // is one the viewer may edit without being its payer.
    payment(
      "demo-payment-groceries",
      "Groceries at the house",
      null,
      15750,
      "demo-guest-cabo",
      [DEMO_VIEWER_MEMBER_ID, "demo-liz", "demo-marco", "demo-sam"],
      startDate,
      userIdOf(DEMO_VIEWER_MEMBER_ID),
    ),
    payment(
      "demo-payment-tacos",
      "Tacos in town",
      null,
      5000,
      "demo-liz",
      [DEMO_VIEWER_MEMBER_ID, "demo-liz", "demo-sam"],
      saturday,
      userIdOf("demo-liz"),
    ),
    payment(
      "demo-payment-drinks",
      "Sunset drinks",
      "Venmo",
      9600,
      DEMO_VIEWER_MEMBER_ID,
      [DEMO_VIEWER_MEMBER_ID, "demo-liz", "demo-marco"],
      saturday,
      userIdOf(DEMO_VIEWER_MEMBER_ID),
    ),
    payment(
      "demo-payment-settled",
      "Settled up",
      null,
      7500,
      "demo-marco",
      [DEMO_VIEWER_MEMBER_ID],
      monday,
      userIdOf("demo-marco"),
    ),
  ];
}

/**
 * The wedding's ledger, on the days its own itinerary runs.
 *
 * Dev fronted the dinner and the four of them settle the rest between
 * them, which is what makes the moves read as people rather than as a
 * single tab. The taxis carry the guest, and one row is a settlement
 * (Liz's only participant is the viewer) so the sheet shows a
 * "Settled up" entry here too.
 */
export function weddingLedger({
  startDate,
  monday,
}: {
  startDate: string;
  monday: string;
}): DemoPayment[] {
  return [
    payment(
      "demo-wed-payment-welcome",
      "Welcome dinner",
      "Paid by card",
      24600,
      "demo-wed-dev",
      [
        `${DEMO_VIEWER_MEMBER_ID}-wed`,
        "demo-wed-dev",
        "demo-wed-priya",
        "demo-wed-marco",
        "demo-wed-liz",
      ],
      startDate,
      userIdOf("demo-wed-dev"),
    ),
    payment(
      "demo-wed-payment-groceries",
      "Casa Marea groceries",
      null,
      9020,
      `${DEMO_VIEWER_MEMBER_ID}-wed`,
      [
        `${DEMO_VIEWER_MEMBER_ID}-wed`,
        "demo-wed-dev",
        "demo-wed-priya",
        "demo-wed-marco",
      ],
      startDate,
      userIdOf(`${DEMO_VIEWER_MEMBER_ID}-wed`),
    ),
    payment(
      "demo-wed-payment-taxis",
      "Airport taxis",
      null,
      7000,
      "demo-wed-marco",
      [
        `${DEMO_VIEWER_MEMBER_ID}-wed`,
        "demo-wed-marco",
        "demo-wed-liz",
        "demo-wed-guest",
      ],
      startDate,
      userIdOf("demo-wed-marco"),
    ),
    payment(
      "demo-wed-payment-brunch",
      "Farewell brunch",
      "Venmo",
      11900,
      "demo-wed-priya",
      [
        `${DEMO_VIEWER_MEMBER_ID}-wed`,
        "demo-wed-dev",
        "demo-wed-priya",
        "demo-wed-liz",
      ],
      monday,
      userIdOf("demo-wed-priya"),
    ),
    payment(
      "demo-wed-payment-settled",
      "Settled up",
      null,
      2000,
      "demo-wed-liz",
      [`${DEMO_VIEWER_MEMBER_ID}-wed`],
      monday,
      userIdOf("demo-wed-liz"),
    ),
  ];
}

/**
 * The bachelor party's ledger, on the days its own itinerary runs.
 *
 * Marco booked the tickets, Eddie got the table, and everyone else
 * carried a piece — the ledger is a party splitting a weekend rather
 * than one person's tab. The steak dinner is deliberately $227.10
 * across six, so its shares are even (3785 each) and the guest Danny
 * holds a real share of the trip.
 */
export function bachelorLedger({
  startDate,
  saturday,
  sunday,
}: {
  startDate: string;
  saturday: string;
  sunday: string;
}): DemoPayment[] {
  return [
    payment(
      "demo-bach-payment-groceries",
      "House groceries",
      null,
      11220,
      `${DEMO_VIEWER_MEMBER_ID}-bac`,
      [
        `${DEMO_VIEWER_MEMBER_ID}-bac`,
        "demo-bach-dev",
        "demo-bach-marco",
        "demo-bach-sam",
      ],
      startDate,
      userIdOf(`${DEMO_VIEWER_MEMBER_ID}-bac`),
    ),
    payment(
      "demo-bach-payment-tickets",
      "Padres game tickets",
      "Paid by card",
      33600,
      "demo-bach-marco",
      [
        `${DEMO_VIEWER_MEMBER_ID}-bac`,
        "demo-bach-dev",
        "demo-bach-marco",
        "demo-bach-sam",
        "demo-bach-eddie",
      ],
      saturday,
      userIdOf("demo-bach-marco"),
    ),
    payment(
      "demo-bach-payment-steak",
      "Steak dinner",
      null,
      22710,
      "demo-bach-eddie",
      [
        `${DEMO_VIEWER_MEMBER_ID}-bac`,
        "demo-bach-dev",
        "demo-bach-marco",
        "demo-bach-sam",
        "demo-bach-eddie",
        "demo-bach-guest",
      ],
      saturday,
      userIdOf("demo-bach-eddie"),
    ),
    payment(
      "demo-bach-payment-surf",
      "Surf lesson",
      "Venmo",
      16000,
      "demo-bach-dev",
      [
        `${DEMO_VIEWER_MEMBER_ID}-bac`,
        "demo-bach-dev",
        "demo-bach-marco",
        "demo-bach-sam",
      ],
      saturday,
      userIdOf("demo-bach-dev"),
    ),
    payment(
      "demo-bach-payment-settled",
      "Settled up",
      null,
      5000,
      "demo-bach-sam",
      [`${DEMO_VIEWER_MEMBER_ID}-bac`],
      sunday,
      userIdOf("demo-bach-sam"),
    ),
  ];
}

/*
 * The server half: the same arithmetic the API's `PaymentService` and
 * `BalanceService` do, over the fixture rows above.
 */

/**
 * The trip's member rows: the only place a person's name comes from.
 * The server's own person map is built the same way
 * (`BalanceService.buildPersonMap`), off the trip's members.
 */
function rosterOf(store: DemoStore, tripId: string): MemberWithProfile[] {
  return store.members.get(tripId) ?? [];
}

/**
 * One member's name as the roster carries it, or `""`.
 *
 * A member id that is not on the trip has no name at all rather than an
 * invented one: the server joins names off the trip's members, so a
 * payment naming somebody else is a bug in the fixture, not a person to
 * make up.
 */
function nameOfMember(roster: MemberWithProfile[], memberId: string): string {
  return roster.find((row) => row.id === memberId)?.displayName ?? "";
}

/**
 * One participant row: the member, the share the split rule gave them,
 * and the name off the roster (`payment.service.ts` joins the same name
 * onto every participant, so the split arrives with everything it draws).
 */
function participantRow(
  paymentId: string,
  memberId: string,
  shareAmount: number,
  nameOf: (memberId: string) => string,
  index: number,
): PaymentParticipant {
  return {
    id: `${paymentId}-participant-${index + 1}`,
    paymentId,
    memberId,
    shareAmount,
    name: nameOf(memberId),
    createdAt: nowIso() as unknown as Date,
  };
}

/**
 * One stored expense: the API's entity, with the names resolved off the
 * roster and the shares **computed**, never written down.
 *
 * The shares are the server's own rule, applied to the participant list
 * in the order the fixture wrote it: `splitPreview` (`lib/payments.ts`)
 * is the repo's existing restatement of
 * `PaymentService.computeEqualShares` — integer division, with the
 * remainder cents going one each to the first `remainder` participants.
 * Reusing it rather than restating it here is what keeps the demo's
 * arithmetic and the form's preview from ever disagreeing, and it is why
 * a fixture row can only state the payer, the people and the total.
 */
function paymentRow(
  tripId: string,
  plan: DemoPayment,
  nameOf: (memberId: string) => string,
): Payment {
  const shares = splitPreview(plan.amount, plan.participants);
  return {
    id: plan.id,
    tripId,
    description: plan.description,
    note: plan.note,
    amount: plan.amount,
    splitScope: "custom",
    // `payerMemberId` and every `participants[].memberId` are **member**
    // ids, while `createdBy` is a **user** id (`userIdOf` in the fixture).
    // The two spaces are never compared to each other.
    payerMemberId: plan.payerMemberId,
    payerName: nameOf(plan.payerMemberId),
    date: plan.date as unknown as Date,
    createdBy: plan.createdBy,
    participants: plan.participants.map((memberId, index) =>
      participantRow(plan.id, memberId, shares[index] ?? 0, nameOf, index),
    ),
    deletedAt: null,
    deletedBy: null,
    createdAt: nowIso() as unknown as Date,
    updatedAt: nowIso() as unknown as Date,
  };
}

/**
 * Every member's net position in cents over the trip's non-deleted
 * expenses: what they paid, minus what they owe.
 *
 * Mirrors `BalanceService.computeNetBalances`: the payer is credited the
 * whole amount, each participant is debited their own share, and the key
 * is the **member** id. Positive means owed money, negative means owing
 * it, and the map's total is always zero — every cent paid is a cent
 * somebody owes.
 *
 * Soft-deleted rows are dropped here, exactly as the server drops them
 * in its query (`isNull(payments.deletedAt)`): that is what makes a
 * delete move the ledger rather than just hide a row.
 */
function netBalancesOf(store: DemoStore, tripId: string): Map<string, number> {
  const net = new Map<string, number>();
  for (const payment of store.payments.get(tripId) ?? []) {
    if (payment.deletedAt !== null) continue;
    net.set(
      payment.payerMemberId,
      (net.get(payment.payerMemberId) ?? 0) + payment.amount,
    );
    for (const participant of payment.participants) {
      net.set(
        participant.memberId,
        (net.get(participant.memberId) ?? 0) - participant.shareAmount,
      );
    }
  }
  return net;
}

/**
 * The trip's simplified moves, computed from the expenses on every read —
 * never stored, and never written down beside them, because a balance
 * written by hand contradicts the entries the moment either changes.
 *
 * Mirrors `BalanceService.simplifyDebts`: zero balances are dropped,
 * creditors and debtors are each sorted largest first, and the largest
 * creditor is repeatedly matched with the largest debtor for
 * `min(the two)`, until every balance is zero. The result is the shortest
 * set of moves that settles the trip — not one row per expense, which is
 * why the sheet can say who to pay rather than who paid what.
 *
 * The person ids here are **member** ids, the space `moveFor` and the
 * payer line substitute "You" in, and the names come off the roster.
 */
function tripBalances(store: DemoStore, tripId: string): BalanceEntry[] {
  const roster = rosterOf(store, tripId);
  const creditors: { id: string; amount: number }[] = [];
  const debtors: { id: string; amount: number }[] = [];

  for (const [memberId, amount] of netBalancesOf(store, tripId)) {
    if (amount > 0) creditors.push({ id: memberId, amount });
    else if (amount < 0) debtors.push({ id: memberId, amount: -amount });
  }
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const moves: BalanceEntry[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]!;
    const debtor = debtors[di]!;
    const transfer = Math.min(creditor.amount, debtor.amount);

    if (transfer > 0) {
      moves.push({
        from: { id: debtor.id, name: nameOfMember(roster, debtor.id) },
        to: { id: creditor.id, name: nameOfMember(roster, creditor.id) },
        amount: transfer,
      });
    }

    creditor.amount -= transfer;
    debtor.amount -= transfer;
    if (creditor.amount === 0) ci++;
    if (debtor.amount === 0) di++;
  }

  return moves;
}

/**
 * The reader's own position, read off the moves above — the second half
 * of `BalanceService.getMyBalance`, verbatim: a move they are the debtor
 * of is money they owe (a positive detail), a move they are the creditor
 * of is money owed to them (a negative one), and the net is the details'
 * own sum with the sign flipped.
 */
function myBalanceOf(
  moves: BalanceEntry[],
  viewerMemberId: string,
): { netBalance: number; details: MyBalanceDetail[] } {
  let netBalance = 0;
  const details: MyBalanceDetail[] = [];

  for (const move of moves) {
    if (move.from.id === viewerMemberId) {
      netBalance -= move.amount;
      details.push({ person: move.to, amount: move.amount });
    } else if (move.to.id === viewerMemberId) {
      netBalance += move.amount;
      details.push({ person: move.from, amount: -move.amount });
    }
  }

  return { netBalance, details };
}

/**
 * The viewer's own **member** row on a trip, resolved the way the server
 * resolves a caller: the row whose `userId` is the signed-in account
 * (`BalanceService.getMyBalance`). Never the other way round — a user id
 * is not a member id.
 */
function viewerRowOf(
  store: DemoStore,
  tripId: string,
): MemberWithProfile | undefined {
  return rosterOf(store, tripId).find((row) => row.userId === "demo-viewer");
}

/**
 * The scope a write body names, or `null` when it names none.
 *
 * Exactly the three the wire carries, and nothing is inferred from
 * anything else: the API answers a 400 for a value outside them
 * (`split_scope`'s check constraint behind the request schema), so the
 * demo has no reason to invent a meaning for one. `null` is "the body
 * said nothing", which is a different thing from `custom` — a create
 * defaults to `custom` (the column's own default), while an update
 * leaves the row's current scope alone.
 */
function splitScopeOf(value: unknown): SplitScope | null {
  return value === "custom" || value === "all_going" || value === "all_invited"
    ? value
    : null;
}

/** The member ids out of a write body's `participants` array. */
function memberIdsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value) {
    const memberId =
      typeof entry === "object" && entry !== null
        ? (entry as { memberId?: unknown }).memberId
        : null;
    if (typeof memberId === "string") ids.push(memberId);
  }
  return ids;
}

/**
 * The member ids one write's split resolves to.
 *
 * `custom` is the list the body carried, in the order it arrived — that
 * order is what hands the remainder cents out. A scope is **resolved**
 * against the demo store's roster through the repo's own rule,
 * `splitForScope` (`lib/payments.ts`): the client's half of the rule the
 * API applies to the same roster, so the people the form previewed are
 * the people the row stores. Its answer is in member-id order, which is
 * `setParticipants`' order too, so the ids resolved here are priced by
 * the one arithmetic (`equalShares`) in the same order they came in.
 */
function splitMemberIdsFor(
  scope: SplitScope,
  body: DemoBody,
  roster: readonly MemberWithProfile[],
  amount: number,
): string[] {
  if (scope === "custom") return memberIdsFrom(body.participants);
  return splitForScope(scope, roster, amount).map((share) => share.memberId);
}

/**
 * Replace a row's participants and recompute every share from the row's
 * own amount — the server's own update path: a participants list replaces
 * the rows, and the shares come from the final amount (`updatePayment`
 * recomputes for the new list, or for the existing one when only the
 * amount changed).
 */
function setParticipants(
  row: Payment,
  memberIds: string[],
  nameOf: (memberId: string) => string,
): void {
  const shares = splitPreview(row.amount, memberIds);
  row.participants = memberIds.map((memberId, index) =>
    participantRow(row.id, memberId, shares[index] ?? 0, nameOf, index),
  );
}

/**
 * Seed one trip's ledger from the fixture. Called after the roster is in
 * place, because every name on a payment comes off it — the server joins
 * them for the same reason (`BalanceService.buildPersonMap`).
 */
export function seedLedger(
  store: DemoStore,
  trip: { id: string; payments: DemoPayment[] },
): void {
  const roster = rosterOf(store, trip.id);
  store.payments.set(
    trip.id,
    trip.payments.map((plan) =>
      paymentRow(trip.id, plan, (memberId) => nameOfMember(roster, memberId)),
    ),
  );
}

/**
 * The stored expense an id addresses, or `null` when no row carries that
 * id — or when the row is soft-deleted: the server's update and delete
 * both read through `deletedAt IS NULL`, so a second delete (or an edit
 * of a row somebody removed) is a 404 rather than a resurrection.
 *
 * The dispatcher resolves the row before it reads the verb, exactly as
 * the route always did, so an id nothing addresses answers the same 404
 * whatever the method is.
 */
export function paymentRowById(store: DemoStore, id: string): Payment | null {
  const found = findRowAnywhere(store.payments, id);
  if (!found || found.row.deletedAt !== null) return null;
  return found.row;
}

/**
 * The trip's expenses, as `GET /trips/:id/payments` serves them.
 */
export function listPayments(
  store: DemoStore,
  tripId: string,
): { status: 200; body: DemoBody } {
  return {
    status: 200,
    body: {
      success: true,
      // Soft-deleted rows stop being served, exactly as the API's
      // own list filters them (`getPaymentsByTrip`, `deletedAt IS
      // NULL`). Nothing here asks for deleted rows: there is no
      // Deleted-items view.
      payments: (store.payments.get(tripId) ?? []).filter(
        (payment) => payment.deletedAt === null,
      ),
    },
  };
}

/**
 * The trip's simplified moves, as `GET /trips/:id/balances` serves them.
 */
export function listBalances(
  store: DemoStore,
  tripId: string,
): { status: 200; body: DemoBody } {
  // Computed from the expenses on every read, never stored — see
  // `tripBalances`.
  return {
    status: 200,
    body: { success: true, balances: tripBalances(store, tripId) },
  };
}

/**
 * The reader's own position, as `GET /trips/:id/balances/me` serves it.
 */
export function myBalance(
  store: DemoStore,
  tripId: string,
): { status: 200 | 404; body: DemoBody } {
  const viewer = viewerRowOf(store, tripId);
  // The server fails closed here (403: only a trip's members may
  // read its money) and deliberately never falls back to zeros — a
  // 200 with an empty ledger reads as "you owe nothing". Every demo
  // trip carries the viewer's row, so this is the same shape the
  // sibling RSVP handler answers for a viewer who is not on the
  // trip.
  if (!viewer) return notFound("Viewer is not on this trip");
  return {
    status: 200,
    body: {
      success: true,
      ...myBalanceOf(tripBalances(store, tripId), viewer.id),
    },
  };
}

/**
 * A new expense, as `POST /trips/:id/payments` serves it.
 *
 * The split arrives as one of the two things the wire allows: a scope the
 * server resolves, or a fixed list. A scope is resolved here against the
 * demo store's own members (`splitMemberIdsFor`) and the row stores the
 * **resolved snapshot**, with the scope it was resolved by beside it — the
 * demo's roster never moves, so a snapshot and a rule are the same thing
 * on this surface, and a read needs no resolver.
 */
export function createPayment(
  store: DemoStore,
  tripId: string,
  body: DemoBody,
): { status: 201; body: DemoBody } {
  store.counters.payment += 1;
  const roster = rosterOf(store, tripId);
  const nameOf = (memberId: string) => nameOfMember(roster, memberId);
  const payerMemberId =
    typeof body.payerMemberId === "string"
      ? body.payerMemberId
      : DEMO_VIEWER_MEMBER_ID;
  const amount =
    typeof body.amount === "number" && Number.isInteger(body.amount)
      ? body.amount
      : 0;
  // No scope in the body is the column's own default, exactly as the
  // server's create would store it (`split_scope` defaults to `custom`).
  const scope = splitScopeOf(body.splitScope) ?? "custom";
  const row: Payment = {
    id: `demo-payment-created-${store.counters.payment}`,
    tripId,
    description:
      typeof body.description === "string"
        ? body.description
        : "Untitled expense",
    // "" is the form's clearing value and the server stores it as
    // null; an absent note stays absent.
    note:
      typeof body.note === "string" && body.note !== "" ? body.note : null,
    amount,
    splitScope: scope,
    payerMemberId,
    payerName: nameOf(payerMemberId),
    date: (typeof body.date === "string"
      ? body.date
      : nowIso()) as unknown as Date,
    // The viewer filed it, which is what the detail's Edit predicate
    // reads — `createdBy` is a **user** id, and this is the demo
    // session's own (`DEMO_AUTH_USER.id`).
    createdBy: "demo-viewer",
    participants: [],
    deletedAt: null,
    deletedBy: null,
    createdAt: nowIso() as unknown as Date,
    updatedAt: nowIso() as unknown as Date,
  };
  // The shares are the server's rule, over the participants in the
  // order they arrived — that order is what hands the remainder
  // cents out, and the form sent it for exactly this reason. A scoped
  // create has no order of its own: the rule decides it
  // (`splitMemberIdsFor`).
  setParticipants(
    row,
    splitMemberIdsFor(scope, body, roster, amount),
    nameOf,
  );
  store.payments.get(tripId)?.push(row);
  return { status: 201, body: { success: true, payment: row } };
}

/**
 * An edit of one stored expense, as `PUT /payments/:id` serves it. The
 * row has already been resolved (`paymentRowById`), so this is only the
 * mutation.
 */
export function updatePayment(
  store: DemoStore,
  row: Payment,
  body: DemoBody,
): { status: 200; body: DemoBody } {
  const roster = rosterOf(store, row.tripId);
  const nameOf = (memberId: string) => nameOfMember(roster, memberId);

  if (typeof body.description === "string") {
    row.description = body.description;
  }
  if (typeof body.date === "string") {
    row.date = body.date as unknown as Date;
  }
  // "" clears the note (the server stores it as null); `null` itself
  // is a 400 on the real update schema, so a non-string is ignored.
  if (typeof body.note === "string") {
    row.note = body.note === "" ? null : body.note;
  }
  if (typeof body.amount === "number" && Number.isInteger(body.amount)) {
    row.amount = body.amount;
  }
  if (typeof body.payerMemberId === "string") {
    row.payerMemberId = body.payerMemberId;
    row.payerName = nameOf(body.payerMemberId);
  }
  row.updatedAt = nowIso() as unknown as Date;

  // The shares follow the amount, exactly as the server recomputes
  // them, and a scope in the body re-resolves the split: a rule is
  // resolved against the trip's roster and replaces the stored rows
  // with the snapshot it names (`splitMemberIdsFor`), while `custom` —
  // or no scope at all — leaves the participants branch below to say
  // what the rows are. The order is load-bearing for a list, and it is
  // the resolver's for a rule.
  const scope = splitScopeOf(body.splitScope);
  if (scope === "all_going" || scope === "all_invited") {
    row.splitScope = scope;
    setParticipants(
      row,
      splitMemberIdsFor(scope, body, roster, row.amount),
      nameOf,
    );
  } else {
    if (scope === "custom") {
      row.splitScope = "custom";
    }
    if (Array.isArray(body.participants)) {
      setParticipants(row, memberIdsFrom(body.participants), nameOf);
    } else if (typeof body.amount === "number") {
      setParticipants(
        row,
        row.participants.map((participant) => participant.memberId),
        nameOf,
      );
    }
  }
  return { status: 200, body: { success: true, payment: row } };
}

/**
 * A soft delete of one stored expense, as `DELETE /payments/:id` serves
 * it.
 *
 * Soft, as the API's is: the row keeps its place and stops being served,
 * which is what moves the balances — the net and the moves are recomputed
 * from the rows that are still there.
 */
export function deletePayment(row: Payment): { status: 204; body: DemoBody } {
  row.deletedAt = nowIso() as unknown as Date;
  row.deletedBy = "demo-viewer";
  return { status: 204, body: { success: true } };
}
