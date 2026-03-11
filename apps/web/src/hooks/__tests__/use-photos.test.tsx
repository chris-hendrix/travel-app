import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  usePhotos,
  useUploadPhotos,
  useUpdatePhotoCaption,
  useDeletePhoto,
  getUploadPhotosErrorMessage,
  getUpdatePhotoCaptionErrorMessage,
  getDeletePhotoErrorMessage,
  type Photo,
} from "../use-photos";
import { APIError } from "@/lib/api";

// Mock the API module
vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  API_URL: "http://localhost:8000/api",
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

describe("usePhotos", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockPhotos: Photo[] = [
    {
      id: "photo-1",
      tripId: "trip-123",
      uploadedBy: "user-1",
      url: "/uploads/photo1.jpg",
      caption: "Beach sunset",
      status: "ready",
      sortOrder: 0,
      createdAt: new Date("2026-03-01T12:00:00Z"),
      updatedAt: new Date("2026-03-01T12:00:00Z"),
    },
    {
      id: "photo-2",
      tripId: "trip-123",
      uploadedBy: "user-2",
      url: "/uploads/photo2.jpg",
      caption: null,
      status: "processing",
      sortOrder: 1,
      createdAt: new Date("2026-03-01T13:00:00Z"),
      updatedAt: new Date("2026-03-01T13:00:00Z"),
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

  describe("successful photos fetch", () => {
    it("fetches photos successfully", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        photos: mockPhotos,
      });

      const { result } = renderHook(() => usePhotos("trip-123"), { wrapper });

      expect(result.current.isPending).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockPhotos);
      expect(apiRequest).toHaveBeenCalledWith(
        "/trips/trip-123/photos",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("returns empty array when no photos exist", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        photos: [],
      });

      const { result } = renderHook(() => usePhotos("trip-123"), { wrapper });

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

      const { result } = renderHook(() => usePhotos("trip-123"), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(apiError);
    });
  });
});

describe("useUploadPhotos", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

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

  it("uploads photos successfully using fetch with FormData", async () => {
    const mockPhotos: Photo[] = [
      {
        id: "photo-new",
        tripId: "trip-123",
        uploadedBy: "user-1",
        url: null,
        caption: null,
        status: "processing",
        sortOrder: 0,
        createdAt: new Date("2026-03-01T12:00:00Z"),
        updatedAt: new Date("2026-03-01T12:00:00Z"),
      },
    ];

    const mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ success: true, photos: mockPhotos }),
      } as Response),
    );
    global.fetch = mockFetch;

    const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
    const { result } = renderHook(() => useUploadPhotos("trip-123"), {
      wrapper,
    });

    result.current.mutate([file]);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/trips/trip-123/photos",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: expect.any(FormData),
      }),
    );
    expect(result.current.data).toEqual(mockPhotos);
  });

  it("invalidates photos query on success", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ success: true, photos: [] }),
      } as Response),
    );
    global.fetch = mockFetch;

    queryClient.setQueryData(["trips", "trip-123", "photos"], []);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
    const { result } = renderHook(() => useUploadPhotos("trip-123"), {
      wrapper,
    });

    result.current.mutate([file]);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["trips", "trip-123", "photos"],
    });
  });

  it("throws APIError on upload failure", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: async () => ({
          error: { code: "VALIDATION_ERROR", message: "File too large" },
        }),
      } as Response),
    );

    const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
    const { result } = renderHook(() => useUploadPhotos("trip-123"), {
      wrapper,
    });

    result.current.mutate([file]);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("File too large");
  });
});

describe("useUpdatePhotoCaption", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockPhotos: Photo[] = [
    {
      id: "photo-1",
      tripId: "trip-123",
      uploadedBy: "user-1",
      url: "/uploads/photo1.jpg",
      caption: "Original caption",
      status: "ready",
      sortOrder: 0,
      createdAt: new Date("2026-03-01T12:00:00Z"),
      updatedAt: new Date("2026-03-01T12:00:00Z"),
    },
  ];

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

  it("updates caption successfully", async () => {
    const { apiRequest } = await import("@/lib/api");
    const updatedPhoto = { ...mockPhotos[0], caption: "New caption" };
    vi.mocked(apiRequest).mockResolvedValueOnce({
      success: true,
      photo: updatedPhoto,
    });

    queryClient.setQueryData(["trips", "trip-123", "photos"], [...mockPhotos]);

    const { result } = renderHook(() => useUpdatePhotoCaption("trip-123"), {
      wrapper,
    });

    result.current.mutate({
      photoId: "photo-1",
      data: { caption: "New caption" },
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiRequest).toHaveBeenCalledWith("/trips/trip-123/photos/photo-1", {
      method: "PATCH",
      body: JSON.stringify({ caption: "New caption" }),
    });
  });

  it("optimistically updates caption in cache", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                success: true,
                photo: { ...mockPhotos[0], caption: "New caption" },
              }),
            100,
          );
        }),
    );

    queryClient.setQueryData(["trips", "trip-123", "photos"], [...mockPhotos]);

    const { result } = renderHook(() => useUpdatePhotoCaption("trip-123"), {
      wrapper,
    });

    result.current.mutate({
      photoId: "photo-1",
      data: { caption: "New caption" },
    });

    await waitFor(() => {
      const cachedPhotos = queryClient.getQueryData<Photo[]>([
        "trips",
        "trip-123",
        "photos",
      ]);
      expect(cachedPhotos?.[0].caption).toBe("New caption");
    });
  });

  it("rolls back optimistic update on error", async () => {
    const { apiRequest } = await import("@/lib/api");
    const apiError = new APIError("VALIDATION_ERROR", "Invalid caption");
    vi.mocked(apiRequest).mockRejectedValueOnce(apiError);

    queryClient.setQueryData(["trips", "trip-123", "photos"], [...mockPhotos]);

    const { result } = renderHook(() => useUpdatePhotoCaption("trip-123"), {
      wrapper,
    });

    result.current.mutate({
      photoId: "photo-1",
      data: { caption: "New caption" },
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    const cachedPhotos = queryClient.getQueryData<Photo[]>([
      "trips",
      "trip-123",
      "photos",
    ]);
    expect(cachedPhotos).toEqual(mockPhotos);
  });
});

