import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { SettleSection } from "../settle-section";

// ─── Mock portal + mount state ──────────────────────────────────────────────

// createPortal renders its node in-place (in the component tree) so the
// portaled FAB stays discoverable via `screen`; we still assert the portal
// was targeted at document.body.
vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    createPortal: vi.fn((node: ReactNode) => node),
  };
});

vi.mock("@/hooks/use-mounted", () => ({
  useMounted: () => true,
}));

const mockedCreatePortal = vi.mocked(createPortal);

// ─── Mock child components ───────────────────────────────────────────────────

vi.mock("../balance-list", () => ({
  BalanceList: vi.fn(
    ({ onSettleUp }: { onSettleUp?: (entry: unknown) => void }) => (
      <div data-testid="balance-list">
        BalanceList
        {onSettleUp ? (
          <span data-testid="balance-list-has-settle-up">hasSettleUp</span>
        ) : (
          <span data-testid="balance-list-no-settle-up">noSettleUp</span>
        )}
      </div>
    ),
  ),
}));

vi.mock("../payment-list", () => ({
  PaymentList: vi.fn(
    ({
      onPaymentClick,
      isOrganizer,
    }: {
      onPaymentClick?: (payment: unknown) => void;
      isOrganizer?: boolean;
    }) => (
      <div data-testid="payment-list">
        PaymentList
        {onPaymentClick ? (
          <span data-testid="payment-list-has-click">hasClick</span>
        ) : (
          <span data-testid="payment-list-no-click">noClick</span>
        )}
        {isOrganizer ? (
          <span data-testid="payment-list-is-organizer">isOrganizer</span>
        ) : null}
      </div>
    ),
  ),
}));

vi.mock("../payment-form", () => ({
  PaymentForm: vi.fn(
    ({
      open,
      onOpenChange,
      payment,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      payment?: unknown;
    }) =>
      open ? (
        <div data-testid="payment-form">
          PaymentForm
          {payment ? (
            <span data-testid="payment-form-editing">editing</span>
          ) : (
            <span data-testid="payment-form-new">new</span>
          )}
          <button
            type="button"
            data-testid="close-payment-form"
            onClick={() => onOpenChange(false)}
          >
            Close
          </button>
        </div>
      ) : null,
  ),
}));

vi.mock("../settlement-form", () => ({
  SettlementForm: vi.fn(
    ({
      open,
      onOpenChange,
      entry,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      entry: unknown;
    }) =>
      open ? (
        <div data-testid="settlement-form">
          SettlementForm
          <span data-testid="settlement-form-entry">
            {(entry as { amount?: number })?.amount ?? "present"}
          </span>
          <button
            type="button"
            data-testid="close-settlement-form"
            onClick={() => onOpenChange(false)}
          >
            Close
          </button>
        </div>
      ) : null,
  ),
}));

// ─── Constants ───────────────────────────────────────────────────────────────

