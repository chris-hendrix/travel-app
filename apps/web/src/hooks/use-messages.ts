"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { apiRequest, APIError } from "@/lib/api";

const POLLING_ENABLED = process.env.NEXT_PUBLIC_ENABLE_POLLING !== "false";
import type {
  CreateMessageInput,
  UpdateMessageInput,
  ToggleReactionInput,
  PinMessageInput,
} from "@tripful/shared/schemas";
import type {
  Message,
  MessageWithReplies,
  ReactionSummary,
  GetMessagesResponse,
  CreateMessageResponse,
  UpdateMessageResponse,
  ToggleReactionResponse,
} from "@tripful/shared/types";

// Import query keys and options from server-safe module for use in hooks
import {
  messageKeys,
  messagesQueryOptions,
  messageCountQueryOptions,
  latestMessageQueryOptions,
} from "./message-queries";

// Import member keys for mute/unmute cache invalidation
import { memberKeys } from "./invitation-queries";

// Re-export for backward compatibility
export {
  messageKeys,
  messagesQueryOptions,
  messageCountQueryOptions,
  latestMessageQueryOptions,
};

// Re-export types for backward compatibility with existing imports
export type { Message, MessageWithReplies, ReactionSummary };

/**
 * Hook for fetching paginated messages for a trip
 *
 * Features:
 * - Automatic caching: Results are cached with ["messages", "list", tripId] key
 * - Returns full response with messages and pagination meta
 * - Polling: Refetches every 5 seconds when enabled
 *
 * @param tripId - The ID of the trip to fetch messages for
 * @param enabled - Whether polling and fetching are active (default: true)
 * @returns Query object with data, loading, and error state
 */
export function useMessages(tripId: string, enabled?: boolean) {
  return useInfiniteQuery({
    ...messagesQueryOptions(tripId),
    refetchInterval: POLLING_ENABLED ? 5000 : false,
    enabled: (enabled ?? true) && !!tripId,
  });
}

/**
 * Hook for fetching the message count for a trip
 *
 * Features:
 * - Polling: Refetches every 30 seconds
 * - Useful for badge/indicator displays
 *
 * @param tripId - The ID of the trip to fetch message count for
 * @returns Query object with count data
 */
export function useMessageCount(tripId: string) {
  return useQuery({
    ...messageCountQueryOptions(tripId),
    refetchInterval: POLLING_ENABLED ? 30000 : false,
    enabled: !!tripId,
  });
}

/**
 * Hook for fetching the latest message for a trip
 *
 * Features:
 * - Polling: Refetches every 30 seconds
 * - Useful for preview displays
 *
 * @param tripId - The ID of the trip to fetch latest message for
 * @returns Query object with latest message data
 */
export function useLatestMessage(tripId: string) {
  return useQuery({
    ...latestMessageQueryOptions(tripId),
    refetchInterval: POLLING_ENABLED ? 30000 : false,
    enabled: !!tripId,
  });
}

// ---------------------------------------------------------------------------
// Create Message
// ---------------------------------------------------------------------------

/**
 * Context type for create message mutation callbacks
 * Contains previous state for rollback on error
 */
interface CreateMessageContext {
  previousMessages: InfiniteData<GetMessagesResponse> | undefined;
  previousCount: number | undefined;
  previousLatest: Message | null | undefined;
}

/**
 * Hook for creating a new message with optimistic updates
 *
 * Features:
 * - Optimistic updates: Adds message to cache immediately
 * - Error rollback: Reverts optimistic update on failure
 * - Cross-query invalidation: Updates messages list, count, and latest
 *
 * @param tripId - The ID of the trip to create a message in
 * @returns Mutation object with mutate function and state
 */
