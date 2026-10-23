import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  memberTravel,
  type NewMemberTravel,
} from "@/db/schema/index.js";
import { eq, inArray } from "drizzle-orm";
import { CalendarService } from "@/services/calendar.service.js";
import { generateUniquePhone } from "../test-utils.js";

/**
 * The read behind `GET /calendar/:token.ics`, scoped to the caller's own
 * travel.
 *
 * Travel hangs off a **member row**, not off the trip: the feed is per
 * user, and "your calendar" means your own legs. So the read is
 * `member_travel.member_id IN (<the caller's live member rows>)`, and every
 * other member's leg on the same trip is absent — a co-traveller's flight
 * is not the subscriber's occupation, and a feed that carried it would tell
 * them they are busy when they are not.
 *
 * The tombstone is the other half: a leg is deleted rather than muted
 * (there is no per-leg switch, D5's Out), so `deleted_at IS NOT NULL` is
 * how a row stops being in the feed, and it has to be filtered here rather
 * than at the row's own service, which never runs for a feed request.
 *
 * A trip the caller has switched off (`calendar_excluded`), a trip that has
 * been cancelled, and a membership marked `not_going` are the three ways a
 * whole trip leaves the feed — already decided by `getCalendarTripsAndEvents`
 * for the trip block, the events and the stays. Travel joins them by
 * construction (it is read through the same member rows and grouped onto
 * the same surviving trips), and these tests pin that it stays true.
 */