describe("useDeletePhoto", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockPhotos: Photo[] = [
    {
      id: "photo-1",
      tripId: "trip-123",
      uploadedBy: "user-1",
      url: "/uploads/photo1.jpg",
      caption: "Beach sunset",
      status: "ready",
      sortOrder: 0,
      createdAt: new Date("2026-03-01T12:00:00Z"),
      updatedAt: new Date("2026-03-01T12:00:00Z"),
    },
    {
      id: "photo-2",
      tripId: "trip-123",
      uploadedBy: "user-2",
      url: "/uploads/photo2.jpg",
      caption: null,
      status: "ready",
      sortOrder: 1,
      createdAt: new Date("2026-03-01T13:00:00Z"),
      updatedAt: new Date("2026-03-01T13:00:00Z"),
    },
  ];

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

  it("deletes a photo successfully", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockResolvedValueOnce({ success: true });

    queryClient.setQueryData(["trips", "trip-123", "photos"], [...mockPhotos]);

    const { result } = renderHook(() => useDeletePhoto("trip-123"), {
      wrapper,
    });

    result.current.mutate("photo-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiRequest).toHaveBeenCalledWith("/trips/trip-123/photos/photo-1", {
      method: "DELETE",
    });
  });

  it("removes photo from cache optimistically", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ success: true }), 100);
        }),
    );

    queryClient.setQueryData(["trips", "trip-123", "photos"], [...mockPhotos]);

    const { result } = renderHook(() => useDeletePhoto("trip-123"), {
      wrapper,
    });

    result.current.mutate("photo-1");

    await waitFor(() => {
      const cachedPhotos = queryClient.getQueryData<Photo[]>([
        "trips",
        "trip-123",
        "photos",
      ]);
      expect(cachedPhotos).toHaveLength(1);
      expect(cachedPhotos?.[0].id).toBe("photo-2");
    });
  });

  it("rolls back optimistic removal on error", async () => {
    const { apiRequest } = await import("@/lib/api");
    const apiError = new APIError("PERMISSION_DENIED", "No permission");
    vi.mocked(apiRequest).mockRejectedValueOnce(apiError);

    queryClient.setQueryData(["trips", "trip-123", "photos"], [...mockPhotos]);

    const { result } = renderHook(() => useDeletePhoto("trip-123"), {
      wrapper,
    });

    result.current.mutate("photo-1");

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    const cachedPhotos = queryClient.getQueryData<Photo[]>([
      "trips",
      "trip-123",
      "photos",
    ]);
    expect(cachedPhotos).toEqual(mockPhotos);
  });
});

describe("error message helpers", () => {
  it("getUploadPhotosErrorMessage handles PERMISSION_DENIED", () => {
    const error = new APIError("PERMISSION_DENIED", "No permission");
    expect(getUploadPhotosErrorMessage(error)).toBe(
      "You don't have permission to upload photos to this trip.",
    );
  });

  it("getUploadPhotosErrorMessage handles null", () => {
    expect(getUploadPhotosErrorMessage(null)).toBeNull();
  });

  it("getUploadPhotosErrorMessage handles network errors", () => {
    const error = new Error("Failed to fetch");
    expect(getUploadPhotosErrorMessage(error)).toBe(
      "Network error: Please check your connection and try again.",
    );
  });

  it("getUpdatePhotoCaptionErrorMessage handles NOT_FOUND", () => {
    const error = new APIError("NOT_FOUND", "Photo not found");
    expect(getUpdatePhotoCaptionErrorMessage(error)).toBe("Photo not found.");
  });

  it("getUpdatePhotoCaptionErrorMessage handles VALIDATION_ERROR", () => {
    const error = new APIError("VALIDATION_ERROR", "Invalid caption");
    expect(getUpdatePhotoCaptionErrorMessage(error)).toBe(
      "Please check your input and try again.",
    );
  });

  it("getDeletePhotoErrorMessage handles UNAUTHORIZED", () => {
    const error = new APIError("UNAUTHORIZED", "Not authenticated");
    expect(getDeletePhotoErrorMessage(error)).toBe(
      "You must be logged in to delete a photo.",
    );
  });

  it("getDeletePhotoErrorMessage handles unknown errors", () => {
    const error = new Error("Something went wrong");
    expect(getDeletePhotoErrorMessage(error)).toBe(
      "An unexpected error occurred. Please try again.",
    );
  });
});
