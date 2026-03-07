import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useInvitations,
  useMembers,
  useInviteMembers,
  useRevokeInvitation,
  useUpdateRsvp,
  useUpdateMemberRole,
  useMySettings,
  useUpdateMySettings,
  getInviteMembersErrorMessage,
  getRevokeInvitationErrorMessage,
  getUpdateRsvpErrorMessage,
  getUpdateMemberRoleErrorMessage,
  getUpdateMySettingsErrorMessage,
  type Invitation,
  type MemberWithProfile,
} from "../use-invitations";
import { APIError } from "@/lib/api";

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

const mockInvitations: Invitation[] = [
  {
    id: "inv-1",
    tripId: "trip-123",
    inviterId: "user-1",
    inviteePhone: "+14155551234",
    status: "pending",
    sentAt: "2026-02-06T12:00:00Z",
    respondedAt: null,
    createdAt: "2026-02-06T12:00:00Z",
    updatedAt: "2026-02-06T12:00:00Z",
  },
];

const mockMembers: MemberWithProfile[] = [
  {
    id: "member-1",
    userId: "user-1",
    displayName: "John Doe",
    profilePhotoUrl: "https://example.com/john.jpg",
    status: "going",
    isOrganizer: true,
    createdAt: "2026-02-06T12:00:00Z",
    handles: null,
  },
  {
    id: "member-2",
    userId: "user-2",
    displayName: "Jane Smith",
    profilePhotoUrl: null,
    phoneNumber: "+14155555678",
    status: "maybe",
    isOrganizer: false,
    createdAt: "2026-02-06T13:00:00Z",
    handles: null,
  },
];

describe("useInvitations", () => {
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

  describe("successful invitations fetch", () => {
    it("fetches invitations successfully", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        invitations: mockInvitations,
      });

      const { result } = renderHook(() => useInvitations("trip-123"), {
        wrapper,
      });

      expect(result.current.isPending).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockInvitations);
      expect(apiRequest).toHaveBeenCalledWith(
        "/trips/trip-123/invitations",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("returns empty array when no invitations exist", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        invitations: [],
      });

      const { result } = renderHook(() => useInvitations("trip-123"), {
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

      const { result } = renderHook(() => useInvitations("trip-123"), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(apiError);
    });
  });
});

describe("useMembers", () => {
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

  describe("successful members fetch", () => {
    it("fetches members successfully", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        members: mockMembers,
      });

      const { result } = renderHook(() => useMembers("trip-123"), { wrapper });

      expect(result.current.isPending).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockMembers);
      expect(apiRequest).toHaveBeenCalledWith(
        "/trips/trip-123/members",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("returns empty array when no members exist", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        members: [],
      });

      const { result } = renderHook(() => useMembers("trip-123"), { wrapper });

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

      const { result } = renderHook(() => useMembers("trip-123"), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(apiError);
    });
  });
});

describe("useInviteMembers", () => {
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

  describe("successful batch invite", () => {
    it("invites members successfully", async () => {
      const { apiRequest } = await import("@/lib/api");
      const mockResponse = {
        success: true as const,
        invitations: mockInvitations,
        skipped: [],
      };
      vi.mocked(apiRequest).mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useInviteMembers("trip-123"), {
        wrapper,
      });

      result.current.mutate({ phoneNumbers: ["+14155551234"] });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiRequest).toHaveBeenCalledWith("/trips/trip-123/invitations", {
        method: "POST",
        body: JSON.stringify({ phoneNumbers: ["+14155551234"] }),
      });
      expect(result.current.data).toEqual(mockResponse);
    });

    it("invalidates invitations and members queries on success", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        invitations: mockInvitations,
        skipped: [],
      });

      queryClient.setQueryData(["invitations", "list", "trip-123"], []);
      queryClient.setQueryData(["members", "list", "trip-123"], []);
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useInviteMembers("trip-123"), {
        wrapper,
      });

      result.current.mutate({ phoneNumbers: ["+14155551234"] });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["invitations", "list", "trip-123"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["members", "list", "trip-123"],
      });
    });
  });

  describe("error handling", () => {
    it("handles PERMISSION_DENIED error", async () => {
      const { apiRequest } = await import("@/lib/api");
      const apiError = new APIError("PERMISSION_DENIED", "No permission");
      vi.mocked(apiRequest).mockRejectedValueOnce(apiError);

      const { result } = renderHook(() => useInviteMembers("trip-123"), {
        wrapper,
      });

      result.current.mutate({ phoneNumbers: ["+14155551234"] });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(apiError);
    });
  });
});

