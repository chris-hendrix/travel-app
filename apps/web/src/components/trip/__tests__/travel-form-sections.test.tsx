import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRef } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  TravelFormSections,
  type TravelFormSectionsHandle,
  type TravelSaveSummary,
} from "../travel-form-sections";
import type { MemberTravel } from "@journiful/shared/types";
import type { TripDetailWithMeta } from "@/hooks/trip-queries";

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  APIError: class APIError extends Error {},
}));

vi.mock("@/components/ui/datetime-picker", () => ({
  DateTimePicker: ({
    value,
    onChange,
    "aria-label": ariaLabel,
    placeholder,
  }: {
    value?: string;
    onChange: (v: string) => void;
    "aria-label"?: string;
    placeholder?: string;
  }) => (
    <input
      type="text"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel || placeholder || "datetime"}
      data-testid="datetime-picker"
    />
  ),
}));

vi.mock("@/components/itinerary/flight-lookup-input", () => ({
  FlightLookupInput: ({
    onResult,
  }: {
    onResult: (result: never, flightNumber: string) => void;
  }) => (
    <button
      type="button"
      aria-label="Simulate flight lookup"
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

const mockTrip = {
  id: "trip-1",
  startDate: "2026-03-15",
  endDate: "2026-03-20",
  preferredTimezone: "America/New_York",
} as TripDetailWithMeta;

function renderForm(props?: {
  existingArrival?: MemberTravel | null;
  existingDeparture?: MemberTravel | null;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ref = createRef<TravelFormSectionsHandle>();
  let saved: TravelSaveSummary | null | undefined;
  render(
    <QueryClientProvider client={queryClient}>
      <TravelFormSections
        ref={ref}
        tripId="trip-1"
        trip={mockTrip}
        timezone="America/New_York"
        existingArrival={props?.existingArrival}
        existingDeparture={props?.existingDeparture}
      />
      <button
        type="button"
        aria-label="Save travel"
        onClick={() => {
          void ref.current?.save().then((r) => {
            saved = r;
          });
        }}
      >
        Save travel
      </button>
    </QueryClientProvider>,
  );
  return {
    save: async () => {
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Save travel" }));
      await waitFor(() => expect(saved !== undefined).toBe(true));
      return saved as TravelSaveSummary | null;
    },
  };
}

function mockTravel(overrides: Partial<MemberTravel> = {}): MemberTravel {
  return {
    id: "travel-1",
    tripId: "trip-1",
    memberId: "member-1",
    travelType: "arrival",
    departureLocation: null,
    departureTime: null,
    arrivalLocation: "JFK Airport",
    arrivalTime: new Date("2026-03-15T17:00:00Z"),
    details: null,
    flightNumber: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("TravelFormSections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Arriving and Leaving sections", () => {
    renderForm();
    expect(screen.getByRole("region", { name: "Arriving" })).toBeDefined();
    expect(screen.getByRole("region", { name: "Leaving" })).toBeDefined();
  });

  it("makes no API calls when both sections are empty", async () => {
    const { apiRequest } = await import("@/lib/api");
    const { save } = renderForm();
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText("Arrival date and time"));
    await user.clear(screen.getByLabelText("Departure date and time"));

    const summary = await save();
    expect(summary).toEqual({});
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("saves manual entry with pertinent fields only", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockResolvedValue({ memberTravel: { id: "x" } });
    const { save } = renderForm();
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText("Departure date and time"));
    await user.clear(screen.getByLabelText("Arrival date and time"));
    await user.type(
      screen.getByLabelText("Arrival date and time"),
      "2026-03-15T17:00:00.000Z",
    );

    const summary = await save();
    expect(summary?.arrivalTime).toBe("2026-03-15T17:00:00.000Z");

    expect(apiRequest).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      vi.mocked(apiRequest).mock.calls[0]?.[1]?.body as string,
    );
    expect(body.travelType).toBe("arrival");
    expect(body.arrivalTime).toBe("2026-03-15T17:00:00.000Z");
    // Manual entry leaves counterpart null (absent)
    expect(body.departureTime).toBeUndefined();
    expect(body.departureLocation).toBeUndefined();
  });

  it("lookup autofill fills visible fields and stores counterpart silently", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockResolvedValue({ memberTravel: { id: "x" } });
    const { save } = renderForm();
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText("Departure date and time"));
    await user.click(
      screen.getAllByRole("button", { name: "Simulate flight lookup" })[0]!,
    );

    await waitFor(() => {
      expect(
        (screen.getByLabelText("Arrival date and time") as HTMLInputElement)
          .value,
      ).toBe(new Date("2026-03-15T22:00:00Z").toISOString());
    });

    await save();
    const body = JSON.parse(
      vi.mocked(apiRequest).mock.calls[0]?.[1]?.body as string,
    );
    expect(body.arrivalLocation).toBe("John F Kennedy Intl (JFK)");
    expect(body.flightNumber).toBe("UA123");
    // Counterpart stored silently
    expect(body.departureLocation).toBe("San Francisco Intl (SFO)");
    expect(body.departureTime).toBe(
      new Date("2026-03-15T14:00:00Z").toISOString(),
    );
  });

  it("pre-fills departure location from arrival when untouched", async () => {
    renderForm();
    const user = userEvent.setup();

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

  it("pre-fills existing records when re-opened", () => {
    renderForm({
      existingArrival: mockTravel(),
      existingDeparture: mockTravel({
        id: "travel-2",
        travelType: "departure",
        arrivalTime: null,
        arrivalLocation: null,
        departureTime: new Date("2026-03-20T18:00:00Z"),
        departureLocation: "JFK Airport",
      }),
    });

    expect(
      (screen.getByLabelText("Arrival date and time") as HTMLInputElement)
        .value,
    ).toBe(new Date("2026-03-15T17:00:00Z").toISOString());
    expect(
      (screen.getByLabelText("Departure date and time") as HTMLInputElement)
        .value,
    ).toBe(new Date("2026-03-20T18:00:00Z").toISOString());
  });

  it("updates existing records instead of creating", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockResolvedValue({ memberTravel: { id: "x" } });
    const { save } = renderForm({ existingArrival: mockTravel() });

    await save();
    // Arrival section has a pertinent time → PUT; departure also has default date → POST.
    // Arrival uses PUT to the existing record id.
    const calls = vi.mocked(apiRequest).mock.calls;
    const putCall = calls.find((c) =>
      (c[0] as string).startsWith("/member-travel/"),
    );
    expect(putCall).toBeDefined();
  });
});
