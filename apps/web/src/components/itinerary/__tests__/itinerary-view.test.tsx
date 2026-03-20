import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ItineraryView } from "../itinerary-view";
import type { Event, Accommodation } from "@journiful/shared/types";

// Mock hooks
const mockUseAuth = vi.fn();
const mockUseTripDetail = vi.fn();
const mockUseEvents = vi.fn();
const mockUseAccommodations = vi.fn();
const mockUseMemberTravels = vi.fn();

vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/hooks/use-trips", () => ({
  useTripDetail: () => mockUseTripDetail(),
}));

vi.mock("@/hooks/use-events", () => ({
  useEvents: () => mockUseEvents(),
  useEventsWithDeleted: () => ({ data: [], isPending: false, isError: false }),
  useEvent: () => ({ data: null, isLoading: false }),
  useCreateEvent: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateEvent: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteEvent: () => ({ mutate: vi.fn(), isPending: false }),
  useRestoreEvent: () => ({ mutate: vi.fn(), isPending: false }),
  getRestoreEventErrorMessage: () => null,
}));

vi.mock("@/hooks/use-accommodations", () => ({
  useAccommodations: () => mockUseAccommodations(),
  useAccommodationsWithDeleted: () => ({
    data: [],
    isPending: false,
    isError: false,
  }),
  useAccommodation: () => ({ data: null, isLoading: false }),
  useCreateAccommodation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAccommodation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAccommodation: () => ({ mutate: vi.fn(), isPending: false }),
  useRestoreAccommodation: () => ({ mutate: vi.fn(), isPending: false }),
  getRestoreAccommodationErrorMessage: () => null,
}));

vi.mock("@/hooks/use-member-travel", () => ({
  useMemberTravels: () => mockUseMemberTravels(),
  useMemberTravelsWithDeleted: () => ({
    data: [],
    isPending: false,
    isError: false,
  }),
  useMemberTravel: () => ({ data: null, isLoading: false }),
  useCreateMemberTravel: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateMemberTravel: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteMemberTravel: () => ({ mutate: vi.fn(), isPending: false }),
  useRestoreMemberTravel: () => ({ mutate: vi.fn(), isPending: false }),
  getRestoreMemberTravelErrorMessage: () => null,
}));

