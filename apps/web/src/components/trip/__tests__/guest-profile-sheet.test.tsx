import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemberProfileSheet } from "../member-profile-sheet";
import type { MemberWithProfile } from "@/hooks/use-invitations";

const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: mockToast }));

vi.mock("@/lib/format", () => ({
  getInitials: (name: string) =>
    name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2),
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

// Mock PhoneInput as a plain tel input (same seam as invite dialog tests)
vi.mock("@/components/ui/phone-input", () => ({
  PhoneInput: ({
    value,
    onChange,
    onBlur,
    placeholder,
    id,
  }: {
    value?: string;
    onChange?: (value?: string) => void;
    onBlur?: () => void;
    placeholder?: string;
    id?: string;
  }) => (
    <input
      type="tel"
      id={id}
      value={value || ""}
      onChange={(e) => onChange?.(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      aria-label="Guest phone number"
    />
  ),
}));

const mockUseInvitations = vi.fn();
const mockInviteMutate = vi.fn();
const mockInviteMembers = vi.fn();
const mockRemoveMutate = vi.fn();
const mockRemoveMember = vi.fn();
const mockUpdateMutate = vi.fn();
const mockUpdateGuest = vi.fn();
const mockUseMutualSuggestions = vi.fn();

vi.mock("@/hooks/use-invitations", () => ({
  useInvitations: (tripId: string, opts?: { enabled?: boolean }) =>
    mockUseInvitations(tripId, opts),
  useInviteMembers: (tripId: string) => mockInviteMembers(tripId),
  useRemoveMember: (tripId: string) => mockRemoveMember(tripId),
  getInviteMembersErrorMessage: () => "Failed to invite",
  getRemoveMemberErrorMessage: () => "Failed to remove",
}));
vi.mock("@/hooks/use-mutuals", () => ({
  useMutualSuggestions: (tripId: string) => mockUseMutualSuggestions(tripId),
}));
vi.mock("@/hooks/use-guest-members", () => ({
  useUpdateGuest: (tripId: string) => mockUpdateGuest(tripId),
  getUpdateGuestErrorMessage: () => "Failed to update",
}));

let queryClient: QueryClient;

// Radix Select calls hasPointerCapture/setPointerCapture/releasePointerCapture
// which are not available in jsdom -- stub them on Element.prototype
let originalHasPointerCapture: typeof Element.prototype.hasPointerCapture;
let originalSetPointerCapture: typeof Element.prototype.setPointerCapture;
let originalReleasePointerCapture: typeof Element.prototype.releasePointerCapture;
let originalScrollIntoView: typeof Element.prototype.scrollIntoView;

beforeEach(() => {
  originalHasPointerCapture = Element.prototype.hasPointerCapture;
  originalSetPointerCapture = Element.prototype.setPointerCapture;
  originalReleasePointerCapture = Element.prototype.releasePointerCapture;
  originalScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  Element.prototype.hasPointerCapture = originalHasPointerCapture;
  Element.prototype.setPointerCapture = originalSetPointerCapture;
  Element.prototype.releasePointerCapture = originalReleasePointerCapture;
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

const guestMom: MemberWithProfile = {
  id: "member-guest-1",
  userId: null,
  displayName: "Mom",
  profilePhotoUrl: null,
  phoneNumber: "+14155551111",
  guestPhone: "+14155551111",
  status: "no_response",
  isOrganizer: false,
  createdAt: "2026-01-05T00:00:00Z",
  handles: null,
};

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });
  vi.clearAllMocks();
  mockToast.success.mockClear();
  mockUseInvitations.mockReturnValue({ data: [], isPending: false });
  mockInviteMutate.mockResolvedValue({ success: true, invitations: [], skipped: [] });
  mockInviteMembers.mockReturnValue({ mutateAsync: mockInviteMutate, isPending: false });
  mockRemoveMutate.mockResolvedValue(undefined);
  mockRemoveMember.mockReturnValue({ mutateAsync: mockRemoveMutate, isPending: false });
  mockUpdateMutate.mockResolvedValue(guestMom);
  mockUpdateGuest.mockReturnValue({ mutateAsync: mockUpdateMutate, isPending: false });
  mockUseMutualSuggestions.mockReturnValue({
    data: {
      success: true,
      mutuals: [
        { id: "user-9", displayName: "Sarah Chen", profilePhotoUrl: null, sharedTripCount: 1, sharedTrips: [] },
      ],
      nextCursor: null,
    },
    isPending: false,
  });
});

const renderSheet = (props?: Partial<React.ComponentProps<typeof MemberProfileSheet>>) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemberProfileSheet
        member={guestMom}
        open={true}
        onOpenChange={vi.fn()}
        tripId="trip-123"
        isOrganizer={true}
        {...props}
      />
    </QueryClientProvider>,
  );

describe("MemberProfileSheet guest redesign", () => {
  it("name click-to-edit PATCHes displayName", async () => {
    const user = userEvent.setup();
    renderSheet();
    // Header shows the name as static text (matches standard member sheet)
    await user.click(screen.getByRole("button", { name: "Edit guest name" }));
    const nameInput = screen.getByLabelText("Guest name");
    expect(nameInput).toHaveProperty("value", "Mom");
    await user.clear(nameInput);
    await user.type(nameInput, "Mama");
    await user.tab();
    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledWith({
        memberId: "member-guest-1",
        data: { displayName: "Mama" },
      });
      expect(mockToast.success).toHaveBeenCalledWith("Guest updated");
    });
    // Phone key omitted entirely (never null)
    const sent = mockUpdateMutate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect("guestPhone" in sent.data).toBe(false);
  });

  it("guest header matches the standard member header (left-aligned Playfair title, click-to-edit)", () => {
    renderSheet();
    // At rest the name is static text in the header (no visible input)
    expect(screen.queryByLabelText("Guest name")).toBeNull();
    const titleButton = screen.getByRole("button", {
      name: "Edit guest name",
    });
    // Header keeps the member-sheet treatment: name is the accessible
    // button label and the subtitle carries the guest identity.
    expect(titleButton).toHaveAccessibleName("Edit guest name");
    expect(
      screen.getByText((_, el) => el?.textContent === "Guest · No response"),
    ).toBeDefined();
  });

  it("RSVP renders pill buttons including No response", () => {
    renderSheet();
    for (const name of ["Going", "Maybe", "No response", "Not Going"]) {
      expect(screen.getByRole("button", { name })).toBeDefined();
    }
  });

  it("RSVP click PATCHes status instantly", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole("button", { name: "Going" }));
    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledWith({
        memberId: "member-guest-1",
        data: { status: "going" },
      });
    });
  });

  it("phone row Send PATCHes then invites when number changed", async () => {
    const user = userEvent.setup();
    renderSheet();
    const phoneInput = screen.getByLabelText("Guest phone number");
    await user.clear(phoneInput);
    await user.type(phoneInput, "+14155552222");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledWith({
        memberId: "member-guest-1",
        data: { guestPhone: "+14155552222" },
      });
      expect(mockInviteMutate).toHaveBeenCalledWith({
        phoneNumbers: ["+14155552222"],
        userIds: [],
      });
      expect(mockToast.success).toHaveBeenCalledWith(
        "Invite sent to +14155552222",
      );
    });
  });

  it("phone row Send invites only when number unchanged", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(mockInviteMutate).toHaveBeenCalledWith({
        phoneNumbers: ["+14155551111"],
        userIds: [],
      });
      expect(mockToast.success).toHaveBeenCalledWith(
        "Invite sent to +14155551111",
      );
    });
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  it("Send is disabled when the phone field is empty", async () => {
    const user = userEvent.setup();
    renderSheet();
    const phoneInput = screen.getByLabelText("Guest phone number");
    await user.clear(phoneInput);
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(mockInviteMutate).not.toHaveBeenCalled();
  });

  it("Send invite closes the sheet", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange });
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(mockInviteMutate).toHaveBeenCalledWith({
        phoneNumbers: ["+14155551111"],
        userIds: [],
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("shows a disabled 'Invite sent' status when a pending invitation exists", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockUseInvitations.mockReturnValue({
      data: [
        { id: "inv-1", tripId: "trip-123", inviterId: "u", inviteePhone: "+14155551111", status: "pending", sentAt: "", respondedAt: null, createdAt: "", updatedAt: "" },
      ],
      isPending: false,
    });
    renderSheet({ onOpenChange });
    const sentButton = screen.getByRole("button", { name: /invite sent/i });
    expect(sentButton).toBeInTheDocument();
    expect(sentButton).toHaveProperty("disabled", true);
    expect(sentButton.querySelector("svg")).toBeInTheDocument();
    await user.click(sentButton);
    expect(mockInviteMutate).not.toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("editing the phone number after an invite re-enables Send", async () => {
    const user = userEvent.setup();
    mockUseInvitations.mockReturnValue({
      data: [
        { id: "inv-1", tripId: "trip-123", inviterId: "u", inviteePhone: "+14155551111", status: "pending", sentAt: "", respondedAt: null, createdAt: "", updatedAt: "" },
      ],
      isPending: false,
    });
    renderSheet();
    const phoneInput = screen.getByLabelText("Guest phone number");
    await user.clear(phoneInput);
    await user.type(phoneInput, "+14155552222");
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("renders a visible label for the guest phone input", () => {
    renderSheet();
    expect(screen.getByText("Guest phone number")).toBeInTheDocument();
  });

  it("invalid phone number shows an error on blur and keeps Send disabled", async () => {
    const user = userEvent.setup();
    renderSheet();
    const phoneInput = screen.getByLabelText("Guest phone number");
    await user.clear(phoneInput);
    await user.type(phoneInput, "123");
    await user.tab();
    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Enter a valid phone number");
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(mockInviteMutate).not.toHaveBeenCalled();
  });

  it("mutual row Invite is disabled until a mutual is selected, then claims", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange });
    const inviteBtn = screen.getByRole("button", { name: "Invite" });
    expect(inviteBtn).toHaveProperty("disabled", true);

    await user.click(screen.getByRole("combobox", { name: /choose a mutual/i }));
    await user.click(
      await screen.findByRole("option", { name: /Sarah Chen/ }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Invite" }),
      ).toHaveProperty("disabled", false);
    });
    await user.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() => {
      expect(mockInviteMutate).toHaveBeenCalledWith({
        phoneNumbers: [],
        userIds: ["user-9"],
      });
      expect(mockToast.success).toHaveBeenCalledWith("Mom is now Sarah Chen");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("remove guest confirms with travel/expenses copy and removes", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole("button", { name: /^remove guest/i }));
    await waitFor(() => {
      expect(screen.getByText(/Their travel and expenses are removed too/)).toBeDefined();
    });
    await user.click(screen.getByRole("button", { name: /^remove$/i }));
    await waitFor(() => {
      expect(mockRemoveMutate).toHaveBeenCalledWith("member-guest-1");
    });
  });

  it("non-organizer sees a read-only sheet (no invite rows or remove)", () => {
    renderSheet({ isOrganizer: false });
    expect(screen.queryByLabelText("Guest phone number")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Invite" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^remove guest/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Going" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Maybe" })).toBeNull();
    expect(screen.queryByRole("button", { name: "No response" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Not Going" })).toBeNull();
    // Guest identity chrome still renders (description line, no badge)
    expect(
      screen.getByText((_, el) => el?.textContent === "Guest · No response"),
    ).toBeDefined();
  });

  it("rsvp failure surfaces an inline error", async () => {
    const user = userEvent.setup();
    mockUpdateMutate.mockRejectedValue(new Error("nope"));
    renderSheet();
    await user.click(screen.getByRole("button", { name: "Going" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
    });
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("Enter commits the name edit (Escape still cancels)", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole("button", { name: "Edit guest name" }));
    const nameInput = screen.getByLabelText("Guest name");
    await user.clear(nameInput);
    await user.type(nameInput, "Mama{enter}");
    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledWith({
        memberId: "member-guest-1",
        data: { displayName: "Mama" },
      });
    });
  });

  it("phone draft re-syncs when the member row changes while not editing", async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemberProfileSheet
          member={guestMom}
          open={true}
          onOpenChange={onOpenChange}
          tripId="trip-123"
          isOrganizer={true}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText("Guest phone number")).toHaveProperty(
      "value",
      "+14155551111",
    );
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemberProfileSheet
          member={{ ...guestMom, guestPhone: "+14155559999" }}
          open={true}
          onOpenChange={onOpenChange}
          tripId="trip-123"
          isOrganizer={true}
        />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Guest phone number")).toHaveProperty(
        "value",
        "+14155559999",
      );
    });
  });

  it("routes post-update invite failures through the invite error message", async () => {
    const user = userEvent.setup();
    mockUpdateMutate.mockResolvedValue(guestMom);
    mockInviteMutate.mockRejectedValueOnce(
      Object.assign(new Error("invite boom"), { code: "RATE_LIMITED" }),
    );
    renderSheet();
    const phoneInput = screen.getByLabelText("Guest phone number");
    await user.clear(phoneInput);
    await user.type(phoneInput, "+14155552222");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Failed to invite");
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("rsvp pills expose aria-pressed with the current status active", () => {
    renderSheet();
    expect(
      screen.getByRole("button", { name: "No response" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Going" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("send failure reverts the phone draft to the prior number", async () => {
    const user = userEvent.setup();
    mockUpdateMutate.mockRejectedValueOnce(
      Object.assign(new Error("boom"), { code: "VALIDATION_ERROR" }),
    );
    renderSheet();
    const phoneInput = screen.getByLabelText("Guest phone number");
    await user.clear(phoneInput);
    await user.type(phoneInput, "+14155552222");
    await user.click(screen.getByRole("button", { name: "Send" }));
    // The mutation rollback restores the row; the draft must follow so
    // phoneEdited clears instead of sticking on the rejected number.
    await waitFor(() => {
      expect(screen.getByLabelText("Guest phone number")).toHaveProperty(
        "value",
        "+14155551111",
      );
    });
    expect(mockInviteMutate).not.toHaveBeenCalled();
  });

  it("edit pencil affordance renders inside the name button", () => {
    renderSheet();
    // Sheet content renders into a Radix portal — query via screen, not container
    const editBtn = screen.getByRole("button", { name: "Edit guest name" });
    expect(editBtn.querySelector("svg")).toBeInTheDocument();
  });
});