export function useCreateMessage(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    Message,
    APIError,
    CreateMessageInput,
    CreateMessageContext
  >({
    mutationKey: messageKeys.create(),
    mutationFn: async (data) => {
      const response = await apiRequest<CreateMessageResponse>(
        `/trips/${tripId}/messages`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      );
      return response.message;
    },

    // Optimistic update: Add message to cache immediately
    onMutate: async (data) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: messageKeys.list(tripId) });
      await queryClient.cancelQueries({ queryKey: messageKeys.count(tripId) });
      await queryClient.cancelQueries({
        queryKey: messageKeys.latest(tripId),
      });

      // Snapshot the previous values for rollback
      const previousMessages = queryClient.getQueryData<
        InfiniteData<GetMessagesResponse>
      >(messageKeys.list(tripId));
      const previousCount = queryClient.getQueryData<number>(
        messageKeys.count(tripId),
      );
      const previousLatest = queryClient.getQueryData<Message | null>(
        messageKeys.latest(tripId),
      );

      // Build optimistic message
      const now = new Date().toISOString();
      const optimisticMessage: MessageWithReplies = {
        id: "temp-" + Date.now(),
        tripId,
        authorId: "current-user",
        parentId: data.parentId || null,
        content: data.content,
        isPinned: false,
        editedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        author: {
          id: "current-user",
          displayName: "You",
          profilePhotoUrl: null,
        },
        reactions: [],
        replies: [],
        replyCount: 0,
      };

      // Add optimistic message to first page if messages list exists
      if (previousMessages) {
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.list(tripId),
          {
            ...previousMessages,
            pages: previousMessages.pages.map((page, i) => {
              if (i === 0) {
                return {
                  ...page,
                  messages: [optimisticMessage, ...page.messages],
                  meta: { ...page.meta, total: page.meta.total + 1 },
                };
              }
              return page;
            }),
          },
        );
      }

      // Update count cache
      if (previousCount !== undefined) {
        queryClient.setQueryData<number>(
          messageKeys.count(tripId),
          previousCount + 1,
        );
      }

      // Update latest cache
      queryClient.setQueryData<Message | null>(
        messageKeys.latest(tripId),
        optimisticMessage,
      );

      // Return context with previous data for rollback
      return {
        previousMessages: previousMessages || undefined,
        previousCount,
        previousLatest,
      };
    },

    // On error: Rollback optimistic update
    onError: (_error, _data, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(
          messageKeys.list(tripId),
          context.previousMessages,
        );
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(
          messageKeys.count(tripId),
          context.previousCount,
        );
      }
      if (context?.previousLatest !== undefined) {
        queryClient.setQueryData(
          messageKeys.latest(tripId),
          context.previousLatest,
        );
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: messageKeys.count(tripId) });
      queryClient.invalidateQueries({ queryKey: messageKeys.latest(tripId) });
    },
  });
}

/**
 * Get user-friendly error message from create message mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getCreateMessageErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to send messages in this trip.";
      case "MEMBER_MUTED":
        return "You have been muted and cannot send messages.";
      case "MESSAGE_LIMIT_EXCEEDED":
        return "Message limit reached. Please try again later.";
      case "INVALID_REPLY_TARGET":
        return "You can only reply to top-level messages.";
      case "NOT_FOUND":
        return "Trip not found.";
      case "VALIDATION_ERROR":
        return "Please check your message and try again.";
      case "UNAUTHORIZED":
        return "You must be logged in to send a message.";
      default:
        return error.message;
    }
  }

  // Network errors or other generic errors
  if (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return "Network error: Please check your connection and try again.";
  }

  return "An unexpected error occurred. Please try again.";
}

// ---------------------------------------------------------------------------
// Edit Message
// ---------------------------------------------------------------------------

/**
 * Context type for edit message mutation callbacks
 * Contains previous state for rollback on error
 */
interface EditMessageContext {
  previousMessages: InfiniteData<GetMessagesResponse> | undefined;
}

/**
 * Hook for editing a message with optimistic updates
 *
 * Features:
 * - Optimistic updates: Updates message content in cache immediately
 * - Error rollback: Reverts optimistic update on failure
 *
 * @param tripId - The ID of the trip the message belongs to
 * @returns Mutation object with mutate function and state
 */
