import {
  messages,
  messageReactions,
  users,
  trips,
  mutedMembers,
} from "@/db/schema/index.js";
import {
  eq,
  and,
  isNull,
  count,
  desc,
  sql,
  inArray,
  gte,
  lt,
  or,
} from "drizzle-orm";
import type { CreateMessageInput } from "@journiful/shared/schemas";
import type { AppDatabase } from "@/types/index.js";
import type { IPermissionsService } from "./permissions.service.js";
import type { INotificationService } from "./notification.service.js";
import type { Logger } from "@/types/logger.js";
import {
  MessageNotFoundError,
  MemberMutedError,
  MessageLimitExceededError,
  InvalidReplyTargetError,
  PinOnReplyError,
  PermissionDeniedError,
  TripNotFoundError,
  TripLockedError,
  AlreadyMutedError,
  NotMutedError,
  CannotMuteOrganizerError,
  DailyMessageLimitError,
} from "../errors.js";
import { z } from "zod";
import { encodeCursor, decodeCursorAs } from "@/utils/pagination.js";

const timestampCursorSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
});

/**
 * Internal result types for message service responses.
 * These use Date objects (not strings) as returned by Drizzle.
 */
interface MessageAuthorResult {
  id: string;
  displayName: string;
  profilePhotoUrl: string | null;
}

interface ReactionSummaryResult {
  emoji: string;
  count: number;
  reacted: boolean;
  reactorNames: string[];
}

interface MessageResult {
  id: string;
  tripId: string;
  authorId: string;
  parentId: string | null;
  content: string;
  isPinned: boolean;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: MessageAuthorResult;
  reactions: ReactionSummaryResult[];
}

interface MessageWithRepliesResult extends MessageResult {
  replies: MessageResult[];
  replyCount: number;
}

/**
 * Message Service Interface
 * Defines the contract for message management operations
 */
