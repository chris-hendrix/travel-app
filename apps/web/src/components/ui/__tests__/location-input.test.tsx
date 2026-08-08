import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { LocationInput } from "../location-input";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

// Track autocomplete calls to verify session tokens
const autocompleteCalls: Array<{ query: string; sessionToken: string }> = [];
const mockDetailsMutateAsync = vi.fn();

// Mock useLocationAutocomplete
vi.mock("@/hooks/use-location-autocomplete", () => ({
  useLocationAutocomplete: (query: string, _context?: unknown, sessionToken?: string) => {
    if (sessionToken) {
      autocompleteCalls.push({ query, sessionToken });
    }
    // Return suggestions when query has 2+ chars
    const suggestions =
      query.length >= 2
        ? [
            {
              placeId: "place-sf",
              shortName: "SF",
              displayName: "San Francisco",
              displayAddress: "CA, USA",
            },
            {
              placeId: "place-la",
              shortName: "LA",
              displayName: "Los Angeles",
              displayAddress: "CA, USA",
            },
          ]
        : [];
    return { data: suggestions, isLoading: false };
  },
}));

// Mock useLocationDetails
vi.mock("@/hooks/use-location-details", () => ({
  useLocationDetails: () => ({
    mutateAsync: mockDetailsMutateAsync,
    isPending: false,
  }),
}));

describe("LocationInput", () => {
  let queryClient: QueryClient;
  let user: ReturnType<typeof userEvent.setup>;

  const mockOnChange = vi.fn();
  const mockOnSelect = vi.fn();

  const fullSuggestion = {
    placeId: "place-sf",
    shortName: "San Francisco",
    displayName: "San Francisco",
    displayPlace: "San Francisco, CA",
    displayAddress: "California, USA",
    lat: 37.7749,
    lon: -122.4194,
  };

  function renderLocationInput() {
    return render(
      <QueryClientProvider client={queryClient}>
        <LocationInput
          value=""
          onChange={mockOnChange}
          onSelect={mockOnSelect}
          placeholder="Search location..."
          aria-label="Location"
        />
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    user = userEvent.setup();
    vi.clearAllMocks();
    autocompleteCalls.length = 0;
    mockDetailsMutateAsync.mockReset();
  });

  it("renders an input with the given placeholder", () => {
    renderLocationInput();
    const input = screen.getByPlaceholderText("Search location...");
    expect(input).toBeDefined();
  });

  it("typing triggers autocomplete with a session token", async () => {
    renderLocationInput();
    const input = screen.getByPlaceholderText("Search location...");

    await user.type(input, "San F");

    await waitFor(() => {
      expect(autocompleteCalls.length).toBeGreaterThan(0);
    });

    // The autocomplete should have been called with a session token
    const lastCall = autocompleteCalls[autocompleteCalls.length - 1];
    expect(lastCall.sessionToken).toBeTruthy();
    // Session token should look like a UUID
    expect(lastCall.sessionToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("shows suggestions popover when typing 2+ characters", async () => {
    renderLocationInput();
    const input = screen.getByPlaceholderText("Search location...");

    await user.type(input, "San");

    await waitFor(() => {
      expect(screen.getByText("San Francisco")).toBeDefined();
    });
    expect(screen.getByText("Los Angeles")).toBeDefined();
  });

  it("selecting a suggestion calls details endpoint and onSelect with full LocationSuggestion", async () => {
    mockDetailsMutateAsync.mockResolvedValueOnce(fullSuggestion);

    renderLocationInput();
    const input = screen.getByPlaceholderText("Search location...");

    await user.type(input, "San");

    await waitFor(() => {
      expect(screen.getByText("San Francisco")).toBeDefined();
    });

    // Click the "San Francisco" suggestion
    await user.click(screen.getByText("San Francisco"));

    await waitFor(() => {
      expect(mockDetailsMutateAsync).toHaveBeenCalledWith({
        placeId: "place-sf",
        sessionToken: expect.any(String),
      });
    });

    // onSelect should be called with the full LocationSuggestion (with lat/lon)
    expect(mockOnSelect).toHaveBeenCalledWith(fullSuggestion);
  });

  it("regenerates session token after a selection", async () => {
    mockDetailsMutateAsync.mockResolvedValueOnce(fullSuggestion);
    mockDetailsMutateAsync.mockResolvedValueOnce({
      ...fullSuggestion,
      placeId: "place-la",
      shortName: "Los Angeles",
    });

    renderLocationInput();
    const input = screen.getByPlaceholderText("Search location...");

    // First selection
    await user.type(input, "San");
    await waitFor(() => {
      expect(screen.getByText("San Francisco")).toBeDefined();
    });
    await user.click(screen.getByText("San Francisco"));

    await waitFor(() => {
      expect(mockOnSelect).toHaveBeenCalledTimes(1);
    });

    const firstCall = autocompleteCalls[autocompleteCalls.length - 1];
    const firstToken = firstCall.sessionToken;

    // Clear the input and type again for second selection
    await user.clear(input);
    await user.type(input, "San");

    await waitFor(() => {
      expect(screen.getByText("San Francisco")).toBeDefined();
    });

    // Click again for second selection
    await user.click(screen.getByText("Los Angeles"));

    await waitFor(() => {
      expect(mockOnSelect).toHaveBeenCalledTimes(2);
    });

    // The session token from the last autocomplete call should be different
    const latestCall = autocompleteCalls[autocompleteCalls.length - 1];
    const secondToken = latestCall.sessionToken;

    // The tokens should differ (new token generated after first selection)
    expect(secondToken).not.toBe(firstToken);
  });

  it("shows toast error when place details call fails", async () => {
    mockDetailsMutateAsync.mockRejectedValueOnce(new Error("Network error"));

    renderLocationInput();
    const input = screen.getByPlaceholderText("Search location...");

    await user.type(input, "San");

    await waitFor(() => {
      expect(screen.getByText("San Francisco")).toBeDefined();
    });

    await user.click(screen.getByText("San Francisco"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't load place details. Please try another suggestion.",
      );
    });
  });
});