export function useEditMessage(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    Message,
    APIError,
    { messageId: string; data: UpdateMessageInput },
    EditMessageContext
  >({
    mutationKey: messageKeys.update(),
    mutationFn: async ({ messageId, data }) => {
      const response = await apiRequest<UpdateMessageResponse>(
        `/trips/${tripId}/messages/${messageId}`,
        {
          method: "PUT",
          body: JSON.stringify(data),
        },
      );
      return response.message;
    },

    // Optimistic update: Update message content in cache immediately
    onMutate: async ({ messageId, data }) => {
      await queryClient.cancelQueries({ queryKey: messageKeys.list(tripId) });

      const previousMessages = queryClient.getQueryData<
        InfiniteData<GetMessagesResponse>
      >(messageKeys.list(tripId));

      if (previousMessages) {
        const now = new Date().toISOString();
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.list(tripId),
          {
            ...previousMessages,
            pages: previousMessages.pages.map((page) => ({
              ...page,
              messages: page.messages.map((msg) => {
                if (msg.id === messageId) {
                  return { ...msg, content: data.content, editedAt: now };
                }
                // Also check replies
                return {
                  ...msg,
                  replies: msg.replies.map((reply) =>
                    reply.id === messageId
                      ? { ...reply, content: data.content, editedAt: now }
                      : reply,
                  ),
                };
              }),
            })),
          },
        );
      }

      return { previousMessages: previousMessages || undefined };
    },

    // On error: Rollback optimistic update
    onError: (_error, _vars, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(
          messageKeys.list(tripId),
          context.previousMessages,
        );
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.list(tripId) });
    },
  });
}

/**
 * Get user-friendly error message from edit message mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getEditMessageErrorMessage(error: Error | null): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to edit this message.";
      case "MESSAGE_NOT_FOUND":
        return "Message not found.";
      case "MEMBER_MUTED":
        return "You have been muted and cannot edit messages.";
      case "VALIDATION_ERROR":
        return "Please check your message and try again.";
      case "UNAUTHORIZED":
        return "You must be logged in to edit a message.";
      default:
        return error.message;
    }
  }

  // Network errors or other generic errors
  if (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return "Network error: Please check your connection and try again.";
  }

  return "An unexpected error occurred. Please try again.";
}

// ---------------------------------------------------------------------------
// Delete Message
// ---------------------------------------------------------------------------

/**
 * Context type for delete message mutation callbacks
 * Contains previous state for rollback on error
 */
interface DeleteMessageContext {
  previousMessages: InfiniteData<GetMessagesResponse> | undefined;
  previousCount: number | undefined;
  previousLatest: Message | null | undefined;
}

/**
 * Hook for deleting (soft deleting) a message with optimistic updates
 *
 * Features:
 * - Optimistic updates: Marks message as deleted in cache immediately (sets deletedAt, clears content)
 * - Does NOT remove from list (soft delete shows placeholder)
 * - Error rollback: Reverts optimistic update on failure
 * - Cross-query invalidation: Updates messages list, count, and latest
 *
 * @param tripId - The ID of the trip the message belongs to
 * @returns Mutation object with mutate function and state
 */
