import { describe, it, expect, vi, beforeEach } from "vitest";
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

describe("MemberProfileSheet guest claim actions (Task 7.3)", () => {
  it("send-invite happy path toasts the guest phone", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole("button", { name: /send invite/i }));
    await waitFor(() => {
      expect(mockInviteMutate).toHaveBeenCalledWith({ phoneNumbers: ["+14155551111"], userIds: [] });
      expect(mockToast.success).toHaveBeenCalledWith("Invite sent to +14155551111");
    });
  });

  it("send-invite button is disabled while a pending invitation exists", () => {
    mockUseInvitations.mockReturnValue({
      data: [
        { id: "inv-1", tripId: "trip-123", inviterId: "u", inviteePhone: "+14155551111", status: "pending", sentAt: "", respondedAt: null, createdAt: "", updatedAt: "" },
      ],
      isPending: false,
    });
    renderSheet();
    const btn = screen.getByRole("button", { name: /invite sent/i });
    expect(btn).toHaveProperty("disabled", true);
  });

  it("attach-to-mutual confirm claims and toasts 'Mom is now Sarah Chen'", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange });
    await user.click(screen.getByRole("button", { name: /attach to a mutual/i }));
    await user.click(screen.getByRole("radio", { name: /sarah chen/i }));
    await waitFor(() => {
      expect(screen.getByText(/Attach Mom to Sarah Chen\?/)).toBeDefined();
    });
    await user.click(screen.getByRole("button", { name: /attach to sarah chen/i }));
    await waitFor(() => {
      expect(mockInviteMutate).toHaveBeenCalledWith({ phoneNumbers: [], userIds: ["user-9"] });
      expect(mockToast.success).toHaveBeenCalledWith("Mom is now Sarah Chen");
    });
  });

  it("edit guest saves name/phone/rsvp via PATCH", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole("button", { name: /edit guest/i }));
    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Mama");
    await user.click(screen.getByRole("radio", { name: "Going" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledWith({
        memberId: "member-guest-1",
        data: expect.objectContaining({ displayName: "Mama", status: "going" }),
      });
      expect(mockToast.success).toHaveBeenCalledWith("Guest updated");
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

  it("non-organizer sees a read-only sheet (no claim/edit/remove)", () => {
    renderSheet({ isOrganizer: false });
    expect(screen.queryByRole("button", { name: /send invite/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /attach to a mutual/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /edit guest/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^remove guest/i })).toBeNull();
    // Guest identity chrome still renders
    expect(screen.getByText("Guest")).toBeDefined();
  });
});
