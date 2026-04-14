import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  messages,
  messageReactions,
  mutedMembers,
  notifications,
  notificationPreferences,
} from "@/db/schema/index.js";
import { eq, or } from "drizzle-orm";
import { MessageService } from "@/services/message.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import { NotificationService } from "@/services/notification.service.js";
import { SMSService } from "@/services/sms.service.js";
import { generateUniquePhone } from "../test-utils.js";
import {
  MessageNotFoundError,
  MemberMutedError,
  MessageLimitExceededError,
  InvalidReplyTargetError,
  PinOnReplyError,
  PermissionDeniedError,
  TripLockedError,
  AlreadyMutedError,
  NotMutedError,
  CannotMuteOrganizerError,
  DailyMessageLimitError,
} from "@/errors.js";

// Create service instances with db for testing
const permissionsService = new PermissionsService(db);
const smsService = new SMSService();
const notificationService = new NotificationService(db, smsService);
const messageService = new MessageService(
  db,
  permissionsService,
  notificationService,
);

describe("message.service", () => {
  let testOrganizerPhone: string;
  let testMemberPhone: string;
  let testNonMemberPhone: string;

  let testOrganizerId: string;
  let testMemberId: string;
  let testNonMemberId: string;

  let testTripId: string;
  let testMessageId: string;

  // Clean up test data (safe for parallel execution)
  const cleanup = async () => {
    if (testTripId) {
      // Delete reactions first due to FK constraint on messages
      const tripMessages = await db
        .select({ id: messages.id })
        .from(messages)
        .where(eq(messages.tripId, testTripId));

      for (const msg of tripMessages) {
        await db
          .delete(messageReactions)
          .where(eq(messageReactions.messageId, msg.id));
      }

      await db
        .delete(notifications)
        .where(eq(notifications.tripId, testTripId));
      await db
        .delete(notificationPreferences)
        .where(eq(notificationPreferences.tripId, testTripId));
      await db.delete(messages).where(eq(messages.tripId, testTripId));
      await db.delete(mutedMembers).where(eq(mutedMembers.tripId, testTripId));
      await db.delete(members).where(eq(members.tripId, testTripId));
      await db.delete(trips).where(eq(trips.id, testTripId));
    }

    const phoneNumbers = [
      testOrganizerPhone,
      testMemberPhone,
      testNonMemberPhone,
    ].filter(Boolean);

    if (phoneNumbers.length > 0) {
      await db
        .delete(users)
        .where(
          or(...phoneNumbers.map((phone) => eq(users.phoneNumber, phone))),
        );
    }
  };

  beforeEach(async () => {
    // Generate unique phone numbers for this test run
    testOrganizerPhone = generateUniquePhone();
    testMemberPhone = generateUniquePhone();
    testNonMemberPhone = generateUniquePhone();

    // Clean up any existing data
    await cleanup();

    // Create test users
    const organizerResult = await db
      .insert(users)
      .values({
        phoneNumber: testOrganizerPhone,
        displayName: "Test Organizer",
        timezone: "UTC",
      })
      .returning();
    testOrganizerId = organizerResult[0].id;

    const memberResult = await db
      .insert(users)
      .values({
        phoneNumber: testMemberPhone,
        displayName: "Test Member",
        timezone: "UTC",
      })
      .returning();
    testMemberId = memberResult[0].id;

    const nonMemberResult = await db
      .insert(users)
      .values({
        phoneNumber: testNonMemberPhone,
        displayName: "Test Non-Member",
        timezone: "UTC",
      })
      .returning();
    testNonMemberId = nonMemberResult[0].id;

    // Create a test trip
    const tripResult = await db
      .insert(trips)
      .values({
        name: "Test Trip",
        destination: "Test Destination",
        preferredTimezone: "UTC",
        createdBy: testOrganizerId,
      })
      .returning();
    testTripId = tripResult[0].id;

    // Add organizer as member with status='going' and isOrganizer=true
    await db.insert(members).values({
      tripId: testTripId,
      userId: testOrganizerId,
      status: "going",
      isOrganizer: true,
    });

    // Add regular member with status='going'
    await db.insert(members).values({
      tripId: testTripId,
      userId: testMemberId,
      status: "going",
    });

    // Create a test message
    const messageResult = await db
      .insert(messages)
      .values({
        tripId: testTripId,
        authorId: testOrganizerId,
        content: "Test message content",
      })
      .returning();
    testMessageId = messageResult[0].id;
  });

  afterEach(cleanup);

  describe("createMessage", () => {
    it("should create a top-level message as going member", async () => {
      const result = await messageService.createMessage(
        testTripId,
        testMemberId,
        { content: "Hello from member" },
      );

      expect(result).toBeDefined();
      expect(result.content).toBe("Hello from member");
      expect(result.authorId).toBe(testMemberId);
      expect(result.tripId).toBe(testTripId);
      expect(result.parentId).toBeNull();
      expect(result.isPinned).toBe(false);
      expect(result.editedAt).toBeNull();
      expect(result.deletedAt).toBeNull();
      expect(result.author.id).toBe(testMemberId);
      expect(result.author.displayName).toBe("Test Member");
      expect(result.reactions).toEqual([]);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it("should create a reply to a top-level message", async () => {
      const result = await messageService.createMessage(
        testTripId,
        testMemberId,
        { content: "Reply to message", parentId: testMessageId },
      );

      expect(result).toBeDefined();
      expect(result.content).toBe("Reply to message");
      expect(result.parentId).toBe(testMessageId);
      expect(result.authorId).toBe(testMemberId);
    });

    it("should throw PermissionDeniedError for non-member", async () => {
      await expect(
        messageService.createMessage(testTripId, testNonMemberId, {
          content: "Should fail",
        }),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw PermissionDeniedError for non-existent trip", async () => {
      // Permission check runs before trip existence check, so non-existent
      // trip results in PermissionDeniedError (user is not a member)
      await expect(
        messageService.createMessage(
          "00000000-0000-0000-0000-000000000000",
          testOrganizerId,
          { content: "Should fail" },
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw MemberMutedError for muted member", async () => {
      // Mute the member
      await db.insert(mutedMembers).values({
        tripId: testTripId,
        userId: testMemberId,
        mutedBy: testOrganizerId,
      });

      await expect(
        messageService.createMessage(testTripId, testMemberId, {
          content: "Should fail",
        }),
      ).rejects.toThrow(MemberMutedError);
    });

    it("should throw InvalidReplyTargetError when replying to a reply (nested reply)", async () => {
      // Create a reply
      const reply = await messageService.createMessage(
        testTripId,
        testMemberId,
        { content: "A reply", parentId: testMessageId },
      );

      // Try to reply to the reply
      await expect(
        messageService.createMessage(testTripId, testOrganizerId, {
          content: "Nested reply",
          parentId: reply.id,
        }),
      ).rejects.toThrow(InvalidReplyTargetError);
    });

    it("should throw InvalidReplyTargetError when parent message not found", async () => {
      await expect(
        messageService.createMessage(testTripId, testMemberId, {
          content: "Reply to ghost",
          parentId: "00000000-0000-0000-0000-000000000000",
        }),
      ).rejects.toThrow(InvalidReplyTargetError);
    });

    it("should throw MessageLimitExceededError when 100 top-level messages exist", async () => {
      // Create 99 more top-level messages (1 already exists from setup)
      const insertValues = [];
      for (let i = 0; i < 99; i++) {
        insertValues.push({
          tripId: testTripId,
          authorId: testOrganizerId,
          content: `Message ${i + 2}`,
        });
      }
      await db.insert(messages).values(insertValues);

      // 100th top-level message should fail
      await expect(
        messageService.createMessage(testTripId, testMemberId, {
          content: "One too many",
        }),
      ).rejects.toThrow(MessageLimitExceededError);
    });

    it("should log error when notification fails but still return the message", async () => {
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
      };

      const failingNotificationService = {
        ...notificationService,
        notifyTripMembers: vi
          .fn()
          .mockRejectedValue(new Error("Notification failed")),
      } as unknown as typeof notificationService;

      const serviceWithLogger = new MessageService(
        db,
        permissionsService,
        failingNotificationService,
        mockLogger,
      );

      const result = await serviceWithLogger.createMessage(
        testTripId,
        testMemberId,
        { content: "Message with failing notification" },
      );

      expect(result).toBeDefined();
      expect(result.content).toBe("Message with failing notification");
      expect(result.authorId).toBe(testMemberId);
      expect(mockLogger.error).toHaveBeenCalledOnce();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(Error),
        "Failed to send message notifications",
      );
    });
  });

  describe("editMessage", () => {
    it("should edit own message content and set editedAt", async () => {
      const result = await messageService.editMessage(
        testMessageId,
        testOrganizerId,
        "Updated content",
      );

      expect(result.content).toBe("Updated content");
      expect(result.editedAt).toBeInstanceOf(Date);
      expect(result.id).toBe(testMessageId);
    });

    it("should throw PermissionDeniedError for non-author", async () => {
      await expect(
        messageService.editMessage(testMessageId, testMemberId, "Should fail"),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw MessageNotFoundError for non-existent message", async () => {
      await expect(
        messageService.editMessage(
          "00000000-0000-0000-0000-000000000000",
          testOrganizerId,
          "Should fail",
        ),
      ).rejects.toThrow(MessageNotFoundError);
    });

    it("should throw TripLockedError for locked trip", async () => {
      // Create a trip with past end date
      const lockedTripResult = await db
        .insert(trips)
        .values({
          name: "Locked Trip",
          destination: "Past",
          preferredTimezone: "UTC",
          createdBy: testOrganizerId,
          endDate: "2020-01-01",
        })
        .returning();
      const lockedTripId = lockedTripResult[0].id;

      // Add member
      await db.insert(members).values({
        tripId: lockedTripId,
        userId: testOrganizerId,
        status: "going",
        isOrganizer: true,
      });

      // Create message in locked trip
      const [lockedMsg] = await db
        .insert(messages)
        .values({
          tripId: lockedTripId,
          authorId: testOrganizerId,
          content: "Old message",
        })
        .returning();

      try {
        await expect(
          messageService.editMessage(
            lockedMsg.id,
            testOrganizerId,
            "Should fail",
          ),
        ).rejects.toThrow(TripLockedError);
      } finally {
        // Cleanup
        await db.delete(messages).where(eq(messages.tripId, lockedTripId));
        await db.delete(members).where(eq(members.tripId, lockedTripId));
        await db.delete(trips).where(eq(trips.id, lockedTripId));
      }
    });

    it("should throw MemberMutedError for muted author", async () => {
      // Create a message as member
      const msg = await messageService.createMessage(testTripId, testMemberId, {
        content: "My message",
      });

      // Mute the member
      await db.insert(mutedMembers).values({
        tripId: testTripId,
        userId: testMemberId,
        mutedBy: testOrganizerId,
      });

      await expect(
        messageService.editMessage(msg.id, testMemberId, "Should fail"),
      ).rejects.toThrow(MemberMutedError);
    });
  });

  describe("deleteMessage", () => {
    it("should soft-delete own message", async () => {
      await messageService.deleteMessage(
        testMessageId,
        testOrganizerId,
        testTripId,
      );

      // Verify soft-deleted
      const [deletedMsg] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, testMessageId));

      expect(deletedMsg.deletedAt).not.toBeNull();
      expect(deletedMsg.deletedBy).toBe(testOrganizerId);
    });

    it("should allow organizer to delete any message", async () => {
      // Create message as regular member
      const msg = await messageService.createMessage(testTripId, testMemberId, {
        content: "Member message",
      });

      // Delete as organizer
      await messageService.deleteMessage(msg.id, testOrganizerId, testTripId);

      const [deletedMsg] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, msg.id));

      expect(deletedMsg.deletedAt).not.toBeNull();
      expect(deletedMsg.deletedBy).toBe(testOrganizerId);
    });

    it("should throw PermissionDeniedError for non-author non-organizer", async () => {
      // testMessageId is owned by organizer; member is not organizer
      // But we need a third user who is neither author nor organizer
      // testNonMemberId is not a member of the trip, so they should get MessageNotFoundError
      // or PermissionDeniedError. Let's create message by organizer and try delete as member.

      await expect(
        messageService.deleteMessage(testMessageId, testMemberId, testTripId),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw MessageNotFoundError for non-existent message", async () => {
      await expect(
        messageService.deleteMessage(
          "00000000-0000-0000-0000-000000000000",
          testOrganizerId,
          testTripId,
        ),
      ).rejects.toThrow(MessageNotFoundError);
    });
  });

  describe("togglePin", () => {
    it("should pin a message as organizer", async () => {
      const result = await messageService.togglePin(
        testMessageId,
        testOrganizerId,
        testTripId,
        true,
      );

      expect(result.isPinned).toBe(true);
      expect(result.id).toBe(testMessageId);
    });

    it("should unpin a message as organizer", async () => {
      // First pin it
      await messageService.togglePin(
        testMessageId,
        testOrganizerId,
        testTripId,
        true,
      );

      // Then unpin
      const result = await messageService.togglePin(
        testMessageId,
        testOrganizerId,
        testTripId,
        false,
      );

      expect(result.isPinned).toBe(false);
    });

    it("should throw PermissionDeniedError for non-organizer", async () => {
      await expect(
        messageService.togglePin(testMessageId, testMemberId, testTripId, true),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw PinOnReplyError for reply message", async () => {
      // Create a reply
      const reply = await messageService.createMessage(
        testTripId,
        testMemberId,
        { content: "A reply", parentId: testMessageId },
      );

      await expect(
        messageService.togglePin(reply.id, testOrganizerId, testTripId, true),
      ).rejects.toThrow(PinOnReplyError);
    });

    it("should throw MessageNotFoundError for non-existent message", async () => {
      await expect(
        messageService.togglePin(
          "00000000-0000-0000-0000-000000000000",
          testOrganizerId,
          testTripId,
          true,
        ),
      ).rejects.toThrow(MessageNotFoundError);
    });
  });

  describe("toggleReaction", () => {
    it("should add a reaction", async () => {
      const result = await messageService.toggleReaction(
        testMessageId,
        testMemberId,
        "heart",
      );

      expect(result).toHaveLength(1);
      expect(result[0].emoji).toBe("heart");
      expect(result[0].count).toBe(1);
      expect(result[0].reacted).toBe(true);
    });

    it("should remove reaction on second toggle", async () => {
      // Add reaction
      await messageService.toggleReaction(testMessageId, testMemberId, "heart");

      // Toggle again to remove
      const result = await messageService.toggleReaction(
        testMessageId,
        testMemberId,
        "heart",
      );

      expect(result).toHaveLength(0);
    });

    it("should return correct reaction summaries with reacted flag", async () => {
      // Organizer adds heart
      await messageService.toggleReaction(
        testMessageId,
        testOrganizerId,
        "heart",
      );

      // Member adds heart and thumbs_up
      await messageService.toggleReaction(testMessageId, testMemberId, "heart");
      const result = await messageService.toggleReaction(
        testMessageId,
        testMemberId,
        "thumbs_up",
      );

      // Should have 2 emojis
      const heartReaction = result.find((r) => r.emoji === "heart");
      const thumbsReaction = result.find((r) => r.emoji === "thumbs_up");

      expect(heartReaction).toBeDefined();
      expect(heartReaction!.count).toBe(2);
      expect(heartReaction!.reacted).toBe(true); // member has reacted

      expect(thumbsReaction).toBeDefined();
      expect(thumbsReaction!.count).toBe(1);
      expect(thumbsReaction!.reacted).toBe(true); // member has reacted
    });

    it("should throw MessageNotFoundError for non-existent message", async () => {
      await expect(
        messageService.toggleReaction(
          "00000000-0000-0000-0000-000000000000",
          testMemberId,
          "heart",
        ),
      ).rejects.toThrow(MessageNotFoundError);
    });

    it("should throw PermissionDeniedError for non-member", async () => {
      await expect(
        messageService.toggleReaction(testMessageId, testNonMemberId, "heart"),
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe("getMessages", () => {
    it("should return paginated top-level messages with author and reactions", async () => {
      // Add a reaction to the test message
      await messageService.toggleReaction(testMessageId, testMemberId, "heart");

      const result = await messageService.getMessages(
        testTripId,
        testMemberId,
        undefined,
        20,
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(testMessageId);
      expect(result.data[0].content).toBe("Test message content");
      expect(result.data[0].author.displayName).toBe("Test Organizer");
      expect(result.data[0].reactions).toHaveLength(1);
      expect(result.data[0].reactions[0].emoji).toBe("heart");
      expect(result.meta.total).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.nextCursor).toBeNull();
    });

    it("should include reply count and 2 most recent replies", async () => {
      // Create 3 replies
      await messageService.createMessage(testTripId, testMemberId, {
        content: "Reply 1",
        parentId: testMessageId,
      });
      await messageService.createMessage(testTripId, testMemberId, {
        content: "Reply 2",
        parentId: testMessageId,
      });
      await messageService.createMessage(testTripId, testOrganizerId, {
        content: "Reply 3",
        parentId: testMessageId,
      });

      const result = await messageService.getMessages(
        testTripId,
        testMemberId,
        undefined,
        20,
      );

      expect(result.data[0].replyCount).toBe(3);
      expect(result.data[0].replies).toHaveLength(2);
      // Most recent replies first
      expect(result.data[0].replies[0].content).toBe("Reply 3");
      expect(result.data[0].replies[1].content).toBe("Reply 2");
    });

    it("should return empty for trip with no messages", async () => {
      // Create a new trip with no messages
      const emptyTripResult = await db
        .insert(trips)
        .values({
          name: "Empty Trip",
          destination: "Nowhere",
          preferredTimezone: "UTC",
          createdBy: testOrganizerId,
        })
        .returning();
      const emptyTripId = emptyTripResult[0].id;

      await db.insert(members).values({
        tripId: emptyTripId,
        userId: testMemberId,
        status: "going",
      });

      try {
        const result = await messageService.getMessages(
          emptyTripId,
          testMemberId,
          undefined,
          20,
        );

        expect(result.data).toEqual([]);
        expect(result.meta.total).toBe(0);
      } finally {
        await db.delete(members).where(eq(members.tripId, emptyTripId));
        await db.delete(trips).where(eq(trips.id, emptyTripId));
      }
    });

    it("should throw PermissionDeniedError for non-member", async () => {
      await expect(
        messageService.getMessages(testTripId, testNonMemberId, undefined, 20),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should return soft-deleted messages as placeholders", async () => {
      await messageService.deleteMessage(
        testMessageId,
        testOrganizerId,
        testTripId,
      );

      const result = await messageService.getMessages(
        testTripId,
        testOrganizerId,
        undefined,
        20,
      );

      // Soft-deleted messages are still returned so the UI can show
      // "This message was deleted" placeholder
      expect(result.data).toHaveLength(1);
      expect(result.data[0].deletedAt).not.toBeNull();
      expect(result.data[0].content).toBe("");
      // But they don't count toward the total
      expect(result.meta.total).toBe(0);
    });
  });

  describe("getMessageCount", () => {
    it("should return count of non-deleted top-level messages", async () => {
      const count = await messageService.getMessageCount(testTripId);
      expect(count).toBe(1);
    });

    it("should not count replies", async () => {
      // Create a reply
      await messageService.createMessage(testTripId, testMemberId, {
        content: "A reply",
        parentId: testMessageId,
      });

      const count = await messageService.getMessageCount(testTripId);
      expect(count).toBe(1); // Still 1 top-level message
    });

    it("should not count deleted messages", async () => {
      await messageService.deleteMessage(
        testMessageId,
        testOrganizerId,
        testTripId,
      );

      const count = await messageService.getMessageCount(testTripId);
      expect(count).toBe(0);
    });
  });

  describe("getLatestMessage", () => {
    it("should return the most recent message", async () => {
      // Create another message
      await messageService.createMessage(testTripId, testMemberId, {
        content: "Newer message",
      });

      const latest = await messageService.getLatestMessage(
        testTripId,
        testMemberId,
      );

      expect(latest).not.toBeNull();
      expect(latest!.content).toBe("Newer message");
    });

    it("should return null for empty trip", async () => {
      // Create a new trip with no messages
      const emptyTripResult = await db
        .insert(trips)
        .values({
          name: "Empty Trip",
          destination: "Nowhere",
          preferredTimezone: "UTC",
          createdBy: testOrganizerId,
        })
        .returning();
      const emptyTripId = emptyTripResult[0].id;

      try {
        const latest = await messageService.getLatestMessage(
          emptyTripId,
          testMemberId,
        );
        expect(latest).toBeNull();
      } finally {
        await db.delete(trips).where(eq(trips.id, emptyTripId));
      }
    });
  });

  describe("permissions", () => {
    it("canViewMessages should return true for going member", async () => {
      const result = await permissionsService.canViewMessages(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("canViewMessages should return false for non-member", async () => {
      const result = await permissionsService.canViewMessages(
        testNonMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });

    it("canPostMessage should return true for going member", async () => {
      const result = await permissionsService.canPostMessage(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("canPostMessage should return false for muted member", async () => {
      // Mute the member
      await db.insert(mutedMembers).values({
        tripId: testTripId,
        userId: testMemberId,
        mutedBy: testOrganizerId,
      });

      const result = await permissionsService.canPostMessage(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });

    it("canModerateMessages should return true for organizer", async () => {
      const result = await permissionsService.canModerateMessages(
        testOrganizerId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("canModerateMessages should return false for regular member", async () => {
      const result = await permissionsService.canModerateMessages(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });

    it("isMemberMuted should return true when muted", async () => {
      await db.insert(mutedMembers).values({
        tripId: testTripId,
        userId: testMemberId,
        mutedBy: testOrganizerId,
      });

      const result = await permissionsService.isMemberMuted(
        testTripId,
        testMemberId,
      );
      expect(result).toBe(true);
    });

    it("isMemberMuted should return false when not muted", async () => {
      const result = await permissionsService.isMemberMuted(
        testTripId,
        testMemberId,
      );
      expect(result).toBe(false);
    });

    it("canMuteMember should return true for organizer targeting non-organizer", async () => {
      const result = await permissionsService.canMuteMember(
        testOrganizerId,
        testTripId,
        testMemberId,
      );
      expect(result).toBe(true);
    });

    it("canMuteMember should return false for non-organizer", async () => {
      const result = await permissionsService.canMuteMember(
        testMemberId,
        testTripId,
        testOrganizerId,
      );
      expect(result).toBe(false);
    });

    it("canMuteMember should return false when target is organizer", async () => {
      const result = await permissionsService.canMuteMember(
        testOrganizerId,
        testTripId,
        testOrganizerId,
      );
      expect(result).toBe(false);
    });
  });

  describe("muteMember", () => {
    it("should mute a member as organizer", async () => {
      await messageService.muteMember(
        testTripId,
        testMemberId,
        testOrganizerId,
      );

      const isMuted = await messageService.isMuted(testTripId, testMemberId);
      expect(isMuted).toBe(true);
    });

    it("should throw AlreadyMutedError if member is already muted", async () => {
      await messageService.muteMember(
        testTripId,
        testMemberId,
        testOrganizerId,
      );

      await expect(
        messageService.muteMember(testTripId, testMemberId, testOrganizerId),
      ).rejects.toThrow(AlreadyMutedError);
    });

    it("should throw CannotMuteOrganizerError when targeting an organizer", async () => {
      await expect(
        messageService.muteMember(testTripId, testOrganizerId, testOrganizerId),
      ).rejects.toThrow(CannotMuteOrganizerError);
    });

    it("should throw PermissionDeniedError for non-organizer", async () => {
      await expect(
        messageService.muteMember(testTripId, testOrganizerId, testMemberId),
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe("unmuteMember", () => {
    it("should unmute a muted member as organizer", async () => {
      // Mute first
      await db.insert(mutedMembers).values({
        tripId: testTripId,
        userId: testMemberId,
        mutedBy: testOrganizerId,
      });

      await messageService.unmuteMember(
        testTripId,
        testMemberId,
        testOrganizerId,
      );

      const isMuted = await messageService.isMuted(testTripId, testMemberId);
      expect(isMuted).toBe(false);
    });

    it("should throw NotMutedError if member is not muted", async () => {
      await expect(
        messageService.unmuteMember(testTripId, testMemberId, testOrganizerId),
      ).rejects.toThrow(NotMutedError);
    });

    it("should throw PermissionDeniedError for non-organizer", async () => {
      await expect(
        messageService.unmuteMember(testTripId, testOrganizerId, testMemberId),
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe("isMuted", () => {
    it("should return true when member is muted", async () => {
      await db.insert(mutedMembers).values({
        tripId: testTripId,
        userId: testMemberId,
        mutedBy: testOrganizerId,
      });

      const result = await messageService.isMuted(testTripId, testMemberId);
      expect(result).toBe(true);
    });

    it("should return false when member is not muted", async () => {
      const result = await messageService.isMuted(testTripId, testMemberId);
      expect(result).toBe(false);
    });
  });

  describe("getMutedMembers", () => {
    it("should return list of muted members", async () => {
      await db.insert(mutedMembers).values({
        tripId: testTripId,
        userId: testMemberId,
        mutedBy: testOrganizerId,
      });

      const result = await messageService.getMutedMembers(testTripId);
      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe(testMemberId);
      expect(result[0].mutedBy).toBe(testOrganizerId);
      expect(result[0].createdAt).toBeInstanceOf(Date);
    });

    it("should return empty array when no muted members", async () => {
      const result = await messageService.getMutedMembers(testTripId);
      expect(result).toEqual([]);
    });
  });

  describe("XSS sanitization", () => {
    it("should strip HTML tags from message content on create", async () => {
      const result = await messageService.createMessage(
        testTripId,
        testMemberId,
        { content: "<script>alert('xss')</script>Hello" },
      );

      expect(result.content).toBe("alert('xss')Hello");
    });

    it("should strip HTML tags from message content on edit", async () => {
      // Create a message as organizer (who owns testMessageId)
      const result = await messageService.editMessage(
        testMessageId,
        testOrganizerId,
        "<b>bold</b> text",
      );

      expect(result.content).toBe("bold text");
    });
  });

  describe("daily rate limit", () => {
    it("should reject when daily message limit (200) is reached", async () => {
      // Bulk insert 200 reply messages for the test member today
      // Use replies to avoid the 100 top-level message limit
      const insertValues = [];
      for (let i = 0; i < 200; i++) {
        insertValues.push({
          tripId: testTripId,
          authorId: testMemberId,
          parentId: testMessageId,
          content: `Rate limit message ${i + 1}`,
        });
      }
      await db.insert(messages).values(insertValues);

      // Attempt to create one more message (reply) should fail with DailyMessageLimitError
      await expect(
        messageService.createMessage(testTripId, testMemberId, {
          content: "One too many today",
          parentId: testMessageId,
        }),
      ).rejects.toThrow(DailyMessageLimitError);
    });
  });
});