describe("useRevokeInvitation", () => {
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

  describe("successful revocation", () => {
    it("revokes an invitation successfully", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useRevokeInvitation("trip-123"), {
        wrapper,
      });

      result.current.mutate("inv-1");

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiRequest).toHaveBeenCalledWith("/invitations/inv-1", {
        method: "DELETE",
      });
    });

    it("invalidates invitations and members queries on success", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({ success: true });

      queryClient.setQueryData(
        ["invitations", "list", "trip-123"],
        mockInvitations,
      );
      queryClient.setQueryData(["members", "list", "trip-123"], mockMembers);
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useRevokeInvitation("trip-123"), {
        wrapper,
      });

      result.current.mutate("inv-1");

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["invitations", "list", "trip-123"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["members", "list", "trip-123"],
      });
    });
  });

  describe("error handling", () => {
    it("handles PERMISSION_DENIED error", async () => {
      const { apiRequest } = await import("@/lib/api");
      const apiError = new APIError("PERMISSION_DENIED", "No permission");
      vi.mocked(apiRequest).mockRejectedValueOnce(apiError);

      const { result } = renderHook(() => useRevokeInvitation("trip-123"), {
        wrapper,
      });

      result.current.mutate("inv-1");

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(apiError);
    });
  });
});

describe("useUpdateRsvp", () => {
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

  describe("successful RSVP update", () => {
    it("updates RSVP status successfully", async () => {
      const { apiRequest } = await import("@/lib/api");
      const mockMember = mockMembers[0];
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        member: mockMember,
      });

      const { result } = renderHook(() => useUpdateRsvp("trip-123"), {
        wrapper,
      });

      result.current.mutate({ status: "going" });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiRequest).toHaveBeenCalledWith("/trips/trip-123/rsvp", {
        method: "POST",
        body: JSON.stringify({ status: "going" }),
      });
      expect(result.current.data).toEqual(mockMember);
    });

    it("invalidates trip detail, trips list, and members queries on success", async () => {
      const { apiRequest } = await import("@/lib/api");
      vi.mocked(apiRequest).mockResolvedValueOnce({
        success: true,
        member: mockMembers[0],
      });

      queryClient.setQueryData(["trips", "trip-123"], {});
      queryClient.setQueryData(["trips"], []);
      queryClient.setQueryData(["members", "list", "trip-123"], mockMembers);
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useUpdateRsvp("trip-123"), {
        wrapper,
      });

      result.current.mutate({ status: "maybe" });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["trips", "trip-123"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["trips"],
        exact: true,
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["members", "list", "trip-123"],
      });
    });
  });

  describe("error handling", () => {
    it("handles PERMISSION_DENIED error", async () => {
      const { apiRequest } = await import("@/lib/api");
      const apiError = new APIError("PERMISSION_DENIED", "No permission");
      vi.mocked(apiRequest).mockRejectedValueOnce(apiError);

      const { result } = renderHook(() => useUpdateRsvp("trip-123"), {
        wrapper,
      });

      result.current.mutate({ status: "going" });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(apiError);
    });
  });
});

