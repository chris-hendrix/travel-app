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

// Mock FlightLookupInput with a simple lookup simulator
vi.mock("@/components/itinerary/flight-lookup-input", () => ({
  FlightLookupInput: ({
    onResult,
    disabled,
  }: {
    onResult: (result: never, flightNumber: string) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      aria-label="Simulate flight lookup"
      disabled={disabled}
      onClick={() =>
        onResult(
          {
            departureAirport: { iata: "SFO", name: "San Francisco Intl" },
            departureTime: "2026-03-15T14:00:00Z",
            arrivalAirport: { iata: "JFK", name: "John F Kennedy Intl" },
            arrivalTime: "2026-03-15T22:00:00Z",
          } as never,
          "UA123",
        )
      }
    >
      Simulate flight lookup
    </button>
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
  allowMembersToAddEvents: false,
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
    mockUseMemberTravels.mockReturnValue({ data: [] });
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

  /** Helper: skip past the phone sharing step (step 0) to the travel step */
  async function skipPhoneStep(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /skip/i }));
    await waitFor(() => {
      expect(screen.getByText("When are you traveling?")).toBeDefined();
    });
  }

  function renderWizard() {
    return renderWithQueryClient(
      <MemberOnboardingWizard
        open={true}
        onOpenChange={mockOnOpenChange}
        tripId="trip-1"
        trip={mockTrip}
      />,
    );
  }

  describe("Rendering", () => {
    it("renders step 0 (phone sharing) when open", () => {
      renderWizard();
      expect(screen.getByText("Share your phone number?")).toBeDefined();
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

    it("shows 3 total steps", () => {
      renderWizard();
      expect(screen.getByText("Step 1 of 3")).toBeDefined();
    });
  });

  describe("Phone sharing step", () => {
    it("renders phone sharing step with switch and description", () => {
      renderWizard();
      expect(screen.getByLabelText("Share phone number")).toBeDefined();
    });

    it("navigates from phone step to travel step when clicking Skip", async () => {
      const user = userEvent.setup();
      renderWizard();
      await skipPhoneStep(user);
    });

    it("calls updateMySettings when Next is clicked on phone step", async () => {
      const user = userEvent.setup();
      mockUpdateMySettingsMutate.mockImplementation(
        (_vars: unknown, opts: { onSuccess: () => void }) => opts.onSuccess(),
      );
      renderWizard();

      await user.click(screen.getByRole("switch"));
      await user.click(screen.getByRole("button", { name: /next/i }));

      expect(mockUpdateMySettingsMutate).toHaveBeenCalledWith(
        { sharePhone: true },
        expect.anything(),
      );
      await waitFor(() => {
        expect(screen.getByText("When are you traveling?")).toBeDefined();
      });
    });

    it("skip on phone step advances without API call", async () => {
      const user = userEvent.setup();
      renderWizard();
      await user.click(screen.getByRole("button", { name: /skip/i }));
      expect(mockUpdateMySettingsMutate).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.getByText("When are you traveling?")).toBeDefined();
      });
    });
  });

  describe("Combined travel step", () => {
    it("renders Arriving and Leaving sections on one screen", async () => {
      const user = userEvent.setup();
      renderWizard();
      await skipPhoneStep(user);

      expect(screen.getByRole("region", { name: "Arriving" })).toBeDefined();
      expect(screen.getByRole("region", { name: "Leaving" })).toBeDefined();
      // No separate arrival/departure step titles
      expect(screen.queryByText("When are you arriving?")).toBeNull();
      expect(screen.queryByText("When are you leaving?")).toBeNull();
    });

    it("never renders an activities step", async () => {
      const user = userEvent.setup();
      renderWizard();
      await skipPhoneStep(user);

      expect(
        screen.queryByText("Want to suggest any activities?"),
      ).toBeNull();
      // Skipping travel goes straight to done
      await user.click(screen.getByRole("button", { name: /skip/i }));
      await waitFor(() => {
        expect(screen.getByText("You're all set!")).toBeDefined();
      });
      expect(
        screen.queryByText("Want to suggest any activities?"),
      ).toBeNull();
    });

    it("saves arrival and departure with one Next click", async () => {
      const user = userEvent.setup();
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValue({ memberTravel: { id: "x" } });
      renderWizard();
      await skipPhoneStep(user);

      // Fill both sections
      await user.clear(screen.getByLabelText("Arrival date and time"));
      await user.type(
        screen.getByLabelText("Arrival date and time"),
        "2026-03-15T17:00:00.000Z",
      );
      await user.clear(screen.getByLabelText("Departure date and time"));
      await user.type(
        screen.getByLabelText("Departure date and time"),
        "2026-03-20T17:00:00.000Z",
      );

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(apiRequest).toHaveBeenCalledTimes(2);
      });
      const bodies = vi
        .mocked(apiRequest)
        .mock.calls.map((c) => JSON.parse(c[1]?.body as string));
      expect(bodies[0].travelType).toBe("arrival");
      expect(bodies[0].arrivalTime).toBe("2026-03-15T17:00:00.000Z");
      expect(bodies[1].travelType).toBe("departure");
      expect(bodies[1].departureTime).toBe("2026-03-20T17:00:00.000Z");

      await waitFor(() => {
        expect(screen.getByText("You're all set!")).toBeDefined();
      });
    });

    it("skips empty sections (no API call when both empty)", async () => {
      const user = userEvent.setup();
      const { apiRequest } = await import("@/lib/api");
      renderWizard();
      await skipPhoneStep(user);

      // Clear pre-filled defaults
      await user.clear(screen.getByLabelText("Arrival date and time"));
      await user.clear(screen.getByLabelText("Departure date and time"));

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText("You're all set!")).toBeDefined();
      });
      expect(apiRequest).not.toHaveBeenCalled();
    });

    it("flight lookup autofill populates visible fields", async () => {
      const user = userEvent.setup();
      renderWizard();
      await skipPhoneStep(user);

      const lookups = screen.getAllByRole("button", {
        name: "Simulate flight lookup",
      });
      await user.click(lookups[0]!);

      await waitFor(() => {
        expect(
          (screen.getByLabelText("Arrival date and time") as HTMLInputElement)
            .value,
        ).toBe(new Date("2026-03-15T22:00:00Z").toISOString());
      });
    });

    it("pre-fills departure location from arrival location when untouched", async () => {
      const user = userEvent.setup();
      renderWizard();
      await skipPhoneStep(user);

      const arrivalLocation = document.getElementById(
        "arrival-location",
      ) as HTMLInputElement;
      await user.type(arrivalLocation, "JFK Airport");

      await waitFor(() => {
        expect(
          (document.getElementById("departure-location") as HTMLInputElement)
            .value,
        ).toBe("JFK Airport");
      });
    });

    it("Back returns to phone step", async () => {
      const user = userEvent.setup();
      renderWizard();
      await skipPhoneStep(user);

      await user.click(screen.getByRole("button", { name: /back/i }));
      await waitFor(() => {
        expect(screen.getByText("Share your phone number?")).toBeDefined();
      });
    });
  });

  describe("Done summary", () => {
    it("shows arrival/departure with Maps links after completing steps", async () => {
      const user = userEvent.setup();
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValue({ memberTravel: { id: "x" } });
      renderWizard();
      await skipPhoneStep(user);

      await user.clear(screen.getByLabelText("Arrival date and time"));
      await user.type(
        screen.getByLabelText("Arrival date and time"),
        "2026-03-15T17:00:00.000Z",
      );
      const arrivalLocation = document.getElementById(
        "arrival-location",
      ) as HTMLInputElement;
      await user.type(arrivalLocation, "JFK Airport");

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText("You're all set!")).toBeDefined();
      });
      expect(screen.getByText("Arrival")).toBeDefined();
      const mapsLinks = screen.getAllByRole("link", { name: /JFK Airport/i });
      expect(mapsLinks.length).toBeGreaterThan(0);
      const mapsLink = mapsLinks[0] as HTMLAnchorElement;
      expect(
        (mapsLink as HTMLAnchorElement).href,
      ).toContain("google.com/maps/search");
    });

    it("closes wizard when clicking View Itinerary on done step", async () => {
      const user = userEvent.setup();
      renderWizard();
      await skipPhoneStep(user);
      await user.click(screen.getByRole("button", { name: /skip/i }));

      await waitFor(() => {
        expect(screen.getByText("You're all set!")).toBeDefined();
      });
      await user.click(
        screen.getByRole("button", { name: /view itinerary/i }),
      );
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it("shows no details message when everything was skipped", async () => {
      const user = userEvent.setup();
      renderWizard();
      await skipPhoneStep(user);

      await user.clear(screen.getByLabelText("Arrival date and time"));
      await user.clear(screen.getByLabelText("Departure date and time"));
      await user.click(screen.getByRole("button", { name: /skip/i }));

      await waitFor(() => {
        expect(
          screen.getByText(
            "No travel details added yet. You can always add them later from the trip page.",
          ),
        ).toBeDefined();
      });
    });
  });

  describe("Navigation buttons", () => {
    it("does not show Back button on step 0", () => {
      renderWizard();
      expect(screen.queryByRole("button", { name: /back/i })).toBeNull();
    });

    it("shows Back button on travel step", async () => {
      const user = userEvent.setup();
      renderWizard();
      await skipPhoneStep(user);
      expect(screen.getByRole("button", { name: /back/i })).toBeDefined();
    });

    it("does not show Skip/Back/Next buttons on done step", async () => {
      const user = userEvent.setup();
      renderWizard();
      await skipPhoneStep(user);
      await user.click(screen.getByRole("button", { name: /skip/i }));

      await waitFor(() => {
        expect(screen.getByText("You're all set!")).toBeDefined();
      });
      expect(screen.queryByRole("button", { name: /^skip$/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /back/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /^next$/i })).toBeNull();
    });
  });

  describe("Null date handling", () => {
    it("handles null startDate gracefully", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={{ ...mockTrip, startDate: null }}
        />,
      );
      await skipPhoneStep(user);
      expect(screen.getByRole("region", { name: "Arriving" })).toBeDefined();
    });

    it("handles null endDate gracefully", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(
        <MemberOnboardingWizard
          open={true}
          onOpenChange={mockOnOpenChange}
          tripId="trip-1"
          trip={{ ...mockTrip, endDate: null }}
        />,
      );
      await skipPhoneStep(user);
      expect(screen.getByRole("region", { name: "Leaving" })).toBeDefined();
    });
  });

  describe("Styling", () => {
    it("applies Playfair Display font to title", () => {
      renderWizard();
      const title = screen.getByText("Share your phone number?");
      expect(title.className).toContain("font-playfair");
    });
  });
});