vi.mock("@/hooks/use-weather", () => ({
  useWeatherForecast: () => ({ data: undefined, isLoading: false }),
  weatherKeys: { all: ["weather"] },
  weatherForecastQueryOptions: () => ({}),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("ItineraryView", () => {
  const mockUser = {
    id: "user-123",
    phoneNumber: "+1234567890",
    displayName: "Test User",
    profilePhotoUrl: null,
    timezone: "America/New_York",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTrip = {
    id: "trip-123",
    name: "Summer Trip",
    destination: "Malibu",
    startDate: "2026-07-15",
    endDate: "2026-07-20",
    preferredTimezone: "America/Los_Angeles",
    description: "Fun trip",
    coverImageUrl: null,
    createdBy: "user-123",
    allowMembersToAddEvents: true,
    cancelled: false,
    organizers: [
      {
        id: "user-123",
        displayName: "Test User",
        phoneNumber: "+1234567890",
        profilePhotoUrl: null,
        timezone: "America/New_York",
      },
    ],
    memberCount: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEvent: Event = {
    id: "event-123",
    tripId: "trip-123",
    createdBy: "user-123",
    name: "Beach Lunch",
    description: "Lunch at beach",
    eventType: "meal",
    location: "Malibu Cafe",
    startTime: new Date("2026-07-15T12:00:00Z"),
    endTime: new Date("2026-07-15T14:00:00Z"),
    allDay: false,
    isOptional: false,
    links: null,
    meetupLocation: null,
    meetupTime: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAccommodation: Accommodation = {
    id: "acc-123",
    tripId: "trip-123",
    createdBy: "user-123",
    name: "Beach House",
    address: "123 Beach St",
    description: "Nice house",
    checkIn: "2026-07-15T14:00:00.000Z",
    checkOut: "2026-07-20T11:00:00.000Z",
    links: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });
    mockUseTripDetail.mockReturnValue({
      data: mockTrip,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseEvents.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseAccommodations.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseMemberTravels.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  describe("Loading state", () => {
    it("shows skeleton loaders while data is loading", () => {
      mockUseTripDetail.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        refetch: vi.fn(),
      });

      const { container } = render(
        <Wrapper>
          <ItineraryView tripId="trip-123" />
        </Wrapper>,
      );

      const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("Error state", () => {
    it("shows error message when trip fails to load", () => {
      mockUseTripDetail.mockReturnValue({
        data: undefined,
        isPending: false,
        isError: true,
        refetch: vi.fn(),
      });

      render(
        <Wrapper>
          <ItineraryView tripId="trip-123" />
        </Wrapper>,
      );

      expect(screen.getByText("Failed to load itinerary")).toBeDefined();
    });

    it("shows retry button on error", () => {
      const refetch = vi.fn();
      mockUseTripDetail.mockReturnValue({
        data: undefined,
        isPending: false,
        isError: true,
        refetch,
      });

      render(
        <Wrapper>
          <ItineraryView tripId="trip-123" />
        </Wrapper>,
      );

      const retryButton = screen.getByText("Retry");
      expect(retryButton).toBeDefined();
    });
  });

  describe("Empty state", () => {
    it("shows empty state when no events, accommodations, or travels", () => {
      render(
        <Wrapper>
          <ItineraryView tripId="trip-123" />
        </Wrapper>,
      );

      expect(screen.getByText("No itinerary yet")).toBeDefined();
    });

    it("shows CTA buttons for organizers in empty state", () => {
      render(
        <Wrapper>
          <ItineraryView tripId="trip-123" />
        </Wrapper>,
      );

      expect(screen.getByText("Add Event")).toBeDefined();
      expect(screen.getByText("Add Accommodation")).toBeDefined();
    });
  });

  describe("View mode toggle", () => {
    it("defaults to day-by-day view", () => {
      mockUseEvents.mockReturnValue({
        data: [mockEvent],
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      });

      render(
        <Wrapper>
          <ItineraryView tripId="trip-123" />
        </Wrapper>,
      );

      const dayByDayButton = screen.getByLabelText("Day by Day");
      expect(dayByDayButton.dataset.variant).toBe("default");
    });

    it("switches to group-by-type view when clicked", async () => {
      const user = userEvent.setup();
      mockUseEvents.mockReturnValue({
        data: [mockEvent],
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      });

      render(
        <Wrapper>
          <ItineraryView tripId="trip-123" />
        </Wrapper>,
      );

      const groupByTypeButton = screen.getByLabelText("Group by Type");
      await user.click(groupByTypeButton);

      await waitFor(() => {
        expect(groupByTypeButton.dataset.variant).toBe("default");
      });
    });
  });

  describe("Timezone toggle", () => {
    it("defaults to trip timezone", () => {
      mockUseEvents.mockReturnValue({
        data: [mockEvent],
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      });

      render(
        <Wrapper>
          <ItineraryView tripId="trip-123" />
        </Wrapper>,
      );

      // The timezone selector defaults to trip timezone and shows its label
      const timezoneTrigger = screen.getByLabelText("Timezone");
      expect(timezoneTrigger).toBeDefined();
      // The selected value should show trip timezone label with "(Trip)" suffix
      expect(screen.getByText(/Pacific Time \(PT\).*\(Trip\)/)).toBeDefined();
    });

    it("renders timezone selector trigger", () => {
      mockUseEvents.mockReturnValue({
        data: [mockEvent],
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      });

      render(
        <Wrapper>
          <ItineraryView tripId="trip-123" />
        </Wrapper>,
      );

      // The timezone selector should be rendered and accessible
      const timezoneTrigger = screen.getByLabelText("Timezone");
      expect(timezoneTrigger).toBeDefined();
    });
  });

  describe("Content display", () => {
    it("displays events when present", () => {
      mockUseEvents.mockReturnValue({
        data: [mockEvent],
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      });

      render(
        <Wrapper>
          <ItineraryView tripId="trip-123" />
        </Wrapper>,
      );

      expect(screen.getByText("Beach Lunch")).toBeDefined();
    });

    it("displays accommodations when present", () => {
      mockUseAccommodations.mockReturnValue({
        data: [mockAccommodation],
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      });

      render(
        <Wrapper>
          <ItineraryView tripId="trip-123" />
        </Wrapper>,
      );

      // Accommodation spans multiple days, so it appears more than once
      const beachHouseElements = screen.getAllByText("Beach House");
      expect(beachHouseElements.length).toBeGreaterThan(0);
    });

    it("shows accommodation on all spanned days (check-in through day before check-out)", () => {
      mockUseAccommodations.mockReturnValue({
        data: [mockAccommodation],
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      });

      render(
        <Wrapper>
          <ItineraryView tripId="trip-123" />
        </Wrapper>,
      );

      // mockAccommodation spans Jul 15 (check-in at 14:00 UTC) to Jul 20 (check-out at 11:00 UTC)
      // In America/Los_Angeles timezone (UTC-7), check-in is Jul 15, check-out is Jul 20
      // Accommodation should appear on days 15, 16, 17, 18, 19 (5 days, excluding check-out day)
      const beachHouseElements = screen.getAllByText("Beach House");
      expect(beachHouseElements).toHaveLength(5);
    });
  });
});
