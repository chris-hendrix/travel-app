import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { messageController } from "@/controllers/message.controller.js";
import {
  authenticate,
  requireCompleteProfile,
} from "@/middleware/auth.middleware.js";
import {
  defaultRateLimitConfig,
  writeRateLimitConfig,
} from "@/middleware/rate-limit.middleware.js";
import {
  createMessageSchema,
  updateMessageSchema,
  toggleReactionSchema,
  pinMessageSchema,
  messageListResponseSchema,
  messageCountResponseSchema,
  latestMessageResponseSchema,
  messageResponseSchema,
  toggleReactionResponseSchema,
  successResponseSchema,
} from "@journiful/shared/schemas";
import type {
  CreateMessageInput,
  UpdateMessageInput,
  ToggleReactionInput,
  PinMessageInput,
} from "@journiful/shared/schemas";

// Reusable param schemas
const tripIdParamsSchema = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
});

const messageParamsSchema = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
  messageId: z.string().uuid({ message: "Invalid message ID format" }),
});

const muteParamsSchema = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
  memberId: z.string().uuid({ message: "Invalid member ID format" }),
});

// Cursor-based pagination query schema
const paginationQuerySchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * Message Routes
 * Registers all message-related endpoints
 *
 * Read-only routes (GET) require authentication only.
 * Write routes (POST/PUT/DELETE/PATCH) require authentication and complete profile,
 * applied via a scoped plugin with shared preHandler hooks.
 *
 * @param fastify - Fastify instance
 */
export async function messageRoutes(fastify: FastifyInstance) {
  /**
   * GET /trips/:tripId/messages
   * List paginated messages for a trip
   * Requires authentication only (not complete profile)
   */
  fastify.get<{
    Params: { tripId: string };
    Querystring: { cursor?: string; limit: number };
  }>(
    "/trips/:tripId/messages",
    {
      schema: {
        params: tripIdParamsSchema,
        querystring: paginationQuerySchema,
        response: { 200: messageListResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    messageController.listMessages,
  );

  /**
   * GET /trips/:tripId/messages/count
   * Get message count for a trip
   * Requires authentication only (not complete profile)
   */
  fastify.get<{
    Params: { tripId: string };
  }>(
    "/trips/:tripId/messages/count",
    {
      schema: {
        params: tripIdParamsSchema,
        response: { 200: messageCountResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    messageController.getMessageCount,
  );

  /**
   * GET /trips/:tripId/messages/latest
   * Get the most recent message for a trip
   * Requires authentication only (not complete profile)
   */
  fastify.get<{
    Params: { tripId: string };
  }>(
    "/trips/:tripId/messages/latest",
    {
      schema: {
        params: tripIdParamsSchema,
        response: { 200: latestMessageResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    messageController.getLatestMessage,
  );

  /**
   * Write routes scope
   * All routes registered here share authenticate + requireCompleteProfile hooks
   * with stricter rate limiting for write operations
   */
  fastify.register(async (scope) => {
    scope.addHook("preHandler", scope.rateLimit(writeRateLimitConfig));
    scope.addHook("preHandler", authenticate);
    scope.addHook("preHandler", requireCompleteProfile);

    /**
     * POST /trips/:tripId/messages
     * Create a new message or reply
     */
    scope.post<{ Params: { tripId: string }; Body: CreateMessageInput }>(
      "/trips/:tripId/messages",
      {
        schema: {
          params: tripIdParamsSchema,
          body: createMessageSchema,
          response: { 201: messageResponseSchema },
        },
      },
      messageController.createMessage,
    );

    /**
     * PUT /trips/:tripId/messages/:messageId
     * Edit a message's content
     */
    scope.put<{
      Params: { tripId: string; messageId: string };
      Body: UpdateMessageInput;
    }>(
      "/trips/:tripId/messages/:messageId",
      {
        schema: {
          params: messageParamsSchema,
          body: updateMessageSchema,
          response: { 200: messageResponseSchema },
        },
      },
      messageController.editMessage,
    );

    /**
     * DELETE /trips/:tripId/messages/:messageId
     * Soft-delete a message
     */
    scope.delete<{ Params: { tripId: string; messageId: string } }>(
      "/trips/:tripId/messages/:messageId",
      {
        schema: {
          params: messageParamsSchema,
          response: { 200: successResponseSchema },
        },
      },
      messageController.deleteMessage,
    );

    /**
     * PATCH /trips/:tripId/messages/:messageId/pin
     * Pin or unpin a message (organizers only)
     */
    scope.patch<{
      Params: { tripId: string; messageId: string };
      Body: PinMessageInput;
    }>(
      "/trips/:tripId/messages/:messageId/pin",
      {
        schema: {
          params: messageParamsSchema,
          body: pinMessageSchema,
          response: { 200: messageResponseSchema },
        },
      },
      messageController.togglePin,
    );

    /**
     * POST /trips/:tripId/messages/:messageId/reactions
     * Toggle a reaction on a message
     */
    scope.post<{
      Params: { tripId: string; messageId: string };
      Body: ToggleReactionInput;
    }>(
      "/trips/:tripId/messages/:messageId/reactions",
      {
        schema: {
          params: messageParamsSchema,
          body: toggleReactionSchema,
          response: { 200: toggleReactionResponseSchema },
        },
      },
      messageController.toggleReaction,
    );

    /**
     * POST /trips/:tripId/members/:memberId/mute
     * Mute a member (organizers only)
     */
    scope.post<{ Params: { tripId: string; memberId: string } }>(
      "/trips/:tripId/members/:memberId/mute",
      {
        schema: {
          params: muteParamsSchema,
          response: { 200: successResponseSchema },
        },
      },
      messageController.muteMember,
    );

    /**
     * DELETE /trips/:tripId/members/:memberId/mute
     * Unmute a member (organizers only)
     */
    scope.delete<{ Params: { tripId: string; memberId: string } }>(
      "/trips/:tripId/members/:memberId/mute",
      {
        schema: {
          params: muteParamsSchema,
          response: { 200: successResponseSchema },
        },
      },
      messageController.unmuteMember,
    );
  });
}