const TRIP_ID = "trip-123";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("SettleSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders the section heading and BalanceList", () => {
      render(
        <SettleSection tripId={TRIP_ID} isOrganizer={false} />,
      );

      // Section heading
      expect(screen.getByText("Settle")).toBeDefined();

      // Balance subsection
      expect(screen.getByText("Balances")).toBeDefined();
      expect(screen.getByTestId("balance-list")).toBeDefined();
    });

    it("renders the Expenses subsection with PaymentList", () => {
      render(
        <SettleSection tripId={TRIP_ID} isOrganizer={false} />,
      );

      expect(screen.getByText("Expenses")).toBeDefined();
      expect(screen.getByTestId("payment-list")).toBeDefined();
    });

    it("passes onSettleUp to BalanceList when not disabled", () => {
      render(
        <SettleSection tripId={TRIP_ID} isOrganizer={false} />,
      );

      expect(
        screen.getByTestId("balance-list-has-settle-up"),
      ).toBeDefined();
    });

    it("passes onPaymentClick to PaymentList when not disabled", () => {
      render(
        <SettleSection tripId={TRIP_ID} isOrganizer={false} />,
      );

      expect(
        screen.getByTestId("payment-list-has-click"),
      ).toBeDefined();
    });

    it("forwards isOrganizer prop to PaymentList", () => {
      render(
        <SettleSection tripId={TRIP_ID} isOrganizer={true} />,
      );

      expect(
        screen.getByTestId("payment-list-is-organizer"),
      ).toBeDefined();
    });

    it("does not forward isOrganizer prop to PaymentList when false", () => {
      render(
        <SettleSection tripId={TRIP_ID} isOrganizer={false} />,
      );

      expect(
        screen.queryByTestId("payment-list-is-organizer"),
      ).toBeNull();
    });
  });

  describe("FAB (Add Expense button)", () => {
    it("renders the Add expense FAB when not disabled", () => {
      render(
        <SettleSection tripId={TRIP_ID} isOrganizer={false} />,
      );

      expect(
        screen.getByRole("button", { name: "Add expense" }),
      ).toBeDefined();
    });

    it("renders the Add expense FAB for organizers", () => {
      render(
        <SettleSection tripId={TRIP_ID} isOrganizer={true} />,
      );

      expect(
        screen.getByRole("button", { name: "Add expense" }),
      ).toBeDefined();
    });

    it("hides the Add expense FAB when disabled", () => {
      render(
        <SettleSection
          tripId={TRIP_ID}
          isOrganizer={false}
          disabled={true}
        />,
      );

      expect(
        screen.queryByRole("button", { name: "Add expense" }),
      ).toBeNull();
    });
  });

  describe("Panel variant", () => {
    it("renders the full-height flex container classes", () => {
      const { container } = render(
        <SettleSection
          tripId={TRIP_ID}
          isOrganizer={false}
          variant="panel"
        />,
      );

      const root = container.firstElementChild;
      expect(root?.className).toContain("h-full");
      expect(root?.className).toContain("flex-col");
      expect(root?.className).toContain("overflow-hidden");
    });

    it("renders the Add expense FAB through a portal to document.body", () => {
      render(
        <SettleSection
          tripId={TRIP_ID}
          isOrganizer={false}
          variant="panel"
        />,
      );

      expect(
        screen.getByRole("button", { name: "Add expense" }),
      ).toBeDefined();
      expect(mockedCreatePortal).toHaveBeenCalledWith(
        expect.anything(),
        document.body,
      );
    });

    it("positions the panel FAB at bottom-20 right-6", () => {
      render(
        <SettleSection
          tripId={TRIP_ID}
          isOrganizer={false}
          variant="panel"
        />,
      );

      const fab = screen.getByRole("button", { name: "Add expense" });
      expect(fab.className).toContain("bottom-20");
      expect(fab.className).toContain("right-6");
    });

    it("still renders heading and child sections in panel variant", () => {
      render(
        <SettleSection
          tripId={TRIP_ID}
          isOrganizer={false}
          variant="panel"
        />,
      );

      expect(screen.getByText("Settle")).toBeDefined();
      expect(screen.getByText("Balances")).toBeDefined();
      expect(screen.getByText("Expenses")).toBeDefined();
      expect(screen.getByTestId("balance-list")).toBeDefined();
      expect(screen.getByTestId("payment-list")).toBeDefined();
    });
  });

  describe("hideFab (panel FAB fade-out)", () => {
    it("applies fade-out classes when hideFab is true", () => {
      render(
        <SettleSection
          tripId={TRIP_ID}
          isOrganizer={false}
          variant="panel"
          hideFab
        />,
      );

      const fab = screen.getByRole("button", { name: "Add expense" });
      const classes = fab.className.split(/\s+/);
      expect(fab.className).toContain("transition-all");
      expect(classes).toContain("opacity-0");
      expect(classes).toContain("scale-75");
      expect(classes).toContain("pointer-events-none");
      expect(fab.tabIndex).toBe(-1);
    });

    it("keeps the FAB visible when hideFab is false/omitted", () => {
      render(
        <SettleSection
          tripId={TRIP_ID}
          isOrganizer={false}
          variant="panel"
        />,
      );

      const fab = screen.getByRole("button", { name: "Add expense" });
      const classes = fab.className.split(/\s+/);
      expect(classes).toContain("opacity-100");
      expect(classes).toContain("scale-100");
      expect(classes).not.toContain("pointer-events-none");
      expect(fab.tabIndex).not.toBe(-1);
    });
  });

  describe("PaymentForm visibility", () => {
    it("does not render PaymentForm initially (closed by default)", () => {
      render(
        <SettleSection tripId={TRIP_ID} isOrganizer={false} />,
      );

      expect(screen.queryByTestId("payment-form")).toBeNull();
    });

    it("does not render PaymentForm when disabled (no FAB to trigger it)", () => {
      render(
        <SettleSection
          tripId={TRIP_ID}
          isOrganizer={false}
          disabled={true}
        />,
      );

      // The PaymentForm is wrapped in {!disabled && ...} so it won't even mount
      // Even if something tried to open it, the component itself is not rendered
      expect(screen.queryByTestId("payment-form")).toBeNull();
    });
  });

  describe("SettlementForm visibility", () => {
    it("does not render SettlementForm when settleEntry is undefined", () => {
      render(
        <SettleSection tripId={TRIP_ID} isOrganizer={false} />,
      );

      expect(screen.queryByTestId("settlement-form")).toBeNull();
    });

    it("does not render SettlementForm when disabled", () => {
      render(
        <SettleSection
          tripId={TRIP_ID}
          isOrganizer={false}
          disabled={true}
        />,
      );

      // The SettlementForm is wrapped in {!disabled && settleEntry && ...}
      // so it won't even mount when disabled
      expect(screen.queryByTestId("settlement-form")).toBeNull();
    });
  });

  describe("Disabled state", () => {
    it("omits onSettleUp from BalanceList when disabled", () => {
      render(
        <SettleSection
          tripId={TRIP_ID}
          isOrganizer={false}
          disabled={true}
        />,
      );

      expect(
        screen.getByTestId("balance-list-no-settle-up"),
      ).toBeDefined();
      expect(
        screen.queryByTestId("balance-list-has-settle-up"),
      ).toBeNull();
    });

    it("omits onPaymentClick from PaymentList when disabled", () => {
      render(
        <SettleSection
          tripId={TRIP_ID}
          isOrganizer={false}
          disabled={true}
        />,
      );

      expect(
        screen.getByTestId("payment-list-no-click"),
      ).toBeDefined();
      expect(
        screen.queryByTestId("payment-list-has-click"),
      ).toBeNull();
    });

    it("still renders headings and child sections when disabled", () => {
      render(
        <SettleSection
          tripId={TRIP_ID}
          isOrganizer={false}
          disabled={true}
        />,
      );

      // Core structure still renders
      expect(screen.getByText("Settle")).toBeDefined();
      expect(screen.getByText("Balances")).toBeDefined();
      expect(screen.getByText("Expenses")).toBeDefined();
      expect(screen.getByTestId("balance-list")).toBeDefined();
      expect(screen.getByTestId("payment-list")).toBeDefined();
    });
  });
});
