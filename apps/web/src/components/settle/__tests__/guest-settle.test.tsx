import type { ReactElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PaymentForm } from "../payment-form";
import { PaymentItem } from "../payment-item";
import { BalanceList } from "../balance-list";
import { SettlementForm } from "../settlement-form";
import type { BalanceEntry, Payment } from "@journiful/shared/types";
import type { MemberWithProfile } from "@journiful/shared/types";

// ============================================================================
// Mocks
// ============================================================================

const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: mockToast }));

const mockCreateMutate = vi.hoisted(() => vi.fn());
const mockUpdateMutate = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-payments", () => ({
  useCreatePayment: () => ({
    mutate: mockCreateMutate,
    isPending: false,
    error: null,
  }),
  useUpdatePayment: () => ({
    mutate: mockUpdateMutate,
    isPending: false,
    error: null,
  }),
  useDeletePayment: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  }),
  getPaymentErrorMessage: () => null,
}));

const mockUseAuth = vi.fn();
vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiRequest = vi.fn();
vi.mock("@/lib/api", () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
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
// Fixtures (member-keyed; Mom is a guest with userId null)
// ============================================================================

const TRIP_ID = "trip-1";

const organizerLiam: MemberWithProfile = {
  id: "member-liam",
  userId: "user-liam",
  displayName: "Liam",
  profilePhotoUrl: null,
  handles: { venmo: "liam-pay" },
  status: "going",
  isOrganizer: true,
  createdAt: "2026-01-01T00:00:00Z",
};

const guestMom: MemberWithProfile = {
  id: "member-mom",
  userId: null,
  displayName: "Mom",
  profilePhotoUrl: null,
  handles: null,
  guestPhone: "+14155551111",
  status: "no_response",
  isOrganizer: false,
  createdAt: "2026-01-05T00:00:00Z",
};

const MEMBERS = [organizerLiam, guestMom];

function mockApi() {
  mockApiRequest.mockImplementation((url: string) => {
    if (typeof url === "string" && url.endsWith("/members")) {
      return Promise.resolve({ success: true, members: MEMBERS });
    }
    if (typeof url === "string" && url.endsWith("/balances")) {
      return Promise.resolve({ success: true, balances: [] });
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
}

let queryClient: QueryClient;

function renderWithClient(ui: ReactElement) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { id: "user-liam", displayName: "Liam" } });
  mockApi();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ============================================================================
// PaymentForm — guest as participant + payer
// ============================================================================

describe("PaymentForm with guests", () => {
  it("lists guests as participants with the dashed guest marker", async () => {
    renderWithClient(
      <PaymentForm tripId={TRIP_ID} open={true} onOpenChange={() => {}} />,
    );

    // Guest appears in the split-between list with a guest label
    // (the payer Select also renders the name — match any occurrence)
    expect(await screen.findAllByText("Mom")).not.toHaveLength(0);
    expect(screen.getByText("guest")).toBeDefined();
    expect((await screen.findAllByText("Liam")).length).toBeGreaterThan(0);
  });

  it("submits a member-keyed payload including the guest participant", async () => {
    const user = userEvent.setup();
    renderWithClient(
      <PaymentForm tripId={TRIP_ID} open={true} onOpenChange={() => {}} />,
    );

    await screen.findByText("Mom");

    await user.type(
      screen.getByLabelText("Description"),
      "Dinner at Da Adolfo",
    );
    await user.type(screen.getByLabelText("Amount"), "120");

    await user.click(screen.getByRole("button", { name: "Add Expense" }));

    await waitFor(() => expect(mockCreateMutate).toHaveBeenCalledTimes(1));
    const [args] = mockCreateMutate.mock.calls[0] as [
      { tripId: string; data: Record<string, unknown> },
    ];
    expect(args.tripId).toBe(TRIP_ID);
    expect(args.data.payerMemberId).toBe("member-liam");
    expect(args.data.participants).toEqual(
      expect.arrayContaining([{ memberId: "member-mom" }]),
    );
    // No user-keyed fields leak into the payload
    expect(args.data).not.toHaveProperty("userId");
    expect(args.data).not.toHaveProperty("payerUserId");
  });

  it("defaults the payer to the viewer's member row (never a guest)", async () => {
    const user = userEvent.setup();
    renderWithClient(
      <PaymentForm tripId={TRIP_ID} open={true} onOpenChange={() => {}} />,
    );

    await screen.findByText("Mom");
    await user.type(screen.getByLabelText("Description"), "Gelato");
    await user.type(screen.getByLabelText("Amount"), "10");
    await user.click(screen.getByRole("button", { name: "Add Expense" }));

    await waitFor(() => expect(mockCreateMutate).toHaveBeenCalledTimes(1));
    const [args] = mockCreateMutate.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(args.data.payerMemberId).toBe("member-liam");
  });
});

// ============================================================================
// PaymentItem — null-safe You-labels (member-keyed)
// ============================================================================

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "payment-1",
    tripId: TRIP_ID,
    description: "Dinner",
    amount: 12000,
    payerMemberId: "member-mom",
    payerName: "Mom",
    date: new Date("2026-09-14T12:00:00Z"),
    createdBy: "user-liam",
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-09-14T12:00:00Z"),
    updatedAt: new Date("2026-09-14T12:00:00Z"),
    participants: [
      {
        id: "pp-1",
        paymentId: "payment-1",
        memberId: "member-liam",
        shareAmount: 6000,
        name: "Liam",
        createdAt: new Date("2026-09-14T12:00:00Z"),
      },
      {
        id: "pp-2",
        paymentId: "payment-1",
        memberId: "member-mom",
        shareAmount: 6000,
        name: "Mom",
        createdAt: new Date("2026-09-14T12:00:00Z"),
      },
    ],
    ...overrides,
  };
}

