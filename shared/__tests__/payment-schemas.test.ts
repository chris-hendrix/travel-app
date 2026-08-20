// Tests for payment validation schemas

import { describe, it, expect } from "vitest";
import {
  createPaymentSchema,
  updatePaymentSchema,
  paymentListResponseSchema,
  paymentResponseSchema,
} from "../schemas/index.js";

const UUID_A = "550e8400-e29b-41d4-a716-446655440000";
const UUID_B = "550e8400-e29b-41d4-a716-446655440001";
const UUID_C = "550e8400-e29b-41d4-a716-446655440002";

describe("createPaymentSchema", () => {
  it("should accept a valid payment with a single participant", () => {
    const input = {
      description: "Dinner",
      amount: 5000,
      memberId: UUID_A,
      participants: [{ memberId: UUID_B }],
    };
    const parsed = createPaymentSchema.parse(input);
    expect(parsed.memberId).toBe(UUID_A);
    expect(parsed.participants).toHaveLength(1);
    expect(parsed.participants[0]?.memberId).toBe(UUID_B);
  });

  it("should accept a payment with multiple participants and a date", () => {
    const input = {
      description: "Groceries",
      amount: 12000,
      memberId: UUID_A,
      participants: [{ memberId: UUID_B }, { memberId: UUID_C }],
      date: "2026-07-15T19:00:00Z",
    };
    expect(() => createPaymentSchema.parse(input)).not.toThrow();
  });

  it("should reject a missing payer memberId", () => {
    const input = {
      description: "Dinner",
      amount: 5000,
      participants: [{ memberId: UUID_B }],
    };
    const result = createPaymentSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("should reject a non-UUID payer memberId", () => {
    const input = {
      description: "Dinner",
      amount: 5000,
      memberId: "not-a-uuid",
      participants: [{ memberId: UUID_B }],
    };
    const result = createPaymentSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("valid UUID");
    }
  });

  it("should reject a participant with a non-UUID memberId", () => {
    const input = {
      description: "Dinner",
      amount: 5000,
      memberId: UUID_A,
      participants: [{ memberId: "not-a-uuid" }],
    };
    const result = createPaymentSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("valid UUID");
    }
  });

  it("should reject a participant missing memberId", () => {
    const input = {
      description: "Dinner",
      amount: 5000,
      memberId: UUID_A,
      participants: [{}],
    };
    const result = createPaymentSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("should reject an empty participants array", () => {
    const input = {
      description: "Dinner",
      amount: 5000,
      memberId: UUID_A,
      participants: [],
    };
    const result = createPaymentSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "At least one participant is required",
      );
    }
  });
});

describe("updatePaymentSchema", () => {
  it("should accept an empty object (no updates)", () => {
    expect(() => updatePaymentSchema.parse({})).not.toThrow();
  });

  it("should accept a memberId-only update", () => {
    const parsed = updatePaymentSchema.parse({ memberId: UUID_A });
    expect(parsed.memberId).toBe(UUID_A);
  });

  it("should accept a participants-only update", () => {
    const parsed = updatePaymentSchema.parse({
      participants: [{ memberId: UUID_B }],
    });
    expect(parsed.participants).toHaveLength(1);
  });

  it("should reject a non-UUID memberId", () => {
    const result = updatePaymentSchema.safeParse({ memberId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("should reject non-UUID participant memberIds", () => {
    const result = updatePaymentSchema.safeParse({
      participants: [{ memberId: "not-a-uuid" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("payment entity schemas", () => {
  const validPayment = {
    id: "payment-1",
    tripId: "trip-1",
    description: "Dinner",
    amount: 5000,
    memberId: UUID_A,
    date: new Date("2026-07-15T19:00:00Z"),
    createdBy: UUID_B,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-07-15T20:00:00Z"),
    updatedAt: new Date("2026-07-15T20:00:00Z"),
    payerName: "Alice",
    payerIsPlaceholder: false,
    participants: [
      {
        id: "participant-1",
        paymentId: "payment-1",
        memberId: UUID_C,
        shareAmount: 2500,
        name: "Bob",
        isPlaceholder: true,
        createdAt: new Date("2026-07-15T20:00:00Z"),
      },
    ],
  };

  it("should accept a payment entity with memberId and payerIsPlaceholder", () => {
    expect(() => paymentResponseSchema.parse({
      success: true,
      payment: validPayment,
    })).not.toThrow();
  });

  it("should accept a list of payment entities", () => {
    expect(() =>
      paymentListResponseSchema.parse({
        success: true,
        payments: [validPayment],
      }),
    ).not.toThrow();
  });

  it("should reject a payment entity missing memberId", () => {
    const { memberId: _memberId, ...withoutMemberId } = validPayment;
    const result = paymentResponseSchema.safeParse({
      success: true,
      payment: withoutMemberId,
    });
    expect(result.success).toBe(false);
  });

  it("should reject a participant entity missing memberId", () => {
    const badPayment = {
      ...validPayment,
      participants: [
        {
          id: "participant-1",
          paymentId: "payment-1",
          shareAmount: 2500,
          createdAt: new Date("2026-07-15T20:00:00Z"),
        },
      ],
    };
    const result = paymentResponseSchema.safeParse({
      success: true,
      payment: badPayment,
    });
    expect(result.success).toBe(false);
  });
});
