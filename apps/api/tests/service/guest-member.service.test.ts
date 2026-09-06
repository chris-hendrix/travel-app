import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/config/database.js";
import { users, trips, members } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";

/**
 * Task 1.1 RED fixture: guest members live in `members` with NULL userId.
 * - insert (tripId, userId NULL, guestDisplayName) succeeds
 * - second insert with same (tripId, guestPhone) fails (partial unique)
 */
describe("guest-member.service (Task 1.1 schema fixture)", () => {
  let creatorId: string;
  let tripId: string;
  let creatorPhone: string;
  const guestPhone = generateUniquePhone();

  beforeEach(async () => {
    creatorPhone = generateUniquePhone();
    const [creator] = await db
      .insert(users)
      .values({ phoneNumber: creatorPhone, displayName: "Guest Test Creator" })
      .returning();
    creatorId = creator.id;
    const [trip] = await db
      .insert(trips)
      .values({
        name: "Guest Schema Trip",
        destination: "Naples",
        preferredTimezone: "Europe/Rome",
        createdBy: creatorId,
      })
      .returning();
    tripId = trip.id;
  });

  afterEach(async () => {
    if (tripId) {
      await db.delete(members).where(eq(members.tripId, tripId));
      await db.delete(trips).where(eq(trips.id, tripId));
    }
    if (creatorId) {
      await db.delete(users).where(eq(users.id, creatorId));
    }
  });

  it("inserts a guest member with NULL userId + guestDisplayName", async () => {
    const [guest] = await db
      .insert(members)
      .values({
        tripId,
        userId: null,
        guestDisplayName: "Mom",
        guestPhone,
      })
      .returning();
    expect(guest.id).toBeDefined();
    expect(guest.userId).toBeNull();
    expect(guest.guestDisplayName).toBe("Mom");
  });

  it("rejects a second guest with the same (tripId, guestPhone)", async () => {
    await db.insert(members).values({
      tripId,
      userId: null,
      guestDisplayName: "Mom",
      guestPhone,
    });
    await expect(
      db.insert(members).values({
        tripId,
        userId: null,
        guestDisplayName: "Mom Duplicate",
        guestPhone,
      }),
    ).rejects.toThrow();
  });
});
