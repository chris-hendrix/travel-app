import { describe, expect, it } from "vitest";
import {
  SCOPE_LABEL,
  emptyScopeSentence,
  findMove,
  moveFor,
  paymentDay,
  paymentInstant,
  paymentsInOrder,
  positionFor,
  previewShares,
  type BalanceMove,
  type Payment,
} from "@/lib/payments";
import { formatDay } from "@/lib/dateRange";
import { zoneOffsetMinutes } from "@/lib/timezone";
import { SPLIT_SCOPES } from "@journiful/shared/utils";

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "payment-1",
    tripId: "trip-1",
    description: "Dinner",
    note: null,
    amount: 10000,
    splitScope: "custom",
    payerMemberId: "member-1",
    payerName: "Ava",
    date: "2026-10-11T10:00:00.000Z",
    createdBy: "user-1",
    participants: [],
    createdAt: "2026-10-11T10:00:00.000Z",
    ...overrides,
  };
}

describe("paymentsInOrder", () => {
  it("puts the newest day first", () => {
    const older = makePayment({ id: "older", date: "2026-10-09T10:00:00.000Z" });
    const newer = makePayment({ id: "newer", date: "2026-10-11T10:00:00.000Z" });
    const middle = makePayment({ id: "middle", date: "2026-10-10T10:00:00.000Z" });

    expect(paymentsInOrder([older, newer, middle]).map((p) => p.id)).toEqual([
      "newer",
      "middle",
      "older",
    ]);
  });

  it("breaks a same-day tie by createdAt, newest first", () => {
    const first = makePayment({
      id: "first",
      date: "2026-10-11T10:00:00.000Z",
      createdAt: "2026-10-11T10:00:00.000Z",
    });
    const second = makePayment({
      id: "second",
      date: "2026-10-11T10:00:00.000Z",
      createdAt: "2026-10-11T18:00:00.000Z",
    });

    expect(paymentsInOrder([first, second]).map((p) => p.id)).toEqual([
      "second",
      "first",
    ]);
  });

  it("is a total order, so identical rows do not swap between renders", () => {
    const a = makePayment({ id: "a" });
    const b = makePayment({ id: "b" });

    expect(paymentsInOrder([a, b]).map((p) => p.id)).toEqual(["b", "a"]);
    expect(paymentsInOrder([b, a]).map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("does not mutate the array it was given", () => {
    const input = [
      makePayment({ id: "older", date: "2026-10-09T10:00:00.000Z" }),
      makePayment({ id: "newer", date: "2026-10-11T10:00:00.000Z" }),
    ];

    paymentsInOrder(input);

    expect(input.map((p) => p.id)).toEqual(["older", "newer"]);
  });

  it("returns nothing for nothing", () => {
    expect(paymentsInOrder([])).toEqual([]);
  });
});

/** A stored row whose people are `memberIds`, in that order. */
function shared(
  overrides: Partial<Payment> & { id: string },
  memberIds: string[],
): Payment {
  return makePayment({
    ...overrides,
    participants: memberIds.map((memberId) => ({
      memberId,
      name: memberId,
      // Never read by the preview: a share is the trip's spread, not the
      // number a stored row carries.
      shareAmount: 0,
    })),
  });
}

const FOUR = ["m-1", "m-2", "m-3", "m-4"];
const DAY = "2026-10-27T12:00:00.000Z";

describe("previewShares", () => {
  it("prices a first cost exactly as the server divides it", () => {
    expect(
      previewShares([], { amount: 100, participantIds: ["a", "b", "c"] }),
    ).toEqual([
      { memberId: "a", shareAmount: 34 },
      { memberId: "b", shareAmount: 33 },
      { memberId: "c", shareAmount: 33 },
    ]);
  });

  it("gives everything to a single participant", () => {
    expect(
      previewShares([], { amount: 100, participantIds: ["a"] }),
    ).toEqual([{ memberId: "a", shareAmount: 100 }]);
  });

  it("answers nothing for an empty split", () => {
    expect(
      previewShares([], { amount: 100, participantIds: [] }),
    ).toEqual([]);
  });

  it("always sums back to the amount, whatever the draft and the trip", () => {
    const trip = [
      shared({ id: "p1", amount: 2800 }, FOUR),
      shared({ id: "p2", amount: 7650 }, FOUR),
      shared({ id: "p3", amount: 4011 }, FOUR),
    ];

    for (const amount of [1, 2, 100, 10001, 12442, 99999]) {
      for (const count of [1, 2, 3, 4]) {
        const participantIds = FOUR.slice(0, count);
        const shares = previewShares(trip, { amount, participantIds });
        expect(shares.reduce((sum, share) => sum + share.shareAmount, 0)).toBe(
          amount,
        );
        expect(shares.map((share) => share.memberId)).toEqual(participantIds);
      }
    }
  });

  it("gives the leftover cent to whoever is behind, not to the same seat", () => {
    // One cent among four, three times. The server's spread hands each of the
    // first three costs to a different person, so the fourth cost is m-4's —
    // and every one of them ends up a cent.
    const trip = ["a", "b", "c"].map((id) =>
      shared({ id, amount: 1 }, FOUR),
    );

    const first = previewShares([], {
      amount: 1,
      participantIds: FOUR,
    });
    expect(first.filter((share) => share.shareAmount === 1)).toHaveLength(1);
    expect(first[0]).toEqual({ memberId: "m-1", shareAmount: 1 });

    const fourth = previewShares(trip, {
      amount: 1,
      participantIds: FOUR,
    });
    expect(fourth[3]).toEqual({ memberId: "m-4", shareAmount: 1 });
    expect(fourth.reduce((sum, share) => sum + share.shareAmount, 0)).toBe(1);
  });

  it("takes a draft out of the trip it is editing instead of adding it", () => {
    const first = shared({ id: "p1", amount: 1000 }, FOUR);

    // Editing p1 without changing anything previews p1's own shares: the
    // draft replaces its row rather than becoming a second $10 cost.
    const edit = previewShares([first], {
      id: "p1",
      createdAt: first.createdAt,
      amount: 1000,
      participantIds: FOUR,
    });
    expect(edit.map((share) => share.shareAmount)).toEqual([250, 250, 250, 250]);

    // A *new* $10 cost on top of it is a different question, and the answer
    // is still even: the second cost's leftover cents go to the people who
    // do not have one yet.
    const added = previewShares([first], {
      amount: 1000,
      participantIds: FOUR,
    });
    expect(added.map((share) => share.shareAmount)).toEqual([250, 250, 250, 250]);
  });

  it("spots the leftover cents to the people behind on an odd trip", () => {
    const trip = [shared({ id: "p1", amount: 1000 }, FOUR)];

    // $10.10 more, four ways: 252.5 each. The two people who are nearest that
    // get the odd cents, so nobody drifts.
    const added = previewShares(trip, {
      amount: 1010,
      participantIds: FOUR,
    });
    expect(added.map((share) => share.shareAmount).sort()).toEqual([
      252, 252, 253, 253,
    ]);
  });

  it("spreads a new cost after the rows already on its day", () => {
    // A draft's `createdAt` sorts after every stored row on the same day,
    // which is where the server's own insert lands — so the preview of a
    // same-day expense is the row the reader gets back.
    const sameDay = shared(
      { id: "p1", amount: 1000, date: DAY, createdAt: DAY },
      FOUR,
    );

    expect(
      previewShares([sameDay], {
        amount: 1000,
        participantIds: FOUR,
      }).map((share) => share.shareAmount),
    ).toEqual([250, 250, 250, 250]);
  });
});

describe("paymentInstant", () => {
  it("stamps a day so the ledger reads the same day back", () => {
    for (const timeZone of ["UTC", "America/Los_Angeles", "Pacific/Auckland"]) {
      for (const day of ["2026-10-27", "2026-01-01", "2026-12-31"]) {
        const payment = makePayment({
          date: paymentInstant(day, timeZone),
        });
        expect(paymentDay(payment, timeZone)).toBe(day);
      }
    }
  });
});

describe("SCOPE_LABEL", () => {
  it("names the three scopes, in the words the form shows", () => {
    expect(SCOPE_LABEL).toEqual({
      custom: "Choose people",
      all_going: "Everyone going",
      all_invited: "Everyone invited",
    });
  });

  it("labels every scope there is", () => {
    for (const scope of SPLIT_SCOPES) {
      expect(SCOPE_LABEL[scope].length).toBeGreaterThan(0);
    }
  });
});

describe("emptyScopeSentence", () => {
  it("says what the rule came back with, one noun per rule", () => {
    // The form draws this where the rows would be, so it is the only thing
    // saying why the save will refuse. `Everyone going` waits on an answer,
    // `Everyone invited` on a roster.
    expect(emptyScopeSentence("all_going")).toBe(
      "Nobody is going yet, so there is no one to share it with.",
    );
    expect(emptyScopeSentence("all_invited")).toBe(
      "Nobody is on the trip yet, so there is no one to share it with.",
    );
  });

  it("reads as the app's copy: no em dash, and it ends in a full stop", () => {
    // `apps/mobile/AGENTS.md` bans em dashes in copy, and a sentence the
    // reader meets mid-form rather than as a title still ends.
    for (const scope of SPLIT_SCOPES) {
      const sentence = emptyScopeSentence(scope);
      expect(sentence).not.toContain("—");
      expect(sentence.endsWith(".")).toBe(true);
    }
  });
});

describe("paymentDay", () => {
  /** The form's own rule (`lib/newStay.ts`'s `stamp`): a day is
   *  noon-anchored in the zone it will be read back in. */
  function noonIn(day: string, timeZone: string): string {
    const offsetMinutes = zoneOffsetMinutes(timeZone, `${day}T12:00:00.000Z`);
    const [year, month, date] = day.split("-").map(Number) as [
      number,
      number,
      number,
    ];
    return new Date(
      Date.UTC(year, month - 1, date, 12, 0) - offsetMinutes * 60_000,
    ).toISOString();
  }

  it("reads a day back in the zone it was stamped in, east of UTC", () => {
    const day = "2026-10-11";
    const payment = makePayment({ date: noonIn(day, "Europe/Rome") });

    expect(paymentDay(payment, "Europe/Rome")).toBe(day);
  });

  it("reads a day back in the zone it was stamped in, west of UTC", () => {
    const day = "2026-10-11";
    const payment = makePayment({ date: noonIn(day, "America/Los_Angeles") });

    expect(paymentDay(payment, "America/Los_Angeles")).toBe(day);
  });

  it("round-trips a day in either zone, including a month boundary", () => {
    for (const timeZone of ["Europe/Rome", "America/Los_Angeles", "UTC"]) {
      for (const day of ["2026-01-01", "2026-06-30", "2026-10-11", "2026-12-31"]) {
        const payment = makePayment({ date: noonIn(day, timeZone) });
        expect(paymentDay(payment, timeZone)).toBe(day);
      }
    }
  });

  it("reads in the device's zone when the trip names none", () => {
    const payment = makePayment({ date: noonIn("2026-10-11", "UTC") });

    expect(paymentDay(payment, null)).toBe("2026-10-11");
  });

  // The ledger's row does not print the raw day: it prints
  // `formatDay(paymentDay(payment, timeZone))`, which is the day the
  // reader sees and the only thing the discrepancy between the two zones
  // could move. Pinned as a pair because the row is the pair.
  it("prints the day the ledger's row shows, in the zone it was stamped in", () => {
    const payment = makePayment({ date: noonIn("2026-10-11", "Europe/Rome") });

    expect(formatDay(paymentDay(payment, "Europe/Rome"))).toBe("Sun Oct 11");
  });

  it("prints the same day in the other zone, and the same one at a month boundary", () => {
    for (const timeZone of ["Europe/Rome", "America/Los_Angeles"]) {
      const payment = makePayment({ date: noonIn("2026-06-30", timeZone) });

      expect(formatDay(paymentDay(payment, timeZone))).toBe("Tue Jun 30");
    }
  });
});

describe("positionFor", () => {
  it("says a settled trip is settled rather than printing zero", () => {
    expect(positionFor(0)).toBe("You are settled up");
  });

  it("answers for money owed to the reader", () => {
    expect(positionFor(4500)).toBe("You are owed $45.00");
  });

  it("answers for money the reader owes", () => {
    expect(positionFor(-4500)).toBe("You owe $45.00");
  });

  // The headline is a string the sheet renders straight, cents and all, so
  // the pennies and the thousands separator are the sheet's own copy.
  it("carries the cents and the separators of the amount it prints", () => {
    expect(positionFor(4550)).toBe("You are owed $45.50");
    expect(positionFor(-123456789)).toBe("You owe $1,234,567.89");
  });
});

describe("findMove", () => {
  const moves: BalanceMove[] = [
    {
      from: { id: "member-1", name: "Ava" },
      to: { id: "member-2", name: "Priya" },
      amount: 4500,
    },
    {
      from: { id: "member-2", name: "Priya" },
      to: { id: "guest-1", name: "Mom" },
      amount: 1000,
    },
  ];

  it("finds the move a settle-up link points at", () => {
    expect(findMove(moves, "member-1", "member-2")).toEqual(moves[0]);
  });

  it("answers null when the ledger no longer has that move", () => {
    expect(findMove(moves, "member-1", "guest-1")).toBeNull();
  });

  it("does not match a move backwards", () => {
    // The direction is the debt's, and a link that swaps the ends names a
    // move that does not exist — reading it the other way would offer to
    // record the opposite payment.
    expect(findMove(moves, "member-2", "member-1")).toBeNull();
  });

  it("answers null when the link named only one end", () => {
    expect(findMove(moves, "member-1", null)).toBeNull();
    expect(findMove(moves, null, "member-2")).toBeNull();
    expect(findMove(moves, null, null)).toBeNull();
  });

  it("answers null for an empty ledger", () => {
    expect(findMove([], "member-1", "member-2")).toBeNull();
  });
});

describe("moveFor", () => {
  const move: BalanceMove = {
    from: { id: "member-1", name: "Ava" },
    to: { id: "member-2", name: "Priya" },
    amount: 4500,
  };

  it("substitutes the reader's own member id for 'You' as the payer", () => {
    expect(moveFor(move, "member-1")).toBe("You owe Priya $45.00");
  });

  it("substitutes the reader's own member id for 'you' as the payee", () => {
    expect(moveFor(move, "member-2")).toBe("Ava owes you $45.00");
  });

  it("names both people when the reader is neither", () => {
    expect(moveFor(move, "member-3")).toBe("Ava owes Priya $45.00");
  });

  it("names a guest as the counterparty, because a guest is a person here", () => {
    const toGuest: BalanceMove = {
      from: { id: "member-1", name: "Ava" },
      to: { id: "guest-1", name: "Mom" },
      amount: 4500,
    };

    expect(moveFor(toGuest, "member-1")).toBe("You owe Mom $45.00");
  });

  it("reads a guest the reader is not part of as one person among two", () => {
    const fromGuest: BalanceMove = {
      from: { id: "guest-1", name: "Mom" },
      to: { id: "member-2", name: "Priya" },
      amount: 4550,
    };

    expect(moveFor(fromGuest, "member-1")).toBe("Mom owes Priya $45.50");
  });

  it("prints the whole amount, separators and cents included", () => {
    const big: BalanceMove = {
      from: { id: "member-1", name: "Ava" },
      to: { id: "member-2", name: "Priya" },
      amount: 123456789,
    };

    expect(moveFor(big, "member-1")).toBe("You owe Priya $1,234,567.89");
  });
});
