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

// Mock useIsMobile — always return false for desktop tests
vi.mock("@/hooks/use-is-mobile", () => ({
  useIsMobile: () => false,
}));

// Mock ItineraryView component
vi.mock("@/components/itinerary/itinerary-view", () => ({
  ItineraryView: ({ tripId }: { tripId: string }) => (
    <div data-testid="itinerary-view">Itinerary View for trip {tripId}</div>
  ),
}));

// Mock WeatherForecastCard component
vi.mock("@/components/itinerary/weather-forecast-card", () => ({
  WeatherForecastCard: () => (
    <div data-testid="weather-forecast-card">Weather Forecast</div>
  ),
}));

// Mock AccommodationDetailSheet component
vi.mock("@/components/itinerary/accommodation-detail-sheet", () => ({
  AccommodationDetailSheet: () => (
    <div data-testid="accommodation-detail-sheet" />
  ),
}));

// Mock canModifyAccommodation
vi.mock("@/components/itinerary/utils/permissions", () => ({
  canModifyAccommodation: () => false,
}));

// Mock PhotosSection component to avoid QueryClientProvider requirement
vi.mock("@/components/photos/photos-section", () => ({
  PhotosSection: () => <div data-testid="photos-section">Photos Section</div>,
}));

// Mock useRemoveMember, useUpdateMemberRole, useUpdateRsvp hooks
const mockRemoveMember = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));
const mockUpdateRole = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));
const mockUpdateRsvp = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));
const mockUseMembers = vi.fn();
vi.mock("@/hooks/use-invitations", () => ({
  useRemoveMember: () => mockRemoveMember,
  getRemoveMemberErrorMessage: () => null,
  useUpdateMemberRole: () => mockUpdateRole,
  getUpdateMemberRoleErrorMessage: () => null,
  useUpdateRsvp: () => mockUpdateRsvp,
  getUpdateRsvpErrorMessage: () => null,
}));

// Mock useScrollReveal — always return revealed for test simplicity
vi.mock("@/hooks/use-scroll-reveal", () => ({
  useScrollReveal: () => ({
    ref: { current: null },
    isRevealed: true,
  }),
}));

// Mock useWeatherForecast
vi.mock("@/hooks/use-weather", () => ({
  useWeatherForecast: () => ({ data: undefined, isLoading: false }),
}));

