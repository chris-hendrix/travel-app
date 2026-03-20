import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type {
  GetInvitationsResponse,
  GetMembersResponse,
} from "@journiful/shared/types";

/**
 * Query key factory for invitation-related queries
 */
export const invitationKeys = {
  all: ["invitations"] as const,
  lists: () => ["invitations", "list"] as const,
  list: (tripId: string) => ["invitations", "list", tripId] as const,
  create: () => ["invitations", "create"] as const,
  revoke: () => ["invitations", "revoke"] as const,
};

/**
 * Query key factory for member-related queries
 */
export const memberKeys = {
  all: ["members"] as const,
  lists: () => ["members", "list"] as const,
  list: (tripId: string) => ["members", "list", tripId] as const,
  remove: (tripId: string) => ["members", "remove", tripId] as const,
  updateRole: (tripId: string) => ["members", "updateRole", tripId] as const,
};

/**
 * Query key factory for RSVP-related mutations
 */
export const rsvpKeys = {
  update: () => ["rsvp", "update"] as const,
};

/**
 * Query key factory for my-settings-related queries
 */
export const mySettingsKeys = {
  all: ["mySettings"] as const,
  detail: (tripId: string) => ["mySettings", tripId] as const,
  update: () => ["mySettings", "update"] as const,
};

/**
 * Query options for fetching invitations for a trip (organizers only)
 */
export const invitationsQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: invitationKeys.list(tripId),
    staleTime: 2 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetInvitationsResponse>(
        `/trips/${tripId}/invitations`,
        { signal },
      );
      return response.invitations;
    },
  });

/**
 * Query options for fetching members for a trip
 */
export const membersQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: memberKeys.list(tripId),
    staleTime: 2 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetMembersResponse>(
        `/trips/${tripId}/members`,
        { signal },
      );
      return response.members;
    },
  });

/**
 * Query options for fetching my-settings (privacy) for a trip
 */
export interface MySettings {
  sharePhone: boolean;
  calendarExcluded: boolean;
}

export const mySettingsQueryOptions = (tripId: string) =>
  queryOptions<MySettings>({
    queryKey: mySettingsKeys.detail(tripId),
    staleTime: 2 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<{
        success: true;
        sharePhone: boolean;
        calendarExcluded: boolean;
      }>(`/trips/${tripId}/my-settings`, { signal });
      return {
        sharePhone: response.sharePhone,
        calendarExcluded: response.calendarExcluded,
      };
    },
  });
