import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useMemberTravels,
  useMemberTravelDetail,
  useCreateMemberTravel,
  useUpdateMemberTravel,
  useDeleteMemberTravel,
  useRestoreMemberTravel,
  getCreateMemberTravelErrorMessage,
  getUpdateMemberTravelErrorMessage,
  getDeleteMemberTravelErrorMessage,
  getRestoreMemberTravelErrorMessage,
  type MemberTravel,
} from "../use-member-travel";
import { APIError } from "@/lib/api";
import type {
  CreateMemberTravelInput,
  UpdateMemberTravelInput,
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

describe("useMemberTravels", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockMemberTravels: MemberTravel[] = [
    {
      id: "member-travel-1",
      tripId: "trip-123",
      memberId: "member-1",
      travelType: "arrival",
      time: new Date("2026-07-15T10:00:00Z"),
      location: "SFO Airport",
      details: "United Airlines UA123",
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date("2026-02-06T12:00:00Z"),
      updatedAt: new Date("2026-02-06T12:00:00Z"),
    },
    {
      id: "member-travel-2",
      tripId: "trip-123",
      memberId: "member-2",
      travelType: "departure",
      time: new Date("2026-07-22T15:00:00Z"),
      location: "SFO Airport",
      details: null,
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

  describe("successful member travels fetch", () => {
    it("fetches member travels successfully", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        memberTravels: mockMemberTravels,
      });

      const { result } = renderHook(() => useMemberTravels("trip-123"), {
        wrapper,
      });

      expect(result.current.isPending).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockMemberTravels);
      expect(apiRequest).toHaveBeenCalledWith(
        "/trips/trip-123/member-travel",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("returns empty array when no member travels exist", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        memberTravels: [],
      });

      const { result } = renderHook(() => useMemberTravels("trip-123"), {
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

      const { result } = renderHook(() => useMemberTravels("trip-123"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(apiError);
    });
  });
});

describe("useCreateMemberTravel", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockMemberTravelInput: CreateMemberTravelInput = {
    travelType: "arrival",
    time: "2026-07-15T14:00:00Z",
    location: "LAX Airport",
    details: "Delta DL456",
  };

  const mockMemberTravelResponse: MemberTravel = {
    id: "member-travel-123",
    tripId: "trip-123",
    memberId: "member-123",
    travelType: "arrival",
    time: new Date("2026-07-15T14:00:00Z"),
    location: "LAX Airport",
    details: "Delta DL456",
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

  describe("successful member travel creation", () => {
    it("creates a member travel successfully", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        memberTravel: mockMemberTravelResponse,
      });

      const { result } = renderHook(() => useCreateMemberTravel(), {
        wrapper,
      });

      result.current.mutate({
        tripId: "trip-123",
        data: mockMemberTravelInput,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiRequest).toHaveBeenCalledWith("/trips/trip-123/member-travel", {
        method: "POST",
        body: JSON.stringify(mockMemberTravelInput),
      });
      expect(result.current.data).toEqual(mockMemberTravelResponse);
    });

    it("invalidates member travels query on success", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        memberTravel: mockMemberTravelResponse,
      });

      queryClient.setQueryData(["memberTravels", "list", "trip-123"], []);
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useCreateMemberTravel(), {
        wrapper,
      });

      result.current.mutate({
        tripId: "trip-123",
        data: mockMemberTravelInput,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["memberTravels", "list", "trip-123"],
      });
    });
  });

  describe("optimistic updates", () => {
    it("adds member travel to cache immediately", async () => {
      const { apiRequest } = await import("@/lib/api");

      vi.mocked(apiRequest).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  success: true,
                  memberTravel: mockMemberTravelResponse,
                }),
              100,
            );
          }),
      );

      const existingMemberTravel: MemberTravel = {
        id: "existing-member-travel",
        tripId: "trip-123",
        memberId: "member-1",
        travelType: "departure",
        time: new Date(),
        location: null,
        details: null,
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      queryClient.setQueryData(
        ["memberTravels", "list", "trip-123"],
        [existingMemberTravel],
      );

      const { result } = renderHook(() => useCreateMemberTravel(), {
        wrapper,
      });

      result.current.mutate({
        tripId: "trip-123",
        data: mockMemberTravelInput,
      });

      await waitFor(() => {
        const cachedMemberTravels = queryClient.getQueryData<MemberTravel[]>([
          "memberTravels",
          "list",
          "trip-123",
        ]);
        expect(cachedMemberTravels).toHaveLength(2);
        expect(cachedMemberTravels![0].id).toMatch(/^temp-/);
        expect(cachedMemberTravels![0].travelType).toBe(
          mockMemberTravelInput.travelType,
        );
      });
    });

    it("rolls back optimistic update on error", async () => {
      const { apiRequest } = await import("@/lib/api");
      const apiError = new APIError("VALIDATION_ERROR", "Invalid data");
      vi.mocked(apiRequest).mockRejectedValueOnce(apiError);

      const existingMemberTravel: MemberTravel = {
        id: "existing-member-travel",
        tripId: "trip-123",
        memberId: "member-1",
        travelType: "departure",
        time: new Date(),
        location: null,
        details: null,
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      queryClient.setQueryData(
        ["memberTravels", "list", "trip-123"],
        [existingMemberTravel],
      );

      const { result } = renderHook(() => useCreateMemberTravel(), {
        wrapper,
      });

      result.current.mutate({
        tripId: "trip-123",
        data: mockMemberTravelInput,
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      const cachedMemberTravels = queryClient.getQueryData<MemberTravel[]>([
        "memberTravels",
        "list",
        "trip-123",
      ]);
      expect(cachedMemberTravels).toEqual([existingMemberTravel]);
    });
  });
});

