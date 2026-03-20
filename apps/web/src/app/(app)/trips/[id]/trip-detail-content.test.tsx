import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { TripDetailContent } from "./trip-detail-content";
import type { TripDetailWithMeta } from "@/hooks/use-trips";
import type { User } from "@journiful/shared";

// Mock sonner
const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({
  toast: mockToast,
}));

// Mock next/dynamic
vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: (importFn: () => Promise<any>) => {
    const React = require("react");
    const Lazy = React.lazy(importFn);
    return function DynamicComponent(props: any) {
      return React.createElement(
        React.Suspense,
        { fallback: null },
        React.createElement(Lazy, props),
      );
    };
  },
}));

// Mock next/image
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    fill,
    priority,
    unoptimized,
    sizes,
    ...props
  }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img src={src as string} alt={alt as string} {...props} />
  ),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock useAuth hook
const mockUser: User = {
  id: "user-123",
  phoneNumber: "+14155551234",
  displayName: "John Doe",
  profilePhotoUrl: "https://example.com/john.jpg",
  timezone: "America/New_York",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const mockUseAuth = vi.fn();
vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock useTripDetail hook
const mockUseTripDetail = vi.fn();
vi.mock("@/hooks/use-trips", () => ({
  useTripDetail: (tripId: string) => mockUseTripDetail(tripId),
}));

// Mock useEvents hook
const mockUseEvents = vi.fn();
vi.mock("@/hooks/use-events", () => ({
  useEvents: (tripId: string) => mockUseEvents(tripId),
}));

// Mock ItineraryView component
vi.mock("@/components/itinerary/itinerary-view", () => ({
  ItineraryView: ({ tripId }: { tripId: string }) => (
    <div data-testid="itinerary-view">Itinerary View for trip {tripId}</div>
  ),
}));

// Mock PhotosSection component to avoid QueryClientProvider requirement
vi.mock("@/components/photos/photos-section", () => ({
  PhotosSection: () => <div data-testid="photos-section">Photos Section</div>,
}));

// Mock useRemoveMember, useUpdateMemberRole hooks
const mockRemoveMember = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));
const mockUpdateRole = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));
const mockUseMembers = vi.fn();
vi.mock("@/hooks/use-invitations", () => ({
  useRemoveMember: () => mockRemoveMember,
  getRemoveMemberErrorMessage: () => null,
  useUpdateMemberRole: () => mockUpdateRole,
  getUpdateMemberRoleErrorMessage: () => null,
}));

// Mock useScrollReveal — always return revealed for test simplicity
vi.mock("@/hooks/use-scroll-reveal", () => ({
  useScrollReveal: () => ({
    ref: { current: null },
    isRevealed: true,
  }),
}));

// Mock invitation-queries for membersQueryOptions used directly by the component
vi.mock("@/hooks/invitation-queries", () => ({
  membersQueryOptions: (tripId: string) => ({
    queryKey: ["members", "list", tripId],
  }),
}));

// Mock useQuery from @tanstack/react-query for direct usage in the component
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useQuery: (options: any) => {
      // Route members queries to our mock
      if (
        options.queryKey?.[0] === "members" &&
        options.queryKey?.[1] === "list"
      ) {
        return mockUseMembers(options.queryKey[2]);
      }
      return { data: undefined, isPending: false, isError: false };
    },
  };
});

// Mock RsvpBadgeDropdown component
const rsvpLabels: Record<string, string> = {
  going: "Going",
  maybe: "Maybe",
  not_going: "Not Going",
  no_response: "No Response",
};
vi.mock("@/components/trip/rsvp-badge-dropdown", () => ({
  RsvpBadgeDropdown: ({
    tripId,
    status,
  }: {
    tripId: string;
    status: string;
  }) => (
    <div data-testid="rsvp-badge-dropdown" data-trip-id={tripId}>
      {rsvpLabels[status] ?? status}
    </div>
  ),
}));

