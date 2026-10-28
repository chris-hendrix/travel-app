// Tests for the split-scope rule (`shared/utils/split.ts`)

import { describe, it, expect } from "vitest";
import {
  SPLIT_SCOPES,
  equalShares,
  ledgerOrder,
  scopeMemberIds,
  spreadShares,
  withPayerFallback,
} from "../utils/split";
import type { LedgerOrderable, LedgerStep, SplitMember } from "../utils/split";

/**
 * One roster row: the id the scope sorts by, the RSVP status, and whether a
 * user account is behind it. A guest row has no user — which is exactly the
 * clause "everyone going" leans on, because a guest never answers an RSVP.
 */
function member(
  id: string,
  status: SplitMember["status"],
  userId: string | null = `user-${id}`,
): SplitMember {
  return { id, status, userId };
}

/**
 * A roster in deliberately scrambled id order, so a scope that returned its
 * input order would fail rather than pass by luck.
 */
const roster: SplitMember[] = [
  member("m-3", "going"),
  member("m-1", "maybe"),
  member("m-5", "no_response"),
  member("m-2", "not_going"),
  member("m-4", "going"),
  // A guest: no account, and the column default is `no_response`.
  member("m-6", "no_response", null),
];

describe("SPLIT_SCOPES", () => {
  it("names the three values, `custom` first", () => {
    expect(SPLIT_SCOPES).toEqual(["custom", "all_going", "all_invited"]);
  });
});

describe("scopeMemberIds", () => {
  it("resolves `all_going` to everyone who has not declined", () => {
    // m-2 said no and m-2 is the only one out. `maybe` (m-1), silence (m-5)
    // and the guest (m-6) are all still in: the split follows the roster, and
    // a rule that waited for an answer would leave a newly added person out of
    // a cost they are already sharing.
    expect(scopeMemberIds("all_going", roster)).toEqual([
      "m-1",
      "m-3",
      "m-4",
      "m-5",
      "m-6",
    ]);
  });

  it("includes a guest whatever status it holds: the guest clause is the rule", () => {
    // D2 reads `status = 'going' OR user_id IS NULL`, so an organizer's mark
    // on a guest does not take them out of "everyone going" — a guest was
    // invited to share the house, and the scope is "going, including
    // guests" rather than "guests who RSVP'd".
    const guests: SplitMember[] = [
      { id: "g-1", status: "not_going", userId: null },
      { id: "g-2", status: "no_response", userId: null },
      { id: "g-3", status: "going", userId: null },
    ];

    expect(scopeMemberIds("all_going", guests)).toEqual(["g-1", "g-2", "g-3"]);
  });

  it("resolves `all_invited` to the whole roster, declines included", () => {
    expect(scopeMemberIds("all_invited", roster)).toEqual([
      "m-1",
      "m-2",
      "m-3",
      "m-4",
      "m-5",
      "m-6",
    ]);
  });

  it("sorts both scopes by member id, whatever order the rows arrive in", () => {
    const scrambled = [...roster].reverse();

    expect(scopeMemberIds("all_going", scrambled)).toEqual([
      "m-1",
      "m-3",
      "m-4",
      "m-5",
      "m-6",
    ]);
    expect(scopeMemberIds("all_invited", scrambled)).toEqual([
      "m-1",
      "m-2",
      "m-3",
      "m-4",
      "m-5",
      "m-6",
    ]);
  });

  it("resolves a custom split to nobody: the list is the participant rows", () => {
    expect(scopeMemberIds("custom", roster)).toEqual([]);
  });

  it("has no answer for an empty roster", () => {
    expect(scopeMemberIds("all_going", [])).toEqual([]);
    expect(scopeMemberIds("all_invited", [])).toEqual([]);
  });

  it("does not mutate the roster it was handed", () => {
    const rows = [member("m-2", "going"), member("m-1", "going")];
    const snapshot = [...rows];

    scopeMemberIds("all_invited", rows);

    expect(rows).toEqual(snapshot);
  });
});

describe("withPayerFallback", () => {
  it("leaves a split that resolves to somebody untouched", () => {
    // The floor only ever shows up where the rule gave nothing: a scope with
    // people in it is the split, in the order it resolved.
    expect(withPayerFallback(["m-3", "m-4"], "m-1")).toEqual(["m-3", "m-4"]);
    expect(withPayerFallback(["m-9"], "m-1")).toEqual(["m-9"]);
  });

  it("reads an empty split as the payer owing the lot", () => {
    // D5. The ledger nets a payment as "the payer paid, each participant owes
    // their share", so nobody owing anything would leave the payer's credit
    // standing and the row unshowable. One person owing it is the floor.
    expect(withPayerFallback([], "m-1")).toEqual(["m-1"]);
  });
});

