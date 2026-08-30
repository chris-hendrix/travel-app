import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PaymentForm } from "../payment-form";
import type { MemberWithProfile } from "@journiful/shared/types";

// ============================================================================
// Hoisted mocks
// ============================================================================

const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: mockToast }));

const mockCreatePayment = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  error: null as Error | null,
}));
const mockUpdatePayment = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  error: null as Error | null,
}));
const mockDeletePayment = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  error: null as Error | null,
}));

vi.mock("@/hooks/use-payments", () => ({
  useCreatePayment: () => mockCreatePayment,
  useUpdatePayment: () => mockUpdatePayment,
  useDeletePayment: () => mockDeletePayment,
  getPaymentErrorMessage: vi.fn(
    (error: Error | null) => error?.message ?? null,
  ),
}));

const mockCreatePlaceholder = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));
const mockUpdatePlaceholder = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));

vi.mock("@/hooks/use-placeholders", () => ({
  useCreatePlaceholder: () => mockCreatePlaceholder,
  useUpdatePlaceholder: () => mockUpdatePlaceholder,
}));

vi.mock("@/hooks/use-dialog-back", () => ({
  useDialogBack: vi.fn(),
}));

vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

// membersQueryOptions resolves from a mutable store so we can simulate the
// members query loading (and refetching after a placeholder is created)
const mockMembersStore = vi.hoisted(() => ({
  data: [] as MemberWithProfile[],
}));

vi.mock("@/hooks/invitation-queries", () => ({
  membersQueryOptions: (tripId: string) => ({
    queryKey: ["members", "list", tripId],
    queryFn: async () => mockMembersStore.data,
  }),
}));

// useMembers is consumed by PlaceholderForm (member-limit check); empty is fine
vi.mock("@/hooks/use-invitations", () => ({
  useMembers: () => ({ data: [] }),
}));

// PhoneInput (react-phone-number-input) is heavy for jsdom — render a plain input
vi.mock("@/components/ui/phone-input", () => ({
  PhoneInput: ({
    value,
    onChange,
    disabled,
    placeholder,
    "aria-label": ariaLabel,
    ...props
  }: any) => (
    <input
      type="tel"
      data-testid="phone-input"
      value={value ?? ""}
      onChange={(e: any) => onChange?.(e.target.value || undefined)}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      {...props}
    />
  ),
}));

// ============================================================================
// Fixtures
// ============================================================================

const TRIP_ID = "trip-1";
const MEMBERS_KEY = ["members", "list", TRIP_ID] as const;

function makeMember(
  overrides: Partial<MemberWithProfile> = {},
): MemberWithProfile {
  return {
    id: "member-1",
    userId: "user-1",
    displayName: "Alice",
    profilePhotoUrl: null,
    handles: null,
    isPlaceholder: false,
    status: "going",
    isOrganizer: true,
    createdAt: "2026-01-01",
    ...overrides,
  };
}

const members: MemberWithProfile[] = [
  makeMember(),
  makeMember({
    id: "member-2",
    userId: null,
    displayName: "Bob",
    isPlaceholder: true,
    isOrganizer: false,
  }),
];

const newPlaceholderMember: MemberWithProfile = makeMember({
  id: "member-3",
  userId: null,
  displayName: "New Person",
  isPlaceholder: true,
  isOrganizer: false,
});

// ============================================================================
// Suite
// ============================================================================

