import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useEvents,
  useEventDetail,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  useRestoreEvent,
  getCreateEventErrorMessage,
  getUpdateEventErrorMessage,
  getDeleteEventErrorMessage,
  getRestoreEventErrorMessage,
  type Event,
} from "../use-events";
import { APIError } from "@/lib/api";
import type {
  CreateEventInput,
  UpdateEventInput,
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

describe("useEvents", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockEvents: Event[] = [
    {
      id: "event-1",
      tripId: "trip-123",
      createdBy: "user-1",
      name: "Airport Pickup",
      description: "Meet at arrivals",
      eventType: "travel",
      location: "SFO Terminal 1",
      meetupLocation: null,
      meetupTime: null,
      startTime: new Date("2026-07-15T10:00:00Z"),
      endTime: new Date("2026-07-15T11:00:00Z"),
      allDay: false,
      isOptional: false,
      links: ["https://example.com/directions"],
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date("2026-02-06T12:00:00Z"),
      updatedAt: new Date("2026-02-06T12:00:00Z"),
    },
    {
      id: "event-2",
      tripId: "trip-123",
      createdBy: "user-2",
      name: "Dinner at Beach House",
      description: null,
      eventType: "meal",
      location: "123 Beach Rd",
      meetupLocation: null,
      meetupTime: null,
      startTime: new Date("2026-07-15T18:00:00Z"),
      endTime: null,
      allDay: false,
      isOptional: true,
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

  describe("successful events fetch", () => {
    it("fetches events successfully", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        events: mockEvents,
      });

      const { result } = renderHook(() => useEvents("trip-123"), { wrapper });

      expect(result.current.isPending).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockEvents);
      expect(apiRequest).toHaveBeenCalledWith(
        "/trips/trip-123/events",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("returns empty array when no events exist", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        events: [],
      });

      const { result } = renderHook(() => useEvents("trip-123"), { wrapper });

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

      const { result } = renderHook(() => useEvents("trip-123"), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(apiError);
    });
  });
});

describe("useCreateEvent", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockEventInput: CreateEventInput = {
    name: "Beach Party",
    description: "Sunset celebration",
    eventType: "activity",
    location: "Bondi Beach",
    startTime: "2026-07-16T18:00:00Z",
    endTime: "2026-07-16T22:00:00Z",
    allDay: false,
    isOptional: true,
    links: ["https://example.com/event"],
  };

  const mockEventResponse: Event = {
    id: "event-123",
    tripId: "trip-123",
    createdBy: "user-123",
    name: "Beach Party",
    description: "Sunset celebration",
    eventType: "activity",
    location: "Bondi Beach",
    meetupLocation: null,
    meetupTime: null,
    startTime: new Date("2026-07-16T18:00:00Z"),
    endTime: new Date("2026-07-16T22:00:00Z"),
    allDay: false,
    isOptional: true,
    links: ["https://example.com/event"],
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

  describe("successful event creation", () => {
    it("creates an event successfully", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        event: mockEventResponse,
      });

      const { result } = renderHook(() => useCreateEvent(), { wrapper });

      result.current.mutate({ tripId: "trip-123", data: mockEventInput });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiRequest).toHaveBeenCalledWith("/trips/trip-123/events", {
        method: "POST",
        body: JSON.stringify(mockEventInput),
      });
      expect(result.current.data).toEqual(mockEventResponse);
    });

    it("invalidates events query on success", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        event: mockEventResponse,
      });

      queryClient.setQueryData(["events", "list", "trip-123"], []);
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useCreateEvent(), { wrapper });

      result.current.mutate({ tripId: "trip-123", data: mockEventInput });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["events", "list", "trip-123"],
      });
    });
  });

  describe("optimistic updates", () => {
    it("adds event to cache immediately", async () => {
      const { apiRequest } = await import("@/lib/api");

      vi.mocked(apiRequest).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  success: true,
                  event: mockEventResponse,
                }),
              100,
            );
          }),
      );

      const existingEvent: Event = {
        id: "existing-event",
        tripId: "trip-123",
        createdBy: "user-1",
        name: "Existing Event",
        description: null,
        eventType: "activity",
        location: null,
        meetupLocation: null,
        meetupTime: null,
        startTime: new Date(),
        endTime: null,
        allDay: false,
        isOptional: false,
        links: null,
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      queryClient.setQueryData(["events", "list", "trip-123"], [existingEvent]);

      const { result } = renderHook(() => useCreateEvent(), { wrapper });

      result.current.mutate({ tripId: "trip-123", data: mockEventInput });

      await waitFor(() => {
        const cachedEvents = queryClient.getQueryData<Event[]>([
          "events",
          "list",
          "trip-123",
        ]);
        expect(cachedEvents).toHaveLength(2);
        expect(cachedEvents![0].id).toMatch(/^temp-/);
        expect(cachedEvents![0].name).toBe(mockEventInput.name);
      });
    });

    it("rolls back optimistic update on error", async () => {
      const { apiRequest } = await import("@/lib/api");
      const apiError = new APIError("VALIDATION_ERROR", "Invalid data");
      vi.mocked(apiRequest).mockRejectedValueOnce(apiError);

      const existingEvent: Event = {
        id: "existing-event",
        tripId: "trip-123",
        createdBy: "user-1",
        name: "Existing Event",
        description: null,
        eventType: "activity",
        location: null,
        meetupLocation: null,
        meetupTime: null,
        startTime: new Date(),
        endTime: null,
        allDay: false,
        isOptional: false,
        links: null,
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      queryClient.setQueryData(["events", "list", "trip-123"], [existingEvent]);

      const { result } = renderHook(() => useCreateEvent(), { wrapper });

      result.current.mutate({ tripId: "trip-123", data: mockEventInput });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      const cachedEvents = queryClient.getQueryData<Event[]>([
        "events",
        "list",
        "trip-123",
      ]);
      expect(cachedEvents).toEqual([existingEvent]);
    });
  });
});

