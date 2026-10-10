import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, trips, members, userBlocks } from "@/db/schema/index.js";
import { and, eq, inArray } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";

// Track fixtures per test for DB cleanup (members -> trips -> users).
const createdTripIds: string[] = [];
const createdUserIds: string[] = [];

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
  createdTripIds.push(trip!.id);
  createdUserIds.push(organizer!.id);
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
  createdUserIds.push(member!.id);
  return { organizer, trip, member: member! };
}

/** A user outside both trips above, tracked for the cleanup below. */
async function createUser(displayName: string) {
  const [user] = await db
    .insert(users)
    .values({
      phoneNumber: generateUniquePhone(),
      displayName,
      timezone: "UTC",
    })
    .returning();
  createdUserIds.push(user!.id);
  return user!;
}

describe("Guest Member Routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    // DB cleanup: members -> trips -> users (FK order)
    for (const tripId of createdTripIds.splice(0)) {
      await db.delete(members).where(eq(members.tripId, tripId));
      await db.delete(trips).where(eq(trips.id, tripId));
    }
    for (const userId of createdUserIds.splice(0)) {
      await db.delete(users).where(eq(users.id, userId));
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

    it("should return 400 (not 500) on invalid guestPhone", async () => {
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
        payload: { displayName: "Mom", guestPhone: "not-a-phone" },
      });
      expect(response.statusCode).toBe(400);
    });

    it("should refuse a blocked phone with exactly the answer an unavailable one gets, and write no guest row", async () => {
      // A guest row is an invitation waiting to happen:
      // `processPendingInvitations` claims it by phone on the owner's next
      // sign-in. Adding a guest whose owner is blocked is therefore the
      // organizer inviting them, which is the act the block forbids.
      app = await buildApp();
      const { organizer, trip } = await setupTripWithOrganizer();

      // The baseline the refusal is measured against: a phone that is
      // genuinely unavailable because its owner is already in the trip.
      const taken = await createUser("Already On Trip");
      await db
        .insert(members)
        .values({ tripId: trip.id, userId: taken.id, status: "going" });

      // Two blocks, one each way round the organizer, plus a phone nobody
      // has blocked.
      const blockedByOrganizer = await createUser("Blocked By Organizer");
      const blockerOfOrganizer = await createUser("Blocker Of Organizer");
      const unblocked = await createUser("Unblocked");
      await db.insert(userBlocks).values([
        { blockerId: organizer.id, blockedId: blockedByOrganizer.id },
        { blockerId: blockerOfOrganizer.id, blockedId: organizer.id },
      ]);

      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });
      const addGuest = (guestPhone: string) =>
        app.inject({
          method: "POST",
          url: `/api/trips/${trip.id}/members/guests`,
          cookies: { auth_token: token },
          payload: { displayName: "Guest", guestPhone },
        });

      const baseline = await addGuest(taken.phoneNumber);
      expect(baseline.statusCode).toBe(409);
      const baselineBody = JSON.parse(baseline.body);
      expect(baselineBody.error.code).toBe("DUPLICATE_MEMBER");

      for (const phone of [
        blockedByOrganizer.phoneNumber,
        blockerOfOrganizer.phoneNumber,
      ]) {
        const response = await addGuest(phone);

        // The same answer, status, code and message — the organizer may be
        // the side the block was written against, so an answer that named a
        // block would tell them what the block was meant to keep from them.
        expect(response.statusCode).toBe(baseline.statusCode);
        expect(JSON.parse(response.body)).toMatchObject({
          success: false,
          error: {
            code: baselineBody.error.code,
            message: baselineBody.error.message,
          },
        });
      }

      // Refusing has to be the whole of it: a row left behind is one the
      // blocked user claims on their next sign-in.
      const written = await db
        .select({ guestPhone: members.guestPhone })
        .from(members)
        .where(
          and(
            eq(members.tripId, trip.id),
            inArray(members.guestPhone, [
              blockedByOrganizer.phoneNumber,
              blockerOfOrganizer.phoneNumber,
            ]),
          ),
        );
      expect(written).toHaveLength(0);

      // The guard is about the block, not about phones with an account.
      const allowed = await addGuest(unblocked.phoneNumber);
      expect(allowed.statusCode).toBe(201);
      expect(JSON.parse(allowed.body).member.guestPhone).toBe(
        unblocked.phoneNumber,
      );
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

    it("should refuse a re-phone onto a blocked number, and leave a row that already carries it alone", async () => {
      // The create guard is one door; a PATCH is the same act one step
      // later, because the claim on the owner's next sign-in matches on the
      // phone the row carries. A row that already carries the number is the
      // pre-existing-row case a block deliberately leaves alone.
      app = await buildApp();
      const { organizer, trip } = await setupTripWithOrganizer();
      const blocked = await createUser("Blocked Counterpart");
      await db
        .insert(userBlocks)
        .values({ blockerId: organizer.id, blockedId: blocked.id });

      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });
      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/members/guests`,
        cookies: { auth_token: token },
        payload: { displayName: "Name Only" },
      });
      expect(created.statusCode).toBe(201);
      const guestId = JSON.parse(created.body).member.id;

      const rephoned = await app.inject({
        method: "PATCH",
        url: `/api/trips/${trip.id}/members/guests/${guestId}`,
        cookies: { auth_token: token },
        payload: { guestPhone: blocked.phoneNumber },
      });
      expect(rephoned.statusCode).toBe(409);
      expect(JSON.parse(rephoned.body).error.code).toBe("DUPLICATE_MEMBER");

      // The number did not land on the row: a refusal that still wrote the
      // phone would be the crossing it just refused.
      const after = await db
        .select({ guestPhone: members.guestPhone })
        .from(members)
        .where(eq(members.id, guestId));
      expect(after[0]!.guestPhone).toBeNull();

      const [preExisting] = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: null,
          guestDisplayName: "Already There",
          guestPhone: blocked.phoneNumber,
        })
        .returning();

      const samePhone = await app.inject({
        method: "PATCH",
        url: `/api/trips/${trip.id}/members/guests/${preExisting!.id}`,
        cookies: { auth_token: token },
        payload: { guestPhone: blocked.phoneNumber, status: "going" },
      });
      expect(samePhone.statusCode).toBe(200);
      const samePhoneBody = JSON.parse(samePhone.body);
      expect(samePhoneBody.member.status).toBe("going");
      expect(samePhoneBody.member.guestPhone).toBe(blocked.phoneNumber);
    });

    it("should return 400 (not 500) on invalid guestPhone", async () => {
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
        payload: { guestPhone: "not-a-phone" },
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