describe("error message helpers", () => {
  describe("getInviteMembersErrorMessage", () => {
    it("returns null for no error", () => {
      expect(getInviteMembersErrorMessage(null)).toBe(null);
    });

    it("handles PERMISSION_DENIED", () => {
      const error = new APIError("PERMISSION_DENIED", "No permission");
      expect(getInviteMembersErrorMessage(error)).toBe(
        "You don't have permission to invite members to this trip.",
      );
    });

    it("handles MEMBER_LIMIT_EXCEEDED", () => {
      const error = new APIError(
        "MEMBER_LIMIT_EXCEEDED",
        "Member limit exceeded",
      );
      expect(getInviteMembersErrorMessage(error)).toBe(
        "Cannot invite more members: the trip has reached the maximum member limit.",
      );
    });

    it("handles VALIDATION_ERROR", () => {
      const error = new APIError("VALIDATION_ERROR", "Invalid data");
      expect(getInviteMembersErrorMessage(error)).toBe(
        "Please check your input and try again.",
      );
    });

    it("handles UNAUTHORIZED", () => {
      const error = new APIError("UNAUTHORIZED", "Not authenticated");
      expect(getInviteMembersErrorMessage(error)).toBe(
        "You must be logged in to invite members.",
      );
    });

    it("handles unknown APIError codes", () => {
      const error = new APIError("UNKNOWN_ERROR", "Something went wrong");
      expect(getInviteMembersErrorMessage(error)).toBe("Something went wrong");
    });

    it("handles network errors", () => {
      const error = new Error("fetch failed");
      expect(getInviteMembersErrorMessage(error)).toBe(
        "Network error: Please check your connection and try again.",
      );
    });

    it("handles generic errors", () => {
      const error = new Error("Something unexpected happened");
      expect(getInviteMembersErrorMessage(error)).toBe(
        "An unexpected error occurred. Please try again.",
      );
    });
  });

  describe("getRevokeInvitationErrorMessage", () => {
    it("returns null for no error", () => {
      expect(getRevokeInvitationErrorMessage(null)).toBe(null);
    });

    it("handles PERMISSION_DENIED", () => {
      const error = new APIError("PERMISSION_DENIED", "No permission");
      expect(getRevokeInvitationErrorMessage(error)).toBe(
        "You don't have permission to revoke this invitation.",
      );
    });

    it("handles INVITATION_NOT_FOUND", () => {
      const error = new APIError(
        "INVITATION_NOT_FOUND",
        "Invitation not found",
      );
      expect(getRevokeInvitationErrorMessage(error)).toBe(
        "Invitation not found.",
      );
    });

    it("handles UNAUTHORIZED", () => {
      const error = new APIError("UNAUTHORIZED", "Not authenticated");
      expect(getRevokeInvitationErrorMessage(error)).toBe(
        "You must be logged in to revoke an invitation.",
      );
    });

    it("handles network errors", () => {
      const error = new Error("fetch failed");
      expect(getRevokeInvitationErrorMessage(error)).toBe(
        "Network error: Please check your connection and try again.",
      );
    });

    it("handles generic errors", () => {
      const error = new Error("Something unexpected happened");
      expect(getRevokeInvitationErrorMessage(error)).toBe(
        "An unexpected error occurred. Please try again.",
      );
    });
  });

  describe("getUpdateRsvpErrorMessage", () => {
    it("returns null for no error", () => {
      expect(getUpdateRsvpErrorMessage(null)).toBe(null);
    });

    it("handles PERMISSION_DENIED", () => {
      const error = new APIError("PERMISSION_DENIED", "No permission");
      expect(getUpdateRsvpErrorMessage(error)).toBe(
        "You don't have permission to update your RSVP for this trip.",
      );
    });

    it("handles NOT_FOUND", () => {
      const error = new APIError("NOT_FOUND", "Trip not found");
      expect(getUpdateRsvpErrorMessage(error)).toBe("Trip not found.");
    });

    it("handles VALIDATION_ERROR", () => {
      const error = new APIError("VALIDATION_ERROR", "Invalid data");
      expect(getUpdateRsvpErrorMessage(error)).toBe(
        "Please check your input and try again.",
      );
    });

    it("handles UNAUTHORIZED", () => {
      const error = new APIError("UNAUTHORIZED", "Not authenticated");
      expect(getUpdateRsvpErrorMessage(error)).toBe(
        "You must be logged in to update your RSVP.",
      );
    });

    it("handles network errors", () => {
      const error = new Error("fetch failed");
      expect(getUpdateRsvpErrorMessage(error)).toBe(
        "Network error: Please check your connection and try again.",
      );
    });

    it("handles generic errors", () => {
      const error = new Error("Something unexpected happened");
      expect(getUpdateRsvpErrorMessage(error)).toBe(
        "An unexpected error occurred. Please try again.",
      );
    });
  });

  describe("getUpdateMemberRoleErrorMessage", () => {
    it("returns null for null error", () => {
      expect(getUpdateMemberRoleErrorMessage(null)).toBe(null);
    });

    it("returns correct message for PERMISSION_DENIED", () => {
      const error = new APIError("PERMISSION_DENIED", "No permission");
      expect(getUpdateMemberRoleErrorMessage(error)).toBe(
        "You don't have permission to change member roles.",
      );
    });

    it("returns correct message for CANNOT_DEMOTE_CREATOR", () => {
      const error = new APIError(
        "CANNOT_DEMOTE_CREATOR",
        "Cannot demote creator",
      );
      expect(getUpdateMemberRoleErrorMessage(error)).toBe(
        "The trip creator's role cannot be changed.",
      );
    });

    it("returns correct message for CANNOT_MODIFY_OWN_ROLE", () => {
      const error = new APIError(
        "CANNOT_MODIFY_OWN_ROLE",
        "Cannot modify own role",
      );
      expect(getUpdateMemberRoleErrorMessage(error)).toBe(
        "You cannot change your own role.",
      );
    });

    it("returns correct message for LAST_ORGANIZER", () => {
      const error = new APIError("LAST_ORGANIZER", "Last organizer");
      expect(getUpdateMemberRoleErrorMessage(error)).toBe(
        "Cannot remove the last organizer.",
      );
    });

    it("returns correct message for MEMBER_NOT_FOUND", () => {
      const error = new APIError("MEMBER_NOT_FOUND", "Member not found");
      expect(getUpdateMemberRoleErrorMessage(error)).toBe("Member not found.");
    });

    it("handles network errors", () => {
      const error = new Error("fetch failed");
      expect(getUpdateMemberRoleErrorMessage(error)).toBe(
        "Network error: Please check your connection and try again.",
      );
    });

    it("returns fallback for unknown error", () => {
      const error = new Error("Something unexpected happened");
      expect(getUpdateMemberRoleErrorMessage(error)).toBe(
        "An unexpected error occurred. Please try again.",
      );
    });
  });
});

