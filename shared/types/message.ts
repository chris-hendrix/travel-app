// Message types for the Journiful platform

/**
 * Allowed reaction identifiers for messages
 */
export const ALLOWED_REACTIONS = [
  "heart",
  "thumbs_up",
  "laugh",
  "surprised",
  "party",
  "plane",
] as const;
export type AllowedReaction = (typeof ALLOWED_REACTIONS)[number];

/**
 * Maps reaction identifiers to their emoji characters
 */
export const REACTION_EMOJI_MAP: Record<AllowedReaction, string> = {
  heart: "\u2764\uFE0F",
  thumbs_up: "\uD83D\uDC4D",
  laugh: "\uD83D\uDE02",
  surprised: "\uD83D\uDE2E",
  party: "\uD83C\uDF89",
  plane: "\u2708\uFE0F",
};

/**
 * Summary of reactions on a message, including whether the current user reacted
 */
export interface ReactionSummary {
  emoji: string;
  count: number;
  /** Whether the current user has reacted with this emoji */
  reacted: boolean;
  /** Display names of users who reacted with this emoji */
  reactorNames: string[];
}

/**
 * Message entity as returned by the API
 */
export interface Message {
  id: string;
  tripId: string;
  authorId: string;
  parentId: string | null;
  content: string;
  isPinned: boolean;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; displayName: string; profilePhotoUrl: string | null };
  reactions: ReactionSummary[];
}

/**
 * Message with threaded replies
 */
export interface MessageWithReplies extends Message {
  replies: Message[];
  replyCount: number;
}

/**
 * API response for fetching paginated messages (cursor-based)
 */
export interface GetMessagesResponse {
  success: true;
  messages: MessageWithReplies[];
  meta: {
    total: number;
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

/**
 * API response for fetching message count
 */
export interface GetMessageCountResponse {
  success: true;
  count: number;
}

/**
 * API response for fetching the latest message
 */
export interface GetLatestMessageResponse {
  success: true;
  message: Message | null;
}

/**
 * API response for creating a message
 */
export interface CreateMessageResponse {
  success: true;
  message: Message;
}

/**
 * API response for updating a message
 */
export interface UpdateMessageResponse {
  success: true;
  message: Message;
}

/**
 * API response for toggling a reaction on a message
 */
export interface ToggleReactionResponse {
  success: true;
  reactions: ReactionSummary[];
}
