// Message validation schemas for the Tripful platform

import { z } from "zod";
import { stripControlChars } from "../utils/sanitize";

/**
 * Validates message creation data
 * - content: 1-2000 characters (required), control chars stripped
 * - parentId: UUID of parent message for threading (optional)
 */
export const createMessageSchema = z.object({
  content: z
    .string()
    .min(1, "Message cannot be empty")
    .max(2000, "Message too long")
    .transform(stripControlChars),
  parentId: z.string().uuid().optional(),
});

/**
 * Validates message update data
 * - content: 1-2000 characters (required), control chars stripped
 */
export const updateMessageSchema = z.object({
  content: z
    .string()
    .min(1, "Message cannot be empty")
    .max(2000, "Message too long")
    .transform(stripControlChars),
});

/**
 * Validates reaction toggle data
 * - emoji: one of the allowed reaction identifiers
 */
export const toggleReactionSchema = z.object({
  emoji: z.enum(["heart", "thumbs_up", "laugh", "surprised", "party", "plane"]),
});

/**
 * Validates message pin/unpin data
 * - pinned: boolean flag
 */
export const pinMessageSchema = z.object({
  pinned: z.boolean(),
});

// --- Response schemas ---

/** Reaction summary as returned by the API */
const reactionSummarySchema = z.object({
  emoji: z.string(),
  count: z.number(),
  reacted: z.boolean(),
  reactorNames: z.array(z.string()),
});

/** Message author as returned by the API */
const messageAuthorSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  profilePhotoUrl: z.string().nullable(),
});

/** Message entity as returned by the API */
const messageEntitySchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  authorId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  content: z.string(),
  isPinned: z.boolean(),
  editedAt: z.date().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  author: messageAuthorSchema,
  reactions: z.array(reactionSummarySchema),
});

/** Message with threaded replies as returned by the API */
const messageWithRepliesEntitySchema = messageEntitySchema.extend({
  replies: z.array(messageEntitySchema),
  replyCount: z.number(),
});

/** GET /api/trips/:tripId/messages - Paginated message list (cursor-based) */
export const messageListResponseSchema = z.object({
  success: z.literal(true),
  messages: z.array(messageWithRepliesEntitySchema),
  meta: z.object({
    total: z.number(),
    limit: z.number(),
    hasMore: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
});

/** GET /api/trips/:tripId/messages/count - Message count */
export const messageCountResponseSchema = z.object({
  success: z.literal(true),
  count: z.number(),
});

/** GET /api/trips/:tripId/messages/latest - Latest message */
export const latestMessageResponseSchema = z.object({
  success: z.literal(true),
  message: messageEntitySchema.nullable(),
});

/** POST/PUT single message */
export const messageResponseSchema = z.object({
  success: z.literal(true),
  message: messageEntitySchema,
});

/** POST /api/trips/:tripId/messages/:messageId/reactions - Toggle reaction */
export const toggleReactionResponseSchema = z.object({
  success: z.literal(true),
  reactions: z.array(reactionSummarySchema),
});

// Inferred TypeScript types from schemas
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export type ToggleReactionInput = z.infer<typeof toggleReactionSchema>;
export type PinMessageInput = z.infer<typeof pinMessageSchema>;