// Mock MembersList component
vi.mock("@/components/trip/members-list", () => ({
  MembersList: ({
    tripId,
    isOrganizer,
    createdBy,
    onInvite,
    onRemove,
  }: {
    tripId: string;
    isOrganizer: boolean;
    createdBy?: string;
    onInvite?: () => void;
    onRemove?: (member: any) => void;
  }) => (
    <div
      data-testid="members-list"
      data-trip-id={tripId}
      data-is-organizer={isOrganizer}
      data-created-by={createdBy}
    >
      Members List for trip {tripId}
      {onInvite && (
        <button data-testid="members-invite-btn" onClick={onInvite}>
          Invite from members
        </button>
      )}
      {onRemove && (
        <button
          data-testid="members-remove-btn"
          onClick={() =>
            onRemove({
              id: "member-456",
              userId: "user-456",
              displayName: "Jane Smith",
            })
          }
        >
          Remove member
        </button>
      )}
    </div>
  ),
}));

// Mock NotificationPreferences component
vi.mock("@/components/notifications/notification-preferences", () => ({
  NotificationPreferences: ({ tripId }: { tripId: string }) => (
    <div data-testid="notification-preferences" data-trip-id={tripId}>
      Notification Preferences
    </div>
  ),
}));

// Mock messaging components
vi.mock("@/components/messaging", () => ({
  TripMessages: ({
    tripId,
    isOrganizer,
    disabled,
    isMuted,
  }: Record<string, unknown>) => (
    <div
      data-testid="trip-messages"
      data-trip-id={tripId}
      data-is-organizer={String(isOrganizer)}
      data-disabled={String(disabled)}
      data-is-muted={String(isMuted)}
    >
      Trip Messages
    </div>
  ),
  MessageCountIndicator: ({ tripId }: Record<string, unknown>) => (
    <div data-testid="message-count-indicator" data-trip-id={tripId}>
      Message Count
    </div>
  ),
}));

// Mock TripPreview component
vi.mock("@/components/trip/trip-preview", () => ({
  TripPreview: ({ trip, tripId, onGoingSuccess }: any) => (
    <div data-testid="trip-preview">
      TripPreview: {trip.name}
      {onGoingSuccess && (
        <button data-testid="preview-going-success" onClick={onGoingSuccess}>
          Trigger Going Success
        </button>
      )}
    </div>
  ),
}));

// Mock TravelReminderBanner component
vi.mock("@/components/trip/travel-reminder-banner", () => ({
  TravelReminderBanner: ({
    tripId,
    memberId,
    onAddTravel,
  }: {
    tripId: string;
    memberId: string | undefined;
    onAddTravel: () => void;
  }) => (
    <div
      data-testid="travel-reminder-banner"
      data-trip-id={tripId}
      data-member-id={memberId}
    >
      Travel Reminder Banner
      <button data-testid="banner-add-travel" onClick={onAddTravel}>
        Add Travel Details
      </button>
    </div>
  ),
}));

// Mock MemberOnboardingWizard component
vi.mock("@/components/trip/member-onboarding-wizard", () => ({
  MemberOnboardingWizard: ({
    open,
    onOpenChange,
    tripId,
    trip,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tripId: string;
    trip: any;
  }) =>
    open ? (
      <div data-testid="member-onboarding-wizard" data-trip-id={tripId}>
        Onboarding Wizard
        <button data-testid="wizard-close" onClick={() => onOpenChange(false)}>
          Close Wizard
        </button>
      </div>
    ) : null,
}));

// Mock InviteMembersDialog component
vi.mock("@/components/trip/invite-members-dialog", () => ({
  InviteMembersDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="invite-members-dialog">Invite Dialog</div> : null,
}));

// Mock CustomizeThemeSheet component
vi.mock("@/components/trip/customize-theme-sheet", () => ({
  CustomizeThemeSheet: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div data-testid="customize-theme-sheet">
        Customize Theme
        <button
          data-testid="theme-sheet-close"
          onClick={() => onOpenChange(false)}
        >
          Close Theme Sheet
        </button>
      </div>
    ) : null,
}));