describe("useUpdateMemberTravel", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockMemberTravel: MemberTravel = {
    id: "member-travel-123",
    tripId: "trip-123",
    memberId: "member-123",
    travelType: "arrival",
    time: new Date("2026-07-15T14:00:00Z"),
    location: "Original location",
    details: "Original details",
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-02-06T12:00:00Z"),
    updatedAt: new Date("2026-02-06T12:00:00Z"),
  };

  const mockUpdateInput: UpdateMemberTravelInput = {
    location: "Updated location",
    details: "Updated details",
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

  it("updates a member travel successfully", async () => {
    const { apiRequest } = await import("@/lib/api");
    const updatedMemberTravel = { ...mockMemberTravel, ...mockUpdateInput };
    vi.mocked(apiRequest).mockResolvedValueOnce({
      success: true,
      memberTravel: updatedMemberTravel,
    });

    queryClient.setQueryData(
      ["memberTravels", "detail", "member-travel-123"],
      mockMemberTravel,
    );

    const { result } = renderHook(() => useUpdateMemberTravel(), { wrapper });

    result.current.mutate({
      memberTravelId: "member-travel-123",
      data: mockUpdateInput,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/member-travel/member-travel-123",
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

    const { result } = renderHook(() => useUpdateMemberTravel(), { wrapper });

    result.current.mutate({
      memberTravelId: "member-travel-123",
      data: mockUpdateInput,
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(apiError);
  });
});

describe("useDeleteMemberTravel", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockMemberTravel: MemberTravel = {
    id: "member-travel-123",
    tripId: "trip-123",
    memberId: "member-123",
    travelType: "arrival",
    time: new Date(),
    location: null,
    details: null,
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

  it("deletes a member travel successfully", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockResolvedValueOnce({ success: true });

    queryClient.setQueryData(
      ["memberTravels", "detail", "member-travel-123"],
      mockMemberTravel,
    );
    queryClient.setQueryData(
      ["memberTravels", "list", "trip-123"],
      [mockMemberTravel],
    );

    const { result } = renderHook(() => useDeleteMemberTravel(), { wrapper });

    result.current.mutate("member-travel-123");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/member-travel/member-travel-123",
      {
        method: "DELETE",
      },
    );
  });

  it("removes member travel from cache optimistically", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ success: true }), 100);
        }),
    );

    queryClient.setQueryData(
      ["memberTravels", "detail", "member-travel-123"],
      mockMemberTravel,
    );
    queryClient.setQueryData(
      ["memberTravels", "list", "trip-123"],
      [mockMemberTravel],
    );

    const { result } = renderHook(() => useDeleteMemberTravel(), { wrapper });

    result.current.mutate("member-travel-123");

    await waitFor(() => {
      const cachedMemberTravels = queryClient.getQueryData<MemberTravel[]>([
        "memberTravels",
        "list",
        "trip-123",
      ]);
      expect(cachedMemberTravels).toEqual([]);
    });
  });
});

describe("useRestoreMemberTravel", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockMemberTravel: MemberTravel = {
    id: "member-travel-123",
    tripId: "trip-123",
    memberId: "member-123",
    travelType: "arrival",
    time: new Date(),
    location: null,
    details: null,
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

  it("restores a member travel successfully", async () => {
    const { apiRequest } = await import("@/lib/api");
    const restoredMemberTravel = {
      ...mockMemberTravel,
      deletedAt: null,
      deletedBy: null,
    };
    vi.mocked(apiRequest).mockResolvedValueOnce({
      success: true,
      memberTravel: restoredMemberTravel,
    });

    queryClient.setQueryData(
      ["memberTravels", "detail", "member-travel-123"],
      mockMemberTravel,
    );
    queryClient.setQueryData(["memberTravels", "list", "trip-123"], []);

    const { result } = renderHook(() => useRestoreMemberTravel(), { wrapper });

    result.current.mutate("member-travel-123");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/member-travel/member-travel-123/restore",
      {
        method: "POST",
      },
    );
    expect(result.current.data).toEqual(restoredMemberTravel);
  });
});

describe("error message helpers", () => {
  it("getCreateMemberTravelErrorMessage handles PERMISSION_DENIED", () => {
    const error = new APIError("PERMISSION_DENIED", "No permission");
    expect(getCreateMemberTravelErrorMessage(error)).toBe(
      "You don't have permission to add member travel to this trip.",
    );
  });

  it("getUpdateMemberTravelErrorMessage handles NOT_FOUND", () => {
    const error = new APIError("NOT_FOUND", "Member travel not found");
    expect(getUpdateMemberTravelErrorMessage(error)).toBe(
      "Member travel not found.",
    );
  });

  it("getDeleteMemberTravelErrorMessage handles network errors", () => {
    const error = new Error("fetch failed");
    expect(getDeleteMemberTravelErrorMessage(error)).toBe(
      "Network error: Please check your connection and try again.",
    );
  });

  it("getRestoreMemberTravelErrorMessage handles UNAUTHORIZED", () => {
    const error = new APIError("UNAUTHORIZED", "Not authenticated");
    expect(getRestoreMemberTravelErrorMessage(error)).toBe(
      "You must be logged in to restore member travel.",
    );
  });
});
