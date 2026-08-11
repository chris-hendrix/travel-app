import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiscoverView } from "../discover-view";
import type { POISuggestionsResponse, POICategoryKey, TemperatureUnit } from "@journiful/shared/types";

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

const celsius: TemperatureUnit = "celsius";

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
    source: "google",
    categories: {
      food_and_drink: [],
      arts_and_entertainment: [],
      outdoors: [],
      nightlife: [],
      wellness: [],
      shopping: [],
    },
  };
}

function makePopulatedResponse(): POISuggestionsResponse {
  return {
    destination: "Paris, France",
    source: "google",
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
          photoName: null,
          photoAttribution: null,
          googleMapsUri: null,
          businessStatus: null,
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
          photoName: null,
          photoAttribution: null,
          googleMapsUri: null,
          businessStatus: null,
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
          photoName: null,
          photoAttribution: null,
          googleMapsUri: null,
          businessStatus: null,
        },
      ],
      outdoors: [],
      nightlife: [],
      wellness: [],
      shopping: [],
    },
  };
}

describe("DiscoverView", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock returns
    mockUseTripDetail.mockReturnValue({
      data: { preferredTimezone: "Europe/Paris", startDate: "2026-04-10", endDate: "2026-04-13", destinationLat: 48.8566, destinationLon: 2.3522, destination: "Paris, France" },
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

      const { container } = render(<DiscoverView tripId={TRIP_ID} temperatureUnit={celsius} />);
      // Should render in loading state
      expect(container.children.length).toBeGreaterThan(0);
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

      render(<DiscoverView tripId={TRIP_ID} temperatureUnit={celsius} />);
      expect(screen.getByText("Failed to load suggestions")).toBeDefined();
      expect(screen.getByText("Network error")).toBeDefined();
      expect(screen.getByText("Retry")).toBeDefined();
    });
  });

  describe("no destination", () => {
    it("shows empty state when no destination is set", () => {
      mockUseTripDetail.mockReturnValue({
        data: { preferredTimezone: "UTC", startDate: null, endDate: null, destination: null, destinationLat: null, destinationLon: null },
      });
      mockUseDiscover.mockReturnValue({
        data: makeEmptyResponse(),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DiscoverView tripId={TRIP_ID} temperatureUnit={celsius} />);
      expect(screen.getByText("No destination set")).toBeDefined();
      expect(
        screen.getByText("Set a trip destination to discover nearby places"),
      ).toBeDefined();
    });
  });

  describe("results", () => {
    it("renders location picker with destination", () => {
      render(<DiscoverView tripId={TRIP_ID} temperatureUnit={celsius} />);
      expect(screen.getByText("near")).toBeDefined();
      expect(screen.getByText(/Paris, France/)).toBeDefined();
    });

    it("renders POI cards for non-empty categories", () => {
      render(<DiscoverView tripId={TRIP_ID} temperatureUnit={celsius} />);
      expect(screen.getByText("Le Bistro")).toBeDefined();
      expect(screen.getByText("Cafe Paris")).toBeDefined();
      expect(screen.getByText("Louvre Museum")).toBeDefined();
    });

    it("does not render category sections for empty categories", () => {
      const { container } = render(<DiscoverView tripId={TRIP_ID} temperatureUnit={celsius} />);
      // The category section <h3> headings should only exist for non-empty categories
      const headings = container.querySelectorAll("h3");
      const headingTexts = Array.from(headings).map((h) => h.textContent);
      // Outdoors, nightlife, wellness, and shopping are empty — should NOT have h3 headings
      expect(headingTexts.some((t) => t?.startsWith("Outdoors"))).toBe(false);
      expect(headingTexts.some((t) => t?.startsWith("Nightlife"))).toBe(false);
      expect(headingTexts.some((t) => t?.startsWith("Wellness"))).toBe(false);
      expect(headingTexts.some((t) => t?.startsWith("Shopping"))).toBe(false);
      // Non-empty categories DO render their section headings
      expect(headingTexts.some((t) => t?.startsWith("Food & Drink"))).toBe(true);
      expect(headingTexts.some((t) => t?.startsWith("Arts & Leisure"))).toBe(true);
    });
  });

  describe("POI-to-event flow", () => {
    it("opens create event dialog when Create Event is clicked in detail sheet", async () => {
      const user = userEvent.setup();
      render(<DiscoverView tripId={TRIP_ID} temperatureUnit={celsius} />);

      // Click the first POI card ("Le Bistro") to open detail sheet
      const bistroButton = screen.getByText("Le Bistro").closest("button");
      expect(bistroButton).not.toBeNull();
      await user.click(bistroButton!);

      // Click "Create Event" button in the detail sheet
      const createEventButton = screen.getByRole("button", { name: /create event/i });
      expect(createEventButton).not.toBeNull();
      await user.click(createEventButton);

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