describe("equalShares", () => {
  it("splits evenly when the amount divides", () => {
    expect(equalShares(300, 3)).toEqual([100, 100, 100]);
    expect(equalShares(100, 1)).toEqual([100]);
  });

  it("gives the remainder cents one each to the first rows, in order", () => {
    expect(equalShares(100, 3)).toEqual([34, 33, 33]);
    // The reading that piles the whole remainder on the first share would
    // say [35, 33, 33]; the server says [34, 34, 33] and the form must too.
    expect(equalShares(10001, 3)).toEqual([3334, 3334, 3333]);
    expect(equalShares(101, 3)).toEqual([34, 34, 33]);
  });

  it("always sums to the amount", () => {
    for (const count of [1, 2, 3, 4, 7, 13]) {
      for (const total of [1, 99, 100, 12345, 10001]) {
        const shares = equalShares(total, count);
        expect(shares).toHaveLength(count);
        expect(shares.reduce((sum, share) => sum + share, 0)).toBe(total);
      }
    }
  });

  it("has no shares for nobody — the floor of one is the caller's job", () => {
    expect(equalShares(100, 0)).toEqual([]);
  });
});

describe("spreadShares", () => {
  /** A trip's costs, in the order the ledger spreads them. */
  const costs = (amounts: number[], participantIds: string[]): LedgerStep[] =>
    amounts.map((amount, index) => ({
      id: `p-${index}`,
      amount,
      participantIds,
    }));

  /** Each member's cents, summed over every cost, keyed by member id. */
  const totalsOf = (steps: LedgerStep[]): Record<string, number> => {
    const sums: Record<string, number> = {};
    for (const [index, step] of spreadShares(steps).entries()) {
      steps[index]!.participantIds.forEach((memberId, position) => {
        sums[memberId] = (sums[memberId] ?? 0) + step.shares[position]!;
      });
    }
    return sums;
  };

  it("rounds a single cost the way largest-remainder rounds it", () => {
    // No history to spread, so this is the plain rule: the integer division
    // each, and the leftover cents one apiece. The multiset is what is fixed —
    // which of them carries a cent follows member id, since a bare trip has
    // nothing else to order by.
    const cases: [number, number, number[]][] = [
      [100, 3, [33, 33, 34]],
      [10001, 3, [3333, 3334, 3334]],
      [101, 3, [33, 34, 34]],
      [100, 1, [100]],
      [7, 7, [1, 1, 1, 1, 1, 1, 1]],
    ];
    for (const [amount, count, expected] of cases) {
      const ids = Array.from({ length: count }, (_, i) => `m-${i}`);
      const [step] = spreadShares([{ id: "p", amount, participantIds: ids }]);
      expect([...step!.shares].sort((a, b) => a - b)).toEqual(expected);
      expect(step!.shares.reduce((sum, share) => sum + share, 0)).toBe(amount);
    }
  });

  it("sums every cost to its amount, whatever the trip looks like", () => {
    const random = mulberry32(20260810);
    for (let trial = 0; trial < 200; trial++) {
      const roster = Array.from(
        { length: 2 + Math.floor(random() * 5) },
        (_, i) => `m-${i}`,
      );
      const steps: LedgerStep[] = Array.from(
        { length: 1 + Math.floor(random() * 20) },
        (_, index) => ({
          id: `p-${index}`,
          amount: 1 + Math.floor(random() * 20000),
          participantIds: shuffle(roster, random).slice(
            0,
            1 + Math.floor(random() * roster.length),
          ),
        }),
      );

      for (const [index, step] of spreadShares(steps).entries()) {
        expect(step.shares).toHaveLength(
          steps[index]!.participantIds.length,
        );
        expect(step.shares.reduce((sum, share) => sum + share, 0)).toBe(
          steps[index]!.amount,
        );
        // Integer cents, always — a fractional share would put a half-cent in
        // a ledger that only knows how to add integers.
        for (const share of step.shares) expect(Number.isInteger(share)).toBe(true);
      }
    }
  });

  it("gives the reported trip a one-cent spread instead of three", () => {
    // The trip behind the bug report: four people on every cost, and every
    // cost paid by one of them. Rounding each cost on its own gave the other
    // three `67.27 / 67.25 / 67.24` — three cents apart, and always the same
    // people on the wrong end of it.
    const steps = costs(
      [2800, 7650, 4011, 12442],
      ["m-1", "m-2", "m-3", "m-4"],
    );
    const totals = totalsOf(steps);

    expect(Object.values(totals).sort()).toEqual([6725, 6726, 6726, 6726]);
    expect(Math.max(...Object.values(totals))).toBe(6726);
    expect(Math.min(...Object.values(totals))).toBe(6725);
    // The exact share is 6725.75 each; every total is within a cent of it.
    for (const total of Object.values(totals)) {
      expect(Math.abs(total - 6725.75)).toBeLessThanOrEqual(1);
    }
  });

  it("does not hand every stray cent to the lowest id", () => {
    // Four one-cent costs among four people. Per-expense rounding gives the
    // first seat all four (`4 / 0 / 0 / 0`); the trip-wide spread gives each
    // person one, which is also the exact answer.
    const totals = totalsOf(costs([1, 1, 1, 1], ["m-1", "m-2", "m-3", "m-4"]));
    expect(Object.values(totals).sort()).toEqual([1, 1, 1, 1]);
  });

  it("keeps everyone within a cent when everyone shares every cost", () => {
    const random = mulberry32(7);
    for (let trial = 0; trial < 300; trial++) {
      const roster = Array.from(
        { length: 2 + Math.floor(random() * 5) },
        (_, i) => `m-${i}`,
      );
      const steps = costs(
        Array.from({ length: 1 + Math.floor(random() * 30) }, () =>
          1 + Math.floor(random() * 20000),
        ),
        roster,
      );
      const totals = totalsOf(steps);
      const total = steps.reduce((sum, step) => sum + step.amount, 0);
      const exact = total / roster.length;

      for (const value of Object.values(totals)) {
        expect(Math.abs(value - exact)).toBeLessThanOrEqual(1);
      }
      // The property a reader can check by eye: two people on the same costs
      // are never more than a cent apart.
      expect(
        Math.max(...Object.values(totals)) - Math.min(...Object.values(totals)),
      ).toBeLessThanOrEqual(1);
    }
  });

  it("leaves the past alone when a cost is appended", () => {
    // The reason `ledgerOrder` sorts by *recorded* order rather than by the day
    // the money went: a row added at the end cannot reach back into the rows
    // before it. This is the property that makes "adding an expense moves my
    // balance by exactly minus my share of it" true, and the property a
    // back-dated receipt depends on.
    const before = [
      { id: "p-1", amount: 2800, createdAt: "2026-10-22T12:00:00.000Z" },
      { id: "p-2", amount: 7650, createdAt: "2026-10-26T12:00:00.000Z" },
      { id: "p-3", amount: 4011, createdAt: "2026-10-26T13:00:00.000Z" },
    ].map((row) => ({ ...row, participantIds: ["m-1", "m-2", "m-3", "m-4"] }));

    // A cost spent a week earlier, recorded now — the back-dated receipt.
    const appended = {
      id: "p-4",
      amount: 12442,
      date: "2026-10-19T12:00:00.000Z",
      createdAt: "2026-10-27T09:00:00.000Z",
      participantIds: ["m-1", "m-2", "m-3", "m-4"],
    };

    const beforeShares = spreadShares(ledgerOrder(before));
    const afterShares = spreadShares(ledgerOrder([...before, appended]));

    // The earlier rows' cents, byte for byte. Not just "still sums right".
    expect(afterShares.slice(0, before.length)).toEqual(beforeShares);
  });

  it("does not depend on the order the people arrive in", () => {
    const random = mulberry32(99);
    const steps = costs(
      [12442, 4011, 7650, 2800, 999, 5001],
      ["m-1", "m-2", "m-3", "m-4"],
    );
    const expected = totalsOf(steps);

    for (let trial = 0; trial < 20; trial++) {
      const shuffled = steps.map((step) => ({
        ...step,
        participantIds: shuffle(step.participantIds, random),
      }));
      expect(totalsOf(shuffled)).toEqual(expected);
    }
  });

  it("is deterministic — the same trip twice is the same cents", () => {
    const steps = costs([777, 888, 999], ["m-3", "m-1", "m-2"]);
    expect(spreadShares(steps)).toEqual(spreadShares(steps));
  });

  it("has no shares for a cost with nobody on it", () => {
    expect(spreadShares([{ id: "p", amount: 100, participantIds: [] }])).toEqual(
      [{ id: "p", shares: [] }],
    );
  });

  it("carries the exact obligation without floating point", () => {
    // Counts whose lcm is large: three, five and seven people. Every share is
    // a third, a fifth and a seventh of a cent at some point, and a float
    // tie-break would settle them by luck.
    const totals = totalsOf([
      { id: "a", amount: 1000003, participantIds: ["m-1", "m-2", "m-3"] },
      { id: "b", amount: 700001, participantIds: ["m-1", "m-2", "m-3", "m-4", "m-5"] },
      {
        id: "c",
        amount: 500009,
        participantIds: ["m-1", "m-2", "m-3", "m-4", "m-5", "m-6", "m-7"],
      },
    ]);

    expect(Object.values(totals).reduce((sum, value) => sum + value, 0)).toBe(
      1000003 + 700001 + 500009,
    );
  });
});

/** The ledger's order (`ledgerOrder`) — oldest first, and total. */
describe("ledgerOrder", () => {
  const row = (id: string, createdAt: string): LedgerOrderable => ({
    id,
    createdAt,
  });

  it("runs in the order the rows were recorded", () => {
    const ordered = ledgerOrder([
      row("c", "2026-10-27T18:00:00.000Z"),
      row("b", "2026-10-26T19:00:00.000Z"),
      row("a", "2026-10-26T18:00:00.000Z"),
      row("d", "2026-10-27T20:00:00.000Z"),
    ]);

    expect(ordered.map((entry) => entry.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("breaks a full tie by id, and leaves the caller's array alone", () => {
    const same = "2026-10-26T12:00:00.000Z";
    const input = [row("b", same), row("a", same)];
    expect(ledgerOrder(input).map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(input.map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});

/** A small seeded PRNG, so a generated trip is the same trip on every run. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A copy shuffled by the caller's generator. */
function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const out = [...values];
  for (let index = out.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [out[index], out[swap]] = [out[swap]!, out[index]!];
  }
  return out;
}
