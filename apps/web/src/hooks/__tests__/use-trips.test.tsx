import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  type InfiniteData,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useTrips,
  useTripDetail,
  useCreateTrip,
  getCreateTripErrorMessage,
  type Trip,
  type TripSummary,
  type TripDetail,
} from "../use-trips";
import { APIError } from "@/lib/api";
import type { CreateTripInput } from "@tripful/shared/schemas";
import type { GetTripsResponse } from "@tripful/shared/types";

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
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("useTrips", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockTrips: TripSummary[] = [
    {
      id: "trip-1",
      name: "Summer Vacation",
      destination: "Hawaii",
      startDate: "2026-07-15",
      endDate: "2026-07-22",
      coverImageUrl: "https://example.com/hawaii.jpg",
      isOrganizer: true,
      rsvpStatus: "going",
      organizerInfo: [
        {
          id: "user-1",
          displayName: "John Doe",
          profilePhotoUrl: "https://example.com/john.jpg",
        },
      ],
      memberCount: 5,
      eventCount: 3,
    },
    {
      id: "trip-2",
      name: "Ski Weekend",
      destination: "Aspen, CO",
      startDate: "2026-12-10",
      endDate: "2026-12-15",
      coverImageUrl: null,
      isOrganizer: false,
      rsvpStatus: "maybe",
      organizerInfo: [
        {
          id: "user-2",
          displayName: "Jane Smith",
          profilePhotoUrl: null,
        },
      ],
      memberCount: 8,
      eventCount: 5,
    },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
        mutations: {
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

  afterEach(async () => {
    queryClient.clear();
    // Flush pending async operations (e.g., onSettled invalidateQueries)
    await new Promise((r) => setTimeout(r, 0));
  });

  describe("successful trips fetch", () => {
    it("fetches trips successfully", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        data: mockTrips,
        meta: {
          total: mockTrips.length,
          limit: 20,
          hasMore: false,
          nextCursor: null,
        },
      });

      const { result } = renderHook(() => useTrips(), { wrapper });

      // Initially loading
      expect(result.current.isPending).toBe(true);
      expect(result.current.data).toBeUndefined();

      // Wait for query to complete
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify data is correct (InfiniteData shape)
      const trips = result.current.data?.pages.flatMap((p) => p.data) ?? [];
      expect(trips).toEqual(mockTrips);
      expect(result.current.error).toBe(null);

      // Verify API was called correctly
      expect(apiRequest).toHaveBeenCalledWith(
        expect.stringContaining("/trips"),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("returns empty array when no trips exist", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        data: [],
        meta: { total: 0, limit: 20, hasMore: false, nextCursor: null },
      });

      const { result } = renderHook(() => useTrips(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const trips = result.current.data?.pages.flatMap((p) => p.data) ?? [];
      expect(trips).toEqual([]);
    });

    it("uses correct query key for caching", async () => {
      const { apiRequest } = await import("@/lib/api");
      const mockResponse = {
        success: true as const,
        data: mockTrips,
        meta: {
          total: mockTrips.length,
          limit: 20,
          hasMore: false,
          nextCursor: null,
        },
      };
      vi.mocked(apiRequest).mockResolvedValueOnce(mockResponse);

      renderHook(() => useTrips(), { wrapper });

      await waitFor(() => {
        const cachedData = queryClient.getQueryData<
          InfiniteData<GetTripsResponse>
        >(["trips"]);
        expect(cachedData?.pages[0]?.data).toEqual(mockTrips);
      });
    });
  });

  describe("error handling", () => {
    it("handles API errors correctly", async () => {
      const { apiRequest } = await import("@/lib/api");
      const apiError = new APIError("UNAUTHORIZED", "Not authenticated");
      vi.mocked(apiRequest).mockRejectedValueOnce(apiError);

      const { result } = renderHook(() => useTrips(), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(apiError);
      expect(result.current.data).toBeUndefined();
    });

    it("handles network errors", async () => {
      const { apiRequest } = await import("@/lib/api");
      const networkError = new Error("fetch failed");
      vi.mocked(apiRequest).mockRejectedValueOnce(networkError);

      const { result } = renderHook(() => useTrips(), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(networkError);
    });
  });

  describe("refetch functionality", () => {
    it("can refetch trips data", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        data: mockTrips,
        meta: {
          total: mockTrips.length,
          limit: 20,
          hasMore: false,
          nextCursor: null,
        },
      });

      const { result } = renderHook(() => useTrips(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify initial data
      const initialTrips =
        result.current.data?.pages.flatMap((p) => p.data) ?? [];
      expect(initialTrips).toEqual(mockTrips);

      // Mock a different response for refetch
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        data: [mockTrips[0]],
        meta: { total: 1, limit: 20, hasMore: false, nextCursor: null },
      });

      // Trigger refetch
      result.current.refetch();

      // Wait for refetch to complete and data to update
      await waitFor(
        () => {
          const trips = result.current.data?.pages.flatMap((p) => p.data) ?? [];
          expect(trips.length).toBe(1);
        },
        { timeout: 3000 },
      );

      // Verify updated data
      const updatedTrips =
        result.current.data?.pages.flatMap((p) => p.data) ?? [];
      expect(updatedTrips).toEqual([mockTrips[0]]);

      // Verify API was called twice
      expect(apiRequest).toHaveBeenCalledTimes(2);
    });
  });
});

