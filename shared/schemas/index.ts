// Shared Zod validation schemas for the Tripful platform

import { z } from "zod";

// Phone number validation (canonical source)
export { phoneNumberSchema, PHONE_REGEX } from "./phone";

/**
 * Validates email addresses using Zod's built-in email validator
 */
export const emailSchema = z.email({
  error: "Invalid email address",
});

/**
 * Validates UUID strings (v4 format)
 */
export const uuidSchema = z.uuid({
  error: "Invalid UUID format",
});

// Re-export authentication schemas
export {
  requestCodeSchema,
  verifyCodeSchema,
  completeProfileSchema,
  userResponseSchema,
  requestCodeResponseSchema,
  verifyCodeResponseSchema,
  completeProfileResponseSchema,
  getMeResponseSchema,
  logoutResponseSchema,
  type RequestCodeInput,
  type VerifyCodeInput,
  type CompleteProfileInput,
} from "./auth";

// Re-export trip schemas
export {
  createTripSchema,
  updateTripSchema,
  addCoOrganizerSchema,
  cursorPaginationSchema,
  successResponseSchema,
  tripListResponseSchema,
  tripDetailResponseSchema,
  tripResponseSchema,
  type CreateTripInput,
  type UpdateTripInput,
  type AddCoOrganizerInput,
  type CursorPaginationInput,
} from "./trip";

// Re-export event schemas
export {
  createEventSchema,
  updateEventSchema,
  eventListResponseSchema,
  eventResponseSchema,
  type CreateEventInput,
  type UpdateEventInput,
} from "./event";

// Re-export accommodation schemas
export {
  createAccommodationSchema,
  updateAccommodationSchema,
  accommodationListResponseSchema,
  accommodationResponseSchema,
  type CreateAccommodationInput,
  type UpdateAccommodationInput,
} from "./accommodation";

// Re-export member travel schemas
export {
  createMemberTravelSchema,
  updateMemberTravelSchema,
  memberTravelListResponseSchema,
  memberTravelResponseSchema,
  type CreateMemberTravelInput,
  type UpdateMemberTravelInput,
} from "./member-travel";

// Re-export invitation schemas
export {
  createInvitationsSchema,
  updateRsvpSchema,
  updateMySettingsSchema,
  mySettingsResponseSchema,
  createInvitationsResponseSchema,
  getInvitationsResponseSchema,
  updateRsvpResponseSchema,
  getMembersResponseSchema,
  type CreateInvitationsInput,
  type UpdateRsvpInput,
  type UpdateMySettingsInput,
} from "./invitation";

// Re-export member schemas
export { updateMemberRoleSchema, type UpdateMemberRoleInput } from "./member";

// Re-export user profile schemas
export {
  ALLOWED_HANDLE_PLATFORMS,
  type HandlePlatform,
  userHandlesSchema,
  updateProfileSchema,
  type UpdateProfileInput,
} from "./user";

// Re-export message schemas
export {
  createMessageSchema,
  updateMessageSchema,
  toggleReactionSchema,
  pinMessageSchema,
  messageListResponseSchema,
  messageCountResponseSchema,
  latestMessageResponseSchema,
  messageResponseSchema,
  toggleReactionResponseSchema,
  type CreateMessageInput,
  type UpdateMessageInput,
  type ToggleReactionInput,
  type PinMessageInput,
} from "./message";

// Re-export notification schemas
export {
  notificationPreferencesSchema,
  notificationListResponseSchema,
  unreadCountResponseSchema,
  notificationPreferencesResponseSchema,
  type NotificationPreferencesInput,
} from "./notification";

// Re-export mutuals schemas
export {
  getMutualsQuerySchema,
  getMutualSuggestionsQuerySchema,
  getMutualsResponseSchema,
  type GetMutualsQueryInput,
  type GetMutualSuggestionsQueryInput,
  type GetMutualsResponse,
} from "./mutuals";