describe("CalendarService.getCalendarTripsAndEvents — the caller's own travel", () => {
  const calendarService = new CalendarService(db);

  const createdUserIds: string[] = [];
  const createdTripIds: string[] = [];

  async function createUser(displayName: string) {
    const [user] = await db
      .insert(users)
      .values({ phoneNumber: generateUniquePhone(), displayName })
      .returning();
    createdUserIds.push(user!.id);
    return user!;
  }

  async function createTrip(ownerId: string) {
    const [trip] = await db
      .insert(trips)
      .values({
        name: "Lisbon in October",
        destination: "Lisbon, Portugal",
        preferredTimezone: "Europe/Lisbon",
        createdBy: ownerId,
      })
      .returning();
    createdTripIds.push(trip!.id);
    return trip!;
  }

  async function addMember(
    tripId: string,
    userId: string,
    overrides: Partial<typeof members.$inferInsert> = {},
  ) {
    const [member] = await db
      .insert(members)
      .values({ tripId, userId, status: "going", ...overrides })
      .returning();
    return member!;
  }

  async function fileTravel(
    tripId: string,
    memberId: string,
    overrides: Partial<NewMemberTravel> = {},
  ) {
    const [row] = await db
      .insert(memberTravel)
      .values({
        tripId,
        memberId,
        travelType: "arrival",
        transportMode: "flight",
        departureLocation: "BCN T2",
        departureTime: new Date("2026-10-23T12:00:00Z"),
        arrivalLocation: "LIS T1",
        arrivalTime: new Date("2026-10-23T14:40:00Z"),
        flightNumber: "UA1842",
        ...overrides,
      })
      .returning();
    return row!;
  }

  /** The travel list the feed carries for one trip, or undefined when the
   *  trip itself is absent — the two ways "nothing here" is stated. */
  function travelFor(
    feed: Awaited<ReturnType<CalendarService["getCalendarTripsAndEvents"]>>,
    tripId: string,
  ) {
    return feed.find((entry) => entry.trip.id === tripId)?.travel;
  }

  /** Every travel row in the feed, whatever trip it hangs off. */
  function allTravel(
    feed: Awaited<ReturnType<CalendarService["getCalendarTripsAndEvents"]>>,
  ) {
    return feed.flatMap((entry) => entry.travel.map((row) => row.id));
  }

  afterEach(async () => {
    if (createdTripIds.length > 0) {
      await db
        .delete(memberTravel)
        .where(inArray(memberTravel.tripId, createdTripIds));
      await db.delete(members).where(inArray(members.tripId, createdTripIds));
      await db.delete(trips).where(inArray(trips.id, createdTripIds));
      createdTripIds.length = 0;
    }
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
      createdUserIds.length = 0;
    }
  });

  it("carries the caller's own legs and no co-member's", async () => {
    const me = await createUser("Me");
    const them = await createUser("Them");
    const trip = await createTrip(me.id);
    const myRow = await addMember(trip.id, me.id, { isOrganizer: true });
    const theirRow = await addMember(trip.id, them.id);

    const mine = await fileTravel(trip.id, myRow.id);
    const theirs = await fileTravel(trip.id, theirRow.id, {
      travelType: "departure",
      transportMode: "train",
      departureLocation: "Lisboa Oriente",
      departureTime: new Date("2026-10-27T09:00:00Z"),
      arrivalLocation: null,
      arrivalTime: null,
      flightNumber: null,
    });

    const feed = await calendarService.getCalendarTripsAndEvents(me.id);
    const travel = travelFor(feed, trip.id);

    expect(travel?.map((row) => row.id)).toEqual([mine.id]);
    expect(travel?.map((row) => row.id)).not.toContain(theirs.id);
    // The row keeps the identity the feed needs to key it: the member it
    // belongs to is the caller's own.
    expect(travel?.[0]?.memberId).toBe(myRow.id);

    // And the co-member's own feed is the mirror image.
    const theirFeed = await calendarService.getCalendarTripsAndEvents(them.id);
    expect(travelFor(theirFeed, trip.id)?.map((row) => row.id)).toEqual([
      theirs.id,
    ]);
  });

  it("leaves out a soft-deleted leg", async () => {
    const me = await createUser("Me");
    const trip = await createTrip(me.id);
    const myRow = await addMember(trip.id, me.id);

    const kept = await fileTravel(trip.id, myRow.id);
    await fileTravel(trip.id, myRow.id, {
      travelType: "departure",
      deletedAt: new Date(),
      deletedBy: me.id,
    });

    const feed = await calendarService.getCalendarTripsAndEvents(me.id);

    expect(travelFor(feed, trip.id)?.map((row) => row.id)).toEqual([kept.id]);
  });

  it("leaves out a trip the caller excluded from the calendar, legs and all", async () => {
    const me = await createUser("Me");
    const trip = await createTrip(me.id);
    const excludedRow = await addMember(trip.id, me.id, {
      calendarExcluded: true,
    });
    await fileTravel(trip.id, excludedRow.id);

    const feed = await calendarService.getCalendarTripsAndEvents(me.id);

    expect(feed.map((entry) => entry.trip.id)).not.toContain(trip.id);
    expect(allTravel(feed)).toHaveLength(0);
    expect(travelFor(feed, trip.id)).toBeUndefined();
  });

  it("leaves out a cancelled trip's legs", async () => {
    const me = await createUser("Me");
    const trip = await createTrip(me.id);
    await db
      .update(trips)
      .set({ cancelled: true })
      .where(eq(trips.id, trip.id));
    const myRow = await addMember(trip.id, me.id);
    await fileTravel(trip.id, myRow.id);

    const feed = await calendarService.getCalendarTripsAndEvents(me.id);

    expect(feed.map((entry) => entry.trip.id)).not.toContain(trip.id);
    expect(allTravel(feed)).toHaveLength(0);
  });

  it("leaves out the legs of a membership that is not going", async () => {
    const me = await createUser("Me");
    const trip = await createTrip(me.id);
    const myRow = await addMember(trip.id, me.id, { status: "not_going" });
    await fileTravel(trip.id, myRow.id);

    const feed = await calendarService.getCalendarTripsAndEvents(me.id);

    expect(feed.map((entry) => entry.trip.id)).not.toContain(trip.id);
    expect(allTravel(feed)).toHaveLength(0);
  });

  it("returns an empty travel list for a trip with no legs", async () => {
    const me = await createUser("Me");
    const trip = await createTrip(me.id);
    await addMember(trip.id, me.id);

    const feed = await calendarService.getCalendarTripsAndEvents(me.id);

    expect(travelFor(feed, trip.id)).toEqual([]);
  });

  it("groups the caller's legs onto the trip each one belongs to", async () => {
    const me = await createUser("Me");
    const lisbon = await createTrip(me.id);
    const porto = await createTrip(me.id);
    const lisbonRow = await addMember(lisbon.id, me.id);
    const portoRow = await addMember(porto.id, me.id);

    const lisbonLeg = await fileTravel(lisbon.id, lisbonRow.id);
    const portoLeg = await fileTravel(porto.id, portoRow.id);

    const feed = await calendarService.getCalendarTripsAndEvents(me.id);

    expect(travelFor(feed, lisbon.id)?.map((row) => row.id)).toEqual([
      lisbonLeg.id,
    ]);
    expect(travelFor(feed, porto.id)?.map((row) => row.id)).toEqual([
      portoLeg.id,
    ]);
  });
});
