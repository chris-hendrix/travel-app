import createError from "@fastify/error";

// Auth errors
export const UnauthorizedError = createError("UNAUTHORIZED", "%s", 401);
export const ProfileIncompleteError = createError(
  "PROFILE_INCOMPLETE",
  "%s",
  403,
);

// Trip errors
export const TripNotFoundError = createError(
  "NOT_FOUND",
  "Trip not found",
  404,
);
export const PermissionDeniedError = createError(
  "PERMISSION_DENIED",
  "%s",
  403,
);
export const TripLockedError = createError(
  "TRIP_LOCKED",
  "This trip has ended and is now read-only",
  403,
);
export const MemberLimitExceededError = createError(
  "MEMBER_LIMIT_EXCEEDED",
  "%s",
  400,
);
export const CoOrganizerNotFoundError = createError(
  "CO_ORGANIZER_NOT_FOUND",
  "%s",
  400,
);
export const CannotRemoveCreatorError = createError(
  "CANNOT_REMOVE_CREATOR",
  "Cannot remove trip creator as co-organizer",
  400,
);
export const DuplicateMemberError = createError("DUPLICATE_MEMBER", "%s", 409);
export const CoOrganizerNotInTripError = createError(
  "CO_ORGANIZER_NOT_IN_TRIP",
  "Co-organizer not found in trip",
  404,
);

// Itinerary errors
export const EventNotFoundError = createError(
  "EVENT_NOT_FOUND",
  "Event not found",
  404,
);
export const AccommodationNotFoundError = createError(
  "ACCOMMODATION_NOT_FOUND",
  "Accommodation not found",
  404,
);
export const MemberTravelNotFoundError = createError(
  "MEMBER_TRAVEL_NOT_FOUND",
  "Member travel not found",
  404,
);
export const EventConflictError = createError("EVENT_CONFLICT", "%s", 409);
export const InvalidDateRangeError = createError(
  "INVALID_DATE_RANGE",
  "%s",
  400,
);
export const InvalidCursorError = createError("INVALID_CURSOR", "%s", 400);

// Upload errors
export const FileTooLargeError = createError("FILE_TOO_LARGE", "%s", 400);
export const InvalidFileTypeError = createError("INVALID_FILE_TYPE", "%s", 400);

// Photo errors
export const PhotoNotFoundError = createError(
  "PHOTO_NOT_FOUND",
  "Photo not found",
  404,
);
export const PhotoLimitExceededError = createError(
  "PHOTO_LIMIT_EXCEEDED",
  "%s",
  400,
);

// Invitation errors
export const InvitationNotFoundError = createError(
  "INVITATION_NOT_FOUND",
  "Invitation not found",
  404,
);
export const NotAMutualError = createError("NOT_A_MUTUAL", "%s", 403);

// Member removal errors
export const MemberNotFoundError = createError(
  "MEMBER_NOT_FOUND",
  "Member not found",
  404,
);
export const LastOrganizerError = createError(
  "LAST_ORGANIZER",
  "Cannot remove the last organizer of a trip",
  400,
);

// Member role errors
export const CannotDemoteCreatorError = createError(
  "CANNOT_DEMOTE_CREATOR",
  "Cannot change the role of the trip creator",
  400,
);
export const CannotModifyOwnRoleError = createError(
  "CANNOT_MODIFY_OWN_ROLE",
  "Cannot modify your own organizer role",
  400,
);

// Entity count limit errors
export const EventLimitExceededError = createError(
  "EVENT_LIMIT_EXCEEDED",
  "%s",
  400,
);
export const AccommodationLimitExceededError = createError(
  "ACCOMMODATION_LIMIT_EXCEEDED",
  "%s",
  400,
);
export const MemberTravelLimitExceededError = createError(
  "MEMBER_TRAVEL_LIMIT_EXCEEDED",
  "%s",
  400,
);

// Messaging errors
export const MessageNotFoundError = createError(
  "MESSAGE_NOT_FOUND",
  "Message not found",
  404,
);
export const MemberMutedError = createError(
  "MEMBER_MUTED",
  "You have been muted and cannot post messages",
  403,
);
export const MessageLimitExceededError = createError(
  "MESSAGE_LIMIT_EXCEEDED",
  "Maximum 100 messages per trip reached",
  409,
);
export const InvalidReplyTargetError = createError(
  "INVALID_REPLY_TARGET",
  "Can only reply to top-level messages",
  400,
);
export const PinOnReplyError = createError(
  "PIN_ON_REPLY",
  "Can only pin top-level messages",
  400,
);
export const AlreadyMutedError = createError(
  "ALREADY_MUTED",
  "Member is already muted",
  409,
);
export const NotMutedError = createError(
  "NOT_MUTED",
  "Member is not muted",
  404,
);
export const CannotMuteOrganizerError = createError(
  "CANNOT_MUTE_ORGANIZER",
  "Cannot mute an organizer",
  403,
);
export const DailyMessageLimitError = createError(
  "DAILY_MESSAGE_LIMIT",
  "Maximum 200 messages per day per trip reached",
  429,
);

// Notification errors
export const NotificationNotFoundError = createError(
  "NOTIFICATION_NOT_FOUND",
  "Notification not found",
  404,
);

// Generic
export const InvalidCodeError = createError("INVALID_CODE", "%s", 400);
export const AccountLockedError = createError("ACCOUNT_LOCKED", "%s", 429);
