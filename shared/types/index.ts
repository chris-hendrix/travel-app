// Shared TypeScript types for the Journiful platform

/**
 * Standardized API response wrapper with discriminated union pattern
 * @template T The type of data being returned on success
 */
export type ApiResponse<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: ErrorResponse;
    };

/**
 * Paginated response wrapper for list endpoints
 * @template T The type of items in the data array
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Standardized error response structure
 */
export interface ErrorResponse {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Re-export user-related types
export type { User, AuthResponse } from "./user";

// Re-export trip-related types
export type {
  Trip,
  TripSummary,
  TripDetail,
  GetTripsResponse,
  GetTripResponse,
  CreateTripResponse,
  UpdateTripResponse,
} from "./trip";

// Re-export event-related types
export type {
  Event,
  GetEventsResponse,
  GetEventResponse,
  CreateEventResponse,
  UpdateEventResponse,
  RestoreEventResponse,
} from "./event";

// Re-export accommodation-related types
export type {
  Accommodation,
  GetAccommodationsResponse,
  GetAccommodationResponse,
  CreateAccommodationResponse,
  UpdateAccommodationResponse,
  RestoreAccommodationResponse,
} from "./accommodation";

// Re-export member travel-related types
export type {
  MemberTravel,
  GetMemberTravelsResponse,
  GetMemberTravelResponse,
  CreateMemberTravelResponse,
  UpdateMemberTravelResponse,
  RestoreMemberTravelResponse,
} from "./member-travel";

// Re-export invitation-related types
export type {
  Invitation,
  MemberWithProfile,
  CreateInvitationsResponse,
  GetInvitationsResponse,
  UpdateRsvpResponse,
  GetMembersResponse,
} from "./invitation";

// Re-export message types
export type {
  Message,
  MessageWithReplies,
  ReactionSummary,
  AllowedReaction,
  GetMessagesResponse,
  GetMessageCountResponse,
  GetLatestMessageResponse,
  CreateMessageResponse,
  UpdateMessageResponse,
  ToggleReactionResponse,
} from "./message";

export { ALLOWED_REACTIONS, REACTION_EMOJI_MAP } from "./message";

// Re-export notification types
export type {
  NotificationType,
  Notification,
  NotificationPreferences,
  GetNotificationsResponse,
  GetUnreadCountResponse,
  GetNotificationPreferencesResponse,
  UpdateNotificationPreferencesResponse,
} from "./notification";

// Re-export mutuals types
export type { Mutual, GetMutualsResponse } from "./mutuals";

// Re-export theme types
export { THEME_FONT_VALUES } from "./theme";
export type { ThemeFont, ThemeBackground, ThemePreset } from "./theme";

// Re-export weather types
export type {
  TemperatureUnit,
  DailyForecast,
  TripWeatherResponse,
} from "./weather";

// Re-export photo types
export type {
  PhotoStatus,
  Photo,
  GetPhotosResponse,
  UploadPhotosResponse,
  UpdatePhotoResponse,
} from "./photo";
