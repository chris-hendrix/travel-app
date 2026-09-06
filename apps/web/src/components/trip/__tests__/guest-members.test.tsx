import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MembersList } from "../members-list";
import type { MemberWithProfile } from "@/hooks/use-invitations";

// Mock format
vi.mock("@/lib/format", () => ({
  getInitials: (name: string) =>
    name
      .split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2),
  formatPhoneNumber: (phone: string) => phone,
  formatRelativeTime: (iso: string) => `${new Date(iso).toLocaleDateString()}`,
}));

// Mock hooks
const mockUseMembers = vi.fn();
const mockUseInvitations = vi.fn();
const mockRevokeInvitation = {
  mutateAsync: vi.fn().mockResolvedValue(undefined),
  isPending: false,
};

vi.mock("@/hooks/use-invitations", () => ({
  useMembers: (tripId: string) => mockUseMembers(tripId),
  useInvitations: (tripId: string, options?: { enabled?: boolean }) =>
    mockUseInvitations(tripId, options),
  useRevokeInvitation: () => mockRevokeInvitation,
  getRevokeInvitationErrorMessage: () => "Failed to revoke invitation",
}));

const mockMuteMember = {
  mutateAsync: vi.fn().mockResolvedValue({ success: true }),
  isPending: false,
};
const mockUnmuteMember = {
  mutateAsync: vi.fn().mockResolvedValue({ success: true }),
  isPending: false,
};

vi.mock("@/hooks/use-messages", () => ({
  useMuteMember: () => mockMuteMember,
  useUnmuteMember: () => mockUnmuteMember,
  getMuteMemberErrorMessage: () => "Failed to mute member",
  getUnmuteMemberErrorMessage: () => "Failed to unmute member",
}));

let queryClient: QueryClient;

const guestMom: MemberWithProfile = {
  id: "member-guest-1",
  userId: null,
  displayName: "Mom",
  profilePhotoUrl: null,
  phoneNumber: "+14155551111",
  status: "no_response",
  isOrganizer: false,
  createdAt: "2026-01-05T00:00:00Z",
  handles: { venmo: "@mom", instagram: "@mom" },
};

const organizerLiam: MemberWithProfile = {
  id: "member-1",
  userId: "user-1",
  displayName: "Liam",
  profilePhotoUrl: null,
  phoneNumber: "+14155551234",
  status: "going",
  isOrganizer: true,
  createdAt: "2026-01-01T00:00:00Z",
  handles: null,
};

const claimedSarah: MemberWithProfile = {
  id: "member-guest-2",
  userId: "user-9",
  displayName: "Sarah Chen",
  profilePhotoUrl: null,
  status: "going",
  isOrganizer: false,
  createdAt: "2026-01-06T00:00:00Z",
  handles: null,
};

beforeEach(() => {
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
  vi.clearAllMocks();

  mockUseMembers.mockReturnValue({
    data: [organizerLiam, guestMom],
    isPending: false,
  });
  mockUseInvitations.mockReturnValue({
    data: [],
    isPending: false,
  });
});

const renderWithQueryClient = (ui: React.ReactElement) => {
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
};

describe("MembersList guest rows (Task 7.1)", () => {
  it("guest row is visible to a non-organizer with Guest badge and dashed ring", () => {
    renderWithQueryClient(
      <MembersList tripId="trip-123" isOrganizer={false} />,
    );

    // Guest with no_response bypasses the status filter for non-organizers
    expect(screen.getByText("Mom")).toBeDefined();
    expect(screen.getByText("Guest")).toBeDefined();

    const avatar = screen.getByTestId("member-avatar-member-guest-1");
    expect(avatar.getAttribute("data-guest-ring")).toBe("dashed");
    expect(avatar.className).toContain("border-dashed");
  });

  it("guest row shows no action buttons to a non-organizer", () => {
    renderWithQueryClient(
      <MembersList tripId="trip-123" isOrganizer={false} />,
    );

    expect(
      screen.queryByRole("button", { name: "Actions for Mom" }),
    ).toBeNull();
  });

  it("guest row hides phone line and handles", () => {
    renderWithQueryClient(
      <MembersList tripId="trip-123" isOrganizer={false} />,
    );

    expect(screen.queryByText("+14155551111")).toBeNull();
    expect(screen.queryByTestId("member-venmo-member-guest-1")).toBeNull();
    expect(screen.queryByTestId("member-instagram-member-guest-1")).toBeNull();
  });

  it("claimed member renders a standard row (solid ring, no Guest badge)", () => {
    mockUseMembers.mockReturnValue({
      data: [organizerLiam, claimedSarah],
      isPending: false,
    });

    renderWithQueryClient(
      <MembersList tripId="trip-123" isOrganizer={false} />,
    );

    expect(screen.getByText("Sarah Chen")).toBeDefined();
    expect(screen.queryByText("Guest")).toBeNull();

    const avatar = screen.getByTestId("member-avatar-member-guest-2");
    expect(avatar.getAttribute("data-guest-ring")).toBe("solid");
    expect(avatar.className).not.toContain("border-dashed");
  });

  it("organizer menu for a guest shows Remove only (no mute, no Make organizer)", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const onUpdateRole = vi.fn();
    renderWithQueryClient(
      <MembersList
        tripId="trip-123"
        isOrganizer={true}
        createdBy="user-1"
        currentUserId="user-1"
        onRemove={onRemove}
        onUpdateRole={onUpdateRole}
      />,
    );

    // Guest is in the Invited tab for organizers
    await user.click(screen.getByRole("tab", { name: /Invited/ }));

    const actionsButton = screen.getByRole("button", {
      name: "Actions for Mom",
    });
    await user.click(actionsButton);

    expect(await screen.findByText("Remove from trip")).toBeDefined();
    expect(screen.queryByText("Mute")).toBeNull();
    expect(screen.queryByText("Unmute")).toBeNull();
    expect(screen.queryByText("Make co-organizer")).toBeNull();
    expect(screen.queryByText("Remove co-organizer")).toBeNull();
  });

  it("organizer Remove fires with the guest member id", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    renderWithQueryClient(
      <MembersList
        tripId="trip-123"
        isOrganizer={true}
        createdBy="user-1"
        currentUserId="user-1"
        onRemove={onRemove}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /Invited/ }));
    await user.click(screen.getByRole("button", { name: "Actions for Mom" }));
    await user.click(await screen.findByText("Remove from trip"));

    expect(onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ id: "member-guest-1", userId: null }),
    );
  });
});
