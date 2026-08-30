import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaymentItem } from "../payment-item";
import type { Payment, PaymentParticipant } from "@journiful/shared/types";

// ============================================================================
// Test fixtures
// ============================================================================

function makeParticipant(
  overrides: Partial<PaymentParticipant> = {},
): PaymentParticipant {
  return {
    id: "participant-1",
    paymentId: "payment-1",
    memberId: "member-2",
    shareAmount: 1500,
    name: "Bob",
    isPlaceholder: false,
    createdAt: new Date("2025-01-10"),
    ...overrides,
  };
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "payment-1",
    tripId: "trip-1",
    description: "Dinner",
    amount: 3000,
    memberId: "member-1",
    date: new Date("2025-01-10"),
    createdBy: "member-1",
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2025-01-10"),
    updatedAt: new Date("2025-01-10"),
    payerName: "Alice",
    payerIsPlaceholder: false,
    participants: [],
    ...overrides,
  };
}

// ============================================================================
// Test suite
// ============================================================================

describe("PaymentItem", () => {
  describe("You detection (member-id based)", () => {
    it("renders 'You paid' when the payer's memberId matches currentMemberId", () => {
      const payment = makePayment({ memberId: "member-1", payerName: "Alice" });
      render(<PaymentItem payment={payment} currentMemberId="member-1" />);

      expect(screen.getByText("You paid")).toBeDefined();
      expect(screen.queryByText(/Alice paid/)).toBeNull();
    });

    it("renders 'you' for the settlement recipient whose memberId matches currentMemberId", () => {
      const payment = makePayment({
        description: "Settled up dinner",
        payerName: "Alice",
        participants: [makeParticipant({ memberId: "member-1", name: "Bob" })],
      });
      render(<PaymentItem payment={payment} currentMemberId="member-1" />);

      // Settlement card: "You paid you $30.00"
      expect(screen.getByText(/You paid you \$30\.00/)).toBeDefined();
    });

    it("renders the payer name (not 'You') when memberId does not match", () => {
      const payment = makePayment({
        memberId: "member-2",
        payerName: "Charlie",
      });
      render(<PaymentItem payment={payment} currentMemberId="member-1" />);

      expect(screen.getByText(/Charlie paid/)).toBeDefined();
      expect(screen.queryByText(/You paid/)).toBeNull();
    });

    it("renders the recipient name (not 'you') when their memberId does not match", () => {
      const payment = makePayment({
        description: "Settled up dinner",
        payerName: "Alice",
        participants: [makeParticipant({ memberId: "member-2", name: "Bob" })],
      });
      render(<PaymentItem payment={payment} currentMemberId="member-1" />);

      expect(screen.getByText(/paid Bob \$30\.00/)).toBeDefined();
      expect(screen.queryByText(/paid you/)).toBeNull();
    });
  });
});