describe("useCreateTrip", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  // Sample trip data for testing
  const mockTripInput: CreateTripInput = {
    name: "Bachelor Party in Miami",
    destination: "Miami Beach, FL",
    startDate: "2026-06-01",
    endDate: "2026-06-05",
    timezone: "America/New_York",
    description: "Epic bachelor party weekend",
    coverImageUrl: "https://example.com/cover.jpg",
    allowMembersToAddEvents: true,
    coOrganizerPhones: ["+14155552671"],
  };

  const mockTripResponse: Trip = {
    id: "trip-123",
    name: "Bachelor Party in Miami",
    destination: "Miami Beach, FL",
    startDate: "2026-06-01",
    endDate: "2026-06-05",
    preferredTimezone: "America/New_York",
    description: "Epic bachelor party weekend",
    coverImageUrl: "https://example.com/cover.jpg",
    createdBy: "user-123",
    allowMembersToAddEvents: true,
    cancelled: false,
    createdAt: new Date("2026-02-06T12:00:00Z"),
    updatedAt: new Date("2026-02-06T12:00:00Z"),
  };

  beforeEach(() => {
    // Create a new QueryClient for each test to ensure isolation
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
        mutations: {
          retry: false,
        },
      },
    });

    // Create wrapper component with QueryClientProvider
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    // Clear all mocks
    vi.clearAllMocks();

    // Mock console.error to avoid test output noise from expected errors
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    queryClient.clear();
    // Flush pending async operations (e.g., onSettled invalidateQueries)
    await new Promise((r) => setTimeout(r, 0));
  });

  describe("successful trip creation", () => {
    it("creates a trip successfully and redirects", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: mockTripResponse,
      });

      const { result } = renderHook(() => useCreateTrip(), { wrapper });

      // Initially not pending
      expect(result.current.isPending).toBe(false);

      // Trigger mutation
      result.current.mutate(mockTripInput);

      // Wait for mutation to complete
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify API was called with correct data
      expect(apiRequest).toHaveBeenCalledWith("/trips", {
        method: "POST",
        body: JSON.stringify(mockTripInput),
      });

      // Verify redirect happened
      expect(mockPush).toHaveBeenCalledWith("/trips/trip-123");

      // Verify no error
      expect(result.current.error).toBe(null);
    });

    it("returns the created trip data", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: mockTripResponse,
      });

      const { result } = renderHook(() => useCreateTrip(), { wrapper });

      result.current.mutate(mockTripInput);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockTripResponse);
    });

    it("invalidates trips query on success", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: mockTripResponse,
      });

      // Set initial query data (InfiniteData shape)
      queryClient.setQueryData(["trips"], {
        pages: [
          {
            success: true,
            data: [],
            meta: { total: 0, limit: 20, hasMore: false, nextCursor: null },
          },
        ],
        pageParams: [undefined],
      });

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useCreateTrip(), { wrapper });

      result.current.mutate(mockTripInput);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify invalidateQueries was called with trips key
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["trips"] });
    });
  });

  describe("optimistic updates", () => {
    it("adds trip to cache immediately (optimistic update)", async () => {
      const { apiRequest } = await import("@/lib/api");

      // Delay the API response to observe optimistic update
      vi.mocked(apiRequest).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  success: true,
                  trip: mockTripResponse,
                }),
              100,
            );
          }),
      );

      // Set initial query data with existing trips (InfiniteData shape)
      const existingTrip: Trip = {
        id: "existing-trip",
        name: "Existing Trip",
        destination: "Somewhere",
        startDate: null,
        endDate: null,
        preferredTimezone: "UTC",
        description: null,
        coverImageUrl: null,
        createdBy: "user-123",
        allowMembersToAddEvents: true,
        cancelled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      queryClient.setQueryData(["trips"], {
        pages: [
          {
            success: true,
            data: [existingTrip],
            meta: { total: 1, limit: 20, hasMore: false, nextCursor: null },
          },
        ],
        pageParams: [undefined],
      });

      const { result } = renderHook(() => useCreateTrip(), { wrapper });

      result.current.mutate(mockTripInput);

      // Check cache was updated optimistically (before API resolves)
      await waitFor(() => {
        const cachedData = queryClient.getQueryData<
          InfiniteData<GetTripsResponse>
        >(["trips"]);
        const cachedTrips = cachedData?.pages.flatMap((p) => p.data) ?? [];
        expect(cachedTrips).toHaveLength(2);
        expect(cachedTrips[0].id).toMatch(/^temp-/); // Temporary ID
        expect(cachedTrips[0].name).toBe(mockTripInput.name);
        expect(cachedTrips[1]).toEqual(existingTrip);
      });
    });

    it("cancels outgoing queries during optimistic update", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: mockTripResponse,
      });

      const cancelQueriesSpy = vi.spyOn(queryClient, "cancelQueries");

      const { result } = renderHook(() => useCreateTrip(), { wrapper });

      result.current.mutate(mockTripInput);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify cancelQueries was called
      expect(cancelQueriesSpy).toHaveBeenCalledWith({ queryKey: ["trips"] });
    });
  });

  describe("error handling", () => {
    it("handles API errors correctly", async () => {
      const { apiRequest } = await import("@/lib/api");
      const apiError = new APIError(
        "CO_ORGANIZER_NOT_FOUND",
        "Co-organizer not found: +14155552671",
      );
      vi.mocked(apiRequest).mockRejectedValueOnce(apiError);

      const { result } = renderHook(() => useCreateTrip(), { wrapper });

      result.current.mutate(mockTripInput);

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(apiError);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("rolls back optimistic update on error", async () => {
      const { apiRequest } = await import("@/lib/api");
      const apiError = new APIError("VALIDATION_ERROR", "Invalid request data");
      vi.mocked(apiRequest).mockRejectedValueOnce(apiError);

      // Set initial query data (InfiniteData shape)
      const existingTrip: Trip = {
        id: "existing-trip",
        name: "Existing Trip",
        destination: "Somewhere",
        startDate: null,
        endDate: null,
        preferredTimezone: "UTC",
        description: null,
        coverImageUrl: null,
        createdBy: "user-123",
        allowMembersToAddEvents: true,
        cancelled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const initialData = {
        pages: [
          {
            success: true as const,
            data: [existingTrip],
            meta: { total: 1, limit: 20, hasMore: false, nextCursor: null },
          },
        ],
        pageParams: [undefined],
      };
      queryClient.setQueryData(["trips"], initialData);

      const { result } = renderHook(() => useCreateTrip(), { wrapper });

      result.current.mutate(mockTripInput);

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      // Verify cache was rolled back to original state
      const cachedData = queryClient.getQueryData<
        InfiniteData<GetTripsResponse>
      >(["trips"]);
      expect(cachedData).toEqual(initialData);
    });

    it("handles network errors", async () => {
      const { apiRequest } = await import("@/lib/api");
      const networkError = new Error("fetch failed");
      vi.mocked(apiRequest).mockRejectedValueOnce(networkError);

      const { result } = renderHook(() => useCreateTrip(), { wrapper });

      result.current.mutate(mockTripInput);

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(networkError);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("invalidates queries even after error (onSettled)", async () => {
      const { apiRequest } = await import("@/lib/api");
      const apiError = new APIError("VALIDATION_ERROR", "Invalid data");
      vi.mocked(apiRequest).mockRejectedValueOnce(apiError);

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useCreateTrip(), { wrapper });

      result.current.mutate(mockTripInput);

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      // Verify invalidateQueries was still called
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["trips"] });
    });
  });

  describe("mutation callbacks", () => {
    it("calls onSuccess callback when provided", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: mockTripResponse,
      });

      const onSuccess = vi.fn();

      const { result } = renderHook(() => useCreateTrip(), { wrapper });

      result.current.mutate(mockTripInput, { onSuccess });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(onSuccess).toHaveBeenCalled();
      expect(onSuccess.mock.calls[0][0]).toEqual(mockTripResponse);
      expect(onSuccess.mock.calls[0][1]).toEqual(mockTripInput);
    });

    it("calls onError callback when provided", async () => {
      const { apiRequest } = await import("@/lib/api");
      const apiError = new APIError("VALIDATION_ERROR", "Invalid data");
      vi.mocked(apiRequest).mockRejectedValueOnce(apiError);

      const onError = vi.fn();

      const { result } = renderHook(() => useCreateTrip(), { wrapper });

      result.current.mutate(mockTripInput, { onError });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0]).toEqual(apiError);
      expect(onError.mock.calls[0][1]).toEqual(mockTripInput);
    });
  });
});

