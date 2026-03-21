import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, type ReactNode } from "react";
import type { TripSummary } from "@/hooks/use-trips";
import { TripsContent } from "./trips-content";

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

// Mock hooks
const mockUseTrips = vi.fn();
vi.mock("@/hooks/use-trips", () => ({
  useTrips: () => mockUseTrips(),
}));

// Mock useScrollReveal — always return revealed for test simplicity
vi.mock("@/hooks/use-scroll-reveal", () => ({
  useScrollReveal: () => ({
    ref: { current: null },
    isRevealed: true,
  }),
}));

// Mock next/navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/trips",
}));

// Mock TripCard component
vi.mock("@/components/trip/trip-card", () => ({
  TripCard: ({ trip, index }: { trip: TripSummary; index?: number }) => (
    <div data-testid={`trip-card-${trip.id}`} data-index={index}>
      <h3>{trip.name}</h3>
      <p>{trip.destination}</p>
    </div>
  ),
}));

// Mock CreateTripDialog component
const mockOnOpenChange = vi.fn();
vi.mock("@/components/trip/create-trip-dialog", () => ({
  CreateTripDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => {
    mockOnOpenChange.mockImplementation(onOpenChange);
    return open ? (
      <div data-testid="create-trip-dialog">Create Trip Dialog</div>
    ) : null;
  },
}));

/** Wrap a flat TripSummary[] into the InfiniteData shape that useTrips() returns */
function wrapTrips(trips: TripSummary[]) {
  return {
    pages: [
      {
        success: true as const,
        data: trips,
        meta: {
          total: trips.length,
          limit: 20,
          hasMore: false,
          nextCursor: null,
        },
      },
    ],
    pageParams: [undefined],
  };
}

