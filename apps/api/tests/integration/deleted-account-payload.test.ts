import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, trips, members, notifications } from "@/db/schema/index.js";
import { and, eq, inArray } from "drizzle-orm";
import { UserService } from "@/services/user.service.js";
import { generateUniquePhone } from "../test-utils.js";

/**
 * The wire, for the two payloads that used to show a tombstone.
 *
 * `getTripMembers` and `getTripById` mask a soft-deleted account's phone
 * number at the source, so this asserts what actually leaves the server: the
 * `phoneNumber` field is absent rather than present-and-null (the response
 * schemas type it as optional, and the client renders absence as no number
 * line), and the `deleted:<uuid>` tombstone appears nowhere in the body.
 *
 * The account is deleted through the real `UserService.deleteAccount`, and
 * every assertion is scoped to rows this file created.
 */
describe("a deleted account in a trip payload", () => {
  let app: FastifyInstance;

  let organizerPhone: string;
  let livePhone: string;
  let deletedPhone: string;

  let organizerId: string;
  let liveId: string;
  let deletedId: string;

  let tripId: string;

  const cleanup = async () => {
    const ids = [organizerId, liveId, deletedId].filter(Boolean);
    const phones = [organizerPhone, livePhone, deletedPhone].filter(Boolean);

    if (tripId) {
      await db.delete(notifications).where(eq(notifications.tripId, tripId));
      await db.delete(members).where(eq(members.tripId, tripId));
      await db.delete(trips).where(eq(trips.id, tripId));
    }
    if (ids.length > 0) {
      // By id as well as by phone: the deleted account's phone is a tombstone
      // by then, so a phone match alone would leave its row behind.
      await db.delete(notifications).where(inArray(notifications.userId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    if (phones.length > 0) {
      await db.delete(users).where(inArray(users.phoneNumber, phones));
    }
  };

  afterEach(async () => {
    await cleanup();
    tripId = "";
    if (app) {
      await app.close();
    }
  });

  /** A trip with a live organizer, a live member, and a member who deletes. */
  const buildFixture = async () => {
    app = await buildApp();

    organizerPhone = generateUniquePhone();
    livePhone = generateUniquePhone();
    deletedPhone = generateUniquePhone();

    await cleanup();

    const inserted = await db
      .insert(users)
      .values([
        { phoneNumber: organizerPhone, displayName: "Payload Organizer" },
        { phoneNumber: livePhone, displayName: "Payload Member" },
        { phoneNumber: deletedPhone, displayName: "Payload Leaver" },
      ])
      .returning();

    organizerId = inserted[0]!.id;
    liveId = inserted[1]!.id;
    deletedId = inserted[2]!.id;

    const [trip] = await db
      .insert(trips)
      .values({
        name: "Deleted Payload Trip",
        destination: "Naples",
        preferredTimezone: "Europe/Rome",
        createdBy: organizerId,
      })
      .returning();
    tripId = trip!.id;

    await db.insert(members).values([
      { tripId, userId: organizerId, status: "going", isOrganizer: true },
      { tripId, userId: liveId, status: "going", sharePhone: true },
      {
        tripId,
        userId: deletedId,
        status: "going",
        isOrganizer: true,
        sharePhone: true,
      },
    ]);

    await new UserService(db).deleteAccount(deletedId);
  };

  const tokenFor = (userId: string, name: string) =>
    app.jwt.sign({ sub: userId, name });

  const rosterOf = (responseBody: string) =>
    (JSON.parse(responseBody) as { members: { userId: string }[] }).members;

  it("GET /api/trips/:id masks a tombstoned co-organizer for an organizer", async () => {
    await buildFixture();

    const response = await app.inject({
      method: "GET",
      url: `/api/trips/${tripId}`,
      cookies: { auth_token: tokenFor(organizerId, "Payload Organizer") },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("deleted:");

    const organizers = (
      JSON.parse(response.body) as { trip: { organizers: { id: string }[] } }
    ).trip.organizers;

    const deletedOrganizer = organizers.find((o) => o.id === deletedId);
    expect(deletedOrganizer).toBeDefined();
    // Absent, not empty and not null: the client's "no number" rendering is
    // the absent field.
    expect(deletedOrganizer).not.toHaveProperty("phoneNumber");

    expect(organizers.find((o) => o.id === organizerId)).toHaveProperty(
      "phoneNumber",
      organizerPhone,
    );
  });

  it("GET /api/trips/:tripId/members masks a tombstoned member for an organizer", async () => {
    await buildFixture();

    const response = await app.inject({
      method: "GET",
      url: `/api/trips/${tripId}/members`,
      cookies: { auth_token: tokenFor(organizerId, "Payload Organizer") },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("deleted:");

    const roster = rosterOf(response.body);
    expect(roster.find((m) => m.userId === deletedId)).not.toHaveProperty(
      "phoneNumber",
    );
    expect(roster.find((m) => m.userId === liveId)).toHaveProperty(
      "phoneNumber",
      livePhone,
    );
  });

  it("GET /api/trips/:tripId/members masks it for a viewer relying on sharePhone", async () => {
    await buildFixture();

    // The deleted member's row still carries `sharePhone = true`, which is
    // what would have published the tombstone to a fellow member.
    const [deletedMemberRow] = await db
      .select({ sharePhone: members.sharePhone })
      .from(members)
      .where(and(eq(members.tripId, tripId), eq(members.userId, deletedId)));
    expect(deletedMemberRow!.sharePhone).toBe(true);

    const response = await app.inject({
      method: "GET",
      url: `/api/trips/${tripId}/members`,
      cookies: { auth_token: tokenFor(liveId, "Payload Member") },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("deleted:");

    const roster = rosterOf(response.body);
    expect(roster.find((m) => m.userId === deletedId)).not.toHaveProperty(
      "phoneNumber",
    );
    expect(roster.find((m) => m.userId === liveId)).toHaveProperty(
      "phoneNumber",
      livePhone,
    );
  });
});