// Mock useAccommodations
const mockUseAccommodations = vi.fn();
vi.mock("@/hooks/use-accommodations", () => ({
  useAccommodations: (tripId: string) => mockUseAccommodations(tripId),
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

// Mock MobileTripLayout component
vi.mock("@/components/trip/mobile/mobile-trip-layout", () => ({
  MobileTripLayout: () => (
    <div data-testid="mobile-trip-layout">Mobile Layout</div>
  ),
}));

// Mock MemberOnboardingWizard component
vi.mock("@/components/trip/member-onboarding-wizard", () => ({
  MemberOnboardingWizard: ({
    open,
    onOpenChange,
    tripId,
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
    trip: any;
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

// Mock EditAccommodationDialog
vi.mock("@/components/itinerary/edit-accommodation-dialog", () => ({
  EditAccommodationDialog: () => (
    <div data-testid="edit-accommodation-dialog" />
  ),
}));

// Mock TripThemeProvider — pass through children
vi.mock("@/components/trip/trip-theme-provider", () => ({
  TripThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="trip-theme-provider">{children}</div>
  ),
}));

// Mock ErrorBoundary — pass through children
vi.mock("@/components/error-boundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// Mock supportsHover
vi.mock("@/lib/supports-hover", () => ({
  supportsHover: false,
}));

// Mock formatInTimezone
vi.mock("@/lib/utils/timezone", () => ({
  formatInTimezone: (date: string) => date,
}));

// Mock THEME_PRESETS and THEME_FONTS from shared config
vi.mock("@journiful/shared/config", () => ({
  THEME_PRESETS: [],
  THEME_FONTS: {},
}));

// Mock getUploadUrl
vi.mock("@/lib/api", () => ({
  getUploadUrl: (path: string | null | undefined) => {
    if (!path) return undefined;
    if (path.startsWith("http") || path.startsWith("blob:")) return path;
    return `http://localhost:8000${path}`;
  },
}));

// Mock CollapsibleSection — render children directly for testability
vi.mock("@/components/ui/collapsible-section", () => ({
  CollapsibleSection: ({
    label,
    children,
    defaultOpen,
  }: {
    label: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
  }) => (
    <div data-testid="collapsible-section" data-label={label}>
      <button aria-label={label}>{label}</button>
      <div>{children}</div>
    </div>
  ),
}));

// Mock TopoPattern
vi.mock("@/components/ui/topo-pattern", () => ({
  TopoPattern: ({ className }: { className?: string }) => (
    <div data-testid="topo-pattern" className={className} />
  ),
}));

describe("TripDetailContent", () => {
  const mockTripDetail: TripDetailWithMeta = {
    id: "trip-123",
    name: "Bachelor Party in Miami",
    destination: "Miami Beach, FL",
    destinationLat: null,
    destinationLon: null,
    startDate: "2026-06-01",
    endDate: "2026-06-05",
    preferredTimezone: "America/New_York",
    description: "Epic bachelor party weekend with the crew!",
    coverImageUrl: "https://example.com/cover.jpg",
    createdBy: "user-123",
    allowMembersToAddEvents: true,
    showAllMembers: true,
    themeId: null,
    themeFont: null,
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
    mockUseAccommodations.mockReturnValue({ data: undefined });
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

      // Check for topo pattern in the gradient placeholder
      expect(screen.getByTestId("topo-pattern")).toBeDefined();
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

    it("shows organizer information in summary line", async () => {
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
        // New layout shows "Organized by" in summary line instead of separate section
        expect(
          screen.getByText(/Organized by.*John Doe, Jane Smith/),
        ).toBeDefined();
      });

      // Check for organizer avatars in avatar stack
      const johnAvatar = screen.getByAltText("John Doe");
      expect(johnAvatar).toBeDefined();
      expect(johnAvatar.getAttribute("src")).toBe(
        "https://example.com/john.jpg",
      );

      // Jane Smith has no profile photo, should show initials
      expect(screen.getByText("JS")).toBeDefined();
    });

    it("displays going count in summary", async () => {
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
        expect(screen.getByText("+8 going")).toBeDefined();
      });
    });

    it("shows RSVP pills", async () => {
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
        // RsvpPills renders Going/Maybe/Not Going buttons
        expect(screen.getByText("Going")).toBeDefined();
        expect(screen.getByText("Maybe")).toBeDefined();
        expect(screen.getByText("Not Going")).toBeDefined();
      });
    });

    it("shows description in collapsible when available", async () => {
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

      // CollapsibleSection mock renders children directly
      await waitFor(() => {
        expect(
          screen.getByText("Epic bachelor party weekend with the crew!"),
        ).toBeDefined();
      });

      // Check that the section has the correct label
      const section = screen.getByTestId("collapsible-section");
      expect(section.getAttribute("data-label")).toBe("About this trip");
    });

    it("hides About section when no description and no weather", async () => {
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

      // With no description and no weather, the About section is not rendered
      expect(screen.queryByTestId("collapsible-section")).toBeNull();
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

    it("shows Settings button for all users", async () => {
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
          screen.getByRole("button", { name: "Settings" }),
        ).toBeDefined();
      });
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

    it("shows customize button for organizers", () => {
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

      expect(
        screen.getByRole("button", { name: "Customize theme" }),
      ).toBeDefined();
    });

    it("hides customize button for non-organizers", () => {
      mockUseAuth.mockReturnValue({ user: mockUser });
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

      expect(
        screen.queryByRole("button", { name: "Customize theme" }),
      ).toBeNull();
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

    it("handles null description (About section hidden without weather)", async () => {
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

      // No weather and no description means the About section is not rendered
      expect(screen.queryByTestId("collapsible-section")).toBeNull();
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

      // "Organized by" line should not be rendered with empty organizers
      expect(screen.queryByText(/Organized by/)).toBeNull();
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

    it("avatar stack summary is a clickable button", async () => {
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
        expect(screen.getByText("+8 going")).toBeDefined();
      });

      const goingText = screen.getByText("+8 going");
      const button = goingText.closest("button");
      expect(button).not.toBeNull();
    });

    it("clicking avatar stack opens members dialog", async () => {
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
        expect(screen.getByText("+8 going")).toBeDefined();
      });

      const goingButton = screen.getByText("+8 going").closest("button")!;
      await user.click(goingButton);

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
        expect(screen.getByText("+8 going")).toBeDefined();
      });

      const goingButton = screen.getByText("+8 going").closest("button")!;
      await user.click(goingButton);

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
        expect(screen.getByText("+8 going")).toBeDefined();
      });

      const goingButton = screen.getByText("+8 going").closest("button")!;
      await user.click(goingButton);

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
        expect(screen.getByText("+8 going")).toBeDefined();
      });

      // Open members dialog
      const goingButton = screen.getByText("+8 going").closest("button")!;
      await user.click(goingButton);

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
        expect(screen.getByText("+8 going")).toBeDefined();
      });

      // Open dialog and go to confirmation
      const goingButton = screen.getByText("+8 going").closest("button")!;
      await user.click(goingButton);

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

  describe("accommodations", () => {
    it("renders accommodation cards when data available", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      mockUseAccommodations.mockReturnValue({
        data: [
          {
            id: "acc-1",
            name: "Beach Hotel",
            checkIn: "2026-06-01T15:00:00Z",
            checkOut: "2026-06-05T11:00:00Z",
            address: "123 Ocean Dr",
          },
        ],
      });

      render(
        <Suspense fallback={null}>
          <TripDetailContent tripId="trip-123" />
        </Suspense>,
      );

      await waitFor(() => {
        expect(screen.getByText("Beach Hotel")).toBeDefined();
      });
    });

    it("does not render accommodation section when no accommodations", async () => {
      mockUseTripDetail.mockReturnValue({
        data: mockTripDetail,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      mockUseAccommodations.mockReturnValue({ data: [] });

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

      expect(screen.queryByText("Beach Hotel")).toBeNull();
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
