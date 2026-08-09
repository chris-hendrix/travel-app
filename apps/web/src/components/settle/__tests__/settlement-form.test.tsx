import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettlementForm } from "../settlement-form";
import type { BalanceEntry } from "@journiful/shared/types";
import type { APIError } from "@/lib/api";

// ============================================================================
// Hoisted mock objects — mutable so tests can control mutation/query state
// ============================================================================

const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: mockToast }));

const mockMutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  error: null as Error | null,
}));

vi.mock("@/hooks/use-payments", () => ({
  useCreatePayment: () => mockMutation,
  getPaymentErrorMessage: vi.fn((error: Error | null) => error?.message ?? null),
}));

vi.mock("@/hooks/use-dialog-back", () => ({
  useDialogBack: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  APIError: class APIError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = "APIError";
    }
  },
}));

// ============================================================================
// Test fixture
// ============================================================================

function makeEntry(overrides: Partial<BalanceEntry> = {}): BalanceEntry {
  return {
    from: { id: "from-1", name: "Alice", isGuest: true },
    to: { id: "to-1", name: "Bob", isGuest: true },
    amount: 2500, // $25.00 in cents
    ...overrides,
  };
}

// ============================================================================
// Test suite
// ============================================================================

describe("SettlementForm", () => {
  const mockOnOpenChange = vi.fn();
  const tripId = "trip-1";
  let queryClient: QueryClient;

  beforeEach(async () => {
    // Reset hoisted mutation state
    mockMutation.mutate = vi.fn();
    mockMutation.isPending = false;
    mockMutation.error = null;

    // Reset toast
    mockToast.success.mockClear();
    mockToast.error.mockClear();

    // Reset onOpenChange
    mockOnOpenChange.mockClear();

    // Reset getPaymentErrorMessage to its default implementation
    // (prior test may have overridden it with mockReturnValue)
    const { getPaymentErrorMessage } = await import("@/hooks/use-payments");
    vi.mocked(getPaymentErrorMessage).mockReset();
    vi.mocked(getPaymentErrorMessage).mockImplementation(
      (error: Error | null) => error?.message ?? null,
    );

    // Mock API to return empty members list (used by membersQueryOptions)
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockClear();
    vi.mocked(apiRequest).mockResolvedValue({ members: [] });

    // Fresh QueryClient per test
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
      logger: {
        log: () => {},
        warn: () => {},
        error: () => {},
      },
    });

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const renderForm = (entry: BalanceEntry, open: boolean = true) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <SettlementForm
          tripId={tripId}
          open={open}
          onOpenChange={mockOnOpenChange}
          entry={entry}
        />
      </QueryClientProvider>,
    );
  };

  // =========================================================================
  // 1. Renders when open
  // =========================================================================
  describe("open/close behavior", () => {
    it("renders form content when open is true", () => {
      const entry = makeEntry();
      renderForm(entry, true);

      // Sheet title
      expect(screen.getByText("Settle Up")).toBeDefined();

      // From/To display
      expect(screen.getByText("Alice")).toBeDefined();
      expect(screen.getByText("Bob")).toBeDefined();

      // Form fields
      expect(screen.getByLabelText("Amount")).toBeDefined();
      expect(screen.getByLabelText("Note (optional)")).toBeDefined();

      // Submit button
      expect(
        screen.getByRole("button", { name: "Record Settlement" }),
      ).toBeDefined();
    });

    it("does not render form content when open is false", () => {
      const entry = makeEntry();
      renderForm(entry, false);

      // Radix Dialog does not mount content when closed
      expect(screen.queryByText("Settle Up")).toBeNull();
      expect(screen.queryByLabelText("Amount")).toBeNull();
    });
  });

  // =========================================================================
  // 2. Form fields render correctly
  // =========================================================================
  describe("form fields", () => {
    it("displays amount input pre-filled from entry amount", () => {
      const entry = makeEntry({ amount: 3999 }); // $39.99
      renderForm(entry);

      const amountInput = screen.getByLabelText("Amount") as HTMLInputElement;
      expect(amountInput.value).toBe("39.99");
    });

    it("renders note input with placeholder", () => {
      renderForm(makeEntry());

      const noteInput = screen.getByLabelText(
        "Note (optional)",
      ) as HTMLInputElement;
      expect(noteInput.value).toBe("");
      expect(noteInput.placeholder).toBe("e.g. Paid on Venmo");
    });

    it("renders payment method suggestion chips", () => {
      renderForm(makeEntry());

      expect(screen.getByText("Venmo")).toBeDefined();
      expect(screen.getByText("Cash")).toBeDefined();
      expect(screen.getByText("Zelle")).toBeDefined();
      expect(screen.getByText("PayPal")).toBeDefined();
      expect(screen.getByText("Apple Pay")).toBeDefined();
    });

    it("fills note when a suggestion chip is clicked", async () => {
      const user = userEvent.setup();
      renderForm(makeEntry());

      await user.click(screen.getByText("Venmo"));

      const noteInput = screen.getByLabelText(
        "Note (optional)",
      ) as HTMLInputElement;
      expect(noteInput.value).toBe("Venmo");
    });

    it("displays payer and recipient names", () => {
      renderForm(makeEntry());

      expect(screen.getByText("From")).toBeDefined();
      expect(screen.getByText("To")).toBeDefined();
      expect(screen.getByText("Alice")).toBeDefined();
      expect(screen.getByText("Bob")).toBeDefined();
    });

    it("disables submit button when amount is zero or invalid", () => {
      const entry = makeEntry({ amount: 0 });
      renderForm(entry);

      const button = screen.getByRole("button", { name: "Record Settlement" });
      expect(button).toHaveProperty("disabled", true);
    });
  });

  // =========================================================================
  // 3. Submit calls mutation with correct data
  // =========================================================================
  describe("submit", () => {
    it("calls createPayment.mutate with correct payload when submitted", async () => {
      const user = userEvent.setup();
      const entry = makeEntry();
      renderForm(entry);

      // Set a note so we can verify description construction
      await user.click(screen.getByText("Venmo"));

      // Trigger submit
      await user.click(
        screen.getByRole("button", { name: "Record Settlement" }),
      );

      expect(mockMutation.mutate).toHaveBeenCalledTimes(1);
      expect(mockMutation.mutate).toHaveBeenCalledWith(
        {
          tripId,
          data: {
            description: "Settled up — Venmo",
            amount: entry.amount,
            guestId: "from-1",
            participants: [{ guestId: "to-1" }],
            date: expect.any(String) as string,
          },
        },
        expect.objectContaining({
          onSuccess: expect.any(Function) as () => void,
        }),
      );
    });

    it("uses default description when note is empty", async () => {
      const user = userEvent.setup();
      const entry = makeEntry();
      renderForm(entry);

      await user.click(
        screen.getByRole("button", { name: "Record Settlement" }),
      );

      expect(mockMutation.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: "Settled up",
          }),
        }),
        expect.any(Object),
      );
    });

    it("calls onOpenChange(false) on successful mutation", async () => {
      const user = userEvent.setup();
      const entry = makeEntry();
      renderForm(entry);

      await user.click(
        screen.getByRole("button", { name: "Record Settlement" }),
      );

      // Simulate the onSuccess callback (which the real mutation would trigger)
      const [_, options] = mockMutation.mutate.mock.calls[0];
      (options as { onSuccess: () => void }).onSuccess();

      expect(mockToast.success).toHaveBeenCalledWith("Settlement recorded");
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it("does not submit when amount is invalid", async () => {
      const user = userEvent.setup();
      // Use 0 amount to make isValid false
      const entry = makeEntry({ amount: 0 });
      renderForm(entry);

      const button = screen.getByRole("button", { name: "Record Settlement" });
      expect(button).toHaveProperty("disabled", true);

      // Click should not trigger mutation since button is disabled
      await user.click(button);
      expect(mockMutation.mutate).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 4. Loading state
  // =========================================================================
  describe("loading state", () => {
    it('shows "Recording..." text and disables button when mutation is pending', () => {
      mockMutation.isPending = true;
      renderForm(makeEntry());

      const button = screen.getByRole("button", { name: "Recording..." });
      expect(button).toBeDefined();
      expect(button).toHaveProperty("disabled", true);
    });

    it('reverts to "Record Settlement" when mutation is not pending', () => {
      mockMutation.isPending = false;
      renderForm(makeEntry());

      const button = screen.getByRole("button", {
        name: "Record Settlement",
      });
      expect(button).toBeDefined();
      expect(button).toHaveProperty("disabled", false);
    });
  });

  // =========================================================================
  // 5. Error state
  // =========================================================================
  describe("error state", () => {
    it("displays error message when mutation has an error", async () => {
      const { getPaymentErrorMessage } = await import("@/hooks/use-payments");
      vi.mocked(getPaymentErrorMessage).mockReturnValue(
        "Something went wrong",
      );

      mockMutation.error = new Error("server error");
      renderForm(makeEntry());

      expect(screen.getByText("Something went wrong")).toBeDefined();
    });

    it("does not show error message when there is no mutation error", () => {
      mockMutation.error = null;
      renderForm(makeEntry());

      expect(screen.queryByText("Something went wrong")).toBeNull();
    });
  });
});