describe("useUpdateMemberRole", () => {
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

  it("calls PATCH endpoint with correct body", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useUpdateMemberRole("trip-123"), {
      wrapper,
    });

    result.current.mutate({ memberId: "member-456", isOrganizer: true });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/trips/trip-123/members/member-456",
      {
        method: "PATCH",
        body: JSON.stringify({ isOrganizer: true }),
      },
    );
  });

  it("invalidates correct queries on settled", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockResolvedValueOnce({ success: true });

    queryClient.setQueryData(["invitations", "list", "trip-123"], []);
    queryClient.setQueryData(["members", "list", "trip-123"], mockMembers);
    queryClient.setQueryData(["trips", "trip-123"], {});
    queryClient.setQueryData(["trips"], []);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateMemberRole("trip-123"), {
      wrapper,
    });

    result.current.mutate({ memberId: "member-456", isOrganizer: false });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["invitations", "list", "trip-123"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["members", "list", "trip-123"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["trips", "trip-123"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["trips"],
      exact: true,
    });
  });
});

describe("useMySettings", () => {
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

  it("fetches my-settings successfully", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockResolvedValueOnce({
      success: true,
      sharePhone: true,
    });

    const { result } = renderHook(() => useMySettings("trip-123"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
      sharePhone: true,
      calendarExcluded: undefined,
    });
  });

  it("handles error", async () => {
    const { apiRequest } = await import("@/lib/api");
    const apiError = new APIError("UNAUTHORIZED", "Not authenticated");
    vi.mocked(apiRequest).mockRejectedValueOnce(apiError);

    const { result } = renderHook(() => useMySettings("trip-123"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("useUpdateMySettings", () => {
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

  it("calls PATCH endpoint with correct body", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockResolvedValueOnce({
      success: true,
      sharePhone: true,
    });

    const { result } = renderHook(() => useUpdateMySettings("trip-123"), {
      wrapper,
    });

    result.current.mutate({ sharePhone: true });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiRequest).toHaveBeenCalledWith("/trips/trip-123/my-settings", {
      method: "PATCH",
      body: JSON.stringify({ sharePhone: true }),
    });
  });

  it("invalidates correct queries on settled", async () => {
    const { apiRequest } = await import("@/lib/api");
    vi.mocked(apiRequest).mockResolvedValueOnce({
      success: true,
      sharePhone: true,
    });

    queryClient.setQueryData(["mySettings", "trip-123"], false);
    queryClient.setQueryData(["members", "list", "trip-123"], mockMembers);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateMySettings("trip-123"), {
      wrapper,
    });

    result.current.mutate({ sharePhone: true });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["mySettings", "trip-123"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["members", "list", "trip-123"],
    });
  });
});

describe("getUpdateMySettingsErrorMessage", () => {
  it("returns null for no error", () => {
    expect(getUpdateMySettingsErrorMessage(null)).toBe(null);
  });

  it("handles PERMISSION_DENIED", () => {
    const error = new APIError("PERMISSION_DENIED", "No permission");
    expect(getUpdateMySettingsErrorMessage(error)).toBe(
      "You don't have permission to update these settings.",
    );
  });

  it("handles MEMBER_NOT_FOUND", () => {
    const error = new APIError("MEMBER_NOT_FOUND", "Member not found");
    expect(getUpdateMySettingsErrorMessage(error)).toBe(
      "You are not a member of this trip.",
    );
  });

  it("handles UNAUTHORIZED error", () => {
    const error = new APIError("UNAUTHORIZED", "Not authorized");
    expect(getUpdateMySettingsErrorMessage(error)).toBe(
      "Please sign in to update your settings.",
    );
  });

  it("handles VALIDATION_ERROR", () => {
    const error = new APIError("VALIDATION_ERROR", "Invalid data");
    expect(getUpdateMySettingsErrorMessage(error)).toBe(
      "Invalid settings data. Please try again.",
    );
  });

  it("handles network errors", () => {
    const error = new Error("fetch failed");
    expect(getUpdateMySettingsErrorMessage(error)).toBe(
      "Network error: Please check your connection and try again.",
    );
  });

  it("handles generic errors", () => {
    const error = new Error("Something unexpected happened");
    expect(getUpdateMySettingsErrorMessage(error)).toBe(
      "An unexpected error occurred. Please try again.",
    );
  });
});
