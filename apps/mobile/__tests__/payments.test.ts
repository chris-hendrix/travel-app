import { describe, expect, it } from "vitest";
import {
  moveFor,
  paymentDay,
  paymentsInOrder,
  positionFor,
  splitPreview,
  type BalanceMove,
  type Payment,
} from "@/lib/payments";
import { zoneOffsetMinutes } from "@/lib/timezone";

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "payment-1",
    tripId: "trip-1",
    description: "Dinner",
    note: null,
    amount: 10000,
    payerMemberId: "member-1",
    payerName: "Ava",
    date: "2026-10-11T10:00:00.000Z",
    createdBy: "user-1",
    participants: [],
    createdAt: "2026-10-11T10:00:00.000Z",
    deletedAt: null,
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

describe("splitPreview", () => {
  it("gives the remainder cents to the first id in the array", () => {
    expect(splitPreview(100, ["a", "b", "c"])).toEqual([34, 33, 33]);
  });

  it("gives everything to a single participant", () => {
    expect(splitPreview(100, ["a"])).toEqual([100]);
  });

  it("answers nothing for an empty split", () => {
    expect(splitPreview(100, [])).toEqual([]);
  });

  it("always sums back to the amount, whatever the split", () => {
    for (const amount of [1, 2, 100, 10001, 99999]) {
      for (const count of [1, 2, 3, 7]) {
        const ids = Array.from({ length: count }, (_, i) => `m${i}`);
        const shares = splitPreview(amount, ids);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(amount);
      }
    }
  });

  it("moves the remainder with the order, since the order is what is sent", () => {
    expect(splitPreview(100, ["c", "b", "a"])).toEqual([34, 33, 33]);
    expect(splitPreview(101, ["c", "b", "a"])[0]).toBe(35);
    expect(splitPreview(101, ["a", "b", "c"])[0]).toBe(35);
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
});
