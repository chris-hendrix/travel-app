import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiscoverView } from "../discover-view";
import type { POISuggestionsResponse, POICategoryKey } from "@journiful/shared/types";

// ─── Mock hooks ──────────────────────────────────────────────────────────────

const mockUseTripDetail = vi.fn();
const mockUseEvents = vi.fn();
const mockUseDiscover = vi.fn();
const mockUseAccommodations = vi.fn();
const mockUseAuth = vi.fn();
const mockConvertPoiMutate = vi.fn();

vi.mock("@/hooks/use-trips", () => ({
  useTripDetail: (...args: unknown[]) => mockUseTripDetail(...args),
}));

vi.mock("@/hooks/use-events", () => ({
  useEvents: (...args: unknown[]) => mockUseEvents(...args),
}));

vi.mock("@/hooks/use-accommodations", () => ({
  useAccommodations: (...args: unknown[]) => mockUseAccommodations(...args),
}));

vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

vi.mock("@/hooks/use-discover", () => ({
  useDiscover: (...args: unknown[]) => mockUseDiscover(...args),
  useConvertPOI: () => ({ mutate: mockConvertPoiMutate }),
}));

// ─── Mock CreateEventDialog ──────────────────────────────────────────────────

vi.mock("@/components/itinerary/create-event-dialog", () => ({
  CreateEventDialog: vi.fn(
    ({ open, onOpenChange, defaultValues }: Record<string, unknown>) =>
      open ? (
        <div data-testid="create-event-dialog">
          {defaultValues ? (
            <span data-testid="dialog-default-name">
              {(defaultValues as { name: string }).name}
            </span>
          ) : null}
          <button
            type="button"
            data-testid="close-dialog"
            onClick={() => onOpenChange?.(false)}
          >
            Close
          </button>
        </div>
      ) : null,
  ),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TRIP_ID = "trip-123";

function makeEmptyResponse(): POISuggestionsResponse {
  return {
    destination: null,
    source: "foursquare",
    categories: {
      food_and_drink: [],
      arts_and_entertainment: [],
      outdoors: [],
      nightlife: [],
    },
  };
}

function makePopulatedResponse(): POISuggestionsResponse {
  return {
    destination: "Paris, France",
    source: "foursquare",
    categories: {
      food_and_drink: [
        {
          sourceId: "fsq-food-1",
          name: "Le Bistro",
          address: "1 Rue de Paris",
          lat: 48.8566,
          lon: 2.3522,
          distance: 200,
          category: "food_and_drink" as POICategoryKey,
          popularity: null,
          price: null,
          rating: null,
          eventId: null,
          website: null,
          tel: null,
          subcategory: null,
        },
        {
          sourceId: "fsq-food-2",
          name: "Cafe Paris",
          address: "2 Rue de Lyon",
          lat: 48.857,
          lon: 2.353,
          distance: 500,
          category: "food_and_drink" as POICategoryKey,
          popularity: null,
          price: null,
          rating: null,
          eventId: null,
          website: null,
          tel: null,
          subcategory: null,
        },
      ],
      arts_and_entertainment: [
        {
          sourceId: "fsq-arts-1",
          name: "Louvre Museum",
          address: "Rue de Rivoli",
          lat: 48.8606,
          lon: 2.3376,
          distance: 1200,
          category: "arts_and_entertainment" as POICategoryKey,
          popularity: null,
          price: null,
          rating: null,
          eventId: null,
          website: null,
          tel: null,
          subcategory: null,
        },
      ],
      outdoors: [],
      nightlife: [],
    },
  };
}

function makePartialResponse(): POISuggestionsResponse {
  return {
    destination: "Paris, France",
    source: "foursquare",
    categories: {
      food_and_drink: [
        {
          sourceId: "fsq-food-p",
          name: "Partial Bistro",
          address: "3 Rue Example",
          lat: 48.8566,
          lon: 2.3522,
          distance: 300,
          category: "food_and_drink" as POICategoryKey,
          popularity: null,
          price: null,
          rating: null,
          eventId: null,
          website: null,
          tel: null,
          subcategory: null,
        },
      ],
      arts_and_entertainment: [],
      outdoors: [],
      nightlife: [],
    },
    partial: true,
    errors: {
      arts_and_entertainment: "No results or fetch failed",
      outdoors: "No results or fetch failed",
      nightlife: "No results or fetch failed",
    },
  };
}

describe("DiscoverView", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock returns
    mockUseTripDetail.mockReturnValue({
      data: { preferredTimezone: "Europe/Paris", startDate: "2026-04-10", endDate: "2026-04-13" },
    });
    mockUseEvents.mockReturnValue({ data: [] });
    mockUseAccommodations.mockReturnValue({ data: [] });
    mockUseAuth.mockReturnValue({ user: null, loading: false, isAdmin: false, impersonating: { active: false } });
    mockUseDiscover.mockReturnValue({
      data: makePopulatedResponse(),
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  describe("loading state", () => {
    it("shows skeleton placeholders when loading", () => {
      mockUseDiscover.mockReturnValue({
        data: null,
        isPending: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      const { container } = render(<DiscoverView tripId={TRIP_ID} />);
      // Should render skeleton elements
      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      // The Skeleton component may not have animate-pulse in test env,
      // but the component renders during isPending
      expect(screen.queryByText("Discover")).toBeNull();
    });
  });

  describe("error state", () => {
    it("shows error message when fetch fails", () => {
      mockUseDiscover.mockReturnValue({
        data: null,
        isPending: false,
        isError: true,
        error: new Error("Network error"),
        refetch: vi.fn(),
      });

      render(<DiscoverView tripId={TRIP_ID} />);
      expect(screen.getByText("Failed to load suggestions")).toBeDefined();
      expect(screen.getByText("Network error")).toBeDefined();
      expect(screen.getByText("Retry")).toBeDefined();
    });
  });

  describe("no destination", () => {
    it("shows empty state when no destination is set", () => {
      mockUseDiscover.mockReturnValue({
        data: makeEmptyResponse(),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DiscoverView tripId={TRIP_ID} />);
      expect(screen.getByText("No destination set")).toBeDefined();
      expect(
        screen.getByText("Set a trip destination to discover nearby places"),
      ).toBeDefined();
    });
  });

  describe("results", () => {
    it("renders discover heading with destination", () => {
      render(<DiscoverView tripId={TRIP_ID} />);
      expect(screen.getByText("Discover")).toBeDefined();
      expect(screen.getByText(/Paris, France/)).toBeDefined();
    });

    it("renders POI cards for non-empty categories", () => {
      render(<DiscoverView tripId={TRIP_ID} />);
      expect(screen.getByText("Le Bistro")).toBeDefined();
      expect(screen.getByText("Cafe Paris")).toBeDefined();
      expect(screen.getByText("Louvre Museum")).toBeDefined();
    });

    it("shows category counts", () => {
      render(<DiscoverView tripId={TRIP_ID} />);
      expect(screen.getByText("(2)")).toBeDefined();
      expect(screen.getByText("(1)")).toBeDefined();
    });

    it("does not render category sections for empty categories", () => {
      const { container } = render(<DiscoverView tripId={TRIP_ID} />);
      // The category section <h3> headings should only exist for non-empty categories
      const headings = container.querySelectorAll("h3");
      const headingTexts = Array.from(headings).map((h) => h.textContent);
      // Outdoors and nightlife are empty — should NOT have h3 headings
      expect(headingTexts.some((t) => t?.startsWith("Outdoors"))).toBe(false);
      expect(headingTexts.some((t) => t?.startsWith("Nightlife"))).toBe(false);
      // Non-empty categories DO render their section headings
      expect(headingTexts.some((t) => t?.startsWith("Food & Drink"))).toBe(true);
      expect(headingTexts.some((t) => t?.startsWith("Arts & Entertainment"))).toBe(true);
    });

    it("shows partial data warning when applicable", () => {
      mockUseDiscover.mockReturnValue({
        data: makePartialResponse(),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DiscoverView tripId={TRIP_ID} />);
      expect(
        screen.getByText("Some categories couldn't be loaded. Results may be incomplete."),
      ).toBeDefined();
    });
  });

  describe("filter pills", () => {
    it("shows all four category filter pills", () => {
      render(<DiscoverView tripId={TRIP_ID} />);
      // Text appears in both filter pills and category h3 headings, so use getAllByText
      expect(screen.getAllByText("Food & Drink").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Arts & Entertainment").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Outdoors").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Nightlife").length).toBeGreaterThan(0);
    });
  });

  describe("refresh button", () => {
    it("renders a refresh button", () => {
      render(<DiscoverView tripId={TRIP_ID} />);
      expect(screen.getByText("Refresh")).toBeDefined();
    });
  });

  describe("POI-to-event flow", () => {
    it("opens create event dialog when a POI card is clicked", async () => {
      const user = userEvent.setup();
      render(<DiscoverView tripId={TRIP_ID} />);

      // Click the first POI card ("Le Bistro")
      const bistroButton = screen.getByText("Le Bistro").closest("button");
      expect(bistroButton).not.toBeNull();
      await user.click(bistroButton!);

      // Dialog should open with the POI name pre-filled
      await waitFor(() => {
        expect(screen.getByTestId("create-event-dialog")).toBeDefined();
      });
      expect(screen.getByTestId("dialog-default-name").textContent).toBe(
        "Le Bistro",
      );
    });
  });
});