export function useDeleteMessage(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ success: true }, APIError, string, DeleteMessageContext>(
    {
      mutationKey: messageKeys.delete(),
      mutationFn: async (messageId: string) => {
        return await apiRequest<{ success: true }>(
          `/trips/${tripId}/messages/${messageId}`,
          {
            method: "DELETE",
          },
        );
      },

      // Optimistic update: Mark message as deleted in cache
      onMutate: async (messageId) => {
        await queryClient.cancelQueries({ queryKey: messageKeys.list(tripId) });
        await queryClient.cancelQueries({
          queryKey: messageKeys.count(tripId),
        });
        await queryClient.cancelQueries({
          queryKey: messageKeys.latest(tripId),
        });

        const previousMessages = queryClient.getQueryData<
          InfiniteData<GetMessagesResponse>
        >(messageKeys.list(tripId));
        const previousCount = queryClient.getQueryData<number>(
          messageKeys.count(tripId),
        );
        const previousLatest = queryClient.getQueryData<Message | null>(
          messageKeys.latest(tripId),
        );

        // Mark message as soft-deleted (set deletedAt, clear content)
        if (previousMessages) {
          const now = new Date().toISOString();
          queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
            messageKeys.list(tripId),
            {
              ...previousMessages,
              pages: previousMessages.pages.map((page) => ({
                ...page,
                messages: page.messages.map((msg) => {
                  if (msg.id === messageId) {
                    return { ...msg, content: "", deletedAt: now };
                  }
                  // Also check replies
                  return {
                    ...msg,
                    replies: msg.replies.map((reply) =>
                      reply.id === messageId
                        ? { ...reply, content: "", deletedAt: now }
                        : reply,
                    ),
                  };
                }),
              })),
            },
          );
        }

        return {
          previousMessages: previousMessages || undefined,
          previousCount,
          previousLatest,
        };
      },

      // On error: Rollback optimistic update
      onError: (_error, _messageId, context) => {
        if (context?.previousMessages) {
          queryClient.setQueryData(
            messageKeys.list(tripId),
            context.previousMessages,
          );
        }
        if (context?.previousCount !== undefined) {
          queryClient.setQueryData(
            messageKeys.count(tripId),
            context.previousCount,
          );
        }
        if (context?.previousLatest !== undefined) {
          queryClient.setQueryData(
            messageKeys.latest(tripId),
            context.previousLatest,
          );
        }
      },

      // Always invalidate queries after mutation settles (success or error)
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: messageKeys.list(tripId) });
        queryClient.invalidateQueries({ queryKey: messageKeys.count(tripId) });
        queryClient.invalidateQueries({ queryKey: messageKeys.latest(tripId) });
      },
    },
  );
}

/**
 * Get user-friendly error message from delete message mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getDeleteMessageErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to delete this message.";
      case "MESSAGE_NOT_FOUND":
        return "Message not found.";
      case "UNAUTHORIZED":
        return "You must be logged in to delete a message.";
      default:
        return error.message;
    }
  }

  // Network errors or other generic errors
  if (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return "Network error: Please check your connection and try again.";
  }

  return "An unexpected error occurred. Please try again.";
}

// ---------------------------------------------------------------------------
// Toggle Reaction
// ---------------------------------------------------------------------------

/**
 * Context type for toggle reaction mutation callbacks
 * Contains previous state for rollback on error
 */
interface ToggleReactionContext {
  previousMessages: InfiniteData<GetMessagesResponse> | undefined;
}

/**
 * Hook for toggling a reaction on a message with optimistic updates
 *
 * Features:
 * - Optimistic updates: Toggles reaction in cache immediately
 * - If already reacted, decrements count (removes if count reaches 0)
 * - If not reacted, increments count or adds new reaction
 * - Error rollback: Reverts optimistic update on failure
 *
 * @param tripId - The ID of the trip the message belongs to
 * @returns Mutation object with mutate function and state
 */