// Mock EditTripDialog component
vi.mock("@/components/trip/edit-trip-dialog", () => ({
  EditTripDialog: ({
    open,
    onOpenChange,
    trip,
    onSuccess,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    trip: TripDetail;
    onSuccess?: () => void;
  }) => (
    <div
      data-testid="edit-trip-dialog"
      data-open={open}
      data-onsuccess={onSuccess ? "true" : "false"}
    >
      <button onClick={() => onOpenChange(false)}>Close Dialog</button>
      <span>Editing: {trip.name}</span>
      {onSuccess && (
        <button
          data-testid="trigger-success"
          onClick={() => {
            onSuccess();
            onOpenChange(false);
          }}
        >
          Trigger Success
        </button>
      )}
    </div>
  ),
}));

describe("TripDetailContent", () => {
  const mockTripDetail: TripDetailWithMeta = {
    id: "trip-123",
    name: "Bachelor Party in Miami",
    destination: "Miami Beach, FL",
    startDate: "2026-06-01",
    endDate: "2026-06-05",
    preferredTimezone: "America/New_York",
    description: "Epic bachelor party weekend with the crew!",
    coverImageUrl: "https://example.com/cover.jpg",
    createdBy: "user-123",
    allowMembersToAddEvents: true,
    cancelled: false,
    createdAt: new Date("2026-02-06T12:00:00Z"),
    updatedAt: new Date("2026-02-06T12:00:00Z"),
    organizers: [
      {
        id: "user-123",
        displayName: "John Doe",
        phoneNumber: "+14155551234",
        profilePhotoUrl: "https://example.com/john.jpg",
        timezone: "America/New_York",
      },
      {
        id: "user-456",
        displayName: "Jane Smith",
        phoneNumber: "+14155555678",
        profilePhotoUrl: null,
        timezone: "America/Los_Angeles",
      },
    ],
    memberCount: 8,
    isPreview: false,
    userRsvpStatus: "going",
    isOrganizer: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: mockUser });
    mockUseEvents.mockReturnValue({ data: [], isLoading: false });
    mockUseMembers.mockReturnValue({
      data: [
        {
          id: "member-1",
          tripId: "trip-123",
          userId: "user-123",
          displayName: "John Doe",
          isOrganizer: true,
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("rendering tests", () => {
    it("renders loading state initially", () => {
      mockUseTripDetail.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      // Check for skeleton loading state
      const skeletonElements = document.querySelectorAll(
        '[data-slot="skeleton"]',
      );
      expect(skeletonElements.length).toBeGreaterThan(0);
    });

    it("renders trip details when data loaded", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Bachelor Party in Miami" }),
        ).toBeDefined();
      });

      expect(screen.getByText("Miami Beach, FL")).toBeDefined();
      expect(screen.getByText("Jun 1 - 5, 2026")).toBeDefined();
      expect(screen.getByText("8 members")).toBeDefined();
      expect(screen.getByText("No events yet")).toBeDefined();
    });

    it("shows cover image when available", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        const coverImage = screen.getByAltText("Bachelor Party in Miami");
        expect(coverImage).toBeDefined();
        expect(coverImage.getAttribute("src")).toBe(
          "https://example.com/cover.jpg",
        );
      });
    });

    it("shows placeholder when no cover image", async () => {
      const tripWithoutCover = { ...mockTripDetail, coverImageUrl: null };
      mockUseTripDetail.mockReturnValue({
        data: tripWithoutCover,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Bachelor Party in Miami" }),
        ).toBeDefined();
      });

      // Check for gradient placeholder
      const placeholder = document.querySelector(
        ".bg-gradient-to-br.from-primary\\/20.via-accent\\/15.to-secondary\\/20",
      );
      expect(placeholder).toBeDefined();
    });

    it("displays trip name, destination, dates", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Bachelor Party in Miami" }),
        ).toBeDefined();
        expect(screen.getByText("Miami Beach, FL")).toBeDefined();
        expect(screen.getByText("Jun 1 - 5, 2026")).toBeDefined();
      });
    });

    it("shows organizer information", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("Organizers")).toBeDefined();
        expect(screen.getByText("John Doe, Jane Smith")).toBeDefined();
      });

      // Check for organizer avatars
      const johnAvatar = screen.getByAltText("John Doe");
      expect(johnAvatar).toBeDefined();
      expect(johnAvatar.getAttribute("src")).toBe(
        "https://example.com/john.jpg",
      );

      // Jane Smith has no profile photo, should show initials
      expect(screen.getByText("JS")).toBeDefined();
    });

    it("displays member count and event count", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("8 members")).toBeDefined();
        expect(screen.getByText("No events yet")).toBeDefined();
      });
    });

    it("displays correct event count when events exist", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      mockUseEvents.mockReturnValue({
        data: [
          { id: "e1", deletedAt: null },
          { id: "e2", deletedAt: null },
          { id: "e3", deletedAt: null },
        ],
        isLoading: false,
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("3 events")).toBeDefined();
      });
    });

    it("displays singular event when count is 1", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      mockUseEvents.mockReturnValue({
        data: [{ id: "e1", deletedAt: null }],
        isLoading: false,
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("1 event")).toBeDefined();
      });
    });

    it("excludes soft-deleted events from count", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      mockUseEvents.mockReturnValue({
        data: [
          { id: "e1", deletedAt: null },
          { id: "e2", deletedAt: new Date("2026-01-15T00:00:00Z") },
          { id: "e3", deletedAt: null },
        ],
        isLoading: false,
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("2 events")).toBeDefined();
      });
    });

    it("shows RSVP badge", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("Going")).toBeDefined();
      });
    });

    it("badge container has items-center for vertical alignment", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("Going")).toBeDefined();
      });

      const goingBadge = screen.getByText("Going");
      const badgeContainer = goingBadge.closest("div.flex");
      expect(badgeContainer).not.toBeNull();
      expect(badgeContainer!.className).toContain("items-center");
    });

    it("shows description in collapsible when available", async () => {
      const user = userEvent.setup();
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      // Collapsible trigger should be visible (rendered as native button by CollapsibleTrigger)
      const trigger = screen.getByRole("button", { name: /about this trip/i });
      expect(trigger).toBeDefined();

      // Click to expand
      await user.click(trigger);

      await waitFor(() => {
        expect(
          screen.getByText("Epic bachelor party weekend with the crew!"),
        ).toBeDefined();
      });
    });

    it("hides description text when description is null", async () => {
      const tripWithoutDescription = { ...mockTripDetail, description: null };
      mockUseTripDetail.mockReturnValue({
        data: tripWithoutDescription,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Bachelor Party in Miami" }),
        ).toBeDefined();
      });

      // "About this trip" section still renders (contains weather), but description text is absent
      expect(screen.getByText("About this trip")).toBeDefined();
      expect(
        screen.queryByText("Epic bachelor party weekend with the crew!"),
      ).toBeNull();
    });
  });

  describe("authorization tests", () => {
    it("shows edit button when user is creator", async () => {
      mockUseAuth.mockReturnValue({ user: mockUser });
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Edit trip" })).toBeDefined();
      });
    });

    it("shows edit button when user is co-organizer", async () => {
      const coOrganizerUser = { ...mockUser, id: "user-456" };
      mockUseAuth.mockReturnValue({ user: coOrganizerUser });
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Edit trip" })).toBeDefined();
      });
    });

    it("hides edit button when user is not organizer", async () => {
      const regularUser = { ...mockUser, id: "user-789" };
      mockUseAuth.mockReturnValue({ user: regularUser });
      mockUseTripDetail.mockReturnValue({
        data: { ...mockTripDetail, isOrganizer: false },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Bachelor Party in Miami" }),
        ).toBeDefined();
      });

      expect(screen.queryByRole("button", { name: "Edit trip" })).toBeNull();
    });

    it("shows organizer action icons for organizers only", async () => {
      mockUseAuth.mockReturnValue({ user: mockUser });
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Edit trip" })).toBeDefined();
        expect(
          screen.getByRole("button", { name: "Invite members" }),
        ).toBeDefined();
      });
    });

    it("hides organizer action icons for non-organizers", async () => {
      const regularUser = { ...mockUser, id: "user-789" };
      mockUseAuth.mockReturnValue({ user: regularUser });
      mockUseTripDetail.mockReturnValue({
        data: { ...mockTripDetail, isOrganizer: false },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Bachelor Party in Miami" }),
        ).toBeDefined();
      });

      expect(screen.queryByRole("button", { name: "Edit trip" })).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Invite members" }),
      ).toBeNull();
    });

    it("renders Invite button for organizer", async () => {
      mockUseAuth.mockReturnValue({ user: mockUser });
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Invite members" }),
        ).toBeDefined();
      });
    });

    it("does not render Invite button for non-organizer", async () => {
      const regularUser = { ...mockUser, id: "user-789" };
      mockUseAuth.mockReturnValue({ user: regularUser });
      mockUseTripDetail.mockReturnValue({
        data: { ...mockTripDetail, isOrganizer: false },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Bachelor Party in Miami" }),
        ).toBeDefined();
      });

      expect(
        screen.queryByRole("button", { name: "Invite members" }),
      ).toBeNull();
    });
  });

  describe("error handling tests", () => {
    it("shows error state on 404", async () => {
      mockUseTripDetail.mockReturnValue({
        data: undefined,
        isPending: false,
        isError: true,
        error: new Error("NOT_FOUND"),
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("Trip not found")).toBeDefined();
      });

      expect(
        screen.getByText(
          "This trip doesn't exist or you don't have access to it.",
        ),
      ).toBeDefined();
    });

    it("shows error state on network failure", async () => {
      mockUseTripDetail.mockReturnValue({
        data: undefined,
        isPending: false,
        isError: true,
        error: new Error("Network error"),
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("Trip not found")).toBeDefined();
      });
    });

    it("return to trips link has correct href", async () => {
      mockUseTripDetail.mockReturnValue({
        data: undefined,
        isPending: false,
        isError: true,
        error: new Error("NOT_FOUND"),
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("Trip not found")).toBeDefined();
      });

      const returnLink = screen.getByText("Return to trips");
      expect(returnLink.closest("a")?.getAttribute("href")).toBe("/trips");
    });
  });

  describe("interaction tests", () => {
    it("edit button opens EditTripDialog", async () => {
      mockUseAuth.mockReturnValue({ user: mockUser });
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      const user = userEvent.setup();
      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Edit trip" })).toBeDefined();
      });

      const editButton = screen.getByRole("button", { name: "Edit trip" });
      await user.click(editButton);

      await waitFor(() => {
        const dialog = screen.getByTestId("edit-trip-dialog");
        expect(dialog).toBeDefined();
        expect(dialog.getAttribute("data-open")).toBe("true");
      });
    });

    it("can close EditTripDialog", async () => {
      mockUseAuth.mockReturnValue({ user: mockUser });
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      const user = userEvent.setup();
      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Edit trip" })).toBeDefined();
      });

      // Open dialog
      const editButton = screen.getByRole("button", { name: "Edit trip" });
      await user.click(editButton);

      await waitFor(() => {
        expect(
          screen.getByTestId("edit-trip-dialog").getAttribute("data-open"),
        ).toBe("true");
      });

      // Close dialog
      const closeButton = screen.getByText("Close Dialog");
      await user.click(closeButton);

      await waitFor(() => {
        expect(
          screen.getByTestId("edit-trip-dialog").getAttribute("data-open"),
        ).toBe("false");
      });
    });
  });

  describe("success notification tests", () => {
    beforeEach(() => {
      mockToast.success.mockClear();
      mockToast.error.mockClear();
    });

    it("shows toast notification when trip is updated", async () => {
      mockUseAuth.mockReturnValue({ user: mockUser });
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Edit trip" })).toBeDefined();
      });

      // Get the EditTripDialog mock and trigger its onSuccess
      const editDialog = screen.getByTestId("edit-trip-dialog");
      const onSuccessButton = within(editDialog).getByTestId("trigger-success");
      await userEvent.click(onSuccessButton);

      expect(mockToast.success).toHaveBeenCalledWith(
        "Trip updated successfully",
      );
    });

    it("does not show toast on initial page load", () => {
      mockUseAuth.mockReturnValue({ user: mockUser });
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      expect(mockToast.success).not.toHaveBeenCalled();
    });
  });

  describe("hero overlay", () => {
    it("renders trip name in the hero", () => {
      mockUseAuth.mockReturnValue({ user: mockUser });
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading.textContent).toBe(mockTripDetail.name);
    });

    it("renders destination and date range in the hero", () => {
      mockUseAuth.mockReturnValue({ user: mockUser });
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      expect(screen.getByText(mockTripDetail.destination)).toBeDefined();
      // Date range should be rendered (formatted — Jun 1-5, 2026)
      expect(screen.getByText(/Jun/)).toBeDefined();
    });
  });

  describe("edge cases", () => {
    it("handles missing dates (shows Dates TBD)", async () => {
      const tripWithoutDates = {
        ...mockTripDetail,
        startDate: null,
        endDate: null,
      };
      mockUseTripDetail.mockReturnValue({
        data: tripWithoutDates,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("Dates TBD")).toBeDefined();
      });
    });

    it("handles null description (section renders without description text)", async () => {
      const tripWithoutDescription = { ...mockTripDetail, description: null };
      mockUseTripDetail.mockReturnValue({
        data: tripWithoutDescription,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Bachelor Party in Miami" }),
        ).toBeDefined();
      });

      // "About this trip" section still renders (contains weather), but description text is absent
      expect(screen.getByText("About this trip")).toBeDefined();
      expect(
        screen.queryByText("Epic bachelor party weekend with the crew!"),
      ).toBeNull();
    });

    it("handles empty organizers list", async () => {
      const tripWithoutOrganizers = { ...mockTripDetail, organizers: [] };
      mockUseTripDetail.mockReturnValue({
        data: tripWithoutOrganizers,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Bachelor Party in Miami" }),
        ).toBeDefined();
      });

      // Organizers section should not be rendered
      expect(screen.queryByText("Organizers")).toBeNull();
    });

    it("handles 0 members", async () => {
      const tripWithNoMembers = { ...mockTripDetail, memberCount: 0 };
      mockUseTripDetail.mockReturnValue({
        data: tripWithNoMembers,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("0 members")).toBeDefined();
      });
    });

    it("handles 1 member (singular)", async () => {
      const tripWithOneMember = { ...mockTripDetail, memberCount: 1 };
      mockUseTripDetail.mockReturnValue({
        data: tripWithOneMember,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("1 member")).toBeDefined();
      });
    });

    it("handles dates spanning different months", async () => {
      const tripCrossMonth = {
        ...mockTripDetail,
        startDate: "2026-06-28",
        endDate: "2026-07-05",
      };
      mockUseTripDetail.mockReturnValue({
        data: tripCrossMonth,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("Jun 28 - Jul 5, 2026")).toBeDefined();
      });
    });

    it("handles only start date", async () => {
      const tripOnlyStart = {
        ...mockTripDetail,
        startDate: "2026-06-01",
        endDate: null,
      };
      mockUseTripDetail.mockReturnValue({
        data: tripOnlyStart,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("Starts Jun 1, 2026")).toBeDefined();
      });
    });

    it("handles only end date", async () => {
      const tripOnlyEnd = {
        ...mockTripDetail,
        startDate: null,
        endDate: "2026-06-05",
      };
      mockUseTripDetail.mockReturnValue({
        data: tripOnlyEnd,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("Ends Jun 5, 2026")).toBeDefined();
      });
    });
  });

  describe("preview mode", () => {
    const previewTrip: TripDetailWithMeta = {
      ...mockTripDetail,
      isPreview: true,
      userRsvpStatus: "no_response",
      isOrganizer: false,
    };

    it("renders TripPreview component when trip.isPreview is true", async () => {
      mockUseTripDetail.mockReturnValue({
        data: previewTrip,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("trip-preview")).toBeDefined();
        expect(
          screen.getByText("TripPreview: Bachelor Party in Miami"),
        ).toBeDefined();
      });
    });

    it("does not render ItineraryView when trip.isPreview is true", async () => {
      mockUseTripDetail.mockReturnValue({
        data: previewTrip,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("trip-preview")).toBeDefined();
      });

      expect(screen.queryByTestId("itinerary-view")).toBeNull();
    });

    it("does not render TripPreview when trip.isPreview is false", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Bachelor Party in Miami" }),
        ).toBeDefined();
      });

      expect(screen.queryByTestId("trip-preview")).toBeNull();
      expect(screen.getByTestId("itinerary-view")).toBeDefined();
    });
  });

  describe("itinerary and members dialog", () => {
    it("renders ItineraryView inline without tabs", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("itinerary-view")).toBeDefined();
      });

      // No tabs should exist
      expect(screen.queryByRole("tab")).toBeNull();
      expect(screen.queryByRole("tablist")).toBeNull();
    });

    it("members stat is a clickable button", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("8 members")).toBeDefined();
      });

      const membersButton = screen.getByText("8 members").closest("button");
      expect(membersButton).not.toBeNull();
    });

    it("clicking members stat opens members dialog", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      const user = userEvent.setup();
      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("8 members")).toBeDefined();
      });

      const membersButton = screen.getByText("8 members").closest("button")!;
      await user.click(membersButton);

      await waitFor(() => {
        expect(screen.getByTestId("members-list")).toBeDefined();
        expect(
          screen.getByText("Members List for trip trip-123"),
        ).toBeDefined();
      });
    });

    it("passes correct props to MembersList in dialog", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      const user = userEvent.setup();
      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("8 members")).toBeDefined();
      });

      const membersButton = screen.getByText("8 members").closest("button")!;
      await user.click(membersButton);

      await waitFor(() => {
        const membersList = screen.getByTestId("members-list");
        expect(membersList.getAttribute("data-trip-id")).toBe("trip-123");
        expect(membersList.getAttribute("data-is-organizer")).toBe("true");
      });
    });

    it("MembersList onInvite closes members dialog and opens invite dialog", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      const user = userEvent.setup();
      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("8 members")).toBeDefined();
      });

      const membersButton = screen.getByText("8 members").closest("button")!;
      await user.click(membersButton);

      await waitFor(() => {
        expect(screen.getByTestId("members-invite-btn")).toBeDefined();
      });

      const inviteBtn = screen.getByTestId("members-invite-btn");
      await user.click(inviteBtn);

      await waitFor(() => {
        expect(screen.getByTestId("invite-members-dialog")).toBeDefined();
      });
    });

    it("clicking remove swaps dialog to confirmation view", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      const user = userEvent.setup();
      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("8 members")).toBeDefined();
      });

      // Open members dialog
      const membersButton = screen.getByText("8 members").closest("button")!;
      await user.click(membersButton);

      await waitFor(() => {
        expect(screen.getByTestId("members-remove-btn")).toBeDefined();
      });

      // Click remove — should swap to confirmation view
      const removeBtn = screen.getByTestId("members-remove-btn");
      await user.click(removeBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Are you sure you want to remove/),
        ).toBeDefined();
        expect(screen.getByText("Jane Smith")).toBeDefined();
      });

      // Members list should be hidden
      expect(screen.queryByTestId("members-list")).toBeNull();
    });

    it("cancel in confirmation view returns to members list", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      const user = userEvent.setup();
      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("8 members")).toBeDefined();
      });

      // Open dialog and go to confirmation
      const membersButton = screen.getByText("8 members").closest("button")!;
      await user.click(membersButton);

      await waitFor(() => {
        expect(screen.getByTestId("members-remove-btn")).toBeDefined();
      });

      await user.click(screen.getByTestId("members-remove-btn"));

      await waitFor(() => {
        expect(
          screen.getByText(/Are you sure you want to remove/),
        ).toBeDefined();
      });

      // Click cancel
      await user.click(screen.getByText("Cancel"));

      await waitFor(() => {
        expect(screen.getByTestId("members-list")).toBeDefined();
      });
    });
  });

  describe("discussion section", () => {
    it("renders TripMessages with correct tripId", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        const tripMessages = screen.getByTestId("trip-messages");
        expect(tripMessages).toBeDefined();
        expect(tripMessages.getAttribute("data-trip-id")).toBe("trip-123");
      });
    });

    it("passes isOrganizer=true to TripMessages for organizer", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        const tripMessages = screen.getByTestId("trip-messages");
        expect(tripMessages.getAttribute("data-is-organizer")).toBe("true");
      });
    });

    it("passes isOrganizer=false to TripMessages for non-organizer", async () => {
      mockUseTripDetail.mockReturnValue({
        data: { ...mockTripDetail, isOrganizer: false },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        const tripMessages = screen.getByTestId("trip-messages");
        expect(tripMessages.getAttribute("data-is-organizer")).toBe("false");
      });
    });

    it("passes disabled=true to TripMessages when trip end date is in the past", async () => {
      const pastTrip = { ...mockTripDetail, endDate: "2020-01-01" };
      mockUseTripDetail.mockReturnValue({
        data: pastTrip,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        const tripMessages = screen.getByTestId("trip-messages");
        expect(tripMessages.getAttribute("data-disabled")).toBe("true");
      });
    });

    it("passes disabled=false to TripMessages when trip end date is in the future", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        const tripMessages = screen.getByTestId("trip-messages");
        expect(tripMessages.getAttribute("data-disabled")).toBe("false");
      });
    });

    it("renders MessageCountIndicator in stats section with correct tripId", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        const indicator = screen.getByTestId("message-count-indicator");
        expect(indicator).toBeDefined();
        expect(indicator.getAttribute("data-trip-id")).toBe("trip-123");
      });
    });

    it("does not render TripMessages in preview mode", async () => {
      const previewTrip = {
        ...mockTripDetail,
        isPreview: true,
        userRsvpStatus: "no_response" as const,
        isOrganizer: false,
      };
      mockUseTripDetail.mockReturnValue({
        data: previewTrip,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("trip-preview")).toBeDefined();
      });

      expect(screen.queryByTestId("trip-messages")).toBeNull();
      expect(screen.queryByTestId("message-count-indicator")).toBeNull();
    });

    it("does not render TripMessages in error state", async () => {
      mockUseTripDetail.mockReturnValue({
        data: undefined,
        isPending: false,
        isError: true,
        error: new Error("NOT_FOUND"),
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("Trip not found")).toBeDefined();
      });

      expect(screen.queryByTestId("trip-messages")).toBeNull();
      expect(screen.queryByTestId("message-count-indicator")).toBeNull();
    });

    it("does not render TripMessages in loading state", () => {
      mockUseTripDetail.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      expect(screen.queryByTestId("trip-messages")).toBeNull();
      expect(screen.queryByTestId("message-count-indicator")).toBeNull();
    });

    it("passes isMuted=true to TripMessages when current member is muted", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      mockUseMembers.mockReturnValue({
        data: [
          {
            id: "member-1",
            tripId: "trip-123",
            userId: "user-123",
            displayName: "John Doe",
            isOrganizer: true,
            isMuted: true,
          },
        ],
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        const tripMessages = screen.getByTestId("trip-messages");
        expect(tripMessages.getAttribute("data-is-muted")).toBe("true");
      });
    });

    it("passes isMuted=undefined to TripMessages when current member is not muted", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      mockUseMembers.mockReturnValue({
        data: [
          {
            id: "member-1",
            tripId: "trip-123",
            userId: "user-123",
            displayName: "John Doe",
            isOrganizer: true,
          },
        ],
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        const tripMessages = screen.getByTestId("trip-messages");
        expect(tripMessages.getAttribute("data-is-muted")).toBe("undefined");
      });
    });

    it("passes isMuted=false to TripMessages when isMuted is explicitly false", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      mockUseMembers.mockReturnValue({
        data: [
          {
            id: "member-1",
            tripId: "trip-123",
            userId: "user-123",
            displayName: "John Doe",
            isOrganizer: true,
            isMuted: false,
          },
        ],
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        const tripMessages = screen.getByTestId("trip-messages");
        expect(tripMessages.getAttribute("data-is-muted")).toBe("false");
      });
    });

    it("passes isMuted=undefined when members data is not yet loaded", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      mockUseMembers.mockReturnValue({ data: undefined });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        const tripMessages = screen.getByTestId("trip-messages");
        expect(tripMessages.getAttribute("data-is-muted")).toBe("undefined");
      });
    });
  });
});
