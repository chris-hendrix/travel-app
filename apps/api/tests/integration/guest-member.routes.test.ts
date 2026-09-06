import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, trips, members } from "@/db/schema/index.js";
import { generateUniquePhone } from "../test-utils.js";

async function setupTripWithOrganizer() {
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
      preferredTimezone: "Europe/Paris",
      createdBy: organizer!.id,
    })
    .returning();
  await db.insert(members).values({
    tripId: trip!.id,
    userId: organizer!.id,
    status: "going",
    isOrganizer: true,
  });
  return { organizer: organizer!, trip: trip! };
}

async function setupTripWithMember() {
  const { organizer, trip } = await setupTripWithOrganizer();
  const [member] = await db
    .insert(users)
    .values({
      phoneNumber: generateUniquePhone(),
      displayName: "Member",
      timezone: "UTC",
    })
    .returning();
  await db.insert(members).values({
    tripId: trip.id,
    userId: member!.id,
    status: "going",
    isOrganizer: false,
  });
  return { organizer, trip, member: member! };
}

describe("Guest Member Routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("POST /api/trips/:tripId/members/guests", () => {
    it("should return 401 when not authenticated", async () => {
      app = await buildApp();
      const { trip } = await setupTripWithOrganizer();
      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/members/guests`,
        payload: { displayName: "Mom" },
      });
      expect(response.statusCode).toBe(401);
    });

    it("should return 403 for non-organizer", async () => {
      app = await buildApp();
      const { trip, member } = await setupTripWithMember();
      const token = app.jwt.sign({ sub: member.id, name: member.displayName });
      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/members/guests`,
        cookies: { auth_token: token },
        payload: { displayName: "Mom" },
      });
      expect(response.statusCode).toBe(403);
    });

    it("should return 400 on invalid body (missing displayName)", async () => {
      app = await buildApp();
      const { organizer, trip } = await setupTripWithOrganizer();
      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });
      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/members/guests`,
        cookies: { auth_token: token },
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    });

    it("should create a guest (name only) and return MemberWithProfile shape", async () => {
      app = await buildApp();
      const { organizer, trip } = await setupTripWithOrganizer();
      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });
      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/members/guests`,
        cookies: { auth_token: token },
        payload: { displayName: "Mom" },
      });
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.member.userId).toBeNull();
      expect(body.member.displayName).toBe("Mom");
      expect(body.member).not.toHaveProperty("isGuest");
      expect(body.member.status).toBe("no_response");
      expect(body.member.isOrganizer).toBe(false);
    });

    it("should create a guest with phone and surface guestPhone (organizer view)", async () => {
      app = await buildApp();
      const { organizer, trip } = await setupTripWithOrganizer();
      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });
      const phone = generateUniquePhone();
      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/members/guests`,
        cookies: { auth_token: token },
        payload: { displayName: "Grandma", guestPhone: phone },
      });
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.member.userId).toBeNull();
      expect(body.member.guestPhone).toBe(phone);
      expect(body.member).not.toHaveProperty("isGuest");
    });

    it("should return 409 on duplicate guestPhone", async () => {
      app = await buildApp();
      const { organizer, trip } = await setupTripWithOrganizer();
      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });
      const phone = generateUniquePhone();
      const first = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/members/guests`,
        cookies: { auth_token: token },
        payload: { displayName: "Mom", guestPhone: phone },
      });
      expect(first.statusCode).toBe(201);
      const second = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/members/guests`,
        cookies: { auth_token: token },
        payload: { displayName: "Mom 2", guestPhone: phone },
      });
      expect(second.statusCode).toBe(409);
    });
  });

  describe("PATCH /api/trips/:tripId/members/guests/:memberId", () => {
    it("should return 401 when not authenticated", async () => {
      app = await buildApp();
      const { organizer, trip } = await setupTripWithOrganizer();
      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });
      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/members/guests`,
        cookies: { auth_token: token },
        payload: { displayName: "Mom" },
      });
      const guestId = JSON.parse(created.body).member.id;
      const response = await app.inject({
        method: "PATCH",
        url: `/api/trips/${trip.id}/members/guests/${guestId}`,
        payload: { displayName: "Mama" },
      });
      expect(response.statusCode).toBe(401);
    });

    it("should return 403 for non-organizer", async () => {
      app = await buildApp();
      const { organizer, trip, member } = await setupTripWithMember();
      const orgToken = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });
      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/members/guests`,
        cookies: { auth_token: orgToken },
        payload: { displayName: "Mom" },
      });
      const guestId = JSON.parse(created.body).member.id;
      const memberToken = app.jwt.sign({
        sub: member.id,
        name: member.displayName,
      });
      const response = await app.inject({
        method: "PATCH",
        url: `/api/trips/${trip.id}/members/guests/${guestId}`,
        cookies: { auth_token: memberToken },
        payload: { displayName: "Mama" },
      });
      expect(response.statusCode).toBe(403);
    });

    it("should update guest displayName and status", async () => {
      app = await buildApp();
      const { organizer, trip } = await setupTripWithOrganizer();
      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });
      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/members/guests`,
        cookies: { auth_token: token },
        payload: { displayName: "Mom" },
      });
      const guestId = JSON.parse(created.body).member.id;
      const response = await app.inject({
        method: "PATCH",
        url: `/api/trips/${trip.id}/members/guests/${guestId}`,
        cookies: { auth_token: token },
        payload: { displayName: "Mama", status: "going" },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.member.userId).toBeNull();
      expect(body.member.displayName).toBe("Mama");
      expect(body.member.status).toBe("going");
      expect(body.member).not.toHaveProperty("isGuest");
    });

    it("should return 400 on invalid status", async () => {
      app = await buildApp();
      const { organizer, trip } = await setupTripWithOrganizer();
      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });
      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/members/guests`,
        cookies: { auth_token: token },
        payload: { displayName: "Mom" },
      });
      const guestId = JSON.parse(created.body).member.id;
      const response = await app.inject({
        method: "PATCH",
        url: `/api/trips/${trip.id}/members/guests/${guestId}`,
        cookies: { auth_token: token },
        payload: { status: "bogus" },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe("DELETE /api/trips/:tripId/members/guests/:memberId", () => {
    it("should return 401 when not authenticated", async () => {
      app = await buildApp();
      const { organizer, trip } = await setupTripWithOrganizer();
      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });
      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/members/guests`,
        cookies: { auth_token: token },
        payload: { displayName: "Mom" },
      });
      const guestId = JSON.parse(created.body).member.id;
      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}/members/guests/${guestId}`,
      });
      expect(response.statusCode).toBe(401);
    });

    it("should return 403 for non-organizer and 204 for organizer", async () => {
      app = await buildApp();
      const { organizer, trip, member } = await setupTripWithMember();
      const orgToken = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });
      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/members/guests`,
        cookies: { auth_token: orgToken },
        payload: { displayName: "Mom" },
      });
      const guestId = JSON.parse(created.body).member.id;
      const memberToken = app.jwt.sign({
        sub: member.id,
        name: member.displayName,
      });
      const denied = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}/members/guests/${guestId}`,
        cookies: { auth_token: memberToken },
      });
      expect(denied.statusCode).toBe(403);
      const deleted = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}/members/guests/${guestId}`,
        cookies: { auth_token: orgToken },
      });
      expect(deleted.statusCode).toBe(204);
    });
  });
});
