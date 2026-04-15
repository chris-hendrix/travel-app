import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  messages,
  messageReactions,
  mutedMembers,
} from "@/db/schema/index.js";
import { generateUniquePhone } from "../test-utils.js";

describe("Message Routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("POST /api/trips/:tripId/messages", () => {
    it("should create a message and return 201", async () => {
      app = await buildApp();

      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/messages`,
        cookies: { auth_token: token },
        payload: {
          content: "Hello, trip friends!",
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("message");
      expect(body.message).toMatchObject({
        tripId: trip.id,
        authorId: testUser.id,
        content: "Hello, trip friends!",
        isPinned: false,
        parentId: null,
      });
      expect(body.message.author).toMatchObject({
        id: testUser.id,
        displayName: "Test User",
      });
      expect(body.message.reactions).toEqual([]);
    });

    it("should create a reply and return 201", async () => {
      app = await buildApp();

      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      // Create a parent message
      const [parentMessage] = await db
        .insert(messages)
        .values({
          tripId: trip.id,
          authorId: testUser.id,
          content: "Parent message",
        })
        .returning();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/messages`,
        cookies: { auth_token: token },
        payload: {
          content: "This is a reply",
          parentId: parentMessage.id,
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.message.parentId).toBe(parentMessage.id);
      expect(body.message.content).toBe("This is a reply");
    });

    it("should return 401 if not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/messages",
        payload: {
          content: "Hello",
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 403 if user is not a going member", async () => {
      app = await buildApp();

      // Create trip owner
      const [owner] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Owner",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: owner.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: owner.id,
        status: "going",
      });

      // Create non-member user
      const [nonMember] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Non Member",
          timezone: "UTC",
        })
        .returning();

      const token = app.jwt.sign({
        sub: nonMember.id,
        name: nonMember.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/messages`,
        cookies: { auth_token: token },
        payload: {
          content: "I should not be able to post",
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it("should return 400 with invalid body (empty content)", async () => {
      app = await buildApp();

      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/messages`,
        cookies: { auth_token: token },
        payload: {
          content: "",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 403 if member is muted", async () => {
      app = await buildApp();

      // Create organizer
      const [organizer] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer",
          timezone: "UTC",
        })
        .returning();

      // Create muted user
      const [mutedUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Muted User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: organizer.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      await db.insert(members).values({
        tripId: trip.id,
        userId: mutedUser.id,
        status: "going",
      });

      // Mute the user
      await db.insert(mutedMembers).values({
        tripId: trip.id,
        userId: mutedUser.id,
        mutedBy: organizer.id,
      });

      const token = app.jwt.sign({
        sub: mutedUser.id,
        name: mutedUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/messages`,
        cookies: { auth_token: token },
        payload: {
          content: "I am muted",
        },
      });

      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe("GET /api/trips/:tripId/messages", () => {
    it("should return paginated messages with 200", async () => {
      app = await buildApp();

      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      // Create some messages
      await db.insert(messages).values([
        {
          tripId: trip.id,
          authorId: testUser.id,
          content: "Message 1",
        },
        {
          tripId: trip.id,
          authorId: testUser.id,
          content: "Message 2",
        },
        {
          tripId: trip.id,
          authorId: testUser.id,
          content: "Message 3",
        },
      ]);

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/messages?limit=2`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("messages");
      expect(body.messages).toHaveLength(2);
      expect(body).toHaveProperty("meta");
      expect(body.meta).toMatchObject({
        total: 3,
        limit: 2,
        hasMore: true,
      });
      expect(body.meta.nextCursor).toBeDefined();
    });

    it("should return empty list when no messages with 200", async () => {
      app = await buildApp();

      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/messages`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.messages).toHaveLength(0);
      expect(body.meta.total).toBe(0);
    });

    it("should return 401 if not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/messages",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/trips/:tripId/messages/count", () => {
    it("should return message count with 200", async () => {
      app = await buildApp();

      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      // Create some messages (2 top-level, 1 reply)
      const [parentMsg] = await db
        .insert(messages)
        .values({
          tripId: trip.id,
          authorId: testUser.id,
          content: "Top-level 1",
        })
        .returning();

      await db.insert(messages).values({
        tripId: trip.id,
        authorId: testUser.id,
        content: "Top-level 2",
      });

      await db.insert(messages).values({
        tripId: trip.id,
        authorId: testUser.id,
        content: "Reply to 1",
        parentId: parentMsg.id,
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/messages/count`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      // Count should be 2 (only top-level, non-deleted messages)
      expect(body.count).toBe(2);
    });
  });

  describe("GET /api/trips/:tripId/messages/latest", () => {
    it("should return latest message with 200", async () => {
      app = await buildApp();

      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      await db.insert(messages).values({
        tripId: trip.id,
        authorId: testUser.id,
        content: "First message",
      });

      // Small delay to ensure ordering
      await db.insert(messages).values({
        tripId: trip.id,
        authorId: testUser.id,
        content: "Latest message",
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/messages/latest`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("message");
      expect(body.message).not.toBeNull();
      expect(body.message.content).toBe("Latest message");
    });

    it("should return null message when no messages", async () => {
      app = await buildApp();

      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/messages/latest`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.message).toBeNull();
    });
  });

  describe("PUT /api/trips/:tripId/messages/:messageId", () => {
    it("should edit own message and return 200", async () => {
      app = await buildApp();

      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      const [message] = await db
        .insert(messages)
        .values({
          tripId: trip.id,
          authorId: testUser.id,
          content: "Original content",
        })
        .returning();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${trip.id}/messages/${message.id}`,
        cookies: { auth_token: token },
        payload: {
          content: "Updated content",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.message.content).toBe("Updated content");
      expect(body.message.editedAt).not.toBeNull();
    });

    it("should return 403 when editing another user's message", async () => {
      app = await buildApp();

      // Create message author
      const [author] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Author",
          timezone: "UTC",
        })
        .returning();

      // Create another user
      const [otherUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Other User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: author.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: author.id,
        status: "going",
      });

      await db.insert(members).values({
        tripId: trip.id,
        userId: otherUser.id,
        status: "going",
      });

      const [message] = await db
        .insert(messages)
        .values({
          tripId: trip.id,
          authorId: author.id,
          content: "Author's message",
        })
        .returning();

      const token = app.jwt.sign({
        sub: otherUser.id,
        name: otherUser.displayName,
      });

      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${trip.id}/messages/${message.id}`,
        cookies: { auth_token: token },
        payload: {
          content: "Trying to edit someone else's message",
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe("DELETE /api/trips/:tripId/messages/:messageId", () => {
    it("should delete own message and return 200", async () => {
      app = await buildApp();

      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      const [message] = await db
        .insert(messages)
        .values({
          tripId: trip.id,
          authorId: testUser.id,
          content: "To be deleted",
        })
        .returning();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}/messages/${message.id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
    });

    it("should allow organizer to delete another's message", async () => {
      app = await buildApp();

      // Create organizer
      const [organizer] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer",
          timezone: "UTC",
        })
        .returning();

      // Create regular member
      const [member] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Member",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: organizer.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      await db.insert(members).values({
        tripId: trip.id,
        userId: member.id,
        status: "going",
      });

      const [message] = await db
        .insert(messages)
        .values({
          tripId: trip.id,
          authorId: member.id,
          content: "Member's message",
        })
        .returning();

      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}/messages/${message.id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
    });
  });

  describe("PATCH /api/trips/:tripId/messages/:messageId/pin", () => {
    it("should allow organizer to pin a message", async () => {
      app = await buildApp();

      const [organizer] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: organizer.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      const [message] = await db
        .insert(messages)
        .values({
          tripId: trip.id,
          authorId: organizer.id,
          content: "Important announcement",
        })
        .returning();

      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/api/trips/${trip.id}/messages/${message.id}/pin`,
        cookies: { auth_token: token },
        payload: {
          pinned: true,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.message.isPinned).toBe(true);
    });

    it("should return 403 when non-organizer tries to pin", async () => {
      app = await buildApp();

      // Create organizer
      const [organizer] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer",
          timezone: "UTC",
        })
        .returning();

      // Create regular member
      const [member] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Member",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: organizer.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      await db.insert(members).values({
        tripId: trip.id,
        userId: member.id,
        status: "going",
      });

      const [message] = await db
        .insert(messages)
        .values({
          tripId: trip.id,
          authorId: member.id,
          content: "Regular message",
        })
        .returning();

      const token = app.jwt.sign({
        sub: member.id,
        name: member.displayName,
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/api/trips/${trip.id}/messages/${message.id}/pin`,
        cookies: { auth_token: token },
        payload: {
          pinned: true,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe("POST /api/trips/:tripId/messages/:messageId/reactions", () => {
    it("should add a reaction and return 200", async () => {
      app = await buildApp();

      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      const [message] = await db
        .insert(messages)
        .values({
          tripId: trip.id,
          authorId: testUser.id,
          content: "React to this",
        })
        .returning();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/messages/${message.id}/reactions`,
        cookies: { auth_token: token },
        payload: {
          emoji: "heart",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("reactions");
      expect(body.reactions).toHaveLength(1);
      expect(body.reactions[0]).toMatchObject({
        emoji: "heart",
        count: 1,
        reacted: true,
      });
    });

    it("should remove reaction on second toggle", async () => {
      app = await buildApp();

      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      const [message] = await db
        .insert(messages)
        .values({
          tripId: trip.id,
          authorId: testUser.id,
          content: "React to this",
        })
        .returning();

      // Add existing reaction
      await db.insert(messageReactions).values({
        messageId: message.id,
        userId: testUser.id,
        emoji: "thumbs_up",
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      // Toggle same reaction again to remove it
      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/messages/${message.id}/reactions`,
        cookies: { auth_token: token },
        payload: {
          emoji: "thumbs_up",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.reactions).toHaveLength(0);
    });
  });

  describe("POST /api/trips/:tripId/members/:memberId/mute", () => {
    it("should mute a member and return 200", async () => {
      app = await buildApp();

      const [organizer] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer",
          timezone: "UTC",
        })
        .returning();

      const [member] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Member",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: organizer.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      await db.insert(members).values({
        tripId: trip.id,
        userId: member.id,
        status: "going",
      });

      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/members/${member.id}/mute`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
    });

    it("should return 409 if already muted", async () => {
      app = await buildApp();

      const [organizer] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer",
          timezone: "UTC",
        })
        .returning();

      const [member] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Member",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: organizer.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      await db.insert(members).values({
        tripId: trip.id,
        userId: member.id,
        status: "going",
      });

      // Mute the member first
      await db.insert(mutedMembers).values({
        tripId: trip.id,
        userId: member.id,
        mutedBy: organizer.id,
      });

      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/members/${member.id}/mute`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(409);
    });

    it("should return 403 when trying to mute an organizer", async () => {
      app = await buildApp();

      const [organizer1] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer 1",
          timezone: "UTC",
        })
        .returning();

      const [organizer2] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer 2",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: organizer1.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer1.id,
        status: "going",
        isOrganizer: true,
      });

      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer2.id,
        status: "going",
        isOrganizer: true,
      });

      const token = app.jwt.sign({
        sub: organizer1.id,
        name: organizer1.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/members/${organizer2.id}/mute`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(403);
    });

    it("should return 403 when non-organizer tries to mute", async () => {
      app = await buildApp();

      const [organizer] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer",
          timezone: "UTC",
        })
        .returning();

      const [member] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Member",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: organizer.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      await db.insert(members).values({
        tripId: trip.id,
        userId: member.id,
        status: "going",
      });

      const token = app.jwt.sign({
        sub: member.id,
        name: member.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/members/${organizer.id}/mute`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(403);
    });

    it("should return 401 when not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/members/550e8400-e29b-41d4-a716-446655440001/mute",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("DELETE /api/trips/:tripId/members/:memberId/mute", () => {
    it("should unmute a member and return 200", async () => {
      app = await buildApp();

      const [organizer] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer",
          timezone: "UTC",
        })
        .returning();

      const [member] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Member",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: organizer.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      await db.insert(members).values({
        tripId: trip.id,
        userId: member.id,
        status: "going",
      });

      // Mute the member first
      await db.insert(mutedMembers).values({
        tripId: trip.id,
        userId: member.id,
        mutedBy: organizer.id,
      });

      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}/members/${member.id}/mute`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
    });

    it("should return 404 when member is not muted", async () => {
      app = await buildApp();

      const [organizer] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer",
          timezone: "UTC",
        })
        .returning();

      const [member] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Member",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: organizer.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      await db.insert(members).values({
        tripId: trip.id,
        userId: member.id,
        status: "going",
      });

      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}/members/${member.id}/mute`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(404);
    });

    it("should return 403 when non-organizer tries to unmute", async () => {
      app = await buildApp();

      const [organizer] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer",
          timezone: "UTC",
        })
        .returning();

      const [member] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Member",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: organizer.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      await db.insert(members).values({
        tripId: trip.id,
        userId: member.id,
        status: "going",
      });

      // Mute the member
      await db.insert(mutedMembers).values({
        tripId: trip.id,
        userId: member.id,
        mutedBy: organizer.id,
      });

      const token = app.jwt.sign({
        sub: member.id,
        name: member.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}/members/${member.id}/mute`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(403);
    });

    it("should return 401 when not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "DELETE",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/members/550e8400-e29b-41d4-a716-446655440001/mute",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("XSS sanitization", () => {
    it("should strip HTML tags from message content", async () => {
      app = await buildApp();

      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/messages`,
        cookies: { auth_token: token },
        payload: {
          content: "<script>alert('xss')</script>Hello world",
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.message.content).toBe("alert('xss')Hello world");
    });
  });

  describe("Daily rate limit", () => {
    it("should return 429 when daily message limit reached", async () => {
      app = await buildApp();

      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      // Create a parent message for replies
      const [parentMsg] = await db
        .insert(messages)
        .values({
          tripId: trip.id,
          authorId: testUser.id,
          content: "Parent message",
        })
        .returning();

      // Bulk insert 200 reply messages for today to avoid the 100 top-level limit
      const insertValues = [];
      for (let i = 0; i < 200; i++) {
        insertValues.push({
          tripId: trip.id,
          authorId: testUser.id,
          parentId: parentMsg.id,
          content: `Rate limit message ${i + 1}`,
        });
      }
      await db.insert(messages).values(insertValues);

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/messages`,
        cookies: { auth_token: token },
        payload: {
          content: "One too many",
          parentId: parentMsg.id,
        },
      });

      expect(response.statusCode).toBe(429);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("DAILY_MESSAGE_LIMIT");
    });
  });

});