describe("PaymentItem with guests", () => {
  it("shows the guest name (never 'You') when a guest paid", () => {
    render(
      <PaymentItem payment={makePayment()} currentMemberId="member-liam" />,
    );
    expect(screen.getByText("Dinner")).toBeDefined();
    expect(screen.getByText(/Mom/)).toBeDefined();
    expect(screen.queryByText(/^You$/)).toBeNull();
  });

  it("shows 'You' when the viewer's member row paid", () => {
    render(
      <PaymentItem
        payment={makePayment({ payerMemberId: "member-liam", payerName: "Liam" })}
        currentMemberId="member-liam"
      />,
    );
    expect(screen.getByText(/You/)).toBeDefined();
  });
});

// ============================================================================
// BalanceList — guest debt rows + me-first sort
// ============================================================================

describe("BalanceList with guests", () => {
  const guestDebt: BalanceEntry = {
    from: { id: "member-mom", name: "Mom" },
    to: { id: "member-liam", name: "Liam" },
    amount: 4000,
  };
  const otherDebt: BalanceEntry = {
    from: { id: "member-sarah", name: "Sarah Chen" },
    to: { id: "member-ben", name: "Ben Ortiz" },
    amount: 1250,
  };

  function mockBalances(balances: BalanceEntry[]) {
    mockApiRequest.mockImplementation((url: string) => {
      if (typeof url === "string" && url.endsWith("/members")) {
        return Promise.resolve({ success: true, members: MEMBERS });
      }
      if (typeof url === "string" && url.endsWith("/balances")) {
        return Promise.resolve({ success: true, balances });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
  }

  it("shows a guest debt row with the guest name", async () => {
    mockBalances([guestDebt]);
    renderWithClient(<BalanceList tripId={TRIP_ID} />);

    // Viewer is Liam (member-liam): "Mom owes You $40.00"
    expect(await screen.findByText(/Mom.*You/)).toBeDefined();
    expect(screen.getByText("$40.00")).toBeDefined();
  });

  it("sorts the viewer's balances (incl. guest debts) first", async () => {
    mockBalances([otherDebt, guestDebt]);
    renderWithClient(<BalanceList tripId={TRIP_ID} />);

    await screen.findByText(/Mom.*You/);
    const rows = screen.getAllByText(/owes?/);
    // First row involves the viewer (Mom owes You); unrelated debt sorts last
    expect(rows[0]?.textContent).toMatch(/Mom/);
    expect(rows[rows.length - 1]?.textContent).toMatch(/Sarah Chen/);
  });
});

// ============================================================================
// SettlementForm — guest counterparty, no venmo link for guests
// ============================================================================

describe("SettlementForm with guests", () => {
  it("records a member-keyed settlement with a guest counterparty", async () => {
    const user = userEvent.setup();
    const entry: BalanceEntry = {
      from: { id: "member-liam", name: "Liam" },
      to: { id: "member-mom", name: "Mom" },
      amount: 4000,
    };
    renderWithClient(
      <SettlementForm
        tripId={TRIP_ID}
        open={true}
        onOpenChange={() => {}}
        entry={entry}
      />,
    );

    await screen.findByText("Mom");
    await user.click(
      screen.getByRole("button", { name: "Record Settlement" }),
    );

    await waitFor(() => expect(mockCreateMutate).toHaveBeenCalledTimes(1));
    const [args] = mockCreateMutate.mock.calls[0] as [
      { tripId: string; data: Record<string, unknown> },
    ];
    expect(args.data.payerMemberId).toBe("member-liam");
    expect(args.data.participants).toEqual([{ memberId: "member-mom" }]);
    expect(args.data).not.toHaveProperty("userId");
  });

  it("shows no Venmo link when the recipient is a guest", async () => {
    const entry: BalanceEntry = {
      from: { id: "member-liam", name: "Liam" },
      to: { id: "member-mom", name: "Mom" },
      amount: 4000,
    };
    renderWithClient(
      <SettlementForm
        tripId={TRIP_ID}
        open={true}
        onOpenChange={() => {}}
        entry={entry}
      />,
    );

    await screen.findByText("Mom");
    // Wait until the members query resolves so the assertion is meaningful
    // (the guest row carries no handles, so no link may ever render).
    await waitFor(() => {
      const state = queryClient.getQueryState(["members", "list", TRIP_ID]);
      expect(state?.status).toBe("success");
    });
    // Guest has no handles — no Venmo quick link renders
    expect(screen.queryByText(/Pay .* on Venmo/)).toBeNull();
  });

  it("shows the Venmo link when the recipient is a full member with a handle", async () => {
    const entry: BalanceEntry = {
      from: { id: "member-mom", name: "Mom" },
      to: { id: "member-liam", name: "Liam" },
      amount: 4000,
    };
    renderWithClient(
      <SettlementForm
        tripId={TRIP_ID}
        open={true}
        onOpenChange={() => {}}
        entry={entry}
      />,
    );

    await screen.findByText("Mom");
    expect(await screen.findByText("Pay Liam on Venmo")).toBeDefined();
  });
});
