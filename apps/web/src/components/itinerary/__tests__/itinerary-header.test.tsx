import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ItineraryHeader } from "../itinerary-header";

// Mock useAuth (required by CreateMemberTravelDialog rendered inside ItineraryHeader)
vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      displayName: "Test User",
      phoneNumber: "+15551234567",
    },
  }),
}));

// Mock useMembers (required by CreateMemberTravelDialog rendered inside ItineraryHeader)
vi.mock("@/hooks/use-invitations", () => ({
  useMembers: () => ({
    data: [
      {
        id: "member-1",
        userId: "user-1",
        displayName: "Test User",
        profilePhotoUrl: null,
        handles: null,
        isOrganizer: true,
        status: "going",
        createdAt: "2026-01-01",
      },
    ],
  }),
}));

// Mock getUploadUrl (required by CreateMemberTravelDialog)
vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  getUploadUrl: (path: string | null | undefined) => path ?? undefined,
  APIError: class APIError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = "APIError";
    }
  },
}));

describe("ItineraryHeader", () => {
  let queryClient: QueryClient;

  const defaultProps = {
    filter: "all" as const,
    onFilterChange: vi.fn(),
    selectedTimezone: "America/Los_Angeles",
    onTimezoneChange: vi.fn(),
    tripTimezone: "America/Los_Angeles",
    userTimezone: "America/New_York",
    tripId: "test-trip-123",
    isOrganizer: false,
    isMember: true,
    allowMembersToAddEvents: true,
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const renderWithQueryClient = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    );
  };

  describe("Rendering", () => {
    it("renders filter pills", () => {
      renderWithQueryClient(<ItineraryHeader {...defaultProps} />);

      expect(screen.getByText("All")).toBeDefined();
    });

    it("renders timezone settings button", () => {
      renderWithQueryClient(<ItineraryHeader {...defaultProps} />);

      expect(
        screen.getByRole("button", { name: "Timezone settings" }),
      ).toBeDefined();
    });
  });

  describe("Filter pills", () => {
    it("highlights 'All' pill when selected", () => {
      renderWithQueryClient(
        <ItineraryHeader {...defaultProps} filter="all" />,
      );

      const allButton = screen.getByText("All");
      expect(allButton.className).toContain("bg-primary");
    });

    it("calls onFilterChange when a filter pill is clicked", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const onFilterChange = vi.fn();

      renderWithQueryClient(
        <ItineraryHeader
          {...defaultProps}
          onFilterChange={onFilterChange}
        />,
      );

      // Click the Activity filter pill (🎯 emoji)
      const buttons = screen.getAllByRole("button");
      // Filter pills are the first buttons in the header
      const activityPill = buttons.find((b) => b.textContent?.includes("\uD83C\uDFAF"));
      expect(activityPill).toBeDefined();
      await user.click(activityPill!);

      expect(onFilterChange).toHaveBeenCalledWith("activity");
    });
  });

  describe("FAB and action menu", () => {
    it("renders FAB when user has any action available", () => {
      renderWithQueryClient(
        <ItineraryHeader {...defaultProps} isMember={true} />,
      );
      const fab = screen.getByRole("button", { name: /add to itinerary/i });
      expect(fab).toBeDefined();
    });

    it("does not render FAB when no actions are available", () => {
      renderWithQueryClient(
        <ItineraryHeader
          {...defaultProps}
          isOrganizer={false}
          isMember={false}
          allowMembersToAddEvents={false}
        />,
      );
      const fab = screen.queryByRole("button", { name: /add to itinerary/i });
      expect(fab).toBeNull();
    });

    it("shows Event menu item when canAddEvent is true", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ItineraryHeader
          {...defaultProps}
          isMember={true}
          allowMembersToAddEvents={true}
        />,
      );

      const fab = screen.getByRole("button", { name: /add to itinerary/i });
      await user.click(fab);

      const eventItem = screen.getByRole("menuitem", { name: /event/i });
      expect(eventItem).toBeDefined();
    });

    it("does not show Event menu item when canAddEvent is false", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ItineraryHeader
          {...defaultProps}
          isOrganizer={false}
          isMember={true}
          allowMembersToAddEvents={false}
        />,
      );

      const fab = screen.getByRole("button", { name: /add to itinerary/i });
      await user.click(fab);

      const eventItem = screen.queryByRole("menuitem", { name: /^event$/i });
      expect(eventItem).toBeNull();
    });

    it("shows Accommodation menu item when isOrganizer is true", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ItineraryHeader {...defaultProps} isOrganizer={true} />,
      );

      const fab = screen.getByRole("button", { name: /add to itinerary/i });
      await user.click(fab);

      const item = screen.getByRole("menuitem", { name: /accommodation/i });
      expect(item).toBeDefined();
    });

    it("does not show Accommodation menu item when isOrganizer is false", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ItineraryHeader {...defaultProps} isOrganizer={false} />,
      );

      const fab = screen.getByRole("button", { name: /add to itinerary/i });
      await user.click(fab);

      const item = screen.queryByRole("menuitem", { name: /accommodation/i });
      expect(item).toBeNull();
    });

    it("shows My Travel menu item when isMember is true", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <ItineraryHeader {...defaultProps} isMember={true} />,
      );

      const fab = screen.getByRole("button", { name: /add to itinerary/i });
      await user.click(fab);

      const item = screen.getByRole("menuitem", { name: /my travel/i });
      expect(item).toBeDefined();
    });

    it("does not show My Travel menu item when isMember is false", async () => {
      // When isMember is false and isOrganizer is true, FAB still shows
      const user = userEvent.setup();
      renderWithQueryClient(
        <ItineraryHeader
          {...defaultProps}
          isOrganizer={true}
          isMember={false}
        />,
      );

      const fab = screen.getByRole("button", { name: /add to itinerary/i });
      await user.click(fab);

      const item = screen.queryByRole("menuitem", { name: /my travel/i });
      expect(item).toBeNull();
    });

    it("menu items are clickable and open dialogs", async () => {
      // Skip pointer-events check: Radix DropdownMenu sets pointer-events:none
      // on the trigger when open, which is a test environment artifact
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      renderWithQueryClient(
        <ItineraryHeader
          {...defaultProps}
          isOrganizer={true}
          isMember={true}
          allowMembersToAddEvents={true}
        />,
      );

      const fab = screen.getByRole("button", { name: /add to itinerary/i });
      await user.click(fab);

      const eventItem = screen.getByRole("menuitem", { name: /event/i });
      await user.click(eventItem);

      // Clicking a menu item should not throw
      // Re-open to verify menu still works
      await user.click(fab);
      const accommItem = screen.getByRole("menuitem", {
        name: /accommodation/i,
      });
      await user.click(accommItem);

      await user.click(fab);
      const travelItem = screen.getByRole("menuitem", {
        name: /my travel/i,
      });
      await user.click(travelItem);
    });
  });

  describe("Sticky positioning", () => {
    it("applies sticky positioning classes", () => {
      const { container } = renderWithQueryClient(
        <ItineraryHeader {...defaultProps} />,
      );

      const header = container.querySelector(".sticky");
      expect(header).toBeDefined();
      expect(header?.className).toContain("top-0");
      expect(header?.className).toContain("z-30");
    });
  });
});
