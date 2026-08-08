import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useLocationAutocomplete } from "../use-location-autocomplete";

// Mock the API module
vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
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

describe("useLocationAutocomplete", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockSuggestions = [
    {
      placeId: "place-1",
      shortName: "SF",
      displayName: "San Francisco",
      displayAddress: "CA, USA",
    },
    {
      placeId: "place-2",
      shortName: "LA",
      displayName: "Los Angeles",
      displayAddress: "CA, USA",
    },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    vi.clearAllMocks();
  });

  it("accepts sessionToken parameter without throwing", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockResolvedValueOnce([]);

    const { result } = renderHook(
      () =>
        useLocationAutocomplete("San Francisco", null, "test-session-token"),
      { wrapper },
    );

    // Should not throw; hook renders successfully with 3 arguments
    expect(result.current).toBeDefined();
  });

  it("returns AutocompleteSuggestion[] data (no lat/lon coords)", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockResolvedValueOnce(mockSuggestions);

    const { result } = renderHook(
      () =>
        useLocationAutocomplete("San Francisco", null, "test-session-token"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const data = result.current.data;
    expect(data).toEqual(mockSuggestions);
    // Verify returned items have no lat/lon (AutocompleteSuggestion shape)
    if (data && data.length > 0) {
      expect(data[0]).toHaveProperty("placeId");
      expect(data[0]).toHaveProperty("displayName");
      expect(data[0]).toHaveProperty("displayAddress");
      expect(data[0]).not.toHaveProperty("lat");
      expect(data[0]).not.toHaveProperty("lon");
    }
  });

  it("includes sessionToken in query params", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockResolvedValueOnce(mockSuggestions);

    renderHook(
      () =>
        useLocationAutocomplete("San Francisco", null, "session-abc-123"),
      { wrapper },
    );

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalled();
    });

    const url = vi.mocked(apiRequest).mock.calls[0][0] as string;
    expect(url).toContain("sessionToken=session-abc-123");
  });

  it("is disabled when query has fewer than 2 characters", () => {
    const { result } = renderHook(
      () => useLocationAutocomplete("S", null, "token"),
      { wrapper },
    );

    // When disabled, the query should not be fetching
    expect(result.current.isFetching).toBe(false);
    expect(result.current.isPending).toBe(true);
  });

  it("becomes enabled when query has 2 or more characters", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockResolvedValueOnce(mockSuggestions);

    const { result } = renderHook(
      () => useLocationAutocomplete("SF", null, "token"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isFetching).toBe(true);
    });
  });

  it("passes context lat/lon alongside sessionToken", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockResolvedValueOnce(mockSuggestions);

    renderHook(
      () =>
        useLocationAutocomplete(
          "pizza",
          { lat: 37.7749, lon: -122.4194 },
          "ctx-session",
        ),
      { wrapper },
    );

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalled();
    });

    const url = vi.mocked(apiRequest).mock.calls[0][0] as string;
    expect(url).toContain("q=pizza");
    expect(url).toContain("lat=37.7749");
    expect(url).toContain("lon=-122.4194");
    expect(url).toContain("sessionToken=ctx-session");
  });
});
