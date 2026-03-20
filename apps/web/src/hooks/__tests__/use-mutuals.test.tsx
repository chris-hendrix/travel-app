import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMutuals, useMutualSuggestions } from "../use-mutuals";
import type { Mutual, GetMutualsResponse } from "@journiful/shared/types";

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

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/mutuals",
}));

describe("useMutuals", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockMutuals: Mutual[] = [
    {
      id: "user-1",
      displayName: "Alice Johnson",
      profilePhotoUrl: "https://example.com/alice.jpg",
      sharedTripCount: 3,
      sharedTrips: [
        { id: "trip-1", name: "Summer Vacation" },
        { id: "trip-2", name: "Ski Weekend" },
        { id: "trip-3", name: "Beach Party" },
      ],
    },
    {
      id: "user-2",
      displayName: "Bob Smith",
      profilePhotoUrl: null,
      sharedTripCount: 1,
      sharedTrips: [{ id: "trip-1", name: "Summer Vacation" }],
    },
  ];

  const mockPage1Response: GetMutualsResponse = {
    success: true,
    mutuals: [mockMutuals[0]!],
    nextCursor: "cursor-abc",
  };

  const mockPage2Response: GetMutualsResponse = {
    success: true,
    mutuals: [mockMutuals[1]!],
    nextCursor: null,
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe("fetches first page", () => {
    it("fetches first page of mutuals successfully", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        mutuals: mockMutuals,
        nextCursor: null,
      } satisfies GetMutualsResponse);

      const { result } = renderHook(() => useMutuals(), { wrapper });

      // Initially loading
      expect(result.current.isPending).toBe(true);

      // Wait for query to complete
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify data is correct
      const allMutuals =
        result.current.data?.pages.flatMap((p) => p.mutuals) ?? [];
      expect(allMutuals).toEqual(mockMutuals);
      expect(result.current.error).toBe(null);

      // Verify API was called correctly
      expect(apiRequest).toHaveBeenCalledWith(
        "/mutuals",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  describe("cursor-based pagination", () => {
    it("supports fetchNextPage with cursor", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce(mockPage1Response);

      const { result } = renderHook(() => useMutuals(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Should have next page
      expect(result.current.hasNextPage).toBe(true);

      // Fetch next page
      vi.mocked(apiRequest).mockResolvedValueOnce(mockPage2Response);
      result.current.fetchNextPage();

      await waitFor(() => {
        expect(result.current.data?.pages).toHaveLength(2);
      });

      // Verify all mutuals across pages
      const allMutuals =
        result.current.data?.pages.flatMap((p) => p.mutuals) ?? [];
      expect(allMutuals).toHaveLength(2);
      expect(allMutuals[0]!.displayName).toBe("Alice Johnson");
      expect(allMutuals[1]!.displayName).toBe("Bob Smith");

      // Verify second call included cursor
      expect(apiRequest).toHaveBeenCalledTimes(2);
      expect(apiRequest).toHaveBeenLastCalledWith(
        expect.stringContaining("cursor=cursor-abc"),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );

      // No more pages
      expect(result.current.hasNextPage).toBe(false);
    });
  });

  describe("search parameter", () => {
    it("passes search parameter to API", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        mutuals: [mockMutuals[0]!],
        nextCursor: null,
      } satisfies GetMutualsResponse);

      const { result } = renderHook(() => useMutuals({ search: "Alice" }), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiRequest).toHaveBeenCalledWith(
        expect.stringContaining("search=Alice"),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  describe("tripId filter", () => {
    it("passes tripId filter to API", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        mutuals: mockMutuals,
        nextCursor: null,
      } satisfies GetMutualsResponse);

      const { result } = renderHook(() => useMutuals({ tripId: "trip-1" }), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiRequest).toHaveBeenCalledWith(
        expect.stringContaining("tripId=trip-1"),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  describe("error handling", () => {
    it("handles API errors", async () => {
      const { apiRequest, APIError } = await import("@/lib/api");
      const apiError = new APIError("UNAUTHORIZED", "Not authenticated");
      vi.mocked(apiRequest).mockRejectedValueOnce(apiError);

      const { result } = renderHook(() => useMutuals(), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(apiError);
    });
  });

  describe("empty results", () => {
    it("returns empty array when no mutuals", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        mutuals: [],
        nextCursor: null,
      } satisfies GetMutualsResponse);

      const { result } = renderHook(() => useMutuals(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const allMutuals =
        result.current.data?.pages.flatMap((p) => p.mutuals) ?? [];
      expect(allMutuals).toEqual([]);
      expect(result.current.hasNextPage).toBe(false);
    });
  });
});

describe("useMutualSuggestions", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("fetches suggestions for a trip", async () => {
    const { apiRequest } = await import("@/lib/api");
    const mockSuggestions: Mutual[] = [
      {
        id: "user-3",
        displayName: "Carol Davis",
        profilePhotoUrl: null,
        sharedTripCount: 2,
        sharedTrips: [
          { id: "trip-1", name: "Summer Vacation" },
          { id: "trip-2", name: "Ski Weekend" },
        ],
      },
    ];

    vi.mocked(apiRequest).mockResolvedValueOnce({
      success: true,
      mutuals: mockSuggestions,
      nextCursor: null,
    } satisfies GetMutualsResponse);

    const { result } = renderHook(() => useMutualSuggestions("trip-1"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.mutuals).toEqual(mockSuggestions);

    expect(apiRequest).toHaveBeenCalledWith(
      "/trips/trip-1/mutual-suggestions",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("is disabled when tripId is empty", () => {
    const { result } = renderHook(() => useMutualSuggestions(""), { wrapper });

    // Should not be fetching since enabled is false
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
  });
});