export function useToggleReaction(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    ReactionSummary[],
    APIError,
    { messageId: string; data: ToggleReactionInput },
    ToggleReactionContext
  >({
    mutationKey: messageKeys.reaction(),
    mutationFn: async ({ messageId, data }) => {
      const response = await apiRequest<ToggleReactionResponse>(
        `/trips/${tripId}/messages/${messageId}/reactions`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      );
      return response.reactions;
    },

    // Optimistic update: Toggle reaction in cache immediately
    onMutate: async ({ messageId, data }) => {
      await queryClient.cancelQueries({ queryKey: messageKeys.list(tripId) });

      const previousMessages = queryClient.getQueryData<
        InfiniteData<GetMessagesResponse>
      >(messageKeys.list(tripId));

      if (previousMessages) {
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.list(tripId),
          {
            ...previousMessages,
            pages: previousMessages.pages.map((page) => ({
              ...page,
              messages: page.messages.map((msg) => {
                if (msg.id === messageId) {
                  return {
                    ...msg,
                    reactions: toggleReactionInList(msg.reactions, data.emoji),
                  };
                }
                // Also check replies
                return {
                  ...msg,
                  replies: msg.replies.map((reply) =>
                    reply.id === messageId
                      ? {
                          ...reply,
                          reactions: toggleReactionInList(
                            reply.reactions,
                            data.emoji,
                          ),
                        }
                      : reply,
                  ),
                };
              }),
            })),
          },
        );
      }

      return { previousMessages: previousMessages || undefined };
    },

    // On error: Rollback optimistic update
    onError: (_error, _vars, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(
          messageKeys.list(tripId),
          context.previousMessages,
        );
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.list(tripId) });
    },
  });
}

/**
 * Helper to toggle a reaction in a reactions array
 * If already reacted, decrements count (removes if 0). Otherwise increments/adds.
 */
function toggleReactionInList(
  reactions: ReactionSummary[],
  emoji: string,
): ReactionSummary[] {
  const existing = reactions.find((r) => r.emoji === emoji);

  if (existing) {
    if (existing.reacted) {
      // User already reacted: remove their reaction
      const newCount = existing.count - 1;
      if (newCount <= 0) {
        return reactions.filter((r) => r.emoji !== emoji);
      }
      return reactions.map((r) =>
        r.emoji === emoji
          ? {
              ...r,
              count: newCount,
              reacted: false,
              reactorNames: r.reactorNames.filter((n) => n !== "You"),
            }
          : r,
      );
    } else {
      // User has not reacted: add their reaction
      return reactions.map((r) =>
        r.emoji === emoji
          ? {
              ...r,
              count: r.count + 1,
              reacted: true,
              reactorNames: [...r.reactorNames, "You"],
            }
          : r,
      );
    }
  }

  // New reaction not in list
  return [
    ...reactions,
    { emoji, count: 1, reacted: true, reactorNames: ["You"] },
  ];
}

/**
 * Get user-friendly error message from toggle reaction mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getToggleReactionErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to react to messages in this trip.";
      case "MESSAGE_NOT_FOUND":
        return "Message not found.";
      case "MEMBER_MUTED":
        return "You have been muted and cannot react to messages.";
      case "VALIDATION_ERROR":
        return "Invalid reaction. Please try again.";
      case "UNAUTHORIZED":
        return "You must be logged in to react to a message.";
      default:
        return error.message;
    }
  }

  // Network errors or other generic errors
  if (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return "Network error: Please check your connection and try again.";
  }

  return "An unexpected error occurred. Please try again.";
}

// ---------------------------------------------------------------------------
// Pin Message
// ---------------------------------------------------------------------------

/**
 * Context type for pin message mutation callbacks
 * Contains previous state for rollback on error
 */
interface PinMessageContext {
  previousMessages: InfiniteData<GetMessagesResponse> | undefined;
}

/**
 * Hook for pinning/unpinning a message with optimistic updates
 *
 * Features:
 * - Optimistic updates: Toggles isPinned in cache immediately
 * - Error rollback: Reverts optimistic update on failure
 *
 * @param tripId - The ID of the trip the message belongs to
 * @returns Mutation object with mutate function and state
 */
