import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db, pool } from "@/config/database.js";
import { users, trips, members, memberTravel } from "@/db/schema/index.js";
import { eq, or, and, count, isNull } from "drizzle-orm";
import { MemberTravelService } from "@/services/member-travel.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import { generateUniquePhone } from "../test-utils.js";
import {
  MemberTravelNotFoundError,
  MemberTravelConflictError,
  MemberNotFoundError,
  PermissionDeniedError,
  TripNotFoundError,
} from "@/errors.js";
import type { UpdateMemberTravelInput } from "@journiful/shared/schemas";

// Create service instances with db for testing
const permissionsService = new PermissionsService(db);
const memberTravelService = new MemberTravelService(db, permissionsService);

describe("member-travel.service", () => {
  // Use unique test data for each test run to enable parallel execution
  let testOrganizerPhone: string;
  let testMember1Phone: string;
  let testMember2Phone: string;
  let testNonMemberPhone: string;

  let testOrganizerId: string;
  let testMember1Id: string;
  let testMember2Id: string;
  let testNonMemberId: string;

  let testTripId: string;
  let testMember1MemberId: string;
  let testMember2MemberId: string;
  let testMemberTravelId: string;

  // Clean up test data (safe for parallel execution)
  const cleanup = async () => {
    // Delete in reverse order of foreign key dependencies
    if (testTripId) {
      await db.delete(memberTravel).where(eq(memberTravel.tripId, testTripId));
      await db.delete(members).where(eq(members.tripId, testTripId));
      await db.delete(trips).where(eq(trips.id, testTripId));
    }

    const phoneNumbers = [
      testOrganizerPhone,
      testMember1Phone,
      testMember2Phone,
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
    testMember1Phone = generateUniquePhone();
    testMember2Phone = generateUniquePhone();
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

    const member1Result = await db
      .insert(users)
      .values({
        phoneNumber: testMember1Phone,
        displayName: "Test Member 1",
        timezone: "UTC",
      })
      .returning();
    testMember1Id = member1Result[0].id;

    const member2Result = await db
      .insert(users)
      .values({
        phoneNumber: testMember2Phone,
        displayName: "Test Member 2",
        timezone: "UTC",
      })
      .returning();
    testMember2Id = member2Result[0].id;

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

    // Add organizer as member with status='going'
    await db.insert(members).values({
      tripId: testTripId,
      userId: testOrganizerId,
      status: "going",
    });

    // Add member 1 with status='going'
    const member1MemberResult = await db
      .insert(members)
      .values({
        tripId: testTripId,
        userId: testMember1Id,
        status: "going",
      })
      .returning();
    testMember1MemberId = member1MemberResult[0].id;

    // Add member 2 with status='maybe'
    const member2MemberResult = await db
      .insert(members)
      .values({
        tripId: testTripId,
        userId: testMember2Id,
        status: "maybe",
      })
      .returning();
    testMember2MemberId = member2MemberResult[0].id;

    // Create a test member travel for member 1
    const travelResult = await db
      .insert(memberTravel)
      .values({
        tripId: testTripId,
        memberId: testMember1MemberId,
        travelType: "arrival",
        arrivalTime: new Date("2026-06-10T14:00:00Z"),
        arrivalLocation: "Airport",
        details: "Flight AA123",
      })
      .returning();
    testMemberTravelId = travelResult[0].id;
  });

  afterEach(cleanup);

  /** Every live row this member holds, straight from the table. */
  const liveRowsFor = async (memberId: string) => {
    const [row] = await db
      .select({ value: count() })
      .from(memberTravel)
      .where(
        and(
          eq(memberTravel.memberId, memberId),
          isNull(memberTravel.deletedAt),
        ),
      );
    return row?.value ?? 0;
  };

  const pairRowsFor = async (
    memberId: string,
    travelType: "arrival" | "departure",
  ) =>
    (
      await db
        .select({ id: memberTravel.id })
        .from(memberTravel)
        .where(
          and(
            eq(memberTravel.memberId, memberId),
            eq(memberTravel.travelType, travelType),
            isNull(memberTravel.deletedAt),
          ),
        )
    ).map((row) => row.id);

  describe("createMemberTravel", () => {
    it("should create member travel as member", async () => {
      const travelData = {
        travelType: "departure" as const,
        departureTime: "2026-06-20T16:00:00Z",
        departureLocation: "Train Station",
        details: "Train to NYC",
      };

      const { memberTravel: travel } =
        await memberTravelService.createMemberTravel(
        testMember1Id,
        testTripId,
        travelData,
      );

      expect(travel).toBeDefined();
      expect(travel.travelType).toBe(travelData.travelType);
      expect(travel.departureTime).toEqual(new Date(travelData.departureTime));
      expect(travel.departureLocation).toBe(travelData.departureLocation);
      expect(travel.details).toBe(travelData.details);
      expect(travel.memberId).toBe(testMember1MemberId);
      expect(travel.tripId).toBe(testTripId);
    });

    it("should persist flightNumber and all flight fields on create", async () => {
      // A departure for member 1: the seeded row holds that member's
      // *arrival*, so this pair is free and the call takes the insert
      // branch. Pointed at the arrival pair it would quietly exercise the
      // update branch instead, and the field mapping the insert does —
      // both sides plus the flight number, in one statement — would go
      // unasserted.
      const travelData = {
        travelType: "departure" as const,
        arrivalTime: "2026-06-10T14:00:00Z",
        arrivalLocation: "JFK Airport",
        departureTime: "2026-06-10T10:00:00Z",
        departureLocation: "SFO Airport",
        flightNumber: "UA123",
        details: "Flight from SFO",
      };

      const { memberTravel: travel, created } =
        await memberTravelService.createMemberTravel(
        testMember1Id,
        testTripId,
        travelData,
      );

      expect(created).toBe(true);
      expect(travel.travelType).toBe("departure");
      expect(travel.flightNumber).toBe("UA123");
      expect(travel.arrivalTime).toEqual(new Date(travelData.arrivalTime));
      expect(travel.arrivalLocation).toBe(travelData.arrivalLocation);
      expect(travel.departureTime).toEqual(
        new Date(travelData.departureTime),
      );
      expect(travel.departureLocation).toBe(travelData.departureLocation);
      expect(travel.details).toBe(travelData.details);
    });

    it("should persist counterpart fields on update", async () => {
      const updateData = {
        departureTime: "2026-06-10T10:00:00Z",
        departureLocation: "SFO Airport",
        flightNumber: "UA123",
      };

      const updatedTravel = await memberTravelService.updateMemberTravel(
        testMember1Id,
        testMemberTravelId,
        updateData,
      );

      expect(updatedTravel.flightNumber).toBe("UA123");
      expect(updatedTravel.departureTime).toEqual(
        new Date(updateData.departureTime),
      );
      expect(updatedTravel.departureLocation).toBe("SFO Airport");
    });

    it("should create member travel for member with any status", async () => {
      const travelData = {
        travelType: "arrival" as const,
        arrivalTime: "2026-06-11T10:00:00Z",
        arrivalLocation: "Bus Station",
      };

      const { memberTravel: travel } =
        await memberTravelService.createMemberTravel(
        testMember2Id,
        testTripId,
        travelData,
      );

      expect(travel).toBeDefined();
      expect(travel.memberId).toBe(testMember2MemberId);
    });

    it("should throw PermissionDeniedError for non-member", async () => {
      const travelData = {
        travelType: "arrival" as const,
        arrivalTime: "2026-06-12T12:00:00Z",
      };

      await expect(
        memberTravelService.createMemberTravel(
          testNonMemberId,
          testTripId,
          travelData,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw TripNotFoundError for non-existent trip", async () => {
      const travelData = {
        travelType: "arrival" as const,
        arrivalTime: "2026-06-12T12:00:00Z",
      };

      await expect(
        memberTravelService.createMemberTravel(
          testMember1Id,
          "00000000-0000-0000-0000-000000000000",
          travelData,
        ),
      ).rejects.toThrow(TripNotFoundError);
    });

    it("should create member travel without optional fields", async () => {
      const travelData = {
        travelType: "departure" as const,
        departureTime: "2026-06-21T08:00:00Z",
      };

      const { memberTravel: travel } =
        await memberTravelService.createMemberTravel(
        testMember1Id,
        testTripId,
        travelData,
      );

      expect(travel).toBeDefined();
      expect(travel.departureLocation).toBeNull();
      expect(travel.details).toBeNull();
    });

    it("files the column's own default when the body names no mode", async () => {
      // A body from a build that predates the mode: the pair is free
      // (member 1's seeded row is the arrival), so this is the insert
      // branch, and `flight` is the value the column supplies rather than
      // one the service invents — which is why the schema carries no
      // default of its own.
      const travelData = {
        travelType: "departure" as const,
        departureTime: "2026-06-21T08:00:00Z",
        departureLocation: "St Pancras",
      };

      const { memberTravel: travel, created } =
        await memberTravelService.createMemberTravel(
        testMember1Id,
        testTripId,
        travelData,
      );

      expect(created).toBe(true);
      expect(travel.transportMode).toBe("flight");
    });

    it("files the mode the body named", async () => {
      const travelData = {
        travelType: "departure" as const,
        departureTime: "2026-06-21T08:00:00Z",
        departureLocation: "Valencia",
        transportMode: "car" as const,
      };

      const { memberTravel: travel, created } =
        await memberTravelService.createMemberTravel(
        testMember1Id,
        testTripId,
        travelData,
      );

      expect(created).toBe(true);
      expect(travel.transportMode).toBe("car");
    });
  });

  describe("createMemberTravel on the member and direction", () => {
    it("updates the live row for the same member and direction", async () => {
      // The pair is the feature's whole identity: a second arrival is the
      // same arrival answered again, not a second one beside it. This is
      // the server half of the bug that drew a member twice on the board.
      const [seededId] = await pairRowsFor(testMember1MemberId, "arrival");

      const { memberTravel, created } =
        await memberTravelService.createMemberTravel(testMember1Id, testTripId, {
          travelType: "arrival",
          arrivalTime: "2026-06-10T18:30:00Z",
          arrivalLocation: "Terminal 1",
        });

      expect(created).toBe(false);
      expect(memberTravel.id).toBe(seededId);
      expect(memberTravel.arrivalTime).toEqual(
        new Date("2026-06-10T18:30:00Z"),
      );
      expect(memberTravel.arrivalLocation).toBe("Terminal 1");
      expect(await pairRowsFor(testMember1MemberId, "arrival")).toEqual([
        seededId,
      ]);
    });

    it("clears a column the create no longer carries", async () => {
      // The body is a full statement of the leg, so a field the client
      // stopped sending is one the member took back — the seeded arrival
      // has both a location and details, and this body has neither.
      const { memberTravel } = await memberTravelService.createMemberTravel(
        testMember1Id,
        testTripId,
        { travelType: "arrival", arrivalTime: "2026-06-10T18:30:00Z" },
      );

      expect(memberTravel.arrivalLocation).toBeNull();
      expect(memberTravel.details).toBeNull();
    });

    it("leaves a filed mode alone when the body does not carry one", async () => {
      // The pair-update branch writes `values` over the live row, which
      // is why the mode joins `values` only when the body carried one. An
      // unconditional `flight` there would turn a mode-less POST — a
      // build already on a phone, saying nothing about the mode — into a
      // silent reset of the rental it was looking at.
      const filed = await memberTravelService.createMemberTravel(
        testMember1Id,
        testTripId,
        {
          travelType: "arrival",
          arrivalTime: "2026-06-10T18:30:00Z",
          arrivalLocation: "BCN T2",
          transportMode: "rental",
        },
      );

      // The seeded arrival pair: this call updated it rather than filing
      // a second row, which is the branch the guard is about.
      expect(filed.created).toBe(false);
      expect(filed.memberTravel.transportMode).toBe("rental");

      const again = await memberTravelService.createMemberTravel(
        testMember1Id,
        testTripId,
        {
          travelType: "arrival",
          arrivalTime: "2026-06-10T19:00:00Z",
          arrivalLocation: "BCN T2",
        },
      );

      expect(again.created).toBe(false);
      expect(again.memberTravel.transportMode).toBe("rental");
      // Everything else the body did carry still lands: the mode is left
      // out of the write, not the body.
      expect(again.memberTravel.arrivalTime).toEqual(
        new Date("2026-06-10T19:00:00Z"),
      );

      // Straight from the table, which is where a silent reset would sit.
      const [row] = await db
        .select({ transportMode: memberTravel.transportMode })
        .from(memberTravel)
        .where(eq(memberTravel.id, filed.memberTravel.id));
      expect(row?.transportMode).toBe("rental");
    });

    it("does not let a soft-deleted row block a new insert", async () => {
      const [seededId] = await pairRowsFor(testMember1MemberId, "arrival");
      await memberTravelService.deleteMemberTravel(testMember1Id, seededId!);

      const { memberTravel, created } =
        await memberTravelService.createMemberTravel(testMember1Id, testTripId, {
          travelType: "arrival",
          arrivalTime: "2026-06-12T09:00:00Z",
          arrivalLocation: "Gate 4",
        });

      expect(created).toBe(true);
      expect(memberTravel.id).not.toBe(seededId);
      expect(await pairRowsFor(testMember1MemberId, "arrival")).toEqual([
        memberTravel.id,
      ]);
    });

    it("still inserts the other direction for the same member", async () => {
      const { created } = await memberTravelService.createMemberTravel(
        testMember1Id,
        testTripId,
        { travelType: "departure", departureTime: "2026-06-20T16:00:00Z" },
      );

      expect(created).toBe(true);
    });

    it("still inserts another member's first arrival", async () => {
      const { created, memberTravel } =
        await memberTravelService.createMemberTravel(testMember2Id, testTripId, {
          travelType: "arrival",
          arrivalTime: "2026-06-11T09:00:00Z",
        });

      expect(created).toBe(true);
      expect(memberTravel.memberId).toBe(testMember2MemberId);
    });

    it("keeps one live row when two creates race on the same pair", async () => {
      // Both calls read the pair as free and both go on to insert: the
      // read-then-write that no amount of checking can order, which is
      // why the database gets the last word. The loser is refused by
      // `member_travel_pair_live_unique` and folds into the row the
      // winner inserted, so the pair still holds one row and no caller
      // sees an error. Two live rows here is exactly the artifact this
      // change exists to remove.
      const body = {
        travelType: "departure" as const,
        departureTime: "2026-06-20T16:00:00Z",
        departureLocation: "Gate 4",
      };

      const results = await Promise.all([
        memberTravelService.createMemberTravel(testMember1Id, testTripId, body),
        memberTravelService.createMemberTravel(testMember1Id, testTripId, body),
      ]);

      expect(results).toHaveLength(2);
      const rows = await pairRowsFor(testMember1MemberId, "departure");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toBe(results[0]!.memberTravel.id);
      expect(rows[0]).toBe(results[1]!.memberTravel.id);

      // Exactly one of them inserted it: the other was the loser of the
      // race and says so, which is what lets the route answer 201 or 200.
      expect(results.filter((result) => result.created)).toHaveLength(1);
    });

    it("folds into the row an uncommitted insert left behind", async () => {
      // The same race in a form the test can hold open: a second connection
      // inserts the pair and does not commit, so this call's lookup — which
      // only ever sees committed rows — misses it, and its own INSERT is
      // the one that blocks on that row and then loses when it commits.
      // That is the branch the pair index exists for. Timing cannot decide
      // the outcome (a slow run simply takes the fast path and lands on the
      // same row), so nothing here depends on the scheduler; the sleep only
      // gives the insert time to be blocked rather than queued behind the
      // winner.
      const client = await pool.connect();
      let committed = false;
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO member_travel (trip_id, member_id, travel_type, departure_time, departure_location)
           VALUES ($1, $2, 'departure', $3, $4)`,
          [testTripId, testMember1MemberId, "2026-06-20T16:00:00Z", "Gate 4"],
        );

        const pending = memberTravelService.createMemberTravel(
          testMember1Id,
          testTripId,
          {
            travelType: "departure",
            departureTime: "2026-06-20T18:00:00Z",
            departureLocation: "Gate 9",
          },
        );

        await new Promise((resolve) => setTimeout(resolve, 150));
        await client.query("COMMIT");
        committed = true;

        const result = await pending;

        expect(result.created).toBe(false);
        const rows = await pairRowsFor(testMember1MemberId, "departure");
        expect(rows).toHaveLength(1);
        expect(rows[0]).toBe(result.memberTravel.id);
        // The loser's statement is the one that stands, like any other
        // upsert of the same leg: both callers filed this pair.
        expect(result.memberTravel.departureLocation).toBe("Gate 9");
      } finally {
        if (!committed) {
          await client.query("ROLLBACK").catch(() => undefined);
        }
        client.release();
      }
    });

    it("bounds a member's live rows to the pair, not a count", async () => {
      // The pair rule is the ceiling: one live row per direction, so two
      // live rows for a member on a trip, and every later POST for either
      // direction folds into the row already there rather than adding one.
      // There is no per-member row count to reach past this — a member
      // cannot hold a third live row to be counted — and the assertions
      // below are what says so without inventing a state the table refuses.
      const arrival = await memberTravelService.createMemberTravel(
        testMember2Id,
        testTripId,
        {
          travelType: "arrival",
          arrivalTime: "2026-06-11T09:00:00Z",
          arrivalLocation: "Airport",
        },
      );
      const departure = await memberTravelService.createMemberTravel(
        testMember2Id,
        testTripId,
        {
          travelType: "departure",
          departureTime: "2026-06-20T16:00:00Z",
          departureLocation: "Train Station",
        },
      );

      expect(arrival.created).toBe(true);
      expect(departure.created).toBe(true);
      expect(await liveRowsFor(testMember2MemberId)).toBe(2);

      // The same direction a second time is the same row answered again.
      const arrivalAgain = await memberTravelService.createMemberTravel(
        testMember2Id,
        testTripId,
        {
          travelType: "arrival",
          arrivalTime: "2026-06-11T11:00:00Z",
          arrivalLocation: "Terminal 2",
        },
      );
      const departureAgain = await memberTravelService.createMemberTravel(
        testMember2Id,
        testTripId,
        {
          travelType: "departure",
          departureTime: "2026-06-21T07:00:00Z",
          departureLocation: "St Pancras",
        },
      );

      expect(arrivalAgain.created).toBe(false);
      expect(arrivalAgain.memberTravel.id).toBe(arrival.memberTravel.id);
      expect(arrivalAgain.memberTravel.arrivalLocation).toBe("Terminal 2");
      expect(departureAgain.created).toBe(false);
      expect(departureAgain.memberTravel.id).toBe(departure.memberTravel.id);
      expect(departureAgain.memberTravel.departureLocation).toBe("St Pancras");
      expect(await liveRowsFor(testMember2MemberId)).toBe(2);
    });
  });

  describe("getMemberTravel", () => {
    it("should get member travel by ID", async () => {
      const travel =
        await memberTravelService.getMemberTravel(testMemberTravelId);

      expect(travel).toBeDefined();
      expect(travel?.id).toBe(testMemberTravelId);
      expect(travel?.travelType).toBe("arrival");
      expect(travel?.arrivalLocation).toBe("Airport");
    });

    it("should return null for non-existent member travel", async () => {
      const travel = await memberTravelService.getMemberTravel(
        "00000000-0000-0000-0000-000000000000",
      );

      expect(travel).toBeNull();
    });

    it("should return null for soft-deleted member travel", async () => {
      // Soft delete the member travel
      await memberTravelService.deleteMemberTravel(
        testMember1Id,
        testMemberTravelId,
      );

      const travel =
        await memberTravelService.getMemberTravel(testMemberTravelId);

      expect(travel).toBeNull();
    });
  });

  describe("getMemberTravelByTrip", () => {
    it("should get all member travel records for a trip", async () => {
      const travelList =
        await memberTravelService.getMemberTravelByTrip(testTripId);

      expect(travelList).toHaveLength(1);
      expect(travelList[0].id).toBe(testMemberTravelId);
    });

    it("should exclude soft-deleted records by default", async () => {
      // Soft delete the member travel
      await memberTravelService.deleteMemberTravel(
        testMember1Id,
        testMemberTravelId,
      );

      const travelList =
        await memberTravelService.getMemberTravelByTrip(testTripId);

      expect(travelList).toHaveLength(0);
    });

    it("should include soft-deleted records when includeDeleted=true", async () => {
      // Soft delete the member travel
      await memberTravelService.deleteMemberTravel(
        testMember1Id,
        testMemberTravelId,
      );

      const travelList = await memberTravelService.getMemberTravelByTrip(
        testTripId,
        true,
      );

      expect(travelList).toHaveLength(1);
      expect(travelList[0].deletedAt).not.toBeNull();
    });

    it("should return empty array for trip with no member travel", async () => {
      // Create another trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Empty Trip",
          destination: "Nowhere",
          preferredTimezone: "UTC",
          createdBy: testOrganizerId,
        })
        .returning();

      const travelList = await memberTravelService.getMemberTravelByTrip(
        tripResult[0].id,
      );

      expect(travelList).toEqual([]);

      // Cleanup
      await db.delete(trips).where(eq(trips.id, tripResult[0].id));
    });
  });

  describe("getMyLocations", () => {
    it("returns the caller's own locations, a leg's own end first", async () => {
      // The fixture row is member 1's arrival: "Airport" is its own end,
      // and the departure the flight lookup filled in is the counterpart.
      await db
        .update(memberTravel)
        .set({ departureLocation: "JFK T4" })
        .where(eq(memberTravel.id, testMemberTravelId));

      const locations = await memberTravelService.getMyLocations(testMember1Id);

      expect(locations).toEqual(["Airport", "JFK T4"]);
    });

    it("never returns another member's locations", async () => {
      await db.insert(memberTravel).values({
        tripId: testTripId,
        memberId: testMember2MemberId,
        travelType: "arrival",
        arrivalTime: new Date("2026-06-11T09:00:00Z"),
        arrivalLocation: "Member 2 Airport",
      });

      expect(await memberTravelService.getMyLocations(testMember1Id)).toEqual([
        "Airport",
      ]);
      expect(await memberTravelService.getMyLocations(testMember2Id)).toEqual([
        "Member 2 Airport",
      ]);
      // A signed-in user with no member row on any trip has nothing.
      expect(await memberTravelService.getMyLocations(testNonMemberId)).toEqual(
        [],
      );
    });

    it("returns nothing for a caller with no travel at all", async () => {
      expect(await memberTravelService.getMyLocations(testOrganizerId)).toEqual(
        [],
      );
    });

    it("dedupes case-insensitively, keeping the newest spelling", async () => {
      await db
        .update(memberTravel)
        .set({
          arrivalLocation: "  bcn t2  ",
          updatedAt: new Date(Date.now() - 60_000),
        })
        .where(eq(memberTravel.id, testMemberTravelId));
      await db.insert(memberTravel).values({
        tripId: testTripId,
        memberId: testMember1MemberId,
        travelType: "departure",
        departureTime: new Date("2026-06-20T10:00:00Z"),
        departureLocation: "BCN T2",
      });

      expect(await memberTravelService.getMyLocations(testMember1Id)).toEqual([
        "BCN T2",
      ]);
    });

    it("orders by the record's own updated_at, newest first", async () => {
      await db
        .update(memberTravel)
        .set({ updatedAt: new Date(Date.now() - 60_000) })
        .where(eq(memberTravel.id, testMemberTravelId));
      await db.insert(memberTravel).values({
        tripId: testTripId,
        memberId: testMember1MemberId,
        travelType: "departure",
        departureTime: new Date("2026-06-20T10:00:00Z"),
        departureLocation: "BCN T2",
      });

      expect(await memberTravelService.getMyLocations(testMember1Id)).toEqual([
        "BCN T2",
        "Airport",
      ]);
    });

    it("leaves out a soft-deleted record", async () => {
      await memberTravelService.deleteMemberTravel(
        testMember1Id,
        testMemberTravelId,
      );

      expect(await memberTravelService.getMyLocations(testMember1Id)).toEqual(
        [],
      );
    });

    it("caps the list at 20 while still ordering it newest first", async () => {
      // A caller's row can only sit on a trip they are a member of, and the
      // pair rule allows two live rows per trip — so 25 rows is 25 trips,
      // each contributing the one where this test files. The list is per
      // caller across trips (that is what makes it useful: the airport from
      // the last trip is the one for this one), which is also what keeps a
      // 20-location cut reachable at all.
      //
      // Ahead of the fixture row, so the cap's cut is what the assertion
      // reads rather than which row happened to be written first.
      const base = Date.now() + 1_000;
      const extraTripIds: string[] = [];
      for (let index = 0; index < 25; index += 1) {
        const [trip] = await db
          .insert(trips)
          .values({
            name: `Where Trip ${index}`,
            destination: "Lisbon",
            preferredTimezone: "Europe/Lisbon",
            createdBy: testOrganizerId,
          })
          .returning();
        extraTripIds.push(trip!.id);

        const [member] = await db
          .insert(members)
          .values({
            tripId: trip!.id,
            userId: testMember1Id,
            status: "going",
          })
          .returning();

        await db.insert(memberTravel).values({
          tripId: trip!.id,
          memberId: member!.id,
          travelType: "arrival",
          arrivalTime: new Date("2026-06-12T09:00:00Z"),
          arrivalLocation: `Where ${index}`,
          updatedAt: new Date(base + index * 1_000),
        });
      }

      const locations = await memberTravelService.getMyLocations(testMember1Id);

      expect(locations).toHaveLength(20);
      // The last one written is the first one read, and the oldest five
      // — 0 through 4, plus the fixture's own where — are what fall off.
      expect(locations[0]).toBe("Where 24");
      expect(locations).not.toContain("Where 4");

      // The trips cascade to the members and rows filed under them, so this
      // is the whole of what the test added.
      for (const tripId of extraTripIds) {
        await db.delete(trips).where(eq(trips.id, tripId));
      }
    });
  });

  describe("updateMemberTravel", () => {
    it("should update member travel as owner", async () => {
      const updateData = {
        arrivalLocation: "Updated Airport",
        details: "Updated Flight AA456",
      };

      const updatedTravel = await memberTravelService.updateMemberTravel(
        testMember1Id,
        testMemberTravelId,
        updateData,
      );

      expect(updatedTravel.arrivalLocation).toBe(updateData.arrivalLocation);
      expect(updatedTravel.details).toBe(updateData.details);
      expect(updatedTravel.travelType).toBe("arrival"); // Unchanged
    });

    it("should update member travel as organizer (not owner)", async () => {
      const updateData = {
        details: "Updated by organizer",
      };

      const updatedTravel = await memberTravelService.updateMemberTravel(
        testOrganizerId,
        testMemberTravelId,
        updateData,
      );

      expect(updatedTravel.details).toBe(updateData.details);
    });

    it("should throw PermissionDeniedError for different member", async () => {
      const updateData = {
        arrivalLocation: "Unauthorized Update",
      };

      await expect(
        memberTravelService.updateMemberTravel(
          testMember2Id,
          testMemberTravelId,
          updateData,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw PermissionDeniedError for non-member", async () => {
      const updateData = {
        arrivalLocation: "Unauthorized Update",
      };

      await expect(
        memberTravelService.updateMemberTravel(
          testNonMemberId,
          testMemberTravelId,
          updateData,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw MemberTravelNotFoundError for non-existent record", async () => {
      const updateData = {
        arrivalLocation: "Updated",
      };

      await expect(
        memberTravelService.updateMemberTravel(
          testMember1Id,
          "00000000-0000-0000-0000-000000000000",
          updateData,
        ),
      ).rejects.toThrow(MemberTravelNotFoundError);
    });

    it("should allow partial updates", async () => {
      const updateData = {
        details: "Updated details",
      };

      const updatedTravel = await memberTravelService.updateMemberTravel(
        testMember1Id,
        testMemberTravelId,
        updateData,
      );

      expect(updatedTravel.details).toBe("Updated details");
      expect(updatedTravel.arrivalLocation).toBe("Airport"); // Unchanged
    });

    it("carries the mode through the update path", async () => {
      // The mode is editable, unlike the direction: a leg that started as
      // a flight and became a train is the same leg. The update path
      // spreads the parsed body into `.set()`, so this needs no code of
      // its own — it is pinned here because the update and the create are
      // two different writes and only one of them has a guard.
      const updatedTravel = await memberTravelService.updateMemberTravel(
        testMember1Id,
        testMemberTravelId,
        { transportMode: "train" },
      );

      expect(updatedTravel.transportMode).toBe("train");
      expect(updatedTravel.arrivalLocation).toBe("Airport"); // Unchanged
    });

    it("ignores a direction in the update body instead of flipping it", async () => {
      // `travelType` is create-only, so an update that carries one gets
      // its other fields applied and its direction dropped: writing it
      // would leave this row claiming the arrival pair while the
      // departure pair sat free for the next write — a second live row on
      // the member, produced by a plain edit. The route's schema strips
      // the key (zod objects drop unknown ones) before the service runs;
      // this cast is what reaches the service with one anyway, so the
      // guard is asserted both where the schema applies it and where the
      // service owns it.
      const updatedTravel = await memberTravelService.updateMemberTravel(
        testMember1Id,
        testMemberTravelId,
        {
          travelType: "departure",
          details: "Still an arrival",
        } as unknown as UpdateMemberTravelInput,
      );

      expect(updatedTravel.travelType).toBe("arrival");
      expect(updatedTravel.arrivalLocation).toBe("Airport"); // Unchanged
      expect(updatedTravel.details).toBe("Still an arrival");
      expect(await pairRowsFor(testMember1MemberId, "departure")).toEqual([]);
    });

    it("should update time field correctly", async () => {
      const updateData = {
        arrivalTime: "2026-06-10T16:00:00Z",
      };

      const updatedTravel = await memberTravelService.updateMemberTravel(
        testMember1Id,
        testMemberTravelId,
        updateData,
      );

      expect(updatedTravel.arrivalTime).toEqual(new Date(updateData.arrivalTime));
    });
  });

  describe("deleteMemberTravel", () => {
    it("should soft delete member travel as owner", async () => {
      await memberTravelService.deleteMemberTravel(
        testMember1Id,
        testMemberTravelId,
      );

      const travel =
        await memberTravelService.getMemberTravel(testMemberTravelId);
      expect(travel).toBeNull();

      // Verify soft delete (check directly in DB)
      const [deletedTravel] = await db
        .select()
        .from(memberTravel)
        .where(eq(memberTravel.id, testMemberTravelId));

      expect(deletedTravel.deletedAt).not.toBeNull();
      expect(deletedTravel.deletedBy).toBe(testMember1Id);
    });

    it("should soft delete member travel as organizer", async () => {
      await memberTravelService.deleteMemberTravel(
        testOrganizerId,
        testMemberTravelId,
      );

      const travel =
        await memberTravelService.getMemberTravel(testMemberTravelId);
      expect(travel).toBeNull();

      // Verify deletedBy is the organizer
      const [deletedTravel] = await db
        .select()
        .from(memberTravel)
        .where(eq(memberTravel.id, testMemberTravelId));

      expect(deletedTravel.deletedBy).toBe(testOrganizerId);
    });

    it("should throw PermissionDeniedError for different member", async () => {
      await expect(
        memberTravelService.deleteMemberTravel(
          testMember2Id,
          testMemberTravelId,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw PermissionDeniedError for non-member", async () => {
      await expect(
        memberTravelService.deleteMemberTravel(
          testNonMemberId,
          testMemberTravelId,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw MemberTravelNotFoundError for non-existent record", async () => {
      await expect(
        memberTravelService.deleteMemberTravel(
          testMember1Id,
          "00000000-0000-0000-0000-000000000000",
        ),
      ).rejects.toThrow(MemberTravelNotFoundError);
    });
  });

  describe("restoreMemberTravel", () => {
    it("should restore soft-deleted member travel as organizer", async () => {
      // Soft delete the member travel
      await memberTravelService.deleteMemberTravel(
        testMember1Id,
        testMemberTravelId,
      );

      // Verify it's deleted
      let travel =
        await memberTravelService.getMemberTravel(testMemberTravelId);
      expect(travel).toBeNull();

      // Restore as organizer
      const restoredTravel = await memberTravelService.restoreMemberTravel(
        testOrganizerId,
        testMemberTravelId,
      );

      expect(restoredTravel.id).toBe(testMemberTravelId);
      expect(restoredTravel.deletedAt).toBeNull();
      expect(restoredTravel.deletedBy).toBeNull();

      // Verify it's visible again
      travel = await memberTravelService.getMemberTravel(testMemberTravelId);
      expect(travel).not.toBeNull();
    });

    it("should throw PermissionDeniedError for non-organizer member", async () => {
      // Soft delete the member travel
      await memberTravelService.deleteMemberTravel(
        testMember1Id,
        testMemberTravelId,
      );

      // Try to restore as member (not organizer)
      await expect(
        memberTravelService.restoreMemberTravel(
          testMember2Id,
          testMemberTravelId,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw PermissionDeniedError for non-member", async () => {
      // Soft delete the member travel
      await memberTravelService.deleteMemberTravel(
        testMember1Id,
        testMemberTravelId,
      );

      // Try to restore as non-member
      await expect(
        memberTravelService.restoreMemberTravel(
          testNonMemberId,
          testMemberTravelId,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw MemberTravelNotFoundError for non-existent record", async () => {
      await expect(
        memberTravelService.restoreMemberTravel(
          testOrganizerId,
          "00000000-0000-0000-0000-000000000000",
        ),
      ).rejects.toThrow(MemberTravelNotFoundError);
    });

    it("should allow owner to restore their own deleted travel (if they are organizer)", async () => {
      // Create member travel for organizer
      const [organizerMember] = await db
        .select()
        .from(members)
        .where(
          and(
            eq(members.tripId, testTripId),
            eq(members.userId, testOrganizerId),
          ),
        );

      const travelResult = await db
        .insert(memberTravel)
        .values({
          tripId: testTripId,
          memberId: organizerMember.id,
          travelType: "arrival",
          arrivalTime: new Date("2026-06-15T10:00:00Z"),
        })
        .returning();

      const organizerTravelId = travelResult[0].id;

      // Delete and restore as organizer (who is also the owner)
      await memberTravelService.deleteMemberTravel(
        testOrganizerId,
        organizerTravelId,
      );
      const restoredTravel = await memberTravelService.restoreMemberTravel(
        testOrganizerId,
        organizerTravelId,
      );

      expect(restoredTravel.deletedAt).toBeNull();

      // Cleanup
      await db
        .delete(memberTravel)
        .where(eq(memberTravel.id, organizerTravelId));
    });

    it("restores an already-live row as the no-op it is", async () => {
      // The twin check asks whether a *different* live row holds the pair.
      // This row is the one the call is about, so it has nothing to
      // conflict with: the endpoint answers 200 with the row it already
      // has. Matching itself here — which the check did before the `ne` —
      // turned that idempotent restore into a 409.
      const seeded = await memberTravelService.getMemberTravel(
        testMemberTravelId,
      );
      expect(seeded?.deletedAt).toBeNull();

      const restored = await memberTravelService.restoreMemberTravel(
        testOrganizerId,
        testMemberTravelId,
      );

      expect(restored.id).toBe(testMemberTravelId);
      expect(restored.deletedAt).toBeNull();
      expect(restored.deletedBy).toBeNull();
      expect(await pairRowsFor(testMember1MemberId, "arrival")).toEqual([
        testMemberTravelId,
      ]);
    });

    it("refuses to restore a row whose pair already holds a live one", async () => {
      // Delete, then file the same direction again: the create path looks
      // only for a *live* row, so it inserts a new one and leaves this
      // deleted row beside it. Restoring it is the second live row on the
      // pair — the state that draws the member twice on the board.
      await memberTravelService.deleteMemberTravel(
        testMember1Id,
        testMemberTravelId,
      );

      const { memberTravel } = await memberTravelService.createMemberTravel(
        testMember1Id,
        testTripId,
        {
          travelType: "arrival",
          arrivalTime: "2026-06-12T09:00:00Z",
          arrivalLocation: "Gate 4",
        },
      );
      expect(memberTravel.id).not.toBe(testMemberTravelId);

      await expect(
        memberTravelService.restoreMemberTravel(
          testOrganizerId,
          testMemberTravelId,
        ),
      ).rejects.toThrow(MemberTravelConflictError);
    });
  });

  describe("edge cases", () => {
    it("should handle member travel with long details", async () => {
      const longDetails = "A".repeat(500);
      const travelData = {
        travelType: "departure" as const,
        departureTime: "2026-06-22T18:00:00Z",
        details: longDetails,
      };

      const { memberTravel: travel } =
        await memberTravelService.createMemberTravel(
        testMember1Id,
        testTripId,
        travelData,
      );

      expect(travel.details).toBe(longDetails);
    });

    it("should handle multiple member travel records for same member", async () => {
      // Create additional travel for member 1
      const travelData = {
        travelType: "departure" as const,
        departureTime: "2026-06-25T20:00:00Z",
        departureLocation: "Airport",
      };

      const { memberTravel: travel } =
        await memberTravelService.createMemberTravel(
        testMember1Id,
        testTripId,
        travelData,
      );

      expect(travel).toBeDefined();

      // Verify both records exist
      const travelList =
        await memberTravelService.getMemberTravelByTrip(testTripId);
      expect(travelList).toHaveLength(2);
    });

    it("should handle member travel for different members in same trip", async () => {
      // Create travel for member 2
      const travelData = {
        travelType: "arrival" as const,
        arrivalTime: "2026-06-11T09:00:00Z",
      };

      const { memberTravel: travel } =
        await memberTravelService.createMemberTravel(
        testMember2Id,
        testTripId,
        travelData,
      );

      expect(travel.memberId).toBe(testMember2MemberId);

      // Verify both members' travel exists
      const travelList =
        await memberTravelService.getMemberTravelByTrip(testTripId);
      expect(travelList).toHaveLength(2);
      expect(travelList.map((t) => t.memberId)).toContain(testMember1MemberId);
      expect(travelList.map((t) => t.memberId)).toContain(testMember2MemberId);
    });
  });

  describe("member travel delegation", () => {
    it("should allow organizer to create travel for another member", async () => {
      // Member 2 holds nothing and this is a departure, so the pair is
      // free: the assertion below is the insert's field mapping for a
      // delegated create. Filing member 1's arrival would have landed on
      // the seeded row and asserted the update branch instead.
      const travelData = {
        travelType: "departure" as const,
        departureTime: "2026-06-20T16:00:00Z",
        departureLocation: "St Pancras",
        flightNumber: "UA456",
        details: "Eurostar 9044",
        memberId: testMember2MemberId,
      };

      const { memberTravel: travel, created } =
        await memberTravelService.createMemberTravel(
        testOrganizerId,
        testTripId,
        travelData,
      );

      expect(created).toBe(true);
      expect(travel).toBeDefined();
      expect(travel.memberId).toBe(testMember2MemberId);
      expect(travel.travelType).toBe("departure");
      expect(travel.departureTime).toEqual(
        new Date(travelData.departureTime),
      );
      expect(travel.departureLocation).toBe("St Pancras");
      expect(travel.flightNumber).toBe("UA456");
      expect(travel.details).toBe("Eurostar 9044");
      expect(travel.tripId).toBe(testTripId);
    });

    it("should throw PermissionDeniedError when non-organizer creates travel for another member", async () => {
      const travelData = {
        travelType: "arrival" as const,
        arrivalTime: "2026-06-10T14:00:00Z",
        arrivalLocation: "Airport",
        memberId: testMember2MemberId,
      };

      await expect(
        memberTravelService.createMemberTravel(
          testMember1Id,
          testTripId,
          travelData,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw MemberNotFoundError when memberId does not belong to trip", async () => {
      // Create a user and member in a different trip
      const otherTripPhone = generateUniquePhone();
      const [otherUser] = await db
        .insert(users)
        .values({
          phoneNumber: otherTripPhone,
          displayName: "Other Trip User",
          timezone: "UTC",
        })
        .returning();

      const [otherTrip] = await db
        .insert(trips)
        .values({
          name: "Other Trip",
          destination: "Other Destination",
          preferredTimezone: "UTC",
          createdBy: otherUser.id,
        })
        .returning();

      const [otherMember] = await db
        .insert(members)
        .values({
          tripId: otherTrip.id,
          userId: otherUser.id,
          status: "going",
        })
        .returning();

      const travelData = {
        travelType: "arrival" as const,
        arrivalTime: "2026-06-10T14:00:00Z",
        memberId: otherMember.id,
      };

      await expect(
        memberTravelService.createMemberTravel(
          testOrganizerId,
          testTripId,
          travelData,
        ),
      ).rejects.toThrow(MemberNotFoundError);

      // Cleanup
      await db.delete(members).where(eq(members.tripId, otherTrip.id));
      await db.delete(trips).where(eq(trips.id, otherTrip.id));
      await db.delete(users).where(eq(users.phoneNumber, otherTripPhone));
    });

    it("should throw MemberNotFoundError when memberId is completely non-existent", async () => {
      const travelData = {
        travelType: "arrival" as const,
        arrivalTime: "2026-06-10T14:00:00Z",
        memberId: "00000000-0000-0000-0000-000000000000",
      };

      await expect(
        memberTravelService.createMemberTravel(
          testOrganizerId,
          testTripId,
          travelData,
        ),
      ).rejects.toThrow(MemberNotFoundError);
    });

    it("should still create travel for self without memberId (backward compatibility)", async () => {
      const travelData = {
        travelType: "departure" as const,
        departureTime: "2026-06-20T16:00:00Z",
        departureLocation: "Train Station",
      };

      const { memberTravel: travel } =
        await memberTravelService.createMemberTravel(
        testMember1Id,
        testTripId,
        travelData,
      );

      expect(travel).toBeDefined();
      expect(travel.memberId).toBe(testMember1MemberId);
      expect(travel.travelType).toBe("departure");
    });
  });
});