describe("TripsContent", () => {
  let queryClient: QueryClient;

  const mockTrips: TripSummary[] = [
    {
      id: "trip-1",
      name: "Summer Vacation",
      destination: "Hawaii",
      startDate: "2026-07-15",
      endDate: "2026-07-22",
      coverImageUrl: "https://example.com/hawaii.jpg",
      isOrganizer: true,
      rsvpStatus: "going",
      organizerInfo: [
        {
          id: "user-1",
          displayName: "John Doe",
          profilePhotoUrl: "https://example.com/john.jpg",
        },
      ],
      memberCount: 5,
      eventCount: 3,
    },
    {
      id: "trip-2",
      name: "Ski Weekend",
      destination: "Aspen, CO",
      startDate: "2026-12-10",
      endDate: "2026-12-15",
      coverImageUrl: null,
      isOrganizer: false,
      rsvpStatus: "maybe",
      organizerInfo: [
        {
          id: "user-2",
          displayName: "Jane Smith",
          profilePhotoUrl: null,
        },
      ],
      memberCount: 8,
      eventCount: 5,
    },
    {
      id: "trip-3",
      name: "Past Beach Trip",
      destination: "Miami Beach, FL",
      startDate: "2024-05-01",
      endDate: "2024-05-05",
      coverImageUrl: null,
      isOrganizer: true,
      rsvpStatus: "going",
      organizerInfo: [
        {
          id: "user-1",
          displayName: "John Doe",
          profilePhotoUrl: "https://example.com/john.jpg",
        },
      ],
      memberCount: 3,
      eventCount: 2,
    },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
        mutations: {
          retry: false,
        },
      },
    });

    mockSearchParams = new URLSearchParams();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const renderWithClient = (component: ReactNode) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>{component}</Suspense>
      </QueryClientProvider>,
    );
  };

  describe("Loading state", () => {
    it("shows loading skeletons while fetching trips", () => {
      mockUseTrips.mockReturnValue({
        data: wrapTrips([]),
        isPending: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      // Should show 3 skeleton cards
      const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("does not show trip count during loading", () => {
      mockUseTrips.mockReturnValue({
        data: wrapTrips([]),
        isPending: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      // Should not show the trip count text (e.g., "3 trips")
      expect(screen.queryByText(/\d+ trips?/)).toBeNull();
    });
  });

  describe("Error state", () => {
    it("shows error message with retry button", () => {
      const mockRefetch = vi.fn();
      mockUseTrips.mockReturnValue({
        data: wrapTrips([]),
        isPending: false,
        isError: true,
        error: new Error("Network error"),
        refetch: mockRefetch,
      });

      renderWithClient(<TripsContent />);

      expect(screen.getByText("Failed to load trips")).toBeDefined();
      expect(screen.getByText("Network error")).toBeDefined();
      expect(screen.getByText("Try again")).toBeDefined();
    });

    it("calls refetch when retry button is clicked", async () => {
      const user = userEvent.setup();
      const mockRefetch = vi.fn();
      mockUseTrips.mockReturnValue({
        data: wrapTrips([]),
        isPending: false,
        isError: true,
        error: new Error("Network error"),
        refetch: mockRefetch,
      });

      renderWithClient(<TripsContent />);

      const retryButton = screen.getByText("Try again");
      await user.click(retryButton);

      expect(mockRefetch).toHaveBeenCalledOnce();
    });

    it("shows generic error message when error has no message", () => {
      mockUseTrips.mockReturnValue({
        data: wrapTrips([]),
        isPending: false,
        isError: true,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      expect(screen.getByText("An unexpected error occurred")).toBeDefined();
    });
  });

  describe("Empty state", () => {
    it("shows empty state when no trips exist", () => {
      mockUseTrips.mockReturnValue({
        data: wrapTrips([]),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      expect(screen.getByText("Your adventures await")).toBeDefined();
      expect(
        screen.getByText(
          "Invite friends, plan together, and keep everything in one place.",
        ),
      ).toBeDefined();
      expect(screen.getByText("Create your first trip")).toBeDefined();
    });

    it("opens create dialog when empty state button is clicked", async () => {
      const user = userEvent.setup();
      mockUseTrips.mockReturnValue({
        data: wrapTrips([]),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      const createButton = screen.getByText("Create your first trip");
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByTestId("create-trip-dialog")).toBeDefined();
      });
    });
  });

  describe("Trips display", () => {
    it("renders trips correctly", () => {
      mockUseTrips.mockReturnValue({
        data: wrapTrips(mockTrips),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      expect(screen.getByText("My Trips")).toBeDefined();
      expect(screen.getByText("3 trips")).toBeDefined();
      expect(screen.getByText("Summer Vacation")).toBeDefined();
      expect(screen.getByText("Ski Weekend")).toBeDefined();
      expect(screen.getByText("Past Beach Trip")).toBeDefined();
    });

    it("shows singular 'trip' for one trip", () => {
      mockUseTrips.mockReturnValue({
        data: wrapTrips([mockTrips[0]]),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      expect(screen.getByText("1 trip")).toBeDefined();
    });

    it("splits trips into upcoming and past sections", () => {
      mockUseTrips.mockReturnValue({
        data: wrapTrips(mockTrips),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      expect(screen.getByText("Upcoming trips")).toBeDefined();
      expect(screen.getByText("Past trips")).toBeDefined();
    });

    it("passes correct index to TripCard for animations", () => {
      mockUseTrips.mockReturnValue({
        data: wrapTrips(mockTrips),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      const upcomingTrip1 = screen.getByTestId("trip-card-trip-1");
      const upcomingTrip2 = screen.getByTestId("trip-card-trip-2");

      expect(upcomingTrip1.getAttribute("data-index")).toBe("0");
      expect(upcomingTrip2.getAttribute("data-index")).toBe("1");
    });
  });

  describe("Search functionality", () => {
    it("filters trips by name", async () => {
      const user = userEvent.setup();
      mockUseTrips.mockReturnValue({
        data: wrapTrips(mockTrips),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      const searchInput = screen.getByPlaceholderText("Search by name or destination...");
      await user.type(searchInput, "Summer");

      await waitFor(() => {
        expect(screen.getByText("Summer Vacation")).toBeDefined();
        expect(screen.queryByText("Ski Weekend")).toBeNull();
        expect(screen.queryByText("Past Beach Trip")).toBeNull();
      });
    });

    it("filters trips by destination", async () => {
      const user = userEvent.setup();
      mockUseTrips.mockReturnValue({
        data: wrapTrips(mockTrips),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      const searchInput = screen.getByPlaceholderText("Search by name or destination...");
      await user.type(searchInput, "Aspen");

      await waitFor(() => {
        expect(screen.getByText("Ski Weekend")).toBeDefined();
        expect(screen.queryByText("Summer Vacation")).toBeNull();
      });
    });

    it("is case-insensitive", async () => {
      const user = userEvent.setup();
      mockUseTrips.mockReturnValue({
        data: wrapTrips(mockTrips),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      const searchInput = screen.getByPlaceholderText("Search by name or destination...");
      await user.type(searchInput, "hawaii");

      await waitFor(() => {
        expect(screen.getByText("Summer Vacation")).toBeDefined();
      });
    });

    it("shows no results message when search has no matches", async () => {
      const user = userEvent.setup();
      mockUseTrips.mockReturnValue({
        data: wrapTrips(mockTrips),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      const searchInput = screen.getByPlaceholderText("Search by name or destination...");
      await user.type(searchInput, "xyz123");

      await waitFor(() => {
        expect(screen.getByText("No trips found")).toBeDefined();
        expect(
          screen.getByText("Try searching with different keywords"),
        ).toBeDefined();
      });
    });

    it("shows all trips when search is cleared", async () => {
      const user = userEvent.setup();
      mockUseTrips.mockReturnValue({
        data: wrapTrips(mockTrips),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      const searchInput = screen.getByPlaceholderText("Search by name or destination...");
      await user.type(searchInput, "Summer");

      await waitFor(() => {
        expect(screen.queryByText("Ski Weekend")).toBeNull();
      });

      await user.clear(searchInput);

      await waitFor(() => {
        expect(screen.getByText("Summer Vacation")).toBeDefined();
        expect(screen.getByText("Ski Weekend")).toBeDefined();
      });
    });
  });

  describe("URL search state persistence", () => {
    it("initializes search from URL query parameter", () => {
      mockSearchParams = new URLSearchParams("q=Summer");
      mockUseTrips.mockReturnValue({
        data: wrapTrips(mockTrips),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      const searchInput =
        screen.getByPlaceholderText<HTMLInputElement>("Search by name or destination...");
      expect(searchInput.value).toBe("Summer");

      // Should filter to show only matching trips
      expect(screen.getByText("Summer Vacation")).toBeDefined();
      expect(screen.queryByText("Ski Weekend")).toBeNull();
    });

    it("updates URL when typing in search", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      });
      mockUseTrips.mockReturnValue({
        data: wrapTrips(mockTrips),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      const searchInput = screen.getByPlaceholderText("Search by name or destination...");
      await user.type(searchInput, "Hawaii");

      // Advance past the 300ms debounce
      vi.advanceTimersByTime(300);

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith(
          expect.stringContaining("q=Hawaii"),
          { scroll: false },
        );
      });

      vi.useRealTimers();
    });

    it("removes URL param when search is cleared", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      mockSearchParams = new URLSearchParams("q=Summer");
      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      });
      mockUseTrips.mockReturnValue({
        data: wrapTrips(mockTrips),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      const searchInput = screen.getByPlaceholderText("Search by name or destination...");
      await user.clear(searchInput);

      // Advance past the 300ms debounce
      vi.advanceTimersByTime(300);

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/trips", { scroll: false });
      });

      vi.useRealTimers();
    });
  });

  describe("Upcoming vs Past trips", () => {
    it("treats trips without start date as upcoming", () => {
      const tripWithoutDate: TripSummary = {
        ...mockTrips[0],
        id: "trip-no-date",
        name: "TBD Trip",
        startDate: null,
        endDate: null,
      };

      mockUseTrips.mockReturnValue({
        data: wrapTrips([tripWithoutDate]),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      expect(screen.getByText("Upcoming trips")).toBeDefined();
      expect(screen.getByText("TBD Trip")).toBeDefined();
      expect(screen.queryByText("Past trips")).toBeNull();
    });

    it("only shows upcoming section when no past trips", () => {
      mockUseTrips.mockReturnValue({
        data: wrapTrips([mockTrips[0], mockTrips[1]]),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      expect(screen.getByText("Upcoming trips")).toBeDefined();
      expect(screen.queryByText("Past trips")).toBeNull();
    });

    it("only shows past section when no upcoming trips", () => {
      mockUseTrips.mockReturnValue({
        data: wrapTrips([mockTrips[2]]),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      expect(screen.queryByText("Upcoming trips")).toBeNull();
      expect(screen.getByText("Past trips")).toBeDefined();
    });
  });

  describe("Floating Action Button (FAB)", () => {
    it("renders FAB button", () => {
      mockUseTrips.mockReturnValue({
        data: wrapTrips(mockTrips),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      const fab = screen.getByLabelText("Create new trip");
      expect(fab).toBeDefined();
    });

    it("opens create dialog when FAB is clicked", async () => {
      const user = userEvent.setup();
      mockUseTrips.mockReturnValue({
        data: wrapTrips(mockTrips),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      const fab = screen.getByLabelText("Create new trip");
      await user.click(fab);

      await waitFor(() => {
        expect(screen.getByTestId("create-trip-dialog")).toBeDefined();
      });
    });
  });

  describe("CreateTripDialog integration", () => {
    it("passes dialog state correctly", async () => {
      const user = userEvent.setup();
      mockUseTrips.mockReturnValue({
        data: wrapTrips([]),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithClient(<TripsContent />);

      // Dialog should not be visible initially
      expect(screen.queryByTestId("create-trip-dialog")).toBeNull();

      // Click FAB to open dialog
      const fab = screen.getByLabelText("Create new trip");
      await user.click(fab);

      // Dialog should now be visible
      await waitFor(() => {
        expect(screen.getByTestId("create-trip-dialog")).toBeDefined();
      });
    });
  });
});
