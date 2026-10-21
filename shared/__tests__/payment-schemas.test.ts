// Tests for the payment schemas' split rule and response shape

import { describe, it, expect } from "vitest";
import {
  createPaymentSchema,
  updatePaymentSchema,
  paymentResponseSchema,
} from "../schemas/index.js";

const payerMemberId = "11111111-1111-4111-8111-111111111111";
const otherMemberId = "22222222-2222-4222-8222-222222222222";

/** The smallest legal custom create: a description, cents, a payer, a list. */
function base() {
  return {
    description: "Dinner",
    amount: 4500,
    payerMemberId,
    participants: [{ memberId: payerMemberId }],
  };
}

describe("createPaymentSchema — the split rule", () => {
  it("accepts a scoped create with no participants at all", () => {
    const parsed = createPaymentSchema.parse({
      description: "Dinner",
      amount: 4500,
      payerMemberId,
      splitScope: "all_going",
    });

    expect(parsed.splitScope).toBe("all_going");
    expect(parsed.participants).toBeUndefined();
  });

  it("accepts `all_invited` the same way", () => {
    expect(() =>
      createPaymentSchema.parse({
        description: "The house",
        amount: 90000,
        payerMemberId,
        splitScope: "all_invited",
      }),
    ).not.toThrow();
  });

  it("accepts a custom create with participants, scope named or absent", () => {
    expect(() => createPaymentSchema.parse(base())).not.toThrow();
    expect(() =>
      createPaymentSchema.parse({
        ...base(),
        participants: [{ memberId: payerMemberId }, { memberId: otherMemberId }],
        splitScope: "custom",
      }),
    ).not.toThrow();
  });

  it("rejects a custom create with no participants", () => {
    // Both ways of saying custom: `custom` is the stored default, so a
    // missing scope is a custom payment and needs its list just the same.
    const { participants: _dropped, ...withoutParticipants } = base();

    expect(() => createPaymentSchema.parse(withoutParticipants)).toThrow();
    expect(() =>
      createPaymentSchema.parse({ ...withoutParticipants, splitScope: "custom" }),
    ).toThrow();
  });

  it("rejects an empty participant list", () => {
    expect(() =>
      createPaymentSchema.parse({ ...base(), participants: [] }),
    ).toThrow();
  });

  it("rejects a scope that also carries participants", () => {
    for (const scope of ["all_going", "all_invited"]) {
      expect(() =>
        createPaymentSchema.parse({ ...base(), splitScope: scope }),
      ).toThrow();
    }
  });

  it("rejects a scope it does not know", () => {
    expect(() =>
      createPaymentSchema.parse({
        ...base(),
        splitScope: "everyone",
        participants: undefined,
      }),
    ).toThrow();
  });
});

describe("updatePaymentSchema — the split rule", () => {
  it("leaves a field at a time alone, split included", () => {
    // An amount-only or note-only edit says nothing about the split, so it
    // must not have to restate it: a scoped or custom row keeps its rule.
    expect(() => updatePaymentSchema.parse({ amount: 5000 })).not.toThrow();
    expect(() =>
      updatePaymentSchema.parse({ note: "Paid by Venmo" }),
    ).not.toThrow();
  });

  it("accepts a list with the scope absent, and a rule with the list absent", () => {
    expect(() =>
      updatePaymentSchema.parse({ participants: [{ memberId: otherMemberId }] }),
    ).not.toThrow();
    expect(() =>
      updatePaymentSchema.parse({ splitScope: "all_going" }),
    ).not.toThrow();
  });

  it("rejects both fields at once, and a bare custom with no list", () => {
    expect(() =>
      updatePaymentSchema.parse({
        splitScope: "all_going",
        participants: [{ memberId: payerMemberId }],
      }),
    ).toThrow();
    expect(() =>
      updatePaymentSchema.parse({ splitScope: "custom" }),
    ).toThrow();
  });
});

describe("paymentResponseSchema — a resolved split", () => {
  /** A payment as the API serializes one, minus whatever a case omits. */
  function payment(overrides: Record<string, unknown> = {}) {
    const date = new Date("2026-10-11T12:00:00Z");
    return {
      success: true as const,
      payment: {
        id: "payment-1",
        tripId: "trip-1",
        description: "Dinner",
        note: null,
        amount: 4500,
        payerMemberId,
        splitScope: "all_going",
        date,
        createdBy: "user-1",
        deletedAt: null,
        deletedBy: null,
        createdAt: date,
        updatedAt: date,
        participants: [
          {
            memberId: payerMemberId,
            shareAmount: 2250,
            name: "You",
          },
          {
            memberId: otherMemberId,
            shareAmount: 2250,
            name: "Guest · Marco",
          },
        ],
        ...overrides,
      },
    };
  }

  it("parses a scoped payment whose participants carry no row id", () => {
    const parsed = paymentResponseSchema.parse(payment());

    expect(parsed.payment.splitScope).toBe("all_going");
    expect(parsed.payment.participants[0]?.memberId).toBe(payerMemberId);
    expect(parsed.payment.participants[0]?.id).toBeUndefined();
    expect(parsed.payment.participants[0]?.paymentId).toBeUndefined();
    expect(parsed.payment.participants[0]?.createdAt).toBeUndefined();
  });

  it("still parses a custom payment whose participants are rows", () => {
    const date = new Date("2026-10-11T12:00:00Z");
    const parsed = paymentResponseSchema.parse(
      payment({
        splitScope: "custom",
        participants: [
          {
            id: "participant-1",
            paymentId: "payment-1",
            memberId: payerMemberId,
            shareAmount: 4500,
            createdAt: date,
          },
        ],
      }),
    );

    expect(parsed.payment.participants[0]?.id).toBe("participant-1");
    expect(parsed.payment.participants[0]?.createdAt).toEqual(date);
  });
});