export function usePinMessage(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    Message,
    APIError,
    { messageId: string; data: PinMessageInput },
    PinMessageContext
  >({
    mutationKey: messageKeys.pin(),
    mutationFn: async ({ messageId, data }) => {
      const response = await apiRequest<UpdateMessageResponse>(
        `/trips/${tripId}/messages/${messageId}/pin`,
        {
          method: "PATCH",
          body: JSON.stringify(data),
        },
      );
      return response.message;
    },

    // Optimistic update: Toggle isPinned in cache immediately
    onMutate: async ({ messageId, data }) => {
      await queryClient.cancelQueries({ queryKey: messageKeys.list(tripId) });

      const previousMessages = queryClient.getQueryData<
        InfiniteData<GetMessagesResponse>
      >(messageKeys.list(tripId));

      if (previousMessages) {
        queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
          messageKeys.list(tripId),
          {
            ...previousMessages,
            pages: previousMessages.pages.map((page) => ({
              ...page,
              messages: page.messages.map((msg) =>
                msg.id === messageId ? { ...msg, isPinned: data.pinned } : msg,
              ),
            })),
          },
        );
      }

      return { previousMessages: previousMessages || undefined };
    },

    // On error: Rollback optimistic update
    onError: (_error, _vars, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(
          messageKeys.list(tripId),
          context.previousMessages,
        );
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.list(tripId) });
    },
  });
}

/**
 * Get user-friendly error message from pin message mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getPinMessageErrorMessage(error: Error | null): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to pin messages in this trip.";
      case "MESSAGE_NOT_FOUND":
        return "Message not found.";
      case "UNAUTHORIZED":
        return "You must be logged in to pin a message.";
      default:
        return error.message;
    }
  }

  // Network errors or other generic errors
  if (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return "Network error: Please check your connection and try again.";
  }

  return "An unexpected error occurred. Please try again.";
}

// ---------------------------------------------------------------------------
// Mute Member
// ---------------------------------------------------------------------------

/**
 * Hook for muting a member in a trip
 *
 * Simple mutation with cache invalidation (no optimistic update needed).
 *
 * @param tripId - The ID of the trip
 * @returns Mutation object with mutate function and state
 */
export function useMuteMember(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ success: true }, APIError, string>({
    mutationKey: messageKeys.mute(),
    mutationFn: async (memberId: string) => {
      return await apiRequest<{ success: true }>(
        `/trips/${tripId}/members/${memberId}/mute`,
        {
          method: "POST",
        },
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: memberKeys.list(tripId) });
    },
  });
}

/**
 * Get user-friendly error message from mute member mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getMuteMemberErrorMessage(error: Error | null): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to mute members in this trip.";
      case "ALREADY_MUTED":
        return "This member is already muted.";
      case "CANNOT_MUTE_ORGANIZER":
        return "Organizers cannot be muted.";
      case "NOT_FOUND":
        return "Member not found.";
      case "UNAUTHORIZED":
        return "You must be logged in to mute a member.";
      default:
        return error.message;
    }
  }

  // Network errors or other generic errors
  if (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return "Network error: Please check your connection and try again.";
  }

  return "An unexpected error occurred. Please try again.";
}

// ---------------------------------------------------------------------------
// Unmute Member
// ---------------------------------------------------------------------------

/**
 * Hook for unmuting a member in a trip
 *
 * Simple mutation with cache invalidation (no optimistic update needed).
 *
 * @param tripId - The ID of the trip
 * @returns Mutation object with mutate function and state
 */
export function useUnmuteMember(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ success: true }, APIError, string>({
    mutationKey: messageKeys.unmute(),
    mutationFn: async (memberId: string) => {
      return await apiRequest<{ success: true }>(
        `/trips/${tripId}/members/${memberId}/mute`,
        {
          method: "DELETE",
        },
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: memberKeys.list(tripId) });
    },
  });
}

/**
 * Get user-friendly error message from unmute member mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getUnmuteMemberErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to unmute members in this trip.";
      case "NOT_MUTED":
        return "This member is not muted.";
      case "NOT_FOUND":
        return "Member not found.";
      case "UNAUTHORIZED":
        return "You must be logged in to unmute a member.";
      default:
        return error.message;
    }
  }

  // Network errors or other generic errors
  if (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return "Network error: Please check your connection and try again.";
  }

  return "An unexpected error occurred. Please try again.";
}
