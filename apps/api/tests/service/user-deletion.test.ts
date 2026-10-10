import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  invitations,
  payments,
  paymentParticipants,
  pushSubscriptions,
} from "@/db/schema/index.js";
import { eq } from "drizzle-orm";
import { UserService, DELETED_DISPLAY_NAME } from "@/services/user.service.js";
import { generateUniquePhone } from "../test-utils.js";

/**
 * Task 26 RED: what survives an account deletion.
 *
 * The contract is asymmetric on purpose:
 *  - personal data goes (name, photo, handles, calendar token, push rows);
 *  - the phone number is *released* — it becomes a `deleted:<uuid>` tombstone
 *    so the number can sign up again, which is the whole reason the row is
 *    anonymized rather than deleted (payments/members reference it);
 *  - the trip's records of the person stay: members rows, payments and
 *    payment_participants are a record of the trip, not of the account.
 */
describe("user.service deleteAccount (Task 26)", () => {
  const userService = new UserService(db);
  let app: FastifyInstance;

  let phone: string;
  let organizerPhone: string;
  let userId: string;
  let memberId: string;
  let tripId: string;
  let paymentId: string;

  beforeEach(async () => {
    app = await buildApp();

    phone = generateUniquePhone();
    organizerPhone = generateUniquePhone();

    const [user] = await db
      .insert(users)
      .values({
        phoneNumber: phone,
        displayName: "Deleting Person",
        profilePhotoUrl: "https://cdn.example.com/photo.jpg",
        handles: { venmo: "@deleting", instagram: "@deleting" },
        // A deliberately low-entropy uuid. This value only has to be
        // non-null for the assertion that deletion clears it, and a
        // realistic-looking one trips GitGuardian's generic
        // high-entropy detector on the pull request — a fixture that
        // reads as a secret is a red check every time.
        calendarToken: "11111111-1111-4111-8111-111111111111",
      })
      .returning();
    userId = user!.id;

    const [organizer] = await db
      .insert(users)
      .values({ phoneNumber: organizerPhone, displayName: "Trip Organizer" })
      .returning();

    await db.insert(pushSubscriptions).values({
      userId,
      endpoint: `https://fcm.googleapis.com/fcm/send/deleting-${Date.now()}`,
      p256dh: "p256dh",
      auth: "auth",
      provider: "fcm",
    });

    const [trip] = await db
      .insert(trips)
      .values({
        name: "Deletion Trip",
        destination: "Naples",
        preferredTimezone: "Europe/Rome",
        createdBy: organizer!.id,
      })
      .returning();
    tripId = trip!.id;

    const [member] = await db
      .insert(members)
      .values({ tripId, userId, isOrganizer: false })
      .returning();
    memberId = member!.id;

    const [payment] = await db
      .insert(payments)
      .values({
        tripId,
        description: "Dinner",
        amount: 4000,
        memberId,
        createdBy: userId,
      })
      .returning();
    paymentId = payment!.id;

    await db.insert(paymentParticipants).values({
      paymentId,
      memberId,
      shareAmount: 4000,
    });
  });

  afterEach(async () => {
    await db
      .delete(paymentParticipants)
      .where(eq(paymentParticipants.paymentId, paymentId));
    await db.delete(payments).where(eq(payments.id, paymentId));
    await db.delete(members).where(eq(members.tripId, tripId));
    await db.delete(trips).where(eq(trips.id, tripId));
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    // The tombstoned row and the re-signed-up row both hold `userId`'s number.
    await db.delete(users).where(eq(users.phoneNumber, phone));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(users).where(eq(users.phoneNumber, organizerPhone));
    if (app) {
      await app.close();
    }
  });

  const readUser = async () => {
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    return row!;
  };

  it("sets deleted_at and keeps the row", async () => {
    await userService.deleteAccount(userId);

    const row = await readUser();
    expect(row.deletedAt).toBeInstanceOf(Date);
  });

  it("moves the phone number to a deleted: tombstone and frees the number", async () => {
    await userService.deleteAccount(userId);

    const row = await readUser();
    expect(row.phoneNumber).not.toBe(phone);
    expect(row.phoneNumber).toMatch(/^deleted:[0-9a-f-]{36}$/);

    // The released number is sign-up-able again.
    const [fresh] = await db
      .insert(users)
      .values({ phoneNumber: phone, displayName: "New Person" })
      .returning();
    expect(fresh).toBeDefined();
    expect(fresh!.id).not.toBe(userId);
  });

  it("moves the invitations that carried the number onto the same tombstone", async () => {
    // An invitation is a verbatim copy of the number (`invitations.invitee_phone`),
    // so the account's own marker does not reach it on its own: the organizer's
    // invitations screen would go on serving a released number while the roster
    // withheld it — one person, two answers, one deletion. This is the half that
    // makes the reader's withholding reachable at all; without it the reader
    // masks a marker that nothing ever writes.
    await db.insert(invitations).values({
      tripId,
      inviterId: userId,
      inviteePhone: phone,
      status: "pending",
    });

    await userService.deleteAccount(userId);

    const moved = await db
      .select()
      .from(invitations)
      .where(eq(invitations.inviteePhone, `deleted:${userId}`));
    expect(moved).toHaveLength(1);

    // The number itself is gone from the invitations table, not merely hidden
    // from one reader.
    const stale = await db
      .select()
      .from(invitations)
      .where(eq(invitations.inviteePhone, phone));
    expect(stale).toHaveLength(0);
  });

  it("drops the name, photo, handles and calendar token", async () => {
    await userService.deleteAccount(userId);

    const row = await readUser();
    expect(row.displayName).toBe(DELETED_DISPLAY_NAME);
    expect(row.displayName).not.toContain("Deleting");
    expect(row.profilePhotoUrl).toBeNull();
    expect(row.handles).toBeNull();
    // A unique, unauthenticated calendar feed must not outlive the account.
    expect(row.calendarToken).toBeNull();
  });

  it("deletes the user's push subscriptions", async () => {
    await userService.deleteAccount(userId);

    const rows = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    expect(rows).toHaveLength(0);
  });

  it("keeps the members row, the payments and the payment participants", async () => {
    await userService.deleteAccount(userId);

    const memberRows = await db
      .select()
      .from(members)
      .where(eq(members.id, memberId));
    expect(memberRows).toHaveLength(1);
    expect(memberRows[0].userId).toBe(userId);

    const paymentRows = await db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId));
    expect(paymentRows).toHaveLength(1);

    const participantRows = await db
      .select()
      .from(paymentParticipants)
      .where(eq(paymentParticipants.paymentId, paymentId));
    expect(participantRows).toHaveLength(1);
  });

  it("answers 401 on GET /auth/me with the deleted user's token", async () => {
    const token = app.jwt.sign({ sub: userId, name: "Deleting Person" });

    const before = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { auth_token: token },
    });
    expect(before.statusCode).toBe(200);

    await userService.deleteAccount(userId);

    const after = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { auth_token: token },
    });
    expect(after.statusCode).toBe(401);
    expect(JSON.parse(after.body)).toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("rejects a stale token on a checkBanned route with 401 Account deleted", async () => {
    const token = app.jwt.sign({ sub: userId });

    // PUT /api/users/me is inside the scope that carries checkBanned.
    const before = await app.inject({
      method: "PUT",
      url: "/api/users/me",
      payload: {},
      cookies: { auth_token: token },
    });
    expect(before.statusCode).toBe(200);

    await userService.deleteAccount(userId);

    const after = await app.inject({
      method: "PUT",
      url: "/api/users/me",
      payload: {},
      cookies: { auth_token: token },
    });
    expect(after.statusCode).toBe(401);
    expect(JSON.parse(after.body)).toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Account deleted" },
    });
  });

  it("throws when the user does not exist", async () => {
    await expect(
      userService.deleteAccount("00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow();
  });
});
