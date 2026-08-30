import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BalanceItem } from "../balance-item";
import type { BalanceEntry } from "@journiful/shared/types";

// ============================================================================
// Test fixtures
// ============================================================================

function makePerson(
  overrides: Partial<BalanceEntry["from"]> = {},
): BalanceEntry["from"] {
  return {
    id: "member-1",
    name: "Alice",
    isPlaceholder: false,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<BalanceEntry> = {}): BalanceEntry {
  return {
    from: makePerson({ id: "member-2", name: "Bob" }),
    to: makePerson({ id: "member-1", name: "Alice" }),
    amount: 1500,
    ...overrides,
  };
}

// ============================================================================
// Test suite
// ============================================================================

describe("BalanceItem", () => {
  describe("You detection (member-id based)", () => {
    it("renders 'You owe' when the from member id matches currentMemberId", () => {
      const entry = makeEntry({
        from: makePerson({ id: "member-1", name: "Alice" }),
      });
      render(<BalanceItem entry={entry} currentMemberId="member-1" />);

      expect(screen.getByText(/You owe/)).toBeDefined();
      expect(screen.queryByText(/Alice owes/)).toBeNull();
    });

    it("renders the person name (not 'You') when the from member id does not match", () => {
      const entry = makeEntry({
        from: makePerson({ id: "member-2", name: "Bob" }),
      });
      render(<BalanceItem entry={entry} currentMemberId="member-1" />);

      expect(screen.getByText(/Bob owes/)).toBeDefined();
      expect(screen.queryByText(/You owe/)).toBeNull();
    });
  });
});
