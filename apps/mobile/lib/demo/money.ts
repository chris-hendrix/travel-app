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
import {
  myBalanceOf,
  nameOfMember,
  participantRow,
  rosterOf,
  rowAsRead,
  rowsAsRead,
  tripBalances,
} from "@/lib/demo/ledger";
import type { SplitScope } from "@/lib/payments";
import type { MemberWithProfile, Payment } from "@journiful/shared/types";

/*
 * The fixture half: what a trip's ledger states, and nothing more.
 */

/**
 * One expense in a trip's ledger, in the fixture's own shorthand.
 *
 * The shares are deliberately **not** written down here: a share is the
 * trip's spread (`shared/utils/split.ts:spreadShares`, the rule
 * `payment-split.ts` runs on the server), and `rowsAsRead` below applies it
 * over the whole trip when the ledger is read. So a fixture row cannot state
 * shares that disagree with its own amount, and every balance the demo serves
 * is arithmetic over these rows rather than a number written beside them.
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
   * Everyone splitting it, as **member** ids. Not a share list and not an
   * order that decides one: the cents are spread over the trip on every read
   * (`shared/utils/split.ts:spreadShares`), so this states who and nothing
   * about how much.
   *
   * Empty on a scoped row, and that is not an omission: a rule's people
   * are the roster's, resolved on every read (`rowAsRead`), so a fixture
   * that stated them would be the snapshot this file exists to avoid.
   * Only `custom` rows state a list, because a fixed list **is** the
   * split.
   */
  participants: string[];
  /**
   * How the cost is shared. `custom` (the column's own default) means the
   * list above is the split; a rule means the roster resolves it, today
   * and on every read after.
   */
  splitScope: SplitScope;
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
  /** The rule, for a row whose people are the roster's (`DemoPayment`). */
  splitScope: SplitScope = "custom",
): DemoPayment {
  return {
    id,
    description,
    note,
    amount,
    payerMemberId,
    participants,
    splitScope,
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
 * One row is shared by a **rule** rather than by a list (the boat), which
 * is the row that shows the demo resolving a scope against the roster
 * instead of reading back a snapshot — see the row itself.
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
      // The one row that is a **rule** rather than a list: `all_going` is
      // resolved against the roster on every read, so this row states the
      // scope and no people at all. It is what the demo shows when it
      // shows a split that follows the roster — Nina the guest is on it
      // although she was seeded after the fact, and Marco (still deciding)
      // is not, which is the difference between a rule and a snapshot in
      // one row. $480.00 across four is $120.00 each, the same shares the
      // fixed list it replaced gave out, so what moved is who and not how
      // much.
      [],
      sunday,
      userIdOf("demo-sam"),
      "all_going",
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
 * One stored expense: the API's entity, with the names resolved off the
 * roster and the shares **computed**, never written down.
 *
 * The shares are **not** written here: a share is the trip's spread, not the
 * row's division (`shared/utils/split.ts:spreadShares`), so it is computed when
 * the trip is read (`rowsAsRead`) exactly as `payment-split.ts` computes it on
 * the server. A fixture row can therefore only state the payer, the people and
 * the total, which is all the product stores either.
 */
function paymentRow(
  tripId: string,
  plan: DemoPayment,
  nameOf: (memberId: string) => string,
): Payment {
  return {
    id: plan.id,
    tripId,
    description: plan.description,
    note: plan.note,
    amount: plan.amount,
    splitScope: plan.splitScope,
    // `payerMemberId` and every `participants[].memberId` are **member**
    // ids, while `createdBy` is a **user** id (`userIdOf` in the fixture).
    // The two spaces are never compared to each other.
    payerMemberId: plan.payerMemberId,
    payerName: nameOf(plan.payerMemberId),
    date: plan.date as unknown as Date,
    createdBy: plan.createdBy,
    // A scoped row stores no people: the roster resolves them on the way
    // out (`rowAsRead`), which is what keeps a rule a rule.
    participants:
      plan.splitScope === "custom"
        ? plan.participants.map((memberId, index) =>
            // A placeholder amount: the read replaces it with the trip's
            // spread (`rowsAsRead`), and nothing serves this row directly.
            participantRow(plan.id, memberId, 0, nameOf, index),
          )
        : [],
    createdAt: nowIso() as unknown as Date,
    updatedAt: nowIso() as unknown as Date,
  };
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
 * Replace a row's participants — the server's own update path, which deletes
 * the rows and writes the new list. There is no share to recompute: the shares
 * are the trip's spread, computed on the way out (`rowsAsRead`), so changing
 * the list changes them by being a different list.
 *
 * **Custom rows only.** A scoped row stores no people at all: the roster
 * resolves them when the row is read, so there is nothing here to write and
 * nothing to go stale.
 */
function setParticipants(
  row: Payment,
  memberIds: string[],
  nameOf: (memberId: string) => string,
): void {
  row.participants = memberIds.map((memberId, index) =>
    participantRow(row.id, memberId, 0, nameOf, index),
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
 * The stored expense an id addresses, or `null` when no row carries that id.
 *
 * A deleted row is not a row: settle hard-deletes, so there is no mark to
 * read past and a second delete is a 404 because the row is gone.
 *
 * The dispatcher resolves the row before it reads the verb, exactly as
 * the route always did, so an id nothing addresses answers the same 404
 * whatever the method is.
 */
export function paymentRowById(store: DemoStore, id: string): Payment | null {
  return findRowAnywhere(store.payments, id)?.row ?? null;
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
      // Every stored row is served, because settle hard-deletes: a deleted
      // expense is not hidden here, it is gone. And the trip is resolved as it
      // is served (`rowsAsRead`): a scoped expense's people are the roster's
      // now, and the leftover cents are spread over the whole trip, which is
      // what the detail sheet's split block and the ledger both read.
      payments: rowsAsRead(store, tripId),
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
 * server resolves, or a fixed list. A scope is stored **as a scope** and
 * no people at all — the roster resolves it on the way out of every read
 * (`rowAsRead`), exactly as the API's `split_scope` column works — so the
 * demo can never disagree with the product about who shares a cost. A
 * fixed list is the rows themselves; what each person owes is the trip's
 * spread, computed when the trip is read.
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
    createdAt: nowIso() as unknown as Date,
    updatedAt: nowIso() as unknown as Date,
  };
  // The shares are the server's rule, over the participants in the
  // order they arrived — that order is what hands the remainder
  // cents out, and the form sent it for exactly this reason. A scoped
  // create stores no people at all: the read resolves them.
  if (scope === "custom") {
    setParticipants(row, memberIdsFrom(body.participants), nameOf);
  }
  store.payments.get(tripId)?.push(row);
  return { status: 201, body: { success: true, payment: rowAsRead(store, row) } };
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

  // The split a body names, and only that. A **rule** is stored as a rule:
  // the row keeps the scope and drops every stored person, because the
  // roster is what resolves it (`rowAsRead`) — a row that kept the people
  // a rule used to name would go stale on the next RSVP. `custom` is the
  // opposite: the rows are the split, so a list in the body replaces them
  // and a bare amount repriced the ones already there. No scope at all
  // leaves the row's own mode alone; a scoped row's shares are recomputed
  // on the read either way, because they follow the amount.
  const scope = splitScopeOf(body.splitScope);
  if (scope === "all_going" || scope === "all_invited") {
    row.splitScope = scope;
    row.participants = [];
  } else {
    if (scope === "custom") {
      row.splitScope = "custom";
    }
    if (row.splitScope === "custom") {
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
  }
  return { status: 200, body: { success: true, payment: rowAsRead(store, row) } };
}

/**
 * A delete of one stored expense, as `DELETE /payments/:id` serves it.
 *
 * A real removal, as the API's is (`0059`): the row leaves the list, which is
 * what moves the balances and the moves — both are recomputed from the rows
 * that are still there.
 */
export function deletePayment(
  store: DemoStore,
  row: Payment,
): { status: 204; body: DemoBody } {
  const found = findRowAnywhere(store.payments, row.id);
  if (found) {
    const index = found.list.indexOf(found.row);
    if (index >= 0) found.list.splice(index, 1);
  }
  return { status: 204, body: { success: true } };
}
