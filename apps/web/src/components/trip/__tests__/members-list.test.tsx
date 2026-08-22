import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MembersList } from "../members-list";
import type { MemberWithProfile } from "@/hooks/use-invitations";
import type { Invitation } from "@journiful/shared/types";

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
  formatRelativeTime: (iso: string) => {
    // Return a simple mock string for testing
    return `${new Date(iso).toLocaleDateString()}`;
  },
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

vi.mock("@/hooks/use-placeholders", () => ({
  useDeletePlaceholder: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }),
  useInvitePlaceholder: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }),
  useLinkPlaceholder: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }),
  useCreatePlaceholder: () => ({ mutateAsync: vi.fn().mockResolvedValue({ id: "new" }), isPending: false }),
  useUpdatePlaceholder: () => ({ mutateAsync: vi.fn().mockResolvedValue({ id: "upd" }), isPending: false }),
  getPlaceholderErrorMessage: () => null,
}));

vi.mock("@/hooks/use-mutuals", () => ({
  useMutualSuggestions: () => ({ data: { mutuals: [] }, isPending: false }),
}));

vi.mock("@/hooks/use-is-mobile", () => ({
  useIsMobile: () => false,
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

const mockMembers: MemberWithProfile[] = [
  {
    id: "member-1",
    userId: "user-1",
    displayName: "John Doe",
    profilePhotoUrl: "https://example.com/john.jpg",
    phoneNumber: "+14155551234",
    status: "going",
    isOrganizer: true,
    isPlaceholder: false,
    createdAt: "2026-01-01T00:00:00Z",
    handles: null,
  },
  {
    id: "member-2",
    userId: "user-2",
    displayName: "Jane Smith",
    profilePhotoUrl: null,
    phoneNumber: "+14155555678",
    status: "maybe",
    isOrganizer: false,
    isPlaceholder: false,
    createdAt: "2026-01-02T00:00:00Z",
    handles: null,
  },
  {
    id: "member-3",
    userId: "user-3",
    displayName: "Bob Wilson",
    profilePhotoUrl: null,
    phoneNumber: "+14155559999",
    status: "not_going",
    isOrganizer: false,
    isPlaceholder: false,
    createdAt: "2026-01-03T00:00:00Z",
    handles: null,
  },
  {
    id: "member-4",
    userId: "user-4",
    displayName: "Alice Brown",
    profilePhotoUrl: null,
    status: "no_response",
    isOrganizer: false,
    isPlaceholder: false,
    createdAt: "2026-01-04T00:00:00Z",
    handles: null,
  },
];

const mockInvitations: Invitation[] = [
  {
    id: "inv-1",
    tripId: "trip-123",
    inviterId: "user-1",
    inviteePhone: "+14155550001",
    status: "pending",
    sentAt: "2026-02-18T12:00:00Z",
    respondedAt: null,
    createdAt: "2026-02-18T12:00:00Z",
    updatedAt: "2026-02-18T12:00:00Z",
  },
  {
    id: "inv-2",
    tripId: "trip-123",
    inviterId: "user-1",
    inviteePhone: "+14155550002",
    status: "failed",
    sentAt: "2026-02-17T12:00:00Z",
    respondedAt: null,
    createdAt: "2026-02-17T12:00:00Z",
    updatedAt: "2026-02-17T12:00:00Z",
  },
];

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },

  });
  vi.clearAllMocks();

  mockUseMembers.mockReturnValue({
    data: mockMembers,
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

describe("MembersList", () => {
  describe("loading state", () => {
    it("renders skeleton loading state when data is pending", () => {
      mockUseMembers.mockReturnValue({
        data: undefined,
        isPending: true,
      });

      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      expect(screen.getByTestId("members-list-skeleton")).toBeDefined();
    });
  });

  describe("empty state", () => {
    it("handles empty member list gracefully", () => {
      mockUseMembers.mockReturnValue({
        data: [],
        isPending: false,
      });

      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      expect(screen.getByText("No members yet")).toBeDefined();
    });

    it("shows invite button in empty state for organizers", () => {
      mockUseMembers.mockReturnValue({
        data: [],
        isPending: false,
      });

      const onInvite = vi.fn();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={true}
          onInvite={onInvite}
        />,
      );

      expect(screen.getByText("Invite members")).toBeDefined();
    });

    it("does NOT show invite button in empty state for non-organizers", () => {
      mockUseMembers.mockReturnValue({
        data: [],
        isPending: false,
      });

      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      expect(screen.queryByText("Invite members")).toBeNull();
    });
  });

  describe("hook calls", () => {
    it("calls useMembers with correct tripId", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      expect(mockUseMembers).toHaveBeenCalledWith("trip-123");
    });

    it("calls useInvitations with enabled=true for organizers", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={true} />,
      );

      expect(mockUseInvitations).toHaveBeenCalledWith("trip-123", {
        enabled: true,
      });
    });

    it("calls useInvitations with enabled=false for non-organizers", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      expect(mockUseInvitations).toHaveBeenCalledWith("trip-123", {
        enabled: false,
      });
    });
  });

  describe("grouped rendering (no tabs)", () => {
    it("shows Going and Maybe headings for non-organizers", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      expect(screen.getByRole("heading", { name: "Going" })).toBeDefined();
      expect(screen.getByRole("heading", { name: "Maybe" })).toBeDefined();
      expect(screen.queryByRole("heading", { name: "Not going" })).toBeNull();
      // Invited hidden when no invitations and no placeholders pending
      // but Not invited heading exists for organizers only — for non-organizer it is hidden
      expect(screen.queryByRole("heading", { name: "Invited" })).toBeNull();
    });

    it("shows all grouped headings for organizers", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={true} />,
      );

      expect(screen.getByRole("heading", { name: "Going" })).toBeDefined();
      expect(screen.getByRole("heading", { name: "Maybe" })).toBeDefined();
      expect(screen.getByRole("heading", { name: "Not going" })).toBeDefined();
      // Invited only when pendingInvitations>0, so with no invitations it is not rendered
      // Placeholders hidden when 0 (hide-empty)
      expect(screen.queryByRole("heading", { name: "Placeholders" })).toBeNull();
      expect(screen.queryByRole("heading", { name: "Not invited" })).toBeNull();
    });

    it("shows correct counts in headings", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={true} />,
      );

      // Check count badges near headings (going 1, maybe 1, not going 1)
      const goingHeading = screen.getByRole("heading", { name: "Going" }).parentElement!;
      expect(within(goingHeading).getByText("1")).toBeDefined();
      const maybeHeading = screen.getByRole("heading", { name: "Maybe" }).parentElement!;
      expect(within(maybeHeading).getByText("1")).toBeDefined();
      const notGoingHeading = screen.getByRole("heading", { name: "Not going" }).parentElement!;
      expect(within(notGoingHeading).getByText("1")).toBeDefined();
      // Placeholders hidden when 0, so no heading
      expect(screen.queryByRole("heading", { name: "Placeholders" })).toBeNull();
    });

    it("shows Invited heading when pending invitations exist", () => {
      mockUseInvitations.mockReturnValue({
        data: mockInvitations,
        isPending: false,
      });

      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={true} />,
      );

      expect(screen.getByRole("heading", { name: "Invited" })).toBeDefined();
      const invitedHeading = screen.getByRole("heading", { name: "Invited" }).parentElement!;
      expect(within(invitedHeading).getByText("3")).toBeDefined();
    });

    it("renders Going section first", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      const headings = screen.getAllByRole("heading");
      expect(headings[0]!.textContent).toBe("Going");
    });
  });

  describe("Going section content (grouped)", () => {
    it("renders going members alongside other sections", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      expect(screen.getByText("John Doe")).toBeDefined();
      // With grouped rendering, Maybe members are also visible
      expect(screen.getByText("Jane Smith")).toBeDefined();
    });

    it("renders avatars for visible members (grouped shows 2)", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      const avatars = document.querySelectorAll("[data-slot='avatar']");
      // Going (John) + Maybe (Jane) = 2 avatars for non-organizer grouped view
      expect(avatars.length).toBe(2);
    });

    it("shows Organizer badge for organizer members", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      expect(screen.getByText("Organizer")).toBeDefined();
    });

    it("Organizer badge uses gradient styling", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      const organizerBadge = screen
        .getByText("Organizer")
        .closest("[data-slot='badge']");
      expect(organizerBadge).not.toBeNull();
      expect(organizerBadge!.className).toContain("bg-gradient-to-r");
      expect(organizerBadge!.className).toContain("from-primary");
      expect(organizerBadge!.className).toContain("to-accent");
    });

    it("does not show Organizer badge for non-organizer members", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      expect(screen.getByText("Jane Smith")).toBeDefined();
      // Only John Doe has Organizer badge, Jane should not contribute another
      expect(screen.getAllByText("Organizer").length).toBe(1);
      const janeRow = screen.getByText("Jane Smith").closest(".py-3")!;
      expect(janeRow.textContent).not.toContain("Organizer");
    });
  });

  describe("Maybe tab content", () => {
    it("renders maybe members alongside going (grouped)", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      expect(screen.getByText("Jane Smith")).toBeDefined();
      expect(screen.getByText("John Doe")).toBeDefined();
    });

    it("renders avatar with initials fallback when no photo", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      // grouped: Maybe visible without tab click

      expect(screen.getByText("JS")).toBeDefined();
    });
  });

  describe("Not Going tab content", () => {
    it("renders not_going members when tab is clicked", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={true} />,
      );

      // grouped: Not going visible without tab

      expect(screen.getByText("Bob Wilson")).toBeDefined();
    });

    it("is not visible for non-organizers", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      expect(screen.queryByRole("tab", { name: /Not Going/ })).toBeNull();
    });
  });

  describe("Invited tab content", () => {
    it("renders no_response members in Invited tab", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={true} />,
      );

      // grouped: Invited visible without tab

      expect(screen.getByText("Alice Brown")).toBeDefined();
    });

    it("renders pending invitations with phone number and Pending badge", async () => {
      mockUseInvitations.mockReturnValue({
        data: mockInvitations,
        isPending: false,
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={true} />,
      );

      // grouped: Invited visible without tab

      expect(screen.getByText("+14155550001")).toBeDefined();
      expect(screen.getByText("Pending")).toBeDefined();
    });

    it("renders failed invitations with destructive badge", async () => {
      mockUseInvitations.mockReturnValue({
        data: mockInvitations,
        isPending: false,
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={true} />,
      );

      // grouped: Invited visible without tab

      expect(screen.getByText("+14155550002")).toBeDefined();
      const failedBadge = screen.getByText("Failed");
      expect(failedBadge).toBeDefined();
      const badgeEl = failedBadge.closest("[data-slot='badge']");
      expect(badgeEl!.className).toContain("destructive");
    });

    it("shows sent date for pending invitations", async () => {
      mockUseInvitations.mockReturnValue({
        data: mockInvitations,
        isPending: false,
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={true} />,
      );

      // grouped: Invited visible without tab

      // formatRelativeTime is mocked to return date string
      const sentTexts = screen.getAllByText(/^Sent /);
      expect(sentTexts.length).toBe(2);
    });

    it("shows revoke button on pending invitation rows", async () => {
      mockUseInvitations.mockReturnValue({
        data: mockInvitations,
        isPending: false,
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={true} />,
      );

      // grouped: Invited visible without tab

      expect(
        screen.getByRole("button", {
          name: "Revoke invitation to +14155550001",
        }),
      ).toBeDefined();
      expect(
        screen.getByRole("button", {
          name: "Revoke invitation to +14155550002",
        }),
      ).toBeDefined();
    });

    it("calls revokeInvitation when revoke button is clicked", async () => {
      mockUseInvitations.mockReturnValue({
        data: mockInvitations,
        isPending: false,
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={true} />,
      );

      // grouped: Invited visible without tab

      const revokeButton = screen.getByRole("button", {
        name: "Revoke invitation to +14155550001",
      });
      await user.click(revokeButton);

      expect(mockRevokeInvitation.mutateAsync).toHaveBeenCalledWith("inv-1");
    });

    it("is not visible for non-organizers", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      expect(screen.queryByRole("tab", { name: /Invited/ })).toBeNull();
    });
  });

  describe("phone number display", () => {
    it("shows phone numbers when phoneNumber is present in the data", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={true} />,
      );

      // John Doe is on the Going tab (default)
      expect(screen.getByText("+14155551234")).toBeDefined();
    });

    it("shows phone numbers for non-organizers when phoneNumber is present", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      // API handles phone filtering server-side
      expect(screen.getByText("+14155551234")).toBeDefined();
    });

    it("does NOT show phone numbers when phoneNumber is absent from the data", () => {
      const membersWithoutPhone: MemberWithProfile[] = [
        {
          id: "member-1",
          userId: "user-1",
          displayName: "John Doe",
          profilePhotoUrl: null,
          status: "going",
          isOrganizer: true,
          createdAt: "2026-01-01T00:00:00Z",
          handles: null,
        },
      ];

      mockUseMembers.mockReturnValue({
        data: membersWithoutPhone,
        isPending: false,
      });

      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      expect(screen.queryByText("+14155551234")).toBeNull();
    });
  });

  describe("invite button", () => {
    it("shows invite button for organizers", () => {
      const onInvite = vi.fn();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={true}
          onInvite={onInvite}
        />,
      );

      expect(screen.getByText(/Invite members/)).toBeDefined();
    });

    it("does NOT show invite button for non-organizers", () => {
      const onInvite = vi.fn();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={false}
          onInvite={onInvite}
        />,
      );

      expect(screen.queryByText(/Invite members/)).toBeNull();
    });

    it("calls onInvite when invite button is clicked", async () => {
      const user = userEvent.setup();
      const onInvite = vi.fn();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={true}
          onInvite={onInvite}
        />,
      );

      const inviteButton = screen.getByText(/Invite members/);
      await user.click(inviteButton);

      expect(onInvite).toHaveBeenCalledOnce();
    });
  });

  describe("organizer actions", () => {
    it("shows actions dropdown for non-creator members when organizer", async () => {
      const user = userEvent.setup();
      const onRemove = vi.fn();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={true}
          createdBy="user-1"
          onRemove={onRemove}
        />,
      );

      // Switch to Maybe tab for Jane Smith
      // grouped: Maybe visible without tab click

      expect(
        screen.getByRole("button", { name: "Actions for Jane Smith" }),
      ).toBeDefined();
    });

    it("does NOT show actions dropdown for trip creator", () => {
      const onRemove = vi.fn();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={true}
          createdBy="user-1"
          onRemove={onRemove}
        />,
      );

      // John Doe (user-1) is the creator on the Going tab
      expect(
        screen.queryByRole("button", { name: "Actions for John Doe" }),
      ).toBeNull();
    });

    it("does NOT show actions dropdown for non-organizers", () => {
      const onRemove = vi.fn();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={false}
          createdBy="user-1"
          onRemove={onRemove}
        />,
      );

      expect(
        screen.queryByRole("button", { name: "Actions for John Doe" }),
      ).toBeNull();
    });
  });

  describe("remove member flow", () => {
    it("calls onRemove with member when remove from trip is clicked", async () => {
      const user = userEvent.setup();
      const onRemove = vi.fn();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={true}
          createdBy="user-1"
          onRemove={onRemove}
        />,
      );

      // Jane Smith is on the Maybe tab
      // grouped: Maybe visible without tab click

      const actionsButton = screen.getByRole("button", {
        name: "Actions for Jane Smith",
      });
      await user.click(actionsButton);

      const removeItem = await screen.findByText("Remove from trip");
      await user.click(removeItem);

      expect(onRemove).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "member-2",
          displayName: "Jane Smith",
        }),
      );
    });
  });

  describe("co-organizer role management", () => {
    it("shows promote option for regular member when organizer views", async () => {
      const user = userEvent.setup();
      const onUpdateRole = vi.fn();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={true}
          createdBy="user-1"
          currentUserId="user-1"
          onUpdateRole={onUpdateRole}
        />,
      );

      // Jane Smith is on the Maybe tab
      // grouped: Maybe visible without tab click

      const actionsButton = screen.getByRole("button", {
        name: "Actions for Jane Smith",
      });
      await user.click(actionsButton);

      expect(await screen.findByText("Make co-organizer")).toBeDefined();
    });

    it("shows demote option for co-organizer member", async () => {
      const membersWithCoOrg: MemberWithProfile[] = [
        {
          id: "member-1",
          userId: "user-1",
          displayName: "John Doe",
          profilePhotoUrl: null,
          status: "going",
          isOrganizer: true,
          createdAt: "2026-01-01T00:00:00Z",
          handles: null,
        },
        {
          id: "member-2",
          userId: "user-2",
          displayName: "Jane Smith",
          profilePhotoUrl: null,
          status: "going",
          isOrganizer: true,
          createdAt: "2026-01-02T00:00:00Z",
          handles: null,
        },
      ];

      mockUseMembers.mockReturnValue({
        data: membersWithCoOrg,
        isPending: false,
      });

      const user = userEvent.setup();
      const onUpdateRole = vi.fn();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={true}
          createdBy="user-1"
          currentUserId="user-1"
          onUpdateRole={onUpdateRole}
        />,
      );

      // Both members are "going", so on the Going tab
      const actionsButton = screen.getByRole("button", {
        name: "Actions for Jane Smith",
      });
      await user.click(actionsButton);

      expect(await screen.findByText("Remove co-organizer")).toBeDefined();
    });

    it("does not show dropdown for trip creator", () => {
      const onUpdateRole = vi.fn();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={true}
          createdBy="user-1"
          currentUserId="user-1"
          onUpdateRole={onUpdateRole}
        />,
      );

      expect(
        screen.queryByRole("button", { name: "Actions for John Doe" }),
      ).toBeNull();
    });

    it("does not show dropdown for current user", () => {
      const onUpdateRole = vi.fn();

      const membersWithCurrentUser: MemberWithProfile[] = [
        {
          id: "member-5",
          userId: "user-5",
          displayName: "Current User",
          profilePhotoUrl: null,
          status: "going",
          isOrganizer: true,
          createdAt: "2026-01-01T00:00:00Z",
          handles: null,
        },
        {
          id: "member-2",
          userId: "user-2",
          displayName: "Jane Smith",
          profilePhotoUrl: null,
          status: "going",
          isOrganizer: false,
          createdAt: "2026-01-02T00:00:00Z",
          handles: null,
        },
      ];

      mockUseMembers.mockReturnValue({
        data: membersWithCurrentUser,
        isPending: false,
      });

      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={true}
          createdBy="user-99"
          currentUserId="user-5"
          onUpdateRole={onUpdateRole}
        />,
      );

      expect(
        screen.queryByRole("button", { name: "Actions for Current User" }),
      ).toBeNull();
    });

    it("calls onUpdateRole with correct args when promote clicked", async () => {
      const user = userEvent.setup();
      const onUpdateRole = vi.fn();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={true}
          createdBy="user-1"
          currentUserId="user-1"
          onUpdateRole={onUpdateRole}
        />,
      );

      // grouped: Maybe visible without tab click

      const actionsButton = screen.getByRole("button", {
        name: "Actions for Jane Smith",
      });
      await user.click(actionsButton);

      const promoteItem = await screen.findByText("Make co-organizer");
      await user.click(promoteItem);

      expect(onUpdateRole).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "member-2",
          userId: "user-2",
          displayName: "Jane Smith",
        }),
        true,
      );
    });

    it("calls onUpdateRole with correct args when demote clicked", async () => {
      const membersWithCoOrg: MemberWithProfile[] = [
        {
          id: "member-1",
          userId: "user-1",
          displayName: "John Doe",
          profilePhotoUrl: null,
          status: "going",
          isOrganizer: true,
          createdAt: "2026-01-01T00:00:00Z",
          handles: null,
        },
        {
          id: "member-2",
          userId: "user-2",
          displayName: "Jane Smith",
          profilePhotoUrl: null,
          status: "going",
          isOrganizer: true,
          createdAt: "2026-01-02T00:00:00Z",
          handles: null,
        },
      ];

      mockUseMembers.mockReturnValue({
        data: membersWithCoOrg,
        isPending: false,
      });

      const user = userEvent.setup();
      const onUpdateRole = vi.fn();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={true}
          createdBy="user-1"
          currentUserId="user-1"
          onUpdateRole={onUpdateRole}
        />,
      );

      const actionsButton = screen.getByRole("button", {
        name: "Actions for Jane Smith",
      });
      await user.click(actionsButton);

      const demoteItem = await screen.findByText("Remove co-organizer");
      await user.click(demoteItem);

      expect(onUpdateRole).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "member-2",
          userId: "user-2",
          displayName: "Jane Smith",
        }),
        false,
      );
    });

    it("shows both role and remove actions in dropdown", async () => {
      const user = userEvent.setup();
      const onUpdateRole = vi.fn();
      const onRemove = vi.fn();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={true}
          createdBy="user-1"
          currentUserId="user-1"
          onUpdateRole={onUpdateRole}
          onRemove={onRemove}
        />,
      );

      // grouped: Maybe visible without tab click

      const actionsButton = screen.getByRole("button", {
        name: "Actions for Jane Smith",
      });
      await user.click(actionsButton);

      expect(await screen.findByText("Make co-organizer")).toBeDefined();
      expect(screen.getByText("Remove from trip")).toBeDefined();

      const separator = document.querySelector(
        "[data-slot='dropdown-menu-separator']",
      );
      expect(separator).not.toBeNull();
    });
  });

  describe("mute/unmute controls", () => {
    it("shows Muted badge for muted members", () => {
      const membersWithMuted: MemberWithProfile[] = [
        {
          id: "member-1",
          userId: "user-1",
          displayName: "John Doe",
          profilePhotoUrl: null,
          status: "going",
          isOrganizer: true,
          createdAt: "2026-01-01T00:00:00Z",
          handles: null,
        },
        {
          id: "member-2",
          userId: "user-2",
          displayName: "Jane Smith",
          profilePhotoUrl: null,
          status: "going",
          isOrganizer: false,
          isMuted: true,
          createdAt: "2026-01-02T00:00:00Z",
          handles: null,
        },
      ];

      mockUseMembers.mockReturnValue({
        data: membersWithMuted,
        isPending: false,
      });

      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={true} />,
      );

      expect(screen.getByText("Muted")).toBeDefined();
    });

    it("does not show Muted badge for non-muted members", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={true} />,
      );

      expect(screen.queryByText("Muted")).toBeNull();
    });

    it("shows Mute option for non-organizer member when organizer views", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={true}
          createdBy="user-1"
          currentUserId="user-1"
        />,
      );

      // grouped: Maybe visible without tab click

      const actionsButton = screen.getByRole("button", {
        name: "Actions for Jane Smith",
      });
      await user.click(actionsButton);

      expect(await screen.findByText("Mute")).toBeDefined();
    });

    it("shows Unmute option for muted member when organizer views", async () => {
      const membersWithMuted: MemberWithProfile[] = [
        {
          id: "member-1",
          userId: "user-1",
          displayName: "John Doe",
          profilePhotoUrl: null,
          status: "going",
          isOrganizer: true,
          createdAt: "2026-01-01T00:00:00Z",
          handles: null,
        },
        {
          id: "member-2",
          userId: "user-2",
          displayName: "Jane Smith",
          profilePhotoUrl: null,
          status: "going",
          isOrganizer: false,
          isMuted: true,
          createdAt: "2026-01-02T00:00:00Z",
          handles: null,
        },
      ];

      mockUseMembers.mockReturnValue({
        data: membersWithMuted,
        isPending: false,
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={true}
          createdBy="user-1"
          currentUserId="user-1"
        />,
      );

      const actionsButton = screen.getByRole("button", {
        name: "Actions for Jane Smith",
      });
      await user.click(actionsButton);

      expect(await screen.findByText("Unmute")).toBeDefined();
    });

    it("does not show Mute/Unmute for organizer member", async () => {
      const membersWithCoOrg: MemberWithProfile[] = [
        {
          id: "member-1",
          userId: "user-1",
          displayName: "John Doe",
          profilePhotoUrl: null,
          status: "going",
          isOrganizer: true,
          createdAt: "2026-01-01T00:00:00Z",
          handles: null,
        },
        {
          id: "member-2",
          userId: "user-2",
          displayName: "Jane Smith",
          profilePhotoUrl: null,
          status: "going",
          isOrganizer: true,
          createdAt: "2026-01-02T00:00:00Z",
          handles: null,
        },
      ];

      mockUseMembers.mockReturnValue({
        data: membersWithCoOrg,
        isPending: false,
      });

      const user = userEvent.setup();
      const onUpdateRole = vi.fn();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={true}
          createdBy="user-1"
          currentUserId="user-1"
          onUpdateRole={onUpdateRole}
        />,
      );

      const actionsButton = screen.getByRole("button", {
        name: "Actions for Jane Smith",
      });
      await user.click(actionsButton);

      await screen.findByText("Remove co-organizer");
      expect(screen.queryByText("Mute")).toBeNull();
      expect(screen.queryByText("Unmute")).toBeNull();
    });

    it("does not show Mute/Unmute when viewer is not organizer", () => {
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={false}
          createdBy="user-1"
          currentUserId="user-5"
        />,
      );

      // No actions dropdown at all for non-organizers
      expect(
        screen.queryByRole("button", { name: "Actions for John Doe" }),
      ).toBeNull();
    });

    it("shows confirmation dialog when Mute is clicked", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={true}
          createdBy="user-1"
          currentUserId="user-1"
        />,
      );

      // grouped: Maybe visible without tab click

      const actionsButton = screen.getByRole("button", {
        name: "Actions for Jane Smith",
      });
      await user.click(actionsButton);

      const muteItem = await screen.findByText("Mute");
      await user.click(muteItem);

      expect(await screen.findByText("Mute Jane Smith?")).toBeDefined();
      expect(
        screen.getByText(
          "This member will not be able to post messages in the trip discussion. You can unmute them at any time.",
        ),
      ).toBeDefined();
    });

    it("calls muteMember with correct userId when mute is confirmed", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={true}
          createdBy="user-1"
          currentUserId="user-1"
        />,
      );

      // grouped: Maybe visible without tab click

      const actionsButton = screen.getByRole("button", {
        name: "Actions for Jane Smith",
      });
      await user.click(actionsButton);

      const muteItem = await screen.findByText("Mute");
      await user.click(muteItem);

      const confirmButtons = await screen.findAllByText("Mute");
      const confirmButton = confirmButtons[confirmButtons.length - 1]!;
      await user.click(confirmButton);

      expect(mockMuteMember.mutateAsync).toHaveBeenCalledWith("user-2");
    });

    it("calls unmuteMember directly without confirmation dialog", async () => {
      const membersWithMuted: MemberWithProfile[] = [
        {
          id: "member-1",
          userId: "user-1",
          displayName: "John Doe",
          profilePhotoUrl: null,
          status: "going",
          isOrganizer: true,
          createdAt: "2026-01-01T00:00:00Z",
          handles: null,
        },
        {
          id: "member-2",
          userId: "user-2",
          displayName: "Jane Smith",
          profilePhotoUrl: null,
          status: "going",
          isOrganizer: false,
          isMuted: true,
          createdAt: "2026-01-02T00:00:00Z",
          handles: null,
        },
      ];

      mockUseMembers.mockReturnValue({
        data: membersWithMuted,
        isPending: false,
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <MembersList
          tripId="trip-123"
          isOrganizer={true}
          createdBy="user-1"
          currentUserId="user-1"
        />,
      );

      const actionsButton = screen.getByRole("button", {
        name: "Actions for Jane Smith",
      });
      await user.click(actionsButton);

      const unmuteItem = await screen.findByText("Unmute");
      await user.click(unmuteItem);

      expect(mockUnmuteMember.mutateAsync).toHaveBeenCalledWith("user-2");
    });
  });

  describe("Venmo icon link", () => {
    it("renders Venmo link with SVG icon when member has venmo handle", () => {
      const membersWithVenmo: MemberWithProfile[] = [
        {
          id: "member-1",
          userId: "user-1",
          displayName: "John Doe",
          profilePhotoUrl: null,
          status: "going",
          isOrganizer: false,
          createdAt: "2026-01-01T00:00:00Z",
          handles: { venmo: "@testuser" },
        },
      ];

      mockUseMembers.mockReturnValue({
        data: membersWithVenmo,
        isPending: false,
      });

      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      const venmoLink = screen.getByTestId("member-venmo-user-1");
      expect(venmoLink).toBeDefined();
      expect(venmoLink.getAttribute("href")).toBe("https://venmo.com/testuser");
      expect(venmoLink.getAttribute("target")).toBe("_blank");

      const svg = venmoLink.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute("aria-hidden")).toBe("true");
    });

    it("does not render Venmo link when member has no handles", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      expect(screen.queryByTestId("member-venmo-user-1")).toBeNull();
    });
  });

  describe("member row padding", () => {
    it("uses consistent py-3 padding without first:pt-0 or last:pb-0 overrides", () => {
      renderWithQueryClient(
        <MembersList tripId="trip-123" isOrganizer={false} />,
      );

      // Grouped rendering shows Going + Maybe = 2 rows for non-organizer
      const memberRows = document.querySelectorAll(".py-3");
      expect(memberRows.length).toBe(2);

      memberRows.forEach((row) => {
        expect(row.className).not.toContain("first:pt-0");
        expect(row.className).not.toContain("last:pb-0");
      });
    });
  });
});
