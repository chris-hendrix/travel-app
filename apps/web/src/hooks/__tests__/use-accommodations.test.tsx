import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useAccommodations,
  useAccommodationDetail,
  useCreateAccommodation,
  useUpdateAccommodation,
  useDeleteAccommodation,
  useRestoreAccommodation,
  getCreateAccommodationErrorMessage,
  getUpdateAccommodationErrorMessage,
  getDeleteAccommodationErrorMessage,
  getRestoreAccommodationErrorMessage,
  type Accommodation,
} from "../use-accommodations";
import { APIError } from "@/lib/api";
import type {
  CreateAccommodationInput,
  UpdateAccommodationInput,
} from "@journiful/shared/schemas";

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

describe("useAccommodations", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockAccommodations: Accommodation[] = [
    {
      id: "accommodation-1",
      tripId: "trip-123",
      createdBy: "user-1",
      name: "Beach Resort Hotel",
      address: "123 Ocean Drive",
      description: "5-star resort with ocean view",
      checkIn: "2026-07-15T14:00:00.000Z",
      checkOut: "2026-07-20T11:00:00.000Z",
      links: ["https://example.com/hotel"],
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date("2026-02-06T12:00:00Z"),
      updatedAt: new Date("2026-02-06T12:00:00Z"),
    },
    {
      id: "accommodation-2",
      tripId: "trip-123",
      createdBy: "user-2",
      name: "Downtown Apartment",
      address: "456 Main St",
      description: null,
      checkIn: "2026-07-20T14:00:00.000Z",
      checkOut: "2026-07-22T11:00:00.000Z",
      links: null,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date("2026-02-06T13:00:00Z"),
      updatedAt: new Date("2026-02-06T13:00:00Z"),
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

  afterEach(() => {
    queryClient.clear();
  });

  describe("successful accommodations fetch", () => {
    it("fetches accommodations successfully", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        accommodations: mockAccommodations,
      });

      const { result } = renderHook(() => useAccommodations("trip-123"), {
        wrapper,
      });

      expect(result.current.isPending).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockAccommodations);
      expect(apiRequest).toHaveBeenCalledWith(
        "/trips/trip-123/accommodations",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("returns empty array when no accommodations exist", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        accommodations: [],
      });

      const { result } = renderHook(() => useAccommodations("trip-123"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("handles API errors correctly", async () => {
      const { apiRequest } = await import("@/lib/api");
      const apiError = new APIError("UNAUTHORIZED", "Not authenticated");
      vi.mocked(apiRequest).mockRejectedValueOnce(apiError);

      const { result } = renderHook(() => useAccommodations("trip-123"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(apiError);
    });
  });
});

describe("useCreateAccommodation", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockAccommodationInput: CreateAccommodationInput = {
    name: "Luxury Villa",
    address: "789 Beach Road",
    description: "Private villa with pool",
    checkIn: "2026-07-15T14:00:00.000Z",
    checkOut: "2026-07-22T11:00:00.000Z",
    links: ["https://example.com/villa"],
  };

  const mockAccommodationResponse: Accommodation = {
    id: "accommodation-123",
    tripId: "trip-123",
    createdBy: "user-123",
    name: "Luxury Villa",
    address: "789 Beach Road",
    description: "Private villa with pool",
    checkIn: "2026-07-15T14:00:00.000Z",
    checkOut: "2026-07-22T11:00:00.000Z",
    links: ["https://example.com/villa"],
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-02-06T12:00:00Z"),
    updatedAt: new Date("2026-02-06T12:00:00Z"),
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
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

  describe("successful accommodation creation", () => {
    it("creates an accommodation successfully", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        accommodation: mockAccommodationResponse,
      });

      const { result } = renderHook(() => useCreateAccommodation(), {
        wrapper,
      });

      result.current.mutate({
        tripId: "trip-123",
        data: mockAccommodationInput,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiRequest).toHaveBeenCalledWith(
        "/trips/trip-123/accommodations",
        {
          method: "POST",
          body: JSON.stringify(mockAccommodationInput),
        },
      );
      expect(result.current.data).toEqual(mockAccommodationResponse);
    });

    it("invalidates accommodations query on success", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        accommodation: mockAccommodationResponse,
      });

      queryClient.setQueryData(["accommodations", "list", "trip-123"], []);
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useCreateAccommodation(), {
        wrapper,
      });

      result.current.mutate({
        tripId: "trip-123",
        data: mockAccommodationInput,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["accommodations", "list", "trip-123"],
      });
    });
  });

  describe("optimistic updates", () => {
    it("adds accommodation to cache immediately", async () => {
      const { apiRequest } = await import("@/lib/api");

      vi.mocked(apiRequest).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  success: true,
                  accommodation: mockAccommodationResponse,
                }),
              100,
            );
          }),
      );

      const existingAccommodation: Accommodation = {
        id: "existing-accommodation",
        tripId: "trip-123",
        createdBy: "user-1",
        name: "Existing Hotel",
        address: null,
        description: null,
        checkIn: "2026-07-10T14:00:00.000Z",
        checkOut: "2026-07-15T11:00:00.000Z",
        links: null,
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      queryClient.setQueryData(
        ["accommodations", "list", "trip-123"],
        [existingAccommodation],
      );

      const { result } = renderHook(() => useCreateAccommodation(), {
        wrapper,
      });

      result.current.mutate({
        tripId: "trip-123",
        data: mockAccommodationInput,
      });

      await waitFor(() => {
        const cachedAccommodations = queryClient.getQueryData<Accommodation[]>([
          "accommodations",
          "list",
          "trip-123",
        ]);
        expect(cachedAccommodations).toHaveLength(2);
        expect(cachedAccommodations![0].id).toMatch(/^temp-/);
        expect(cachedAccommodations![0].name).toBe(mockAccommodationInput.name);
      });
    });

    it("rolls back optimistic update on error", async () => {
      const { apiRequest } = await import("@/lib/api");
      const apiError = new APIError("VALIDATION_ERROR", "Invalid data");
      vi.mocked(apiRequest).mockRejectedValueOnce(apiError);

      const existingAccommodation: Accommodation = {
        id: "existing-accommodation",
        tripId: "trip-123",
        createdBy: "user-1",
        name: "Existing Hotel",
        address: null,
        description: null,
        checkIn: "2026-07-10T14:00:00.000Z",
        checkOut: "2026-07-15T11:00:00.000Z",
        links: null,
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      queryClient.setQueryData(
        ["accommodations", "list", "trip-123"],
        [existingAccommodation],
      );

      const { result } = renderHook(() => useCreateAccommodation(), {
        wrapper,
      });

      result.current.mutate({
        tripId: "trip-123",
        data: mockAccommodationInput,
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      const cachedAccommodations = queryClient.getQueryData<Accommodation[]>([
        "accommodations",
        "list",
        "trip-123",
      ]);
      expect(cachedAccommodations).toEqual([existingAccommodation]);
    });
  });
});

