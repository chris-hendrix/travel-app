import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemberOnboardingWizard } from "../member-onboarding-wizard";
import type { TripDetailWithMeta } from "@/hooks/trip-queries";

// Mock sonner
const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({
  toast: mockToast,
}));

// Mock the API module
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

// Mock DateTimePicker (complex component needs simple mock)
vi.mock("@/components/ui/datetime-picker", () => ({
  DateTimePicker: ({
    value,
    onChange,
    "aria-label": ariaLabel,
    placeholder,
    disabled,
  }: {
    value?: string;
    onChange: (v: string) => void;
    "aria-label"?: string;
    placeholder?: string;
    disabled?: boolean;
  }) => (
    <input
      type="text"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel || placeholder || "datetime"}
      disabled={disabled}
      data-testid="datetime-picker"
    />
  ),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock useAuth
vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

// Mock useMembers and useUpdateMySettings
const mockUpdateMySettingsMutate = vi.fn();
vi.mock("@/hooks/use-invitations", () => ({
  useMembers: () => ({ data: [] }),
  useUpdateMySettings: () => ({
    mutate: mockUpdateMySettingsMutate,
    isPending: false,
  }),
}));

// Mock useMemberTravels while keeping mutation hooks real
const mockUseMemberTravels = vi.fn().mockReturnValue({ data: [] });
vi.mock("@/hooks/use-member-travel", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/hooks/use-member-travel")>();
  return {
    ...actual,
    useMemberTravels: (...args: unknown[]) => mockUseMemberTravels(...args),
  };
});

const mockTrip: TripDetailWithMeta = {
  id: "trip-1",
  name: "Test Trip",
  destination: "Miami, FL",
  startDate: "2026-03-15",
  endDate: "2026-03-20",
  preferredTimezone: "America/New_York",
  allowMembersToAddEvents: true,
  showAllMembers: false,
  isOrganizer: false,
  isPreview: false,
  userRsvpStatus: "going",
  description: null,
  coverImageUrl: null,
  createdBy: "user-1",
  cancelled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  organizers: [],
  memberCount: 3,
};

describe("MemberOnboardingWizard", () => {
  const mockOnOpenChange = vi.fn();
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
      logger: {
        log: () => {},
        warn: () => {},
        error: () => {},
      },
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const renderWithQueryClient = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    );
  };

  /** Helper: skip past the phone sharing step (step 0) to arrive at step 1 (arrival) */
  async function skipPhoneStep(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /skip/i }));
    await waitFor(() => {
      expect(screen.getByText("When are you arriving?")).toBeDefined();
    });
  }

  describe("Rendering", () => {
    it("renders step 0 (phone sharing) when open", () => {
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      expect(screen.getByText("Share your phone number?")).toBeDefined();
      expect(screen.getByText("Step 1 of 5")).toBeDefined();
    });

    it("does not render content when closed", () => {
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={false}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      expect(screen.queryByText("Share your phone number?")).toBeNull();
    });

    it("shows 4 total steps when events are disabled", () => {
      const tripNoEvents: TripDetailWithMeta = {
        ...mockTrip,
        allowMembersToAddEvents: false,
        isOrganizer: false,
      };

      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={tripNoEvents}
        />,
      );

      expect(screen.getByText("Step 1 of 4")).toBeDefined();
    });

    it("shows 5 total steps when events are enabled", () => {
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      expect(screen.getByText("Step 1 of 5")).toBeDefined();
    });
  });

  describe("Phone sharing step", () => {
    it("renders phone sharing step as step 1 with switch and description", () => {
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      expect(screen.getByText("Share your phone number?")).toBeDefined();
      expect(
        screen.getByText("Let other trip members contact you directly"),
      ).toBeDefined();
      expect(screen.getByText("Share phone number")).toBeDefined();
      expect(
        screen.getByText(
          "Other members will be able to see your phone number for this trip. Organizers can always see it.",
        ),
      ).toBeDefined();

      const sharePhoneSwitch = screen.getByRole("switch", {
        name: "Share phone number",
      });
      expect(sharePhoneSwitch).toBeDefined();
      expect(sharePhoneSwitch.getAttribute("data-state")).toBe("unchecked");
    });

    it("navigates from phone step to arrival step when clicking Skip", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      await user.click(screen.getByRole("button", { name: /skip/i }));

      await waitFor(() => {
        expect(screen.getByText("When are you arriving?")).toBeDefined();
        expect(screen.getByText("Step 2 of 5")).toBeDefined();
      });
    });

    it("calls updateMySettings when Next is clicked on phone step", async () => {
      mockUpdateMySettingsMutate.mockImplementation(
        (_data: unknown, opts: { onSuccess?: () => void }) => {
          opts.onSuccess?.();
        },
      );

      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      // Toggle the switch on
      const sharePhoneSwitch = screen.getByRole("switch", {
        name: "Share phone number",
      });
      await user.click(sharePhoneSwitch);

      // Click Next
      await user.click(screen.getByRole("button", { name: /next/i }));

      expect(mockUpdateMySettingsMutate).toHaveBeenCalledWith(
        { sharePhone: true },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );

      // Should advance to arrival step after success
      await waitFor(() => {
        expect(screen.getByText("When are you arriving?")).toBeDefined();
      });
    });

    it("calls updateMySettings with sharePhone false when left unchecked", async () => {
      mockUpdateMySettingsMutate.mockImplementation(
        (_data: unknown, opts: { onSuccess?: () => void }) => {
          opts.onSuccess?.();
        },
      );

      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      // Click Next without toggling
      await user.click(screen.getByRole("button", { name: /next/i }));

      expect(mockUpdateMySettingsMutate).toHaveBeenCalledWith(
        { sharePhone: false },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it("skip on phone step advances without API call", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      // Click Skip
      await user.click(screen.getByRole("button", { name: /skip/i }));

      await waitFor(() => {
        expect(screen.getByText("When are you arriving?")).toBeDefined();
      });

      // updateMySettings should NOT have been called
      expect(mockUpdateMySettingsMutate).not.toHaveBeenCalled();
    });
  });

  describe("Step navigation forward", () => {
    it("advances to departure step after saving arrival", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        memberTravel: {
          id: "travel-1",
          tripId: "trip-1",
          memberId: "member-1",
          travelType: "arrival",
          time: new Date("2026-03-15T17:00:00.000Z"),
          location: "JFK Airport",
          details: null,
          deletedAt: null,
          deletedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      // Skip phone step
      await skipPhoneStep(user);

      // Fill arrival datetime
      const datetimeInput = screen.getByLabelText("Arrival date and time");
      await user.clear(datetimeInput);
      await user.type(datetimeInput, "2026-03-15T17:00:00.000Z");

      // Fill location
      const locationInput = screen.getByLabelText("Location");
      await user.type(locationInput, "JFK Airport");

      // Click Next
      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText("When are you leaving?")).toBeDefined();
        expect(screen.getByText("Step 3 of 5")).toBeDefined();
      });
    });
  });

  describe("Step navigation back", () => {
    it("returns to arrival step when clicking Back on departure step", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      // Skip phone step to get to arrival
      await skipPhoneStep(user);

      // Skip arrival to get to departure
      await user.click(screen.getByRole("button", { name: /skip/i }));

      await waitFor(() => {
        expect(screen.getByText("When are you leaving?")).toBeDefined();
      });

      // Click Back
      await user.click(screen.getByRole("button", { name: /back/i }));

      await waitFor(() => {
        expect(screen.getByText("When are you arriving?")).toBeDefined();
        expect(screen.getByText("Step 2 of 5")).toBeDefined();
      });
    });
  });

  describe("Skip behavior", () => {
    it("advances from arrival to departure without calling API when skipping", async () => {
      const { apiRequest } = await import("@/lib/api");

      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      // Skip phone step
      await skipPhoneStep(user);

      // Click Skip on arrival step
      await user.click(screen.getByRole("button", { name: /skip/i }));

      await waitFor(() => {
        expect(screen.getByText("When are you leaving?")).toBeDefined();
      });

      // apiRequest should NOT have been called
      expect(apiRequest).not.toHaveBeenCalled();
    });
  });

  describe("Arrival form submission", () => {
    it("calls apiRequest with correct body for arrival travel", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        memberTravel: {
          id: "travel-1",
          tripId: "trip-1",
          memberId: "member-1",
          travelType: "arrival",
          time: new Date("2026-03-15T17:00:00.000Z"),
          location: "JFK Airport",
          details: null,
          deletedAt: null,
          deletedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      // Skip phone step
      await skipPhoneStep(user);

      // Fill arrival datetime
      const datetimeInput = screen.getByLabelText("Arrival date and time");
      await user.clear(datetimeInput);
      await user.type(datetimeInput, "2026-03-15T17:00:00.000Z");

      // Fill location
      const locationInput = screen.getByLabelText("Location");
      await user.type(locationInput, "JFK Airport");

      // Click Next
      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(apiRequest).toHaveBeenCalledWith(
          "/trips/trip-1/member-travel",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining('"travelType":"arrival"'),
          }),
        );
      });

      // Verify body contains location
      const callArgs = vi.mocked(apiRequest).mock.calls[0];
      const body = JSON.parse(callArgs![1]?.body as string);
      expect(body.travelType).toBe("arrival");
      expect(body.location).toBe("JFK Airport");
    });
  });

  describe("Departure pre-fills from arrival location", () => {
    it("pre-fills departure location with arrival location", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        memberTravel: {
          id: "travel-1",
          tripId: "trip-1",
          memberId: "member-1",
          travelType: "arrival",
          time: new Date("2026-03-15T17:00:00.000Z"),
          location: "JFK Airport",
          details: null,
          deletedAt: null,
          deletedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      // Skip phone step
      await skipPhoneStep(user);

      // Fill arrival datetime and location
      const datetimeInput = screen.getByLabelText("Arrival date and time");
      await user.clear(datetimeInput);
      await user.type(datetimeInput, "2026-03-15T17:00:00.000Z");

      const locationInput = screen.getByLabelText("Location");
      await user.type(locationInput, "JFK Airport");

      // Click Next to save arrival
      await user.click(screen.getByRole("button", { name: /next/i }));

      // Wait for departure step
      await waitFor(() => {
        expect(screen.getByText("When are you leaving?")).toBeDefined();
      });

      // Verify departure location is pre-filled
      const departureLocation = screen.getByLabelText(
        "Location",
      ) as HTMLInputElement;
      expect(departureLocation.value).toBe("JFK Airport");
    });
  });

  describe("Events step conditionally rendered", () => {
    it("skips events step when allowMembersToAddEvents is false and not organizer", async () => {
      const { apiRequest } = await import("@/lib/api");
      // Mock arrival save
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        memberTravel: {
          id: "travel-1",
          tripId: "trip-1",
          memberId: "member-1",
          travelType: "arrival",
          time: new Date("2026-03-15T17:00:00.000Z"),
          location: null,
          details: null,
          deletedAt: null,
          deletedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      // Mock departure save
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        memberTravel: {
          id: "travel-2",
          tripId: "trip-1",
          memberId: "member-1",
          travelType: "departure",
          time: new Date("2026-03-20T17:00:00.000Z"),
          location: null,
          details: null,
          deletedAt: null,
          deletedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const tripNoEvents: TripDetailWithMeta = {
        ...mockTrip,
        allowMembersToAddEvents: false,
        isOrganizer: false,
      };

      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={tripNoEvents}
        />,
      );

      // Should be 4 total steps
      expect(screen.getByText("Step 1 of 4")).toBeDefined();

      // Skip step 0 (phone sharing)
      await user.click(screen.getByRole("button", { name: /skip/i }));
      await waitFor(() => {
        expect(screen.getByText("When are you arriving?")).toBeDefined();
      });

      // Skip step 1 (arrival)
      await user.click(screen.getByRole("button", { name: /skip/i }));

      await waitFor(() => {
        expect(screen.getByText("When are you leaving?")).toBeDefined();
      });

      // Skip step 2 (departure)
      await user.click(screen.getByRole("button", { name: /skip/i }));

      // Should go directly to done (step 3), NOT events
      await waitFor(() => {
        expect(screen.getByText("You're all set!")).toBeDefined();
        expect(
          screen.queryByText("Want to suggest any activities?"),
        ).toBeNull();
      });
    });
  });

  describe("Done summary", () => {
    it("shows arrival time in done summary after completing steps", async () => {
      const { apiRequest } = await import("@/lib/api");
      // Mock arrival save
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        memberTravel: {
          id: "travel-1",
          tripId: "trip-1",
          memberId: "member-1",
          travelType: "arrival",
          time: new Date("2026-03-15T17:00:00.000Z"),
          location: "JFK Airport",
          details: null,
          deletedAt: null,
          deletedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      // Skip phone step
      await skipPhoneStep(user);

      // Fill and submit arrival
      const datetimeInput = screen.getByLabelText("Arrival date and time");
      await user.clear(datetimeInput);
      await user.type(datetimeInput, "2026-03-15T17:00:00.000Z");

      const locationInput = screen.getByLabelText("Location");
      await user.type(locationInput, "JFK Airport");

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText("When are you leaving?")).toBeDefined();
      });

      // Skip departure
      await user.click(screen.getByRole("button", { name: /skip/i }));

      // Skip events
      await waitFor(() => {
        expect(
          screen.getByText("Want to suggest any activities?"),
        ).toBeDefined();
      });
      await user.click(screen.getByRole("button", { name: /skip/i }));

      // Verify done step
      await waitFor(() => {
        expect(screen.getByText("You're all set!")).toBeDefined();
        expect(screen.getByText("Arrival")).toBeDefined();
        expect(screen.getByText("JFK Airport")).toBeDefined();
      });
    });

    it("closes wizard when clicking View Itinerary on done step", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      // Skip all steps to reach done
      // Skip phone step
      await skipPhoneStep(user);

      // Skip arrival
      await user.click(screen.getByRole("button", { name: /skip/i }));
      await waitFor(() => {
        expect(screen.getByText("When are you leaving?")).toBeDefined();
      });
      // Skip departure
      await user.click(screen.getByRole("button", { name: /skip/i }));
      await waitFor(() => {
        expect(
          screen.getByText("Want to suggest any activities?"),
        ).toBeDefined();
      });
      // Skip events
      await user.click(screen.getByRole("button", { name: /skip/i }));

      await waitFor(() => {
        expect(screen.getByText("You're all set!")).toBeDefined();
      });

      // Click View Itinerary
      await user.click(screen.getByRole("button", { name: /view itinerary/i }));

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it("shows no details message when everything was skipped", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      // Skip all steps
      // Skip phone step
      await skipPhoneStep(user);

      // Skip arrival
      await user.click(screen.getByRole("button", { name: /skip/i }));
      await waitFor(() => {
        expect(screen.getByText("When are you leaving?")).toBeDefined();
      });
      // Skip departure
      await user.click(screen.getByRole("button", { name: /skip/i }));
      await waitFor(() => {
        expect(
          screen.getByText("Want to suggest any activities?"),
        ).toBeDefined();
      });
      // Skip events
      await user.click(screen.getByRole("button", { name: /skip/i }));

      await waitFor(() => {
        expect(screen.getByText("You're all set!")).toBeDefined();
        expect(screen.getByText(/no travel details added yet/i)).toBeDefined();
      });
    });
  });

  describe("Navigation buttons", () => {
    it("does not show Back button on step 0", () => {
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      expect(screen.queryByRole("button", { name: /back/i })).toBeNull();
    });

    it("shows Back button on step 1", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      await user.click(screen.getByRole("button", { name: /skip/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /back/i })).toBeDefined();
      });
    });

    it("does not show Skip/Back/Next buttons on done step", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      // Skip all steps
      // Skip phone step
      await skipPhoneStep(user);

      // Skip arrival
      await user.click(screen.getByRole("button", { name: /skip/i }));
      await waitFor(() => {
        expect(screen.getByText("When are you leaving?")).toBeDefined();
      });
      // Skip departure
      await user.click(screen.getByRole("button", { name: /skip/i }));
      await waitFor(() => {
        expect(
          screen.getByText("Want to suggest any activities?"),
        ).toBeDefined();
      });
      // Skip events
      await user.click(screen.getByRole("button", { name: /skip/i }));

      await waitFor(() => {
        expect(screen.getByText("You're all set!")).toBeDefined();
      });

      expect(screen.queryByRole("button", { name: /skip/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /^back$/i })).toBeNull();
      expect(
        screen.getByRole("button", { name: /view itinerary/i }),
      ).toBeDefined();
    });
  });

  describe("Next button triggers mutation", () => {
    it("calls apiRequest when clicking Next with filled datetime on arrival step", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        memberTravel: {
          id: "travel-1",
          tripId: "trip-1",
          memberId: "member-1",
          travelType: "arrival",
          time: new Date("2026-03-15T17:00:00.000Z"),
          location: null,
          details: null,
          deletedAt: null,
          deletedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      // Skip phone step
      await skipPhoneStep(user);

      // The arrival datetime should already be pre-populated from trip.startDate
      // Just click Next to trigger the mutation with the pre-populated value
      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(apiRequest).toHaveBeenCalledWith(
          "/trips/trip-1/member-travel",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining('"travelType":"arrival"'),
          }),
        );
      });
    });

    it("does not call apiRequest when clicking Next with empty datetime on arrival step", async () => {
      const { apiRequest } = await import("@/lib/api");

      const tripNoStart: TripDetailWithMeta = {
        ...mockTrip,
        startDate: null,
      };

      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={tripNoStart}
        />,
      );

      // Skip phone step
      await user.click(screen.getByRole("button", { name: /skip/i }));
      await waitFor(() => {
        expect(screen.getByText("When are you arriving?")).toBeDefined();
      });

      // Click Next with empty datetime
      await user.click(screen.getByRole("button", { name: /next/i }));

      // Should advance without calling API
      await waitFor(() => {
        expect(screen.getByText("When are you leaving?")).toBeDefined();
      });
      expect(apiRequest).not.toHaveBeenCalled();
    });
  });

  describe("Null date handling", () => {
    it("handles null startDate gracefully", async () => {
      const tripNoStartDate: TripDetailWithMeta = {
        ...mockTrip,
        startDate: null,
      };

      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={tripNoStartDate}
        />,
      );

      // Skip phone step to reach arrival
      await user.click(screen.getByRole("button", { name: /skip/i }));
      await waitFor(() => {
        expect(screen.getByText("When are you arriving?")).toBeDefined();
      });

      // DateTimePicker should have empty value
      const datetimeInput = screen.getByLabelText("Arrival date and time");
      expect((datetimeInput as HTMLInputElement).value).toBe("");
    });

    it("handles null endDate gracefully", async () => {
      const tripNoEndDate: TripDetailWithMeta = {
        ...mockTrip,
        endDate: null,
      };

      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={tripNoEndDate}
        />,
      );

      // Skip phone step
      await skipPhoneStep(user);

      // Skip to departure step
      await user.click(screen.getByRole("button", { name: /skip/i }));

      await waitFor(() => {
        expect(screen.getByText("When are you leaving?")).toBeDefined();
      });

      // DateTimePicker should have empty value for departure
      const datetimeInput = screen.getByLabelText("Departure date and time");
      expect((datetimeInput as HTMLInputElement).value).toBe("");
    });
  });

  describe("Styling", () => {
    it("applies Playfair Display font to title", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      // Check phone step title first
      const phoneTitle = screen.getByText("Share your phone number?");
      expect(phoneTitle.className).toContain("font-playfair");

      // Skip to arrival step and check that title too
      await skipPhoneStep(user);

      const arrivalTitle = screen.getByText("When are you arriving?");
      expect(arrivalTitle.className).toContain("font-playfair");
    });

    it("applies progress dot styling", () => {
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      // The first dot should have bg-primary (current step)
      const dots = document.querySelectorAll(".rounded-full.h-2.w-2");
      expect(dots.length).toBe(5);
      expect(dots[0]!.className).toContain("bg-primary");
      expect(dots[4]!.className).toContain("bg-muted");
    });
  });

  describe("Event creation flow", () => {
    it("creates an event and shows it as a chip", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        event: {
          id: "event-1",
          tripId: "trip-1",
          name: "Beach day",
          eventType: "activity",
          startTime: new Date("2026-03-16T14:00:00.000Z"),
          endTime: null,
          location: null,
          description: null,
          allDay: false,
          isOptional: false,
          deletedAt: null,
          deletedBy: null,
          createdBy: "user-1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={mockTrip}
        />,
      );

      // Skip phone step
      await skipPhoneStep(user);

      // Skip arrival step
      await user.click(screen.getByRole("button", { name: /skip/i }));
      await waitFor(() => {
        expect(screen.getByText("When are you leaving?")).toBeDefined();
      });

      // Skip departure step
      await user.click(screen.getByRole("button", { name: /skip/i }));
      await waitFor(() => {
        expect(
          screen.getByText("Want to suggest any activities?"),
        ).toBeDefined();
      });

      // Fill in event name
      const eventNameInput = screen.getByLabelText("Activity name");
      await user.type(eventNameInput, "Beach day");

      // Fill in event start time
      const eventTimeInput = screen.getByLabelText("Event date and time");
      await user.type(eventTimeInput, "2026-03-16T14:00:00.000Z");

      // Click Add
      await user.click(screen.getByRole("button", { name: /^add$/i }));

      // Verify apiRequest was called with event data
      await waitFor(() => {
        expect(apiRequest).toHaveBeenCalledWith(
          "/trips/trip-1/events",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining('"name":"Beach day"'),
          }),
        );
      });

      // Verify the event appears as a chip
      await waitFor(() => {
        expect(screen.getByText("Beach day")).toBeDefined();
        expect(
          screen.getByRole("button", { name: /remove beach day/i }),
        ).toBeDefined();
      });
    });
  });
});
