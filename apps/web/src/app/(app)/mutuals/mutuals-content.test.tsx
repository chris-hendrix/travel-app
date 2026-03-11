import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { Suspense, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MutualsContent } from "./mutuals-content";

// Mock hooks
const mockUseMutuals = vi.fn();
vi.mock("@/hooks/use-mutuals", () => ({
  useMutuals: (...args: unknown[]) => mockUseMutuals(...args),
  mutualKeys: {
    all: ["mutuals"],
    lists: () => ["mutuals", "list"],
    list: (p: unknown) => ["mutuals", "list", p],
  },
}));

// Mock useScrollReveal — always return revealed for test simplicity
vi.mock("@/hooks/use-scroll-reveal", () => ({
  useScrollReveal: () => ({
    ref: { current: null },
    isRevealed: true,
  }),
}));

const mockUseTrips = vi.fn();
vi.mock("@/hooks/use-trips", () => ({
  tripsQueryOptions: {
    queryKey: ["trips"],
  },
}));

// Mock useInfiniteQuery from @tanstack/react-query for direct usage in the component
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useInfiniteQuery: (options: any) => {
      // Route trips queries to our mock
      if (options.queryKey?.[0] === "trips") {
        return mockUseTrips();
      }
      // Fall through to actual (should not happen in this test since useMutuals is mocked)
      return { data: undefined, isPending: false, isError: false };
    },
  };
});

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/mutuals",
}));

// Mock next/link for MutualProfileSheet
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock @/lib/api for getUploadUrl used by both MutualsContent and MutualProfileSheet
vi.mock("@/lib/api", () => ({
  getUploadUrl: (url: string | null) => url || "",
}));

// Mock @/lib/format for getInitials used by both MutualsContent and MutualProfileSheet
vi.mock("@/lib/format", () => ({
  getInitials: (name: string) =>
    name
      .split(" ")
      .map((n: string) => n[0])
      .join(""),
}));

// Mock IntersectionObserver
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

beforeEach(() => {
  global.IntersectionObserver = class {
    observe = mockObserve;
    unobserve = vi.fn();
    disconnect = mockDisconnect;
  } as unknown as typeof IntersectionObserver;
});

