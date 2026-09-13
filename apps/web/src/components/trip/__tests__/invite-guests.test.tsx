import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InviteMembersDialog } from "../invite-members-dialog";

const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: mockToast }));

vi.mock("@/components/ui/phone-input", () => ({
  PhoneInput: ({
    value,
    onChange,
    disabled,
    placeholder,
    ...rest
  }: {
    value?: string;
    onChange?: (value?: string) => void;
    disabled?: boolean;
    placeholder?: string;
    [k: string]: unknown;
  }) => (
    <input
      type="tel"
      value={value || ""}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={(rest["aria-label"] as string) || "Phone number"}
      data-testid={rest["aria-label"] === "Guest phone (optional)" ? "guest-phone-input" : "phone-input"}
    />
  ),
}));

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  APIError: class APIError extends Error {
    constructor(public code: string, message: string) {
      super(message);
      this.name = "APIError";
    }
  },
  getUploadUrl: (u: string | null) => u || "",
}));

vi.mock("@/lib/format", () => ({
  formatPhoneNumber: (p: string) => p,
  getInitials: (n: string) => n.slice(0, 2).toUpperCase(),
}));

const mockUseMutualSuggestions = vi.fn();
vi.mock("@/hooks/use-mutuals", () => ({
  useMutualSuggestions: (...args: unknown[]) => mockUseMutualSuggestions(...args),
}));

let queryClient: QueryClient;
const defaultProps = { open: true, onOpenChange: vi.fn(), tripId: "trip-123" };

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });
  vi.clearAllMocks();
  mockUseMutualSuggestions.mockReturnValue({ data: undefined, isPending: false, isError: false });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const renderDialog = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <InviteMembersDialog {...defaultProps} />
    </QueryClientProvider>,
  );

describe("InviteMembersDialog guest section (Task 7.5)", () => {
  it("renders WITHOUT AN ACCOUNT section with helper copy; Add guest disabled until name", () => {
    renderDialog();
    expect(screen.getByTestId("guest-section")).toBeDefined();
    expect(
      screen.getByText(/No app needed\. You plan for them; they can claim their spot later/),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: /add guest/i })).toHaveProperty("disabled", true);
  });

  it("add guest name-only shows terracotta chip and submits to POST guests endpoint", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockResolvedValueOnce({ success: true, member: { id: "m1" } });
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText("Guest name"), "Mom");
    await user.click(screen.getByRole("button", { name: /add guest/i }));

    await waitFor(() => {
      expect(screen.getByTestId("guest-chips")).toBeDefined();
      expect(screen.getByText("Mom")).toBeDefined();
    });
    const chip = screen.getByText("Mom").closest("[data-slot='badge']");
    expect(chip?.className).toContain("bg-accent");

    await user.click(screen.getByRole("button", { name: /send invitations/i }));
    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        "/trips/trip-123/members/guests",
        expect.objectContaining({ method: "POST" }),
      );
      const body = JSON.parse(vi.mocked(apiRequest).mock.calls[0][1]?.body as string);
      expect(body.displayName).toBe("Mom");
      expect(body.guestPhone).toBeUndefined();
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining("1 guest added"));
    });
  });

  it("announces the guest count in a polite live region and labels terracotta chips", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText("Guest name"), "Mom");
    await user.click(screen.getByRole("button", { name: /add guest/i }));

    await waitFor(() => {
      expect(screen.getByText("Mom")).toBeDefined();
    });
    expect(
      screen.getByText("Terracotta chips are guests without accounts."),
    ).toBeDefined();
    expect(screen.getByText("1 guest added")).toBeDefined();
  });

  it("rejects a case-insensitive duplicate guest name with inline error", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText("Guest name"), "Mom");
    await user.click(screen.getByRole("button", { name: /add guest/i }));
    await waitFor(() => expect(screen.getByText("Mom")).toBeDefined());

    await user.type(screen.getByLabelText("Guest name"), "mom");
    await user.click(screen.getByRole("button", { name: /add guest/i }));

    await waitFor(() => {
      expect(screen.getByText("mom is already added.")).toBeDefined();
    });
    expect(screen.getByText("1 guest added")).toBeDefined();
  });

  it("caps queued guests at 15 with inline messaging", async () => {
    const user = userEvent.setup();
    renderDialog();

    for (let i = 0; i < 15; i++) {
      await user.type(screen.getByLabelText("Guest name"), `Guest${i}`);
      await user.click(screen.getByRole("button", { name: /add guest/i }));
    }
    await waitFor(() => {
      expect(screen.getByText("15 guests added. You reached the 15 guest limit.")).toBeDefined();
    });
    expect(screen.getByRole("button", { name: /add guest/i })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("shows the cap error when a 16th guest is attempted via Enter", async () => {
    const user = userEvent.setup();
    renderDialog();

    for (let i = 0; i < 15; i++) {
      await user.type(screen.getByLabelText("Guest name"), `Guest${i}{enter}`);
    }
    await waitFor(() => {
      expect(screen.getByText("15 guests added. You reached the 15 guest limit.")).toBeDefined();
    });

    await user.type(screen.getByLabelText("Guest name"), "Extra{enter}");
    await waitFor(() => {
      expect(
        screen.getByText("You can add up to 15 guests. Remove one to add another."),
      ).toBeDefined();
    });
    expect(screen.queryByText("Extra")).toBeNull();
  });

  it("Enter in the name field adds the guest and clears the input", async () => {
    const user = userEvent.setup();
    renderDialog();

    const nameInput = screen.getByLabelText("Guest name");
    await user.type(nameInput, "Mom{enter}");

    await waitFor(() => {
      expect(screen.getByTestId("guest-chips")).toBeDefined();
      expect(screen.getByText("Mom")).toBeDefined();
      expect(nameInput).toHaveProperty("value", "");
    });
  });

  it("409 DUPLICATE_MEMBER surfaces '[Name] is already in this trip' toast and skipped list", async () => {
    const { apiRequest, APIError } = await import("@/lib/api");
    vi.mocked(apiRequest).mockRejectedValueOnce(new APIError("DUPLICATE_MEMBER", "already in trip"));
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText("Guest name"), "Mom");
    await user.click(screen.getByRole("button", { name: /add guest/i }));
    await waitFor(() => expect(screen.getByText("Mom")).toBeDefined());

    await user.click(screen.getByRole("button", { name: /send invitations/i }));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Mom is already in this trip");
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining("Skipped: Mom"));
    });
  });
});