describe("useUpdateEvent", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockEvent: Event = {
    id: "event-123",
    tripId: "trip-123",
    createdBy: "user-123",
    name: "Original Name",
    description: "Original description",
    eventType: "activity",
    location: "Original location",
    meetupLocation: null,
    meetupTime: null,
    startTime: new Date("2026-07-16T18:00:00Z"),
    endTime: new Date("2026-07-16T22:00:00Z"),
    allDay: false,
    isOptional: false,
    links: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-02-06T12:00:00Z"),
    updatedAt: new Date("2026-02-06T12:00:00Z"),
  };

  const mockUpdateInput: UpdateEventInput = {
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

  it("updates an event successfully", async () => {
    const { apiRequest } = await import("@/lib/api");
    const updatedEvent = { ...mockEvent, ...mockUpdateInput };
    vi.mocked(apiRequest).mockResolvedValueOnce({
      success: true,
      event: updatedEvent,
    });

    queryClient.setQueryData(["events", "detail", "event-123"], mockEvent);

    const { result } = renderHook(() => useUpdateEvent(), { wrapper });

    result.current.mutate({
      eventId: "event-123",
      data: mockUpdateInput,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiRequest).toHaveBeenCalledWith("/events/event-123", {
      method: "PUT",
      body: JSON.stringify(mockUpdateInput),
    });
  });

  it("handles PERMISSION_DENIED error", async () => {
    const { apiRequest } = await import("@/lib/api");
    const apiError = new APIError("PERMISSION_DENIED", "No permission");
    vi.mocked(apiRequest).mockRejectedValueOnce(apiError);

    const { result } = renderHook(() => useUpdateEvent(), { wrapper });

    result.current.mutate({
      eventId: "event-123",
      data: mockUpdateInput,
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(apiError);
  });
});

describe("useDeleteEvent", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockEvent: Event = {
    id: "event-123",
    tripId: "trip-123",
    createdBy: "user-123",
    name: "Event to Delete",
    description: null,
    eventType: "activity",
    location: null,
    meetupLocation: null,
    meetupTime: null,
    startTime: new Date(),
    endTime: null,
    allDay: false,
    isOptional: false,
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

  it("deletes an event successfully", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockResolvedValueOnce({ success: true });

    queryClient.setQueryData(["events", "detail", "event-123"], mockEvent);
    queryClient.setQueryData(["events", "list", "trip-123"], [mockEvent]);

    const { result } = renderHook(() => useDeleteEvent(), { wrapper });

    result.current.mutate("event-123");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiRequest).toHaveBeenCalledWith("/events/event-123", {
      method: "DELETE",
    });
  });

  it("removes event from cache optimistically", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ success: true }), 100);
        }),
    );

    queryClient.setQueryData(["events", "detail", "event-123"], mockEvent);
    queryClient.setQueryData(["events", "list", "trip-123"], [mockEvent]);

    const { result } = renderHook(() => useDeleteEvent(), { wrapper });

    result.current.mutate("event-123");

    await waitFor(() => {
      const cachedEvents = queryClient.getQueryData<Event[]>([
        "events",
        "list",
        "trip-123",
      ]);
      expect(cachedEvents).toEqual([]);
    });
  });
});

describe("useRestoreEvent", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  const mockEvent: Event = {
    id: "event-123",
    tripId: "trip-123",
    createdBy: "user-123",
    name: "Restored Event",
    description: null,
    eventType: "activity",
    location: null,
    meetupLocation: null,
    meetupTime: null,
    startTime: new Date(),
    endTime: null,
    allDay: false,
    isOptional: false,
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

  it("restores an event successfully", async () => {
    const { apiRequest } = await import("@/lib/api");
    const restoredEvent = { ...mockEvent, deletedAt: null, deletedBy: null };
    vi.mocked(apiRequest).mockResolvedValueOnce({
      success: true,
      event: restoredEvent,
    });

    queryClient.setQueryData(["events", "detail", "event-123"], mockEvent);
    queryClient.setQueryData(["events", "list", "trip-123"], []);

    const { result } = renderHook(() => useRestoreEvent(), { wrapper });

    result.current.mutate("event-123");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiRequest).toHaveBeenCalledWith("/events/event-123/restore", {
      method: "POST",
    });
    expect(result.current.data).toEqual(restoredEvent);
  });
});

describe("error message helpers", () => {
  it("getCreateEventErrorMessage handles PERMISSION_DENIED", () => {
    const error = new APIError("PERMISSION_DENIED", "No permission");
    expect(getCreateEventErrorMessage(error)).toBe(
      "You don't have permission to add events to this trip.",
    );
  });

  it("getUpdateEventErrorMessage handles NOT_FOUND", () => {
    const error = new APIError("NOT_FOUND", "Event not found");
    expect(getUpdateEventErrorMessage(error)).toBe("Event not found.");
  });

  it("getDeleteEventErrorMessage handles network errors", () => {
    const error = new Error("fetch failed");
    expect(getDeleteEventErrorMessage(error)).toBe(
      "Network error: Please check your connection and try again.",
    );
  });

  it("getRestoreEventErrorMessage handles UNAUTHORIZED", () => {
    const error = new APIError("UNAUTHORIZED", "Not authenticated");
    expect(getRestoreEventErrorMessage(error)).toBe(
      "You must be logged in to restore an event.",
    );
  });
});
