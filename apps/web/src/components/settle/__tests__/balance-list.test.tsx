import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BalanceList } from "../balance-list";
import type { BalanceEntry } from "@journiful/shared/types";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { useCurrentMemberId, useQuery } = vi.hoisted(() => ({
  useCurrentMemberId: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@/hooks/use-current-member-id", () => ({ useCurrentMemberId }));
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery,
  };
});

// ============================================================================
// Test fixtures
// ============================================================================

function makePerson(
  id: string,
  name: string,
  isPlaceholder = false,
): BalanceEntry["from"] {
  return { id, name, isPlaceholder };
}

function makeEntry(overrides: Partial<BalanceEntry> = {}): BalanceEntry {
  return {
    from: makePerson("member-2", "Bob"),
    to: makePerson("member-1", "Alice"),
    amount: 1500,
    ...overrides,
  };
}

// ============================================================================
// Test suite
// ============================================================================

describe("BalanceList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCurrentMemberId.mockReturnValue("member-1");
    useQuery.mockReturnValue({ data: [], isPending: false });
  });

  describe("Sort order (member-id based)", () => {
    it("sorts the current member's entry first", () => {
      const balances: BalanceEntry[] = [
        // Not the current member (would sort first only if the comparator
        // is not member-id aware)
        makeEntry({
          from: makePerson("member-3", "Charlie"),
          to: makePerson("member-4", "Dana"),
          amount: 500,
        }),
        // Current member: from.id === "member-1"
        makeEntry({
          from: makePerson("member-1", "Alice"),
          to: makePerson("member-2", "Bob"),
          amount: 1200,
        }),
      ];
      useQuery.mockReturnValue({ data: balances, isPending: false });

      render(<BalanceList tripId="trip-1" />);

      const labels = screen.getAllByText(/owe/i);
      expect(labels).toHaveLength(2);
      expect(labels[0].textContent).toContain("You owe");
      expect(labels[1].textContent).toContain("Charlie owes");
    });

    it("keeps original order when no member matches currentMemberId", () => {
      const balances: BalanceEntry[] = [
        makeEntry({
          from: makePerson("member-3", "Charlie"),
          to: makePerson("member-4", "Dana"),
          amount: 500,
        }),
        makeEntry({
          from: makePerson("member-5", "Eve"),
          to: makePerson("member-2", "Bob"),
          amount: 1200,
        }),
      ];
      useCurrentMemberId.mockReturnValue(undefined);
      useQuery.mockReturnValue({ data: balances, isPending: false });

      render(<BalanceList tripId="trip-1" />);

      const labels = screen.getAllByText(/owe/i);
      expect(labels).toHaveLength(2);
      expect(labels[0].textContent).toContain("Charlie owes");
      expect(labels[1].textContent).toContain("Eve owes");
    });
  });
});
