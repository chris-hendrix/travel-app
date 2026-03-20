import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeletedItemsDialog } from "../deleted-items-dialog";
import type { Event, Accommodation, MemberTravel } from "@journiful/shared/types";

// Mock data
const mockDeletedEvent: Event = {
  id: "event-del-1",
  tripId: "trip-123",
  createdBy: "user-123",
  name: "Deleted Beach Party",
  description: null,
  eventType: "activity",
  location: null,
  meetupLocation: null,
  meetupTime: null,
  startTime: new Date("2026-07-16T12:00:00Z"),
  endTime: null,
  allDay: false,
  isOptional: false,
  links: null,
  deletedAt: new Date("2026-07-10T15:30:00Z"),
  deletedBy: "user-123",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockDeletedAccommodation: Accommodation = {
  id: "acc-del-1",
  tripId: "trip-123",
  createdBy: "user-123",
  name: "Deleted Hotel Stay",
  address: "456 Palm Ave",
  description: null,
  checkIn: "2026-07-15T14:00:00.000Z",
  checkOut: "2026-07-18T11:00:00.000Z",
  links: null,
  deletedAt: new Date("2026-07-09T10:00:00Z"),
  deletedBy: "user-123",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockDeletedMemberTravel: MemberTravel = {
  id: "mt-del-1",
  tripId: "trip-123",
  memberId: "member-1",
  travelType: "arrival",
  time: new Date("2026-07-15T08:00:00Z"),
  location: "LAX",
  details: null,
  deletedAt: new Date("2026-07-08T09:00:00Z"),
  deletedBy: "user-123",
  createdAt: new Date(),
  updatedAt: new Date(),
  memberName: "Alice",
};

// Mock hooks
const mockUseEventsWithDeleted = vi.fn();
const mockUseAccommodationsWithDeleted = vi.fn();
const mockUseMemberTravelsWithDeleted = vi.fn();
const mockRestoreEventMutate = vi.fn();
const mockRestoreAccommodationMutate = vi.fn();
const mockRestoreMemberTravelMutate = vi.fn();

vi.mock("@/hooks/use-events", () => ({
  useEventsWithDeleted: () => mockUseEventsWithDeleted(),
  useRestoreEvent: () => ({
    mutate: mockRestoreEventMutate,
    isPending: false,
    variables: undefined,
  }),
  getRestoreEventErrorMessage: () => "Failed to restore event",
}));

vi.mock("@/hooks/use-accommodations", () => ({
  useAccommodationsWithDeleted: () => mockUseAccommodationsWithDeleted(),
  useRestoreAccommodation: () => ({
    mutate: mockRestoreAccommodationMutate,
    isPending: false,
    variables: undefined,
  }),
  getRestoreAccommodationErrorMessage: () => "Failed to restore accommodation",
}));

vi.mock("@/hooks/use-member-travel", () => ({
  useMemberTravelsWithDeleted: () => mockUseMemberTravelsWithDeleted(),
  useRestoreMemberTravel: () => ({
    mutate: mockRestoreMemberTravelMutate,
    isPending: false,
    variables: undefined,
  }),
  getRestoreMemberTravelErrorMessage: () => "Failed to restore member travel",
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
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

describe("DeletedItemsDialog", () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseEventsWithDeleted.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    mockUseAccommodationsWithDeleted.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    mockUseMemberTravelsWithDeleted.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
  });

  it("shows empty state when there are no deleted items", () => {
    render(
      <Wrapper>
        <DeletedItemsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-123"
          timezone="UTC"
        />
      </Wrapper>,
    );

    expect(screen.getByText("Deleted items")).toBeDefined();
    expect(screen.getByText("No deleted items.")).toBeDefined();
  });

  it("shows deleted events when dialog is open", () => {
    mockUseEventsWithDeleted.mockReturnValue({
      data: [mockDeletedEvent],
      isPending: false,
      isError: false,
    });

    render(
      <Wrapper>
        <DeletedItemsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-123"
          timezone="UTC"
        />
      </Wrapper>,
    );

    expect(screen.getByText("Deleted Beach Party")).toBeDefined();
  });

  it("shows items grouped by type", () => {
    mockUseEventsWithDeleted.mockReturnValue({
      data: [mockDeletedEvent],
      isPending: false,
      isError: false,
    });
    mockUseAccommodationsWithDeleted.mockReturnValue({
      data: [mockDeletedAccommodation],
      isPending: false,
      isError: false,
    });
    mockUseMemberTravelsWithDeleted.mockReturnValue({
      data: [mockDeletedMemberTravel],
      isPending: false,
      isError: false,
    });

    render(
      <Wrapper>
        <DeletedItemsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-123"
          timezone="UTC"
        />
      </Wrapper>,
    );

    expect(screen.getByText("Events")).toBeDefined();
    expect(screen.getByText("Accommodations")).toBeDefined();
    expect(screen.getByText("Member Travel")).toBeDefined();
    expect(screen.getByText("Deleted Beach Party")).toBeDefined();
    expect(screen.getByText("Deleted Hotel Stay")).toBeDefined();
    expect(screen.getByText("Alice - arrival")).toBeDefined();
  });

  it("filters out non-deleted items", () => {
    const activeEvent: Event = {
      ...mockDeletedEvent,
      id: "event-active",
      name: "Active Event",
      deletedAt: null,
      deletedBy: null,
    };

    mockUseEventsWithDeleted.mockReturnValue({
      data: [activeEvent, mockDeletedEvent],
      isPending: false,
      isError: false,
    });

    render(
      <Wrapper>
        <DeletedItemsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-123"
          timezone="UTC"
        />
      </Wrapper>,
    );

    expect(screen.getByText("Deleted Beach Party")).toBeDefined();
    expect(screen.queryByText("Active Event")).toBeNull();
  });

  it("does not show group headers for types with no deleted items", () => {
    mockUseEventsWithDeleted.mockReturnValue({
      data: [mockDeletedEvent],
      isPending: false,
      isError: false,
    });

    render(
      <Wrapper>
        <DeletedItemsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-123"
          timezone="UTC"
        />
      </Wrapper>,
    );

    expect(screen.getByText("Events")).toBeDefined();
    expect(screen.queryByText("Accommodations")).toBeNull();
    expect(screen.queryByText("Member Travel")).toBeNull();
  });

  it("calls restore event hook when restore button is clicked", async () => {
    const user = userEvent.setup();

    mockUseEventsWithDeleted.mockReturnValue({
      data: [mockDeletedEvent],
      isPending: false,
      isError: false,
    });

    render(
      <Wrapper>
        <DeletedItemsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-123"
          timezone="UTC"
        />
      </Wrapper>,
    );

    const restoreButton = screen.getByRole("button", { name: /Restore/i });
    await user.click(restoreButton);

    expect(mockRestoreEventMutate).toHaveBeenCalledWith(
      "event-del-1",
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("calls restore accommodation hook when restore button is clicked", async () => {
    const user = userEvent.setup();

    mockUseAccommodationsWithDeleted.mockReturnValue({
      data: [mockDeletedAccommodation],
      isPending: false,
      isError: false,
    });

    render(
      <Wrapper>
        <DeletedItemsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-123"
          timezone="UTC"
        />
      </Wrapper>,
    );

    const restoreButton = screen.getByRole("button", { name: /Restore/i });
    await user.click(restoreButton);

    expect(mockRestoreAccommodationMutate).toHaveBeenCalledWith(
      "acc-del-1",
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("calls restore member travel hook when restore button is clicked", async () => {
    const user = userEvent.setup();

    mockUseMemberTravelsWithDeleted.mockReturnValue({
      data: [mockDeletedMemberTravel],
      isPending: false,
      isError: false,
    });

    render(
      <Wrapper>
        <DeletedItemsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-123"
          timezone="UTC"
        />
      </Wrapper>,
    );

    const restoreButton = screen.getByRole("button", { name: /Restore/i });
    await user.click(restoreButton);

    expect(mockRestoreMemberTravelMutate).toHaveBeenCalledWith(
      "mt-del-1",
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("displays member travel label with member name and travel type", () => {
    mockUseMemberTravelsWithDeleted.mockReturnValue({
      data: [mockDeletedMemberTravel],
      isPending: false,
      isError: false,
    });

    render(
      <Wrapper>
        <DeletedItemsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-123"
          timezone="UTC"
        />
      </Wrapper>,
    );

    expect(screen.getByText("Alice - arrival")).toBeDefined();
  });

  it("displays travel type as label when member name is missing", () => {
    const travelWithoutName: MemberTravel = {
      ...mockDeletedMemberTravel,
      memberName: undefined,
    };

    mockUseMemberTravelsWithDeleted.mockReturnValue({
      data: [travelWithoutName],
      isPending: false,
      isError: false,
    });

    render(
      <Wrapper>
        <DeletedItemsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-123"
          timezone="UTC"
        />
      </Wrapper>,
    );

    const arrivalTexts = screen.getAllByText("arrival");
    expect(arrivalTexts.length).toBeGreaterThan(0);
  });

  it("does not render content when closed", () => {
    mockUseEventsWithDeleted.mockReturnValue({
      data: [mockDeletedEvent],
      isPending: false,
      isError: false,
    });

    render(
      <Wrapper>
        <DeletedItemsDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          tripId="trip-123"
          timezone="UTC"
        />
      </Wrapper>,
    );

    expect(screen.queryByText("Deleted Beach Party")).toBeNull();
  });
});