describe("useTripDetail", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockTripDetail: TripDetail = {
    id: "trip-123",
    name: "Bachelor Party in Miami",
    destination: "Miami Beach, FL",
    startDate: "2026-06-01",
    endDate: "2026-06-05",
    preferredTimezone: "America/New_York",
    description: "Epic bachelor party weekend",
    coverImageUrl: "https://example.com/cover.jpg",
    createdBy: "user-123",
    allowMembersToAddEvents: true,
    cancelled: false,
    createdAt: new Date("2026-02-06T12:00:00Z"),
    updatedAt: new Date("2026-02-06T12:00:00Z"),
    organizers: [
      {
        id: "user-123",
        displayName: "John Doe",
        phoneNumber: "+14155551234",
        profilePhotoUrl: "https://example.com/john.jpg",
        timezone: "America/New_York",
      },
      {
        id: "user-456",
        displayName: "Jane Smith",
        phoneNumber: "+14155555678",
        profilePhotoUrl: null,
        timezone: "America/Los_Angeles",
      },
    ],
    memberCount: 8,
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
        mutations: {
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

  afterEach(async () => {
    queryClient.clear();
    // Flush pending async operations (e.g., onSettled invalidateQueries)
    await new Promise((r) => setTimeout(r, 0));
  });

  describe("successful trip detail fetch", () => {
    it("fetches trip detail successfully", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: mockTripDetail,
      });

      const { result } = renderHook(() => useTripDetail("trip-123"), {
        wrapper,
      });

      // Initially loading
      expect(result.current.isPending).toBe(true);
      expect(result.current.data).toBeUndefined();

      // Wait for query to complete
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify data is correct (includes meta fields from response envelope)
      expect(result.current.data).toEqual({
        ...mockTripDetail,
        isPreview: false,
        userRsvpStatus: "going",
        isOrganizer: false,
      });
      expect(result.current.error).toBe(null);

      // Verify API was called correctly
      expect(apiRequest).toHaveBeenCalledWith(
        "/trips/trip-123",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("returns trip with organizers and member count", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: mockTripDetail,
      });

      const { result } = renderHook(() => useTripDetail("trip-123"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.organizers).toHaveLength(2);
      expect(result.current.data?.organizers[0].displayName).toBe("John Doe");
      expect(result.current.data?.memberCount).toBe(8);
    });

    it("includes meta fields with defaults when not present in response", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: mockTripDetail,
      });

      const { result } = renderHook(() => useTripDetail("trip-123"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.isPreview).toBe(false);
      expect(result.current.data?.userRsvpStatus).toBe("going");
      expect(result.current.data?.isOrganizer).toBe(false);
    });

    it("includes meta fields from response when present", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: mockTripDetail,
        isPreview: true,
        userRsvpStatus: "maybe",
        isOrganizer: true,
      });

      const { result } = renderHook(() => useTripDetail("trip-123"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.isPreview).toBe(true);
      expect(result.current.data?.userRsvpStatus).toBe("maybe");
      expect(result.current.data?.isOrganizer).toBe(true);
    });

    it("uses correct query key for caching", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: mockTripDetail,
      });

      renderHook(() => useTripDetail("trip-123"), { wrapper });

      await waitFor(() => {
        const cachedData = queryClient.getQueryData(["trips", "trip-123"]);
        expect(cachedData).toEqual({
          ...mockTripDetail,
          isPreview: false,
          userRsvpStatus: "going",
          isOrganizer: false,
        });
      });
    });

    it("caches different trips separately", async () => {
      const { apiRequest } = await import("@/lib/api");
      const trip1 = { ...mockTripDetail, id: "trip-1", name: "Trip 1" };
      const trip2 = { ...mockTripDetail, id: "trip-2", name: "Trip 2" };

      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: trip1,
      });

      const { result: result1 } = renderHook(() => useTripDetail("trip-1"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result1.current.isSuccess).toBe(true);
      });

      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: trip2,
      });

      const { result: result2 } = renderHook(() => useTripDetail("trip-2"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result2.current.isSuccess).toBe(true);
      });

      // Verify both are cached separately (with meta field defaults)
      expect(queryClient.getQueryData(["trips", "trip-1"])).toEqual({
        ...trip1,
        isPreview: false,
        userRsvpStatus: "going",
        isOrganizer: false,
      });
      expect(queryClient.getQueryData(["trips", "trip-2"])).toEqual({
        ...trip2,
        isPreview: false,
        userRsvpStatus: "going",
        isOrganizer: false,
      });
    });
  });

  describe("error handling", () => {
    it("handles 404 error (trip not found)", async () => {
      const { apiRequest } = await import("@/lib/api");
      const notFoundError = new APIError("NOT_FOUND", "Trip not found");
      vi.mocked(apiRequest).mockRejectedValueOnce(notFoundError);

      const { result } = renderHook(() => useTripDetail("nonexistent-trip"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(notFoundError);
      expect(result.current.data).toBeUndefined();
    });

    it("handles 404 error when user has no access", async () => {
      const { apiRequest } = await import("@/lib/api");
      const notFoundError = new APIError("NOT_FOUND", "Trip not found");
      vi.mocked(apiRequest).mockRejectedValueOnce(notFoundError);

      const { result } = renderHook(() => useTripDetail("trip-no-access"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(notFoundError);
    });

    it("handles network errors", async () => {
      const { apiRequest } = await import("@/lib/api");
      const networkError = new Error("fetch failed");
      vi.mocked(apiRequest).mockRejectedValueOnce(networkError);

      const { result } = renderHook(() => useTripDetail("trip-123"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(networkError);
    });

    it("handles unauthorized error", async () => {
      const { apiRequest } = await import("@/lib/api");
      const unauthorizedError = new APIError(
        "UNAUTHORIZED",
        "Not authenticated",
      );
      vi.mocked(apiRequest).mockRejectedValueOnce(unauthorizedError);

      const { result } = renderHook(() => useTripDetail("trip-123"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(unauthorizedError);
    });
  });

  describe("refetch functionality", () => {
    it("can refetch trip detail data", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: mockTripDetail,
      });

      const { result } = renderHook(() => useTripDetail("trip-123"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify initial data
      expect(result.current.data?.name).toBe("Bachelor Party in Miami");

      // Mock a different response for refetch
      const updatedTrip = { ...mockTripDetail, name: "Updated Trip Name" };
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        trip: updatedTrip,
      });

      // Trigger refetch
      result.current.refetch();

      // Wait for refetch to complete and data to update
      await waitFor(
        () => {
          expect(result.current.data?.name).toBe("Updated Trip Name");
        },
        { timeout: 3000 },
      );

      // Verify API was called twice
      expect(apiRequest).toHaveBeenCalledTimes(2);
    });
  });
});

describe("getCreateTripErrorMessage", () => {
  it("returns null for no error", () => {
    expect(getCreateTripErrorMessage(null)).toBe(null);
  });

  it("handles CO_ORGANIZER_NOT_FOUND error", () => {
    const error = new APIError(
      "CO_ORGANIZER_NOT_FOUND",
      "Co-organizer not found: +14155552671",
    );
    expect(getCreateTripErrorMessage(error)).toBe(
      "One or more co-organizers could not be found. Please check the phone numbers and try again.",
    );
  });

  it("handles MEMBER_LIMIT_EXCEEDED error", () => {
    const error = new APIError(
      "MEMBER_LIMIT_EXCEEDED",
      "Member limit exceeded: maximum 25 members allowed",
    );
    expect(getCreateTripErrorMessage(error)).toBe(
      "Trip cannot be created: maximum 25 members allowed (including creator and co-organizers).",
    );
  });

  it("handles VALIDATION_ERROR", () => {
    const error = new APIError("VALIDATION_ERROR", "Invalid request data");
    expect(getCreateTripErrorMessage(error)).toBe(
      "Please check your input and try again.",
    );
  });

  it("handles UNAUTHORIZED error", () => {
    const error = new APIError("UNAUTHORIZED", "Not authenticated");
    expect(getCreateTripErrorMessage(error)).toBe(
      "You must be logged in to create a trip.",
    );
  });

  it("handles unknown APIError codes", () => {
    const error = new APIError("UNKNOWN_ERROR", "Something went wrong");
    expect(getCreateTripErrorMessage(error)).toBe("Something went wrong");
  });

  it("handles network errors", () => {
    const error = new Error("fetch failed");
    expect(getCreateTripErrorMessage(error)).toBe(
      "Network error: Please check your connection and try again.",
    );
  });

  it("handles generic errors", () => {
    const error = new Error("Something unexpected happened");
    expect(getCreateTripErrorMessage(error)).toBe(
      "An unexpected error occurred. Please try again.",
    );
  });
});
