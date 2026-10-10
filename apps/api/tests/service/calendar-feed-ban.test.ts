import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/config/database.js";
import { users } from "@/db/schema/index.js";
import { eq, inArray } from "drizzle-orm";
import { CalendarService } from "@/services/calendar.service.js";
import { generateUniquePhone } from "../test-utils.js";

/**
 * The calendar feed is the one surface where the token *is* the credential:
 * `GET /calendar/:token.ics` runs no `authenticate`, so `checkBanned` never
 * runs on it either. Deletion was already covered — `deleteAccount` nulls the
 * token — but a ban left the URL serving the account's itineraries to whoever
 * held it. The lookup now decides on the account's own state, which is the
 * smaller of the two available fixes and the reversible one: a ban can be
 * lifted, and an unban puts the subscription back instead of leaving a dead
 * ICS URL on the user's calendar.
 */
describe("CalendarService.getUserByCalendarToken", () => {
  const calendarService = new CalendarService(db);
  const createdUserIds: string[] = [];

  async function createUser(values: Partial<typeof users.$inferInsert> = {}) {
    const [user] = await db
      .insert(users)
      .values({
        phoneNumber: generateUniquePhone(),
        displayName: "Feed Owner",
        calendarToken: randomUUID(),
        ...values,
      })
      .returning();

    createdUserIds.push(user!.id);
    return user!;
  }

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
      createdUserIds.length = 0;
    }
  });

  it("resolves a live account's token", async () => {
    const user = await createUser();

    const found = await calendarService.getUserByCalendarToken(
      user.calendarToken!,
    );

    expect(found?.id).toBe(user.id);
  });

  it("does not resolve a banned account's token", async () => {
    const user = await createUser({ status: "banned" });

    expect(
      await calendarService.getUserByCalendarToken(user.calendarToken!),
    ).toBeNull();
  });

  it("does not resolve a tombstone's token, even one that survived deletion", async () => {
    const user = await createUser({ deletedAt: new Date() });

    expect(
      await calendarService.getUserByCalendarToken(user.calendarToken!),
    ).toBeNull();
  });

  it("resolves the same token again once the ban is lifted", async () => {
    const user = await createUser({ status: "banned" });

    await db
      .update(users)
      .set({ status: "active" })
      .where(eq(users.id, user.id));

    const found = await calendarService.getUserByCalendarToken(
      user.calendarToken!,
    );

    expect(found?.id).toBe(user.id);
  });
});