describe("MutualsContent", () => {
  let queryClient: QueryClient;

  const mockMutuals = [
    {
      id: "user-1",
      displayName: "Alice Johnson",
      profilePhotoUrl: "https://example.com/alice.jpg",
      sharedTripCount: 3,
      sharedTrips: [
        { id: "trip-1", name: "Summer Vacation" },
        { id: "trip-2", name: "Ski Weekend" },
        { id: "trip-3", name: "Beach Party" },
      ],
    },
    {
      id: "user-2",
      displayName: "Bob Smith",
      profilePhotoUrl: null,
      sharedTripCount: 1,
      sharedTrips: [{ id: "trip-1", name: "Summer Vacation" }],
    },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    vi.clearAllMocks();

    // Default: trips hook returns empty (already select-transformed to flat array)
    mockUseTrips.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      error: null,
    });
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
    it("shows loading skeletons while fetching mutuals", () => {
      mockUseMutuals.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
        isFetching: true,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
      });

      renderWithClient(<MutualsContent />);

      // Should show skeleton cards
      const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("does not show mutual count during loading", () => {
      mockUseMutuals.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
        isFetching: true,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
      });

      renderWithClient(<MutualsContent />);

      expect(screen.queryByText(/\d+ mutuals?/)).toBeNull();
    });
  });

  describe("Mutuals display", () => {
    it("renders mutuals grid when data loaded", () => {
      mockUseMutuals.mockReturnValue({
        data: {
          pages: [{ success: true, mutuals: mockMutuals, nextCursor: null }],
          pageParams: [undefined],
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        isFetching: false,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
      });

      renderWithClient(<MutualsContent />);

      expect(screen.getByText("My Mutuals")).toBeDefined();
      expect(screen.getByText("2 mutuals")).toBeDefined();
      expect(screen.getByText("Alice Johnson")).toBeDefined();
      expect(screen.getByText("Bob Smith")).toBeDefined();
      expect(screen.getByText("3 shared trips")).toBeDefined();
      expect(screen.getByText("1 shared trip")).toBeDefined();
    });

    it("shows singular 'mutual' for one mutual", () => {
      mockUseMutuals.mockReturnValue({
        data: {
          pages: [
            {
              success: true,
              mutuals: [mockMutuals[0]],
              nextCursor: null,
            },
          ],
          pageParams: [undefined],
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        isFetching: false,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
      });

      renderWithClient(<MutualsContent />);

      expect(screen.getByText("1 mutual")).toBeDefined();
    });
  });

  describe("Empty state", () => {
    it("renders empty state when no mutuals", () => {
      mockUseMutuals.mockReturnValue({
        data: {
          pages: [{ success: true, mutuals: [], nextCursor: null }],
          pageParams: [undefined],
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        isFetching: false,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
      });

      renderWithClient(<MutualsContent />);

      expect(screen.getByText("No mutuals yet")).toBeDefined();
      expect(
        screen.getByText(
          "Mutuals are people who share trips with you. Start a trip and invite friends to see them here.",
        ),
      ).toBeDefined();
    });
  });

  describe("Error state", () => {
    it("displays error state with retry button", () => {
      const mockRefetch = vi.fn();
      mockUseMutuals.mockReturnValue({
        data: undefined,
        isPending: false,
        isError: true,
        error: new Error("Network error"),
        refetch: mockRefetch,
        isFetching: false,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
      });

      renderWithClient(<MutualsContent />);

      expect(screen.getByText("Failed to load mutuals")).toBeDefined();
      expect(screen.getByText("Network error")).toBeDefined();
      expect(screen.getByText("Try again")).toBeDefined();
    });

    it("calls refetch when retry button is clicked", async () => {
      const user = userEvent.setup();
      const mockRefetch = vi.fn();
      mockUseMutuals.mockReturnValue({
        data: undefined,
        isPending: false,
        isError: true,
        error: new Error("Network error"),
        refetch: mockRefetch,
        isFetching: false,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
      });

      renderWithClient(<MutualsContent />);

      const retryButton = screen.getByText("Try again");
      await user.click(retryButton);

      expect(mockRefetch).toHaveBeenCalledOnce();
    });
  });

  describe("Search functionality", () => {
    it("search input filters with debounce", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      });

      mockUseMutuals.mockReturnValue({
        data: {
          pages: [{ success: true, mutuals: mockMutuals, nextCursor: null }],
          pageParams: [undefined],
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        isFetching: false,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
      });

      renderWithClient(<MutualsContent />);

      const searchInput = screen.getByPlaceholderText("Search mutuals...");
      await user.type(searchInput, "Alice");

      // Before debounce, should still be called without search
      expect(mockUseMutuals).toHaveBeenCalledWith({
        search: undefined,
        tripId: undefined,
      });

      // Advance past the 300ms debounce
      vi.advanceTimersByTime(300);

      // After debounce, should be called with search param
      await waitFor(() => {
        expect(mockUseMutuals).toHaveBeenCalledWith({
          search: "Alice",
          tripId: undefined,
        });
      });

      vi.useRealTimers();
    });
  });

  describe("Mutual profile sheet", () => {
    it("opens sheet with mutual details when a mutual card is clicked", async () => {
      const user = userEvent.setup();

      mockUseMutuals.mockReturnValue({
        data: {
          pages: [{ success: true, mutuals: mockMutuals, nextCursor: null }],
          pageParams: [undefined],
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        isFetching: false,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
      });

      renderWithClient(<MutualsContent />);

      // Click the first mutual card (Alice Johnson)
      const aliceCard = screen.getByRole("button", {
        name: /Alice Johnson/,
      });
      await user.click(aliceCard);

      // The sheet should open with Alice's details
      // Verify sheet-unique content: "Shared Trips" heading and individual trip names
      await waitFor(() => {
        expect(screen.getByText("Shared Trips")).toBeDefined();
      });

      // Verify display name appears in both card and sheet
      expect(screen.getAllByText("Alice Johnson")).toHaveLength(2);

      expect(screen.getByText("Summer Vacation")).toBeDefined();
      expect(screen.getByText("Ski Weekend")).toBeDefined();
      expect(screen.getByText("Beach Party")).toBeDefined();

      // Verify trip links point to correct routes
      const summerLink = screen.getByRole("link", {
        name: "Summer Vacation",
      });
      expect(summerLink.getAttribute("href")).toBe("/trips/trip-1");

      const skiLink = screen.getByRole("link", { name: "Ski Weekend" });
      expect(skiLink.getAttribute("href")).toBe("/trips/trip-2");

      const beachLink = screen.getByRole("link", { name: "Beach Party" });
      expect(beachLink.getAttribute("href")).toBe("/trips/trip-3");
    });
  });

  describe("Trip filter", () => {
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

    it("passes selected tripId to useMutuals when a trip is selected", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      mockUseTrips.mockReturnValue({
        data: [
          { id: "filter-trip-1", name: "Paris Adventure" },
          { id: "filter-trip-2", name: "Tokyo Explorer" },
        ],
        isPending: false,
        isError: false,
        error: null,
      });

      mockUseMutuals.mockReturnValue({
        data: {
          pages: [{ success: true, mutuals: mockMutuals, nextCursor: null }],
          pageParams: [undefined],
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        isFetching: false,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
      });

      renderWithClient(<MutualsContent />);

      // The trip filter select should be visible since trips.length > 0
      const selectTrigger = screen.getByRole("combobox");
      await user.click(selectTrigger);

      // Select "Paris Adventure" from the dropdown
      const parisOption = await screen.findByRole("option", {
        name: "Paris Adventure",
      });
      await user.click(parisOption);

      // Verify useMutuals was called with the selected tripId
      await waitFor(() => {
        expect(mockUseMutuals).toHaveBeenCalledWith({
          search: undefined,
          tripId: "filter-trip-1",
        });
      });
    });
  });
});