export interface IMessageService {
  getMessages(
    tripId: string,
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{
    data: MessageWithRepliesResult[];
    meta: {
      total: number;
      limit: number;
      hasMore: boolean;
      nextCursor: string | null;
    };
  }>;
  getMessageCount(tripId: string): Promise<number>;
  getLatestMessage(
    tripId: string,
    userId: string,
  ): Promise<MessageResult | null>;
  createMessage(
    tripId: string,
    authorId: string,
    data: CreateMessageInput,
  ): Promise<MessageResult>;
  editMessage(
    messageId: string,
    userId: string,
    content: string,
  ): Promise<MessageResult>;
  deleteMessage(
    messageId: string,
    userId: string,
    tripId: string,
  ): Promise<void>;
  togglePin(
    messageId: string,
    userId: string,
    tripId: string,
    pinned: boolean,
  ): Promise<MessageResult>;
  toggleReaction(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<ReactionSummaryResult[]>;
  muteMember(tripId: string, memberId: string, mutedBy: string): Promise<void>;
  unmuteMember(
    tripId: string,
    memberId: string,
    actorId: string,
  ): Promise<void>;
  isMuted(tripId: string, userId: string): Promise<boolean>;
  getMutedMembers(
    tripId: string,
  ): Promise<{ userId: string; mutedBy: string; createdAt: Date }[]>;
}

/**
 * Message Service Implementation
 * Handles message creation, editing, deletion, pinning, and reactions
 */
export class MessageService implements IMessageService {
  constructor(
    private db: AppDatabase,
    private permissionsService: IPermissionsService,
    private notificationService: INotificationService,
    private logger?: Logger,
  ) {}

  /**
   * Gets cursor-paginated top-level messages for a trip with replies and reactions
   */
  async getMessages(
    tripId: string,
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{
    data: MessageWithRepliesResult[];
    meta: {
      total: number;
      limit: number;
      hasMore: boolean;
      nextCursor: string | null;
    };
  }> {
    const canView = await this.permissionsService.canViewMessages(
      userId,
      tripId,
    );
    if (!canView) {
      throw new PermissionDeniedError(
        "Permission denied: only going members can view messages",
      );
    }

    // Count total top-level non-deleted messages
    const [totalResult] = await this.db
      .select({ value: count() })
      .from(messages)
      .where(
        and(
          eq(messages.tripId, tripId),
          isNull(messages.parentId),
          isNull(messages.deletedAt),
        ),
      );
    const total = totalResult?.value ?? 0;

    // Build cursor WHERE conditions for keyset pagination (createdAt DESC, id DESC)
    // NOTE: We intentionally do NOT filter out soft-deleted messages here.
    // Soft-deleted messages are returned as placeholders (empty content, deletedAt set)
    // so the UI can display "This message was deleted" in place.
    const baseConditions = [
      eq(messages.tripId, tripId),
      isNull(messages.parentId),
    ];
    if (cursor) {
      const decoded = decodeCursorAs(cursor, timestampCursorSchema);
      const cursorCreatedAt = new Date(decoded.createdAt);
      const cursorId = decoded.id;
      baseConditions.push(
        or(
          lt(messages.createdAt, cursorCreatedAt),
          and(
            eq(messages.createdAt, cursorCreatedAt),
            lt(messages.id, cursorId),
          ),
        )!,
      );
    }

    // Query top-level messages with author info (fetch limit+1)
    const topLevelRows = await this.db
      .select({
        message: messages,
        authorId: users.id,
        authorDisplayName: users.displayName,
        authorProfilePhotoUrl: users.profilePhotoUrl,
      })
      .from(messages)
      .leftJoin(users, eq(messages.authorId, users.id))
      .where(and(...baseConditions))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(limit + 1);

    const hasMore = topLevelRows.length > limit;
    const pageRows = hasMore ? topLevelRows.slice(0, limit) : topLevelRows;

    // Early return for empty results
    if (pageRows.length === 0) {
      return {
        data: [],
        meta: { total, limit, hasMore: false, nextCursor: null },
      };
    }

    // Build next cursor from the last row
    let nextCursor: string | null = null;
    if (hasMore) {
      const lastRow = pageRows[pageRows.length - 1]!;
      nextCursor = encodeCursor({
        createdAt: lastRow.message.createdAt.toISOString(),
        id: lastRow.message.id,
      });
    }

    // Collect all top-level message IDs
    const messageIds = pageRows.map((r) => r.message.id);

    // Batch fetch ALL replies for all top-level messages (including soft-deleted)
    // Soft-deleted replies are returned as placeholders so the UI can show
    // "This message was deleted" in place.
    const allReplyRows = await this.db
      .select({
        message: messages,
        authorId: users.id,
        authorDisplayName: users.displayName,
        authorProfilePhotoUrl: users.profilePhotoUrl,
      })
      .from(messages)
      .leftJoin(users, eq(messages.authorId, users.id))
      .where(and(inArray(messages.parentId, messageIds)))
      .orderBy(desc(messages.createdAt));

    // Group replies by parentId and compute counts
    const repliesByParent = new Map<string, typeof allReplyRows>();
    const replyCountByParent = new Map<string, number>();

    for (const reply of allReplyRows) {
      const parentId = reply.message.parentId!;
      const existing = repliesByParent.get(parentId);
      if (!existing) {
        repliesByParent.set(parentId, [reply]);
      } else {
        existing.push(reply);
      }
      replyCountByParent.set(
        parentId,
        (replyCountByParent.get(parentId) ?? 0) + 1,
      );
    }

    // Collect ALL message IDs (top-level + replies) for batch reaction fetch
    const replyIds = allReplyRows.map((r) => r.message.id);
    const allMessageIds = [...messageIds, ...replyIds];

    // Batch fetch ALL reactions for all messages
    const allReactions =
      allMessageIds.length > 0
        ? await this.db
            .select({
              messageId: messageReactions.messageId,
              emoji: messageReactions.emoji,
              count: count(),
              reacted: sql<boolean>`bool_or(${messageReactions.userId} = ${userId})`,
              reactorNames: sql<string[]>`array_agg(${users.displayName})`,
            })
            .from(messageReactions)
            .leftJoin(users, eq(messageReactions.userId, users.id))
            .where(inArray(messageReactions.messageId, allMessageIds))
            .groupBy(messageReactions.messageId, messageReactions.emoji)
        : [];

    // Build reactions Map
    const reactionsByMessage = new Map<string, ReactionSummaryResult[]>();
    for (const r of allReactions) {
      const existing = reactionsByMessage.get(r.messageId);
      const summary: ReactionSummaryResult = {
        emoji: r.emoji,
        count: r.count,
        reacted: r.reacted ?? false,
        reactorNames: (r.reactorNames ?? []).filter(
          (n): n is string => n != null,
        ),
      };
      if (!existing) {
        reactionsByMessage.set(r.messageId, [summary]);
      } else {
        existing.push(summary);
      }
    }

    // Assemble results using Map lookups
    const data: MessageWithRepliesResult[] = pageRows.map((row) => {
      const reactions = reactionsByMessage.get(row.message.id) ?? [];
      const replyCount = replyCountByParent.get(row.message.id) ?? 0;

      // Get up to 2 most recent replies (already sorted by createdAt DESC)
      const replyRowsForMessage = (
        repliesByParent.get(row.message.id) ?? []
      ).slice(0, 2);

      const replies: MessageResult[] = replyRowsForMessage.map((replyRow) => {
        const replyReactions =
          reactionsByMessage.get(replyRow.message.id) ?? [];
        return this.buildMessageResult(
          replyRow.message,
          replyRow,
          replyReactions,
        );
      });

      return {
        ...this.buildMessageResult(row.message, row, reactions),
        replies,
        replyCount,
      };
    });

    return {
      data,
      meta: { total, limit, hasMore, nextCursor },
    };
  }

  /**
   * Gets the count of non-deleted top-level messages for a trip
   */
  async getMessageCount(tripId: string): Promise<number> {
    const [result] = await this.db
      .select({ value: count() })
      .from(messages)
      .where(
        and(
          eq(messages.tripId, tripId),
          isNull(messages.parentId),
          isNull(messages.deletedAt),
        ),
      );
    return result?.value ?? 0;
  }

  /**
   * Gets the most recent non-deleted top-level message with author and reactions
   */
  async getLatestMessage(
    tripId: string,
    userId: string,
  ): Promise<MessageResult | null> {
    const rows = await this.db
      .select({
        message: messages,
        authorId: users.id,
        authorDisplayName: users.displayName,
        authorProfilePhotoUrl: users.profilePhotoUrl,
      })
      .from(messages)
      .leftJoin(users, eq(messages.authorId, users.id))
      .where(
        and(
          eq(messages.tripId, tripId),
          isNull(messages.parentId),
          isNull(messages.deletedAt),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(1);

    if (rows.length === 0) return null;

    const row = rows[0]!;
    const reactions = await this.getReactionSummaries(row.message.id, userId);
    return this.buildMessageResult(row.message, row, reactions);
  }

  /**
   * Creates a new message (top-level or reply)
   */
  async createMessage(
    tripId: string,
    authorId: string,
    data: CreateMessageInput,
  ): Promise<MessageResult> {
    // Permission checks (outside transaction - they use permissionsService's own db)
    const canView = await this.permissionsService.canViewMessages(
      authorId,
      tripId,
    );
    if (!canView) {
      throw new PermissionDeniedError(
        "Permission denied: only going members can post messages",
      );
    }

    const isLocked = await this.permissionsService.isTripLocked(tripId);
    if (isLocked) {
      throw new TripLockedError();
    }

    const isMuted = await this.permissionsService.isMemberMuted(
      tripId,
      authorId,
    );
    if (isMuted) {
      throw new MemberMutedError();
    }

    // Transaction (data checks + insert)
    const newMessage = await this.db.transaction(async (tx) => {
      // Verify trip exists
      const tripExists = await tx
        .select({ id: trips.id })
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);
      if (tripExists.length === 0) {
        throw new TripNotFoundError();
      }

      // Handle reply validation
      if (data.parentId) {
        const [parentMessage] = await tx
          .select({
            id: messages.id,
            tripId: messages.tripId,
            parentId: messages.parentId,
            deletedAt: messages.deletedAt,
          })
          .from(messages)
          .where(eq(messages.id, data.parentId))
          .limit(1);

        if (!parentMessage || parentMessage.deletedAt !== null) {
          throw new InvalidReplyTargetError();
        }

        if (parentMessage.tripId !== tripId) {
          throw new InvalidReplyTargetError();
        }

        // Only allow replies to top-level messages (no nested replies)
        if (parentMessage.parentId !== null) {
          throw new InvalidReplyTargetError();
        }
      } else {
        // Top-level message: check count limit
        const [messageCount] = await tx
          .select({ value: count() })
          .from(messages)
          .where(
            and(
              eq(messages.tripId, tripId),
              isNull(messages.parentId),
              isNull(messages.deletedAt),
            ),
          );
        if ((messageCount?.value ?? 0) >= 100) {
          throw new MessageLimitExceededError();
        }
      }

      // Daily rate limit: 200 messages per user per trip per day
      const startOfToday = new Date();
      startOfToday.setUTCHours(0, 0, 0, 0);

      const [dailyCount] = await tx
        .select({ value: count() })
        .from(messages)
        .where(
          and(
            eq(messages.authorId, authorId),
            eq(messages.tripId, tripId),
            gte(messages.createdAt, startOfToday),
          ),
        );

      if ((dailyCount?.value ?? 0) >= 200) {
        throw new DailyMessageLimitError();
      }

      // Strip HTML tags from content (XSS sanitization)
      const sanitizedContent = data.content.replace(/<[^>]*>/g, "");

      // Insert the message
      const [inserted] = await tx
        .insert(messages)
        .values({
          tripId,
          authorId,
          parentId: data.parentId ?? null,
          content: sanitizedContent,
        })
        .returning();

      if (!inserted) {
        throw new Error("Failed to create message");
      }

      return inserted;
    });

    // Get author info (outside transaction)
    const [author] = await this.db
      .select({
        id: users.id,
        displayName: users.displayName,
        profilePhotoUrl: users.profilePhotoUrl,
      })
      .from(users)
      .where(eq(users.id, authorId))
      .limit(1);

    // Notify trip members for top-level messages only (outside transaction, fire-and-forget)
    if (!data.parentId) {
      try {
        const authorName = author?.displayName ?? "Someone";
        const truncatedContent =
          newMessage.content.length > 100
            ? newMessage.content.slice(0, 97) + "..."
            : newMessage.content;

        await this.notificationService.notifyTripMembers({
          tripId,
          type: "trip_message",
          title: "New message",
          body: `${authorName}: ${truncatedContent}`,
          data: { messageId: newMessage.id },
          excludeUserId: authorId,
        });
      } catch (err) {
        this.logger?.error(err, "Failed to send message notifications");
      }
    }

    return {
      id: newMessage.id,
      tripId: newMessage.tripId,
      authorId: newMessage.authorId,
      parentId: newMessage.parentId,
      content: newMessage.content,
      isPinned: newMessage.isPinned,
      editedAt: newMessage.editedAt,
      deletedAt: newMessage.deletedAt,
      createdAt: newMessage.createdAt,
      updatedAt: newMessage.updatedAt,
      author: {
        id: author?.id ?? authorId,
        displayName: author?.displayName ?? "",
        profilePhotoUrl: author?.profilePhotoUrl ?? null,
      },
      reactions: [],
    };
  }

  /**
   * Edits the content of a message
   * Only the author can edit, and the trip must not be locked
   */
  async editMessage(
    messageId: string,
    userId: string,
    content: string,
  ): Promise<MessageResult> {
    // Find non-deleted message
    const messageRow = await this.getMessageWithAuthor(messageId);
    if (!messageRow || messageRow.message.deletedAt !== null) {
      throw new MessageNotFoundError();
    }

    // Check trip not locked
    const isLocked = await this.permissionsService.isTripLocked(
      messageRow.message.tripId,
    );
    if (isLocked) {
      throw new TripLockedError();
    }

    // Check author matches
    if (messageRow.message.authorId !== userId) {
      throw new PermissionDeniedError(
        "Permission denied: only the message author can edit",
      );
    }

    // Check not muted
    const isMuted = await this.permissionsService.isMemberMuted(
      messageRow.message.tripId,
      userId,
    );
    if (isMuted) {
      throw new MemberMutedError();
    }

    // Strip HTML tags from content (XSS sanitization)
    const sanitizedContent = content.replace(/<[^>]*>/g, "");

    // Update content and set editedAt
    const now = new Date();
    const [updatedMessage] = await this.db
      .update(messages)
      .set({
        content: sanitizedContent,
        editedAt: now,
        updatedAt: now,
      })
      .where(eq(messages.id, messageId))
      .returning();

    if (!updatedMessage) {
      throw new MessageNotFoundError();
    }

    const reactions = await this.getReactionSummaries(messageId, userId);

    return this.buildMessageResult(updatedMessage, messageRow, reactions);
  }

  /**
   * Soft-deletes a message
   * Author or organizer can delete
   */
  async deleteMessage(
    messageId: string,
    userId: string,
    _tripId: string,
  ): Promise<void> {
    // Find non-deleted message
    const [messageRow] = await this.db
      .select({
        id: messages.id,
        tripId: messages.tripId,
        authorId: messages.authorId,
        deletedAt: messages.deletedAt,
      })
      .from(messages)
      .where(and(eq(messages.id, messageId), isNull(messages.deletedAt)))
      .limit(1);

    if (!messageRow) {
      throw new MessageNotFoundError();
    }

    // Check trip not locked
    const isLocked = await this.permissionsService.isTripLocked(
      messageRow.tripId,
    );
    if (isLocked) {
      throw new TripLockedError();
    }

    // Check author OR organizer (via canModerateMessages)
    const isAuthor = messageRow.authorId === userId;
    const canModerate = await this.permissionsService.canModerateMessages(
      userId,
      messageRow.tripId,
    );
    if (!isAuthor && !canModerate) {
      throw new PermissionDeniedError(
        "Permission denied: only the message author or trip organizers can delete messages",
      );
    }

    // Soft delete
    const now = new Date();
    await this.db
      .update(messages)
      .set({
        deletedAt: now,
        deletedBy: userId,
        updatedAt: now,
      })
      .where(eq(messages.id, messageId));
  }

  /**
   * Toggles pin status for a top-level message
   * Only organizers can pin/unpin
   */
  async togglePin(
    messageId: string,
    userId: string,
    _tripId: string,
    pinned: boolean,
  ): Promise<MessageResult> {
    // Find non-deleted message
    const messageRow = await this.getMessageWithAuthor(messageId);
    if (!messageRow || messageRow.message.deletedAt !== null) {
      throw new MessageNotFoundError();
    }

    // Must be top-level
    if (messageRow.message.parentId !== null) {
      throw new PinOnReplyError();
    }

    // Check trip not locked
    const isLocked = await this.permissionsService.isTripLocked(
      messageRow.message.tripId,
    );
    if (isLocked) {
      throw new TripLockedError();
    }

    // Check canModerateMessages (organizer only)
    const canModerate = await this.permissionsService.canModerateMessages(
      userId,
      messageRow.message.tripId,
    );
    if (!canModerate) {
      throw new PermissionDeniedError(
        "Permission denied: only organizers can pin messages",
      );
    }

    // Update pin status
    const [updatedMessage] = await this.db
      .update(messages)
      .set({
        isPinned: pinned,
        updatedAt: new Date(),
      })
      .where(eq(messages.id, messageId))
      .returning();

    if (!updatedMessage) {
      throw new MessageNotFoundError();
    }

    const reactions = await this.getReactionSummaries(messageId, userId);

    return this.buildMessageResult(updatedMessage, messageRow, reactions);
  }

  /**
   * Toggles a reaction on a message
   * If the user already has the reaction, remove it; otherwise add it
   */
  async toggleReaction(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<ReactionSummaryResult[]> {
    // Find non-deleted message
    const [messageRow] = await this.db
      .select({
        id: messages.id,
        tripId: messages.tripId,
        deletedAt: messages.deletedAt,
      })
      .from(messages)
      .where(and(eq(messages.id, messageId), isNull(messages.deletedAt)))
      .limit(1);

    if (!messageRow) {
      throw new MessageNotFoundError();
    }

    // Check trip not locked
    const isLocked = await this.permissionsService.isTripLocked(
      messageRow.tripId,
    );
    if (isLocked) {
      throw new TripLockedError();
    }

    // Check canViewMessages (going member)
    const canView = await this.permissionsService.canViewMessages(
      userId,
      messageRow.tripId,
    );
    if (!canView) {
      throw new PermissionDeniedError(
        "Permission denied: only going members can react to messages",
      );
    }

    // Check if reaction already exists
    const [existingReaction] = await this.db
      .select({ id: messageReactions.id })
      .from(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, userId),
          eq(messageReactions.emoji, emoji),
        ),
      )
      .limit(1);

    if (existingReaction) {
      // Remove the reaction
      await this.db
        .delete(messageReactions)
        .where(eq(messageReactions.id, existingReaction.id));
    } else {
      // Add the reaction
      await this.db.insert(messageReactions).values({
        messageId,
        userId,
        emoji,
      });
    }

    // Return updated reaction summaries
    return this.getReactionSummaries(messageId, userId);
  }

  /**
   * Gets a single message with author info
   */
  private async getMessageWithAuthor(messageId: string) {
    const rows = await this.db
      .select({
        message: messages,
        authorId: users.id,
        authorDisplayName: users.displayName,
        authorProfilePhotoUrl: users.profilePhotoUrl,
      })
      .from(messages)
      .leftJoin(users, eq(messages.authorId, users.id))
      .where(eq(messages.id, messageId))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Gets reaction summaries for a message, grouped by emoji with count
   * and whether the current user has reacted
   */
  private async getReactionSummaries(
    messageId: string,
    userId: string,
  ): Promise<ReactionSummaryResult[]> {
    const reactionRows = await this.db
      .select({
        emoji: messageReactions.emoji,
        count: count(),
        reacted: sql<boolean>`bool_or(${messageReactions.userId} = ${userId})`,
        reactorNames: sql<string[]>`array_agg(${users.displayName})`,
      })
      .from(messageReactions)
      .leftJoin(users, eq(messageReactions.userId, users.id))
      .where(eq(messageReactions.messageId, messageId))
      .groupBy(messageReactions.emoji);

    return reactionRows.map((r) => ({
      emoji: r.emoji,
      count: r.count,
      reacted: r.reacted ?? false,
      reactorNames: (r.reactorNames ?? []).filter(
        (n): n is string => n != null,
      ),
    }));
  }

  /**
   * Mutes a member in a trip (organizers only, cannot mute other organizers)
   */
  async muteMember(
    tripId: string,
    memberId: string,
    mutedBy: string,
  ): Promise<void> {
    // First check if actor is an organizer at all
    const canModerate = await this.permissionsService.canModerateMessages(
      mutedBy,
      tripId,
    );
    if (!canModerate) {
      throw new PermissionDeniedError(
        "Permission denied: only organizers can mute members",
      );
    }

    // Then check the more specific mute permission (target cannot be organizer)
    const canMute = await this.permissionsService.canMuteMember(
      mutedBy,
      tripId,
      memberId,
    );
    if (!canMute) {
      throw new CannotMuteOrganizerError();
    }

    const alreadyMuted = await this.permissionsService.isMemberMuted(
      tripId,
      memberId,
    );
    if (alreadyMuted) {
      throw new AlreadyMutedError();
    }

    await this.db.insert(mutedMembers).values({
      tripId,
      userId: memberId,
      mutedBy,
    });
  }

  /**
   * Unmutes a member in a trip (organizers only)
   */
  async unmuteMember(
    tripId: string,
    memberId: string,
    actorId: string,
  ): Promise<void> {
    const canModerate = await this.permissionsService.canModerateMessages(
      actorId,
      tripId,
    );
    if (!canModerate) {
      throw new PermissionDeniedError(
        "Permission denied: only organizers can unmute members",
      );
    }

    const isMuted = await this.permissionsService.isMemberMuted(
      tripId,
      memberId,
    );
    if (!isMuted) {
      throw new NotMutedError();
    }

    await this.db
      .delete(mutedMembers)
      .where(
        and(eq(mutedMembers.tripId, tripId), eq(mutedMembers.userId, memberId)),
      );
  }

  /**
   * Checks if a member is muted in a trip
   */
  async isMuted(tripId: string, userId: string): Promise<boolean> {
    return this.permissionsService.isMemberMuted(tripId, userId);
  }

  /**
   * Gets all muted members for a trip
   */
  async getMutedMembers(
    tripId: string,
  ): Promise<{ userId: string; mutedBy: string; createdAt: Date }[]> {
    const rows = await this.db
      .select({
        userId: mutedMembers.userId,
        mutedBy: mutedMembers.mutedBy,
        createdAt: mutedMembers.createdAt,
      })
      .from(mutedMembers)
      .where(eq(mutedMembers.tripId, tripId));

    return rows;
  }

  /**
   * Builds a MessageResult from a message row and author info
   */
  private buildMessageResult(
    messageRow: typeof messages.$inferSelect,
    authorRow: {
      authorId: string | null;
      authorDisplayName: string | null;
      authorProfilePhotoUrl: string | null;
    },
    reactions: ReactionSummaryResult[],
  ): MessageResult {
    // Soft-deleted messages return as placeholders with empty content and no reactions
    if (messageRow.deletedAt) {
      return {
        id: messageRow.id,
        tripId: messageRow.tripId,
        authorId: messageRow.authorId,
        parentId: messageRow.parentId,
        content: "",
        isPinned: messageRow.isPinned,
        editedAt: messageRow.editedAt,
        deletedAt: messageRow.deletedAt,
        createdAt: messageRow.createdAt,
        updatedAt: messageRow.updatedAt,
        author: {
          id: authorRow.authorId ?? messageRow.authorId,
          displayName: authorRow.authorDisplayName ?? "Unknown",
          profilePhotoUrl: authorRow.authorProfilePhotoUrl ?? null,
        },
        reactions: [],
      };
    }

    return {
      id: messageRow.id,
      tripId: messageRow.tripId,
      authorId: messageRow.authorId,
      parentId: messageRow.parentId,
      content: messageRow.content,
      isPinned: messageRow.isPinned,
      editedAt: messageRow.editedAt,
      deletedAt: messageRow.deletedAt,
      createdAt: messageRow.createdAt,
      updatedAt: messageRow.updatedAt,
      author: {
        id: authorRow.authorId ?? messageRow.authorId,
        displayName: authorRow.authorDisplayName ?? "",
        profilePhotoUrl: authorRow.authorProfilePhotoUrl ?? null,
      },
      reactions,
    };
  }
}