describe("PaymentForm", () => {
  const mockOnOpenChange = vi.fn();
  let queryClient: QueryClient;

  beforeEach(() => {
    // Reset hoisted mutation state
    mockCreatePayment.mutate = vi.fn();
    mockCreatePayment.isPending = false;
    mockCreatePayment.error = null;
    mockUpdatePayment.mutate = vi.fn();
    mockUpdatePayment.isPending = false;
    mockUpdatePayment.error = null;
    mockDeletePayment.mutate = vi.fn();
    mockDeletePayment.isPending = false;
    mockDeletePayment.error = null;

    mockCreatePlaceholder.mutate = vi.fn();
    mockCreatePlaceholder.isPending = false;
    mockUpdatePlaceholder.mutate = vi.fn();
    mockUpdatePlaceholder.isPending = false;

    mockMembersStore.data = [];

    mockToast.success.mockClear();
    mockToast.error.mockClear();
    mockOnOpenChange.mockClear();

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

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  const renderForm = (open: boolean = true) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <PaymentForm
          tripId={TRIP_ID}
          open={open}
          onOpenChange={mockOnOpenChange}
        />
      </QueryClientProvider>,
    );
  };

  /**
   * The participant's <label> row in the "Split with" list.
   * Disambiguates from the "Paid by" select trigger, which can show the same
   * name (e.g. the default payer) without being inside a checkbox label.
   */
  const participantLabel = (name: string) => {
    const matches = screen.getAllByText(name);
    const row = matches.find((m) =>
      m.closest("label")?.querySelector('[data-slot="checkbox"]'),
    );
    if (!row) {
      throw new Error(`No participant row found for "${name}"`);
    }
    return row.closest("label") as HTMLLabelElement;
  };

  const expectParticipantChecked = (name: string) => {
    const checkbox = participantLabel(name).querySelector(
      '[data-slot="checkbox"]',
    );
    expect(checkbox?.getAttribute("data-state")).toBe("checked");
  };

  // =========================================================================
  // 1. In-sheet placeholder flow (view swap)
  // =========================================================================
  describe("adding a placeholder in-sheet", () => {
    it("swaps the sheet content to the placeholder form and back on cancel", async () => {
      const user = userEvent.setup();
      mockMembersStore.data = members;
      renderForm();

      // Expense form visible with footer
      expect(await screen.findByLabelText("Description")).toBeDefined();
      expect(screen.getByRole("button", { name: "Add Expense" })).toBeDefined();
      expect(screen.queryByText("Add person")).toBeNull();

      await user.click(
        screen.getByRole("button", { name: /Add person without inviting/i }),
      );

      // Placeholder form replaces the expense form in-place (no nested sheet/dialog)
      expect(screen.getByTestId("add-placeholder-name")).toBeDefined();
      expect(screen.getAllByText("Add person").length).toBeGreaterThan(0);
      expect(screen.queryByLabelText("Description")).toBeNull();
      expect(screen.queryByRole("button", { name: "Add Expense" })).toBeNull();

      // Cancel returns to the expense form
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.getByLabelText("Description")).toBeDefined();
      expect(screen.queryByTestId("add-placeholder-name")).toBeNull();
      expect(screen.getByRole("button", { name: "Add Expense" })).toBeDefined();
    });

    it("auto-selects the new member as a participant and returns to the expense form on success", async () => {
      const user = userEvent.setup();
      mockMembersStore.data = members;
      renderForm();

      await user.click(
        screen.getByRole("button", { name: /Add person without inviting/i }),
      );

      await user.type(screen.getByTestId("add-placeholder-name"), "New Person");

      // Simulate the create-placeholder mutation: the new member joins the
      // members list (as an invalidated query refetch would) and succeeds
      mockCreatePlaceholder.mutate = vi.fn((_payload, options) => {
        mockMembersStore.data = [...members, newPlaceholderMember];
        act(() => {
          queryClient.invalidateQueries({ queryKey: MEMBERS_KEY });
          options?.onSuccess?.(newPlaceholderMember);
        });
      });

      await user.click(screen.getByTestId("add-placeholder-submit"));

      // View returns to the expense form
      expect(await screen.findByLabelText("Description")).toBeDefined();
      expect(screen.queryByTestId("add-placeholder-name")).toBeNull();

      // The new member is auto-selected as a participant
      await screen.findByText("New Person");
      expectParticipantChecked("New Person");
    });
  });

  // =========================================================================
  // 2. Select all by default
  // =========================================================================
  describe("default participant selection", () => {
    it("selects all members by default once they are loaded", async () => {
      mockMembersStore.data = members;
      renderForm();

      // Alice appears both in the "Paid by" select trigger and the participant
      // list, so use findAllByText to wait for the members query to resolve
      await screen.findAllByText("Alice");
      expectParticipantChecked("Alice");
      expectParticipantChecked("Bob");
    });

    it("selects all by default when members load after mount without render-phase setState warnings", async () => {
      // Members NOT available yet — simulate an async fetch resolving later
      renderForm();
      expect(screen.queryByText("Alice")).toBeNull();

      // Let the initial (empty) members fetch settle before the refetch, so
      // the invalidation actually triggers a second fetch
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      act(() => {
        mockMembersStore.data = members;
        queryClient.invalidateQueries({ queryKey: MEMBERS_KEY });
      });

      await screen.findAllByText("Alice");
      expectParticipantChecked("Alice");
      expectParticipantChecked("Bob");

      // No React "update during render" warnings
      const errorCalls = vi.mocked(console.error).mock.calls;
      expect(
        errorCalls.some((call) =>
          /Cannot update a component|while rendering/i.test(
            call.map(String).join(" "),
          ),
        ),
      ).toBe(false);
    });
  });
});
