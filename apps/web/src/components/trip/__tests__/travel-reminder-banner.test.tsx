import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TravelReminderBanner } from "../travel-reminder-banner";

// Mock useMemberTravels hook
const mockUseMemberTravels = vi.fn();
vi.mock("@/hooks/use-member-travel", () => ({
  useMemberTravels: (tripId: string) => mockUseMemberTravels(tripId),
}));

describe("TravelReminderBanner", () => {
  const defaultProps = {
    tripId: "trip-1",
    memberId: "member-1",
    onAddTravel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseMemberTravels.mockReturnValue({ data: [] });
  });

  it("renders banner when no arrival and not dismissed", () => {
    render(<TravelReminderBanner {...defaultProps} />);
    expect(screen.getByTestId("travel-reminder-banner")).toBeDefined();
    expect(screen.getByText("Share your travel plans")).toBeDefined();
    expect(screen.getByText("Add Travel Details")).toBeDefined();
    expect(screen.getByText("Dismiss")).toBeDefined();
  });

  it("renders when member has only arrival entry (no departure)", () => {
    mockUseMemberTravels.mockReturnValue({
      data: [
        {
          id: "t1",
          memberId: "member-1",
          travelType: "arrival",
          deletedAt: null,
        },
      ],
    });
    render(<TravelReminderBanner {...defaultProps} />);
    expect(screen.getByTestId("travel-reminder-banner")).toBeDefined();
  });

  it("does not render when member has both arrival and departure entries", () => {
    mockUseMemberTravels.mockReturnValue({
      data: [
        {
          id: "t1",
          memberId: "member-1",
          travelType: "arrival",
          deletedAt: null,
        },
        {
          id: "t2",
          memberId: "member-1",
          travelType: "departure",
          deletedAt: null,
        },
      ],
    });
    render(<TravelReminderBanner {...defaultProps} />);
    expect(screen.queryByTestId("travel-reminder-banner")).toBeNull();
  });

  it("renders when different member has arrival (not current member)", () => {
    mockUseMemberTravels.mockReturnValue({
      data: [
        {
          id: "t1",
          memberId: "member-2",
          travelType: "arrival",
          deletedAt: null,
        },
      ],
    });
    render(<TravelReminderBanner {...defaultProps} />);
    expect(screen.getByTestId("travel-reminder-banner")).toBeDefined();
  });

  it("renders when member's arrival is soft-deleted", () => {
    mockUseMemberTravels.mockReturnValue({
      data: [
        {
          id: "t1",
          memberId: "member-1",
          travelType: "arrival",
          deletedAt: new Date(),
        },
      ],
    });
    render(<TravelReminderBanner {...defaultProps} />);
    expect(screen.getByTestId("travel-reminder-banner")).toBeDefined();
  });

  it("renders when departure exists but no arrival", () => {
    mockUseMemberTravels.mockReturnValue({
      data: [
        {
          id: "t1",
          memberId: "member-1",
          travelType: "departure",
          deletedAt: null,
        },
      ],
    });
    render(<TravelReminderBanner {...defaultProps} />);
    expect(screen.getByTestId("travel-reminder-banner")).toBeDefined();
  });

  it("does not render when memberId is undefined", () => {
    render(<TravelReminderBanner {...defaultProps} memberId={undefined} />);
    expect(screen.queryByTestId("travel-reminder-banner")).toBeNull();
  });

  it("dismiss button hides banner", async () => {
    const user = userEvent.setup();
    render(<TravelReminderBanner {...defaultProps} />);

    expect(screen.getByTestId("travel-reminder-banner")).toBeDefined();

    await user.click(screen.getByText("Dismiss"));

    expect(screen.queryByTestId("travel-reminder-banner")).toBeNull();
  });

  it("dismiss persists in localStorage", async () => {
    const user = userEvent.setup();
    render(<TravelReminderBanner {...defaultProps} />);

    await user.click(screen.getByText("Dismiss"));

    expect(localStorage.getItem("tripful:onboarding-dismissed:trip-1")).toBe(
      "true",
    );
  });

  it("does not render when localStorage has dismiss flag", () => {
    localStorage.setItem("tripful:onboarding-dismissed:trip-1", "true");
    render(<TravelReminderBanner {...defaultProps} />);
    expect(screen.queryByTestId("travel-reminder-banner")).toBeNull();
  });

  it("X button also dismisses banner", async () => {
    const user = userEvent.setup();
    render(<TravelReminderBanner {...defaultProps} />);

    await user.click(screen.getByLabelText("Dismiss banner"));

    expect(screen.queryByTestId("travel-reminder-banner")).toBeNull();
    expect(localStorage.getItem("tripful:onboarding-dismissed:trip-1")).toBe(
      "true",
    );
  });

  it("Add Travel Details button calls onAddTravel", async () => {
    const user = userEvent.setup();
    const onAddTravel = vi.fn();
    render(
      <TravelReminderBanner {...defaultProps} onAddTravel={onAddTravel} />,
    );

    await user.click(screen.getByText("Add Travel Details"));

    expect(onAddTravel).toHaveBeenCalledOnce();
  });

  it("uses trip-specific localStorage key", async () => {
    const user = userEvent.setup();
    render(<TravelReminderBanner {...defaultProps} tripId="trip-abc" />);

    await user.click(screen.getByText("Dismiss"));

    expect(localStorage.getItem("tripful:onboarding-dismissed:trip-abc")).toBe(
      "true",
    );
    expect(
      localStorage.getItem("tripful:onboarding-dismissed:trip-1"),
    ).toBeNull();
  });
});