describe("useUpdateAccommodation", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockAccommodation: Accommodation = {
    id: "accommodation-123",
    tripId: "trip-123",
    createdBy: "user-123",
    name: "Original Name",
    address: "Original address",
    description: "Original description",
    checkIn: "2026-07-15T14:00:00.000Z",
    checkOut: "2026-07-20T11:00:00.000Z",
    links: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-02-06T12:00:00Z"),
    updatedAt: new Date("2026-02-06T12:00:00Z"),
  };

  const mockUpdateInput: UpdateAccommodationInput = {
    name: "Updated Name",
    description: "Updated description",
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
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

  it("updates an accommodation successfully", async () => {
    const { apiRequest } = await import("@/lib/api");
    const updatedAccommodation = { ...mockAccommodation, ...mockUpdateInput };
    vi.mocked(apiRequest).mockResolvedValueOnce({
      success: true,
      accommodation: updatedAccommodation,
    });

    queryClient.setQueryData(
      ["accommodations", "detail", "accommodation-123"],
      mockAccommodation,
    );

    const { result } = renderHook(() => useUpdateAccommodation(), { wrapper });

    result.current.mutate({
      accommodationId: "accommodation-123",
      data: mockUpdateInput,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/accommodations/accommodation-123",
      {
        method: "PUT",
        body: JSON.stringify(mockUpdateInput),
      },
    );
  });

  it("handles PERMISSION_DENIED error", async () => {
    const { apiRequest } = await import("@/lib/api");
    const apiError = new APIError("PERMISSION_DENIED", "No permission");
    vi.mocked(apiRequest).mockRejectedValueOnce(apiError);

    const { result } = renderHook(() => useUpdateAccommodation(), { wrapper });

    result.current.mutate({
      accommodationId: "accommodation-123",
      data: mockUpdateInput,
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(apiError);
  });
});

describe("useDeleteAccommodation", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockAccommodation: Accommodation = {
    id: "accommodation-123",
    tripId: "trip-123",
    createdBy: "user-123",
    name: "Accommodation to Delete",
    address: null,
    description: null,
    checkIn: "2026-07-15T14:00:00.000Z",
    checkOut: "2026-07-20T11:00:00.000Z",
    links: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
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

  it("deletes an accommodation successfully", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockResolvedValueOnce({ success: true });

    queryClient.setQueryData(
      ["accommodations", "detail", "accommodation-123"],
      mockAccommodation,
    );
    queryClient.setQueryData(
      ["accommodations", "list", "trip-123"],
      [mockAccommodation],
    );

    const { result } = renderHook(() => useDeleteAccommodation(), { wrapper });

    result.current.mutate("accommodation-123");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/accommodations/accommodation-123",
      {
        method: "DELETE",
      },
    );
  });

  it("removes accommodation from cache optimistically", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ success: true }), 100);
        }),
    );

    queryClient.setQueryData(
      ["accommodations", "detail", "accommodation-123"],
      mockAccommodation,
    );
    queryClient.setQueryData(
      ["accommodations", "list", "trip-123"],
      [mockAccommodation],
    );

    const { result } = renderHook(() => useDeleteAccommodation(), { wrapper });

    result.current.mutate("accommodation-123");

    await waitFor(() => {
      const cachedAccommodations = queryClient.getQueryData<Accommodation[]>([
        "accommodations",
        "list",
        "trip-123",
      ]);
      expect(cachedAccommodations).toEqual([]);
    });
  });
});

describe("useRestoreAccommodation", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockAccommodation: Accommodation = {
    id: "accommodation-123",
    tripId: "trip-123",
    createdBy: "user-123",
    name: "Restored Accommodation",
    address: null,
    description: null,
    checkIn: "2026-07-15T14:00:00.000Z",
    checkOut: "2026-07-20T11:00:00.000Z",
    links: null,
    deletedAt: new Date(),
    deletedBy: "user-123",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
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

  it("restores an accommodation successfully", async () => {
    const { apiRequest } = await import("@/lib/api");
    const restoredAccommodation = {
      ...mockAccommodation,
      deletedAt: null,
      deletedBy: null,
    };
    vi.mocked(apiRequest).mockResolvedValueOnce({
      success: true,
      accommodation: restoredAccommodation,
    });

    queryClient.setQueryData(
      ["accommodations", "detail", "accommodation-123"],
      mockAccommodation,
    );
    queryClient.setQueryData(["accommodations", "list", "trip-123"], []);

    const { result } = renderHook(() => useRestoreAccommodation(), { wrapper });

    result.current.mutate("accommodation-123");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/accommodations/accommodation-123/restore",
      {
        method: "POST",
      },
    );
    expect(result.current.data).toEqual(restoredAccommodation);
  });
});

describe("error message helpers", () => {
  it("getCreateAccommodationErrorMessage handles PERMISSION_DENIED", () => {
    const error = new APIError("PERMISSION_DENIED", "No permission");
    expect(getCreateAccommodationErrorMessage(error)).toBe(
      "You don't have permission to add accommodations to this trip.",
    );
  });

  it("getUpdateAccommodationErrorMessage handles NOT_FOUND", () => {
    const error = new APIError("NOT_FOUND", "Accommodation not found");
    expect(getUpdateAccommodationErrorMessage(error)).toBe(
      "Accommodation not found.",
    );
  });

  it("getDeleteAccommodationErrorMessage handles network errors", () => {
    const error = new Error("fetch failed");
    expect(getDeleteAccommodationErrorMessage(error)).toBe(
      "Network error: Please check your connection and try again.",
    );
  });

  it("getRestoreAccommodationErrorMessage handles UNAUTHORIZED", () => {
    const error = new APIError("UNAUTHORIZED", "Not authenticated");
    expect(getRestoreAccommodationErrorMessage(error)).toBe(
      "You must be logged in to restore an accommodation.",
    );
  });
});
