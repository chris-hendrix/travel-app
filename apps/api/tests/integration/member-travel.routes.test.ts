import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, trips, members, memberTravel } from "@/db/schema/index.js";
import { generateUniquePhone } from "../test-utils.js";
import { and, eq, isNull } from "drizzle-orm";

describe("Member Travel Routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  /**
   * A user, a trip they created, their member row and a bearer token.
   * Shared by the suites that assert the member-and-direction pair, since
   * each of them needs its own trip to stay out of the others' way.
   */
  const seed = async (label: string) => {
    const [user] = await db
      .insert(users)
      .values({
        phoneNumber: generateUniquePhone(),
        displayName: label,
        timezone: "UTC",
      })
      .returning();

    const [trip] = await db
      .insert(trips)
      .values({
        name: `${label} Trip`,
        destination: "Lisbon",
        preferredTimezone: "Europe/Lisbon",
        createdBy: user!.id,
      })
      .returning();

    const [member] = await db
      .insert(members)
      .values({
        tripId: trip!.id,
        userId: user!.id,
        status: "going",
      })
      .returning();

    const token = app.jwt.sign({
      sub: user!.id,
      name: user!.displayName,
    });

    return { token, tripId: trip!.id, memberId: member!.id };
  };

  describe("POST /api/trips/:tripId/member-travel", () => {
    it("should create member travel and return 201", async () => {
      app = await buildApp();

      // Create test user with complete profile
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Create a trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add user as member
      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/member-travel`,
        cookies: {
          auth_token: token,
        },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-06-15T14:00:00Z",
          arrivalLocation: "CDG Airport",
          details: "Flight AF123 from JFK",
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("memberTravel");
      expect(body.memberTravel).toMatchObject({
        travelType: "arrival",
        arrivalLocation: "CDG Airport",
        details: "Flight AF123 from JFK",
        tripId: trip.id,
      });
    });

    it("should round-trip full flight data on POST/GET/PUT", async () => {
      app = await buildApp();

      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Round Trip User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Round Trip Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
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

      // POST with full flight data (both sides + flight number)
      const postResponse = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-06-15T14:00:00Z",
          arrivalLocation: "CDG Airport",
          departureTime: "2026-06-15T10:00:00Z",
          departureLocation: "JFK Airport",
          flightNumber: "AF123",
        },
      });

      expect(postResponse.statusCode).toBe(201);
      const posted = JSON.parse(postResponse.body).memberTravel;
      expect(posted.flightNumber).toBe("AF123");
      expect(posted.arrivalLocation).toBe("CDG Airport");
      expect(posted.departureLocation).toBe("JFK Airport");

      // GET list returns the same fields
      const getResponse = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/member-travel`,
        cookies: { auth_token: token },
      });
      expect(getResponse.statusCode).toBe(200);
      const listed = JSON.parse(getResponse.body).memberTravels;
      expect(listed).toHaveLength(1);
      expect(listed[0].flightNumber).toBe("AF123");
      expect(listed[0].departureLocation).toBe("JFK Airport");

      // PUT updates counterpart fields
      const putResponse = await app.inject({
        method: "PUT",
        url: `/api/member-travel/${posted.id}`,
        cookies: { auth_token: token },
        payload: {
          departureLocation: "EWR Airport",
        },
      });
      expect(putResponse.statusCode).toBe(200);
      expect(JSON.parse(putResponse.body).memberTravel.departureLocation).toBe(
        "EWR Airport",
      );
    });

    it("should return 401 if not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/member-travel",
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-06-15T14:00:00Z",
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 403 if user lacks permission", async () => {
      app = await buildApp();

      // Create trip owner
      const ownerResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Owner",
          timezone: "UTC",
        })
        .returning();

      const owner = ownerResult[0];

      // Create trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Owner's Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: owner.id,
        })
        .returning();

      const trip = tripResult[0];

      await db.insert(members).values({
        tripId: trip.id,
        userId: owner.id,
        status: "going",
      });

      // Create unauthorized user
      const unauthorizedResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Unauthorized User",
          timezone: "UTC",
        })
        .returning();

      const unauthorized = unauthorizedResult[0];

      const token = app.jwt.sign({
        sub: unauthorized.id,
        name: unauthorized.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/member-travel`,
        cookies: {
          auth_token: token,
        },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-06-15T14:00:00Z",
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe("GET /api/trips/:tripId/member-travel", () => {
    it("should list all member travel for a trip", async () => {
      app = await buildApp();

      // Create test user
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Create second user
      const user2Result = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "User 2",
          timezone: "UTC",
        })
        .returning();

      const user2 = user2Result[0];

      // Create trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      const memberRecords = await db
        .insert(members)
        .values([
          {
            tripId: trip.id,
            userId: testUser.id,
            status: "going",
          },
          {
            tripId: trip.id,
            userId: user2.id,
            status: "going",
          },
        ])
        .returning();

      // Create member travel records using member IDs
      await db.insert(memberTravel).values([
        {
          tripId: trip.id,
          memberId: memberRecords[0].id,
          createdBy: testUser.id,
          travelType: "arrival",
          arrivalTime: new Date("2026-06-15T14:00:00Z"),
        },
        {
          tripId: trip.id,
          memberId: memberRecords[1].id,
          createdBy: testUser.id,
          travelType: "departure",
          departureTime: new Date("2026-06-15T10:00:00Z"),
        },
      ]);

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/member-travel`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("memberTravels");
      expect(body.memberTravels).toHaveLength(2);
    });

    it("should return 401 if not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/member-travel",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/member-travel/locations", () => {
    it("returns the caller's own locations", async () => {
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
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const [member] = await db
        .insert(members)
        .values({ tripId: trip.id, userId: testUser.id, status: "going" })
        .returning();

      await db.insert(memberTravel).values({
        tripId: trip.id,
        memberId: member.id,
        travelType: "arrival",
        arrivalTime: new Date("2026-06-15T14:00:00Z"),
        arrivalLocation: "CDG Airport",
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/member-travel/locations",
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        success: true,
        locations: ["CDG Airport"],
      });

      // Cleanup
      await db.delete(memberTravel).where(eq(memberTravel.tripId, trip.id));
      await db.delete(members).where(eq(members.tripId, trip.id));
      await db.delete(trips).where(eq(trips.id, trip.id));
      await db.delete(users).where(eq(users.id, testUser.id));
    });

    it("returns 401 if not authenticated", async () => {
      app = await buildApp();

      // 401 rather than 400 is also what proves the static segment
      // resolves ahead of `GET /member-travel/:id`: a request that fell
      // into the id route would fail its UUID param schema before the
      // authenticate hook ever ran.
      const response = await app.inject({
        method: "GET",
        url: "/api/member-travel/locations",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/member-travel/:id", () => {
    it("should get member travel by ID", async () => {
      app = await buildApp();

      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      const memberRecords = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: testUser.id,
          status: "going",
        })
        .returning();

      const travelResult = await db
        .insert(memberTravel)
        .values({
          tripId: trip.id,
          memberId: memberRecords[0].id,
          createdBy: testUser.id,
          travelType: "arrival",
          arrivalTime: new Date("2026-06-15T14:00:00Z"),
        })
        .returning();

      const travel = travelResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/member-travel/${travel.id}`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("memberTravel");
      expect(body.memberTravel.id).toBe(travel.id);
    });

    it("should return 404 if member travel not found", async () => {
      app = await buildApp();

      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/member-travel/550e8400-e29b-41d4-a716-446655440000",
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("PUT /api/member-travel/:id", () => {
    it("should update member travel and return 200", async () => {
      app = await buildApp();

      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      const memberRecords = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: testUser.id,
          status: "going",
        })
        .returning();

      const travelResult = await db
        .insert(memberTravel)
        .values({
          tripId: trip.id,
          memberId: memberRecords[0].id,
          createdBy: testUser.id,
          travelType: "arrival",
          arrivalTime: new Date("2026-06-15T14:00:00Z"),
        })
        .returning();

      const travel = travelResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "PUT",
        url: `/api/member-travel/${travel.id}`,
        cookies: {
          auth_token: token,
        },
        payload: {
          arrivalLocation: "JFK Airport",
          details: "Updated details",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.memberTravel.arrivalLocation).toBe("JFK Airport");
      expect(body.memberTravel.details).toBe("Updated details");
    });

    it("should return 403 if user lacks permission", async () => {
      app = await buildApp();

      // Create travel owner
      const ownerResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Owner",
          timezone: "UTC",
        })
        .returning();

      const owner = ownerResult[0];

      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: owner.id,
        })
        .returning();

      const trip = tripResult[0];

      const memberRecords = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: owner.id,
          status: "going",
        })
        .returning();

      const travelResult = await db
        .insert(memberTravel)
        .values({
          tripId: trip.id,
          memberId: memberRecords[0].id,
          createdBy: owner.id,
          travelType: "arrival",
          arrivalTime: new Date("2026-06-15T14:00:00Z"),
        })
        .returning();

      const travel = travelResult[0];

      // Create unauthorized user
      const unauthorizedResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Unauthorized User",
          timezone: "UTC",
        })
        .returning();

      const unauthorized = unauthorizedResult[0];

      const token = app.jwt.sign({
        sub: unauthorized.id,
        name: unauthorized.displayName,
      });

      const response = await app.inject({
        method: "PUT",
        url: `/api/member-travel/${travel.id}`,
        cookies: {
          auth_token: token,
        },
        payload: {
          arrivalLocation: "Unauthorized",
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe("DELETE /api/member-travel/:id", () => {
    it("should soft delete member travel and return 200", async () => {
      app = await buildApp();

      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      const memberRecords = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: testUser.id,
          status: "going",
        })
        .returning();

      const travelResult = await db
        .insert(memberTravel)
        .values({
          tripId: trip.id,
          memberId: memberRecords[0].id,
          createdBy: testUser.id,
          travelType: "arrival",
          arrivalTime: new Date("2026-06-15T14:00:00Z"),
        })
        .returning();

      const travel = travelResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/member-travel/${travel.id}`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
    });
  });

  describe("POST /api/member-travel/:id/restore", () => {
    it("should restore soft-deleted member travel and return 200", async () => {
      app = await buildApp();

      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      const memberRecords = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: testUser.id,
          status: "going",
        })
        .returning();

      const travelResult = await db
        .insert(memberTravel)
        .values({
          tripId: trip.id,
          memberId: memberRecords[0].id,
          createdBy: testUser.id,
          travelType: "arrival",
          arrivalTime: new Date("2026-06-15T14:00:00Z"),
          deletedAt: new Date(),
          deletedBy: testUser.id,
        })
        .returning();

      const travel = travelResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/member-travel/${travel.id}/restore`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("memberTravel");
      expect(body.memberTravel.deletedAt).toBeNull();
    });
  });

  describe("POST /api/trips/:tripId/member-travel on the member and direction", () => {
    it("answers 201 for a new pair and 200 for the same pair again", async () => {
      app = await buildApp();
      const { token, tripId } = await seed("Upsert Test User");

      const payload = {
        travelType: "arrival" as const,
        arrivalTime: "2026-07-01T14:00:00Z",
        arrivalLocation: "Airport",
      };

      const first = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload,
      });
      expect(first.statusCode).toBe(201);
      const created = JSON.parse(first.body);

      const second = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload: { ...payload, arrivalLocation: "Terminal 1" },
      });
      expect(second.statusCode).toBe(200);
      const updated = JSON.parse(second.body);

      // The same row and the same body shape: only the status says which
      // happened, so a client can read one response shape either way.
      expect(updated.memberTravel.id).toBe(created.memberTravel.id);
      expect(updated.memberTravel.arrivalLocation).toBe("Terminal 1");
      expect(Object.keys(updated).sort()).toEqual(
        Object.keys(created).sort(),
      );

      const rows = await db
        .select()
        .from(memberTravel)
        .where(
          and(
            eq(memberTravel.tripId, tripId),
            isNull(memberTravel.deletedAt),
          ),
        );
      expect(rows).toHaveLength(1);
    });

    it("clears only the field a PUT sends as null", async () => {
      app = await buildApp();
      const { token, tripId } = await seed("Clear Test User");

      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-07-01T14:00:00Z",
          arrivalLocation: "Airport",
          details: "Landing T2",
        },
      });
      expect(created.statusCode).toBe(201);
      const id = JSON.parse(created.body).memberTravel.id;

      const cleared = await app.inject({
        method: "PUT",
        url: `/api/member-travel/${id}`,
        cookies: { auth_token: token },
        payload: { arrivalLocation: null },
      });
      expect(cleared.statusCode).toBe(200);
      const body = JSON.parse(cleared.body);
      // The null clears its own column and nothing else: the detail the
      // patch never mentioned is still there.
      expect(body.memberTravel.arrivalLocation).toBeNull();
      expect(body.memberTravel.details).toBe("Landing T2");
      expect(body.memberTravel.arrivalTime).toBe(
        "2026-07-01T14:00:00.000Z",
      );
    });

    it("still rejects a null time, on the PUT and on the POST", async () => {
      // The two time columns stay non-nullable: a direction is removed
      // with Delete, not by blanking the time the board files on.
      app = await buildApp();
      const { token, tripId } = await seed("Null Time Test User");

      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-07-01T14:00:00Z",
        },
      });
      const id = JSON.parse(created.body).memberTravel.id;

      const viaPut = await app.inject({
        method: "PUT",
        url: `/api/member-travel/${id}`,
        cookies: { auth_token: token },
        payload: { arrivalTime: null },
      });
      expect(viaPut.statusCode).toBe(400);

      const viaPost = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload: { travelType: "arrival", arrivalTime: null },
      });
      expect(viaPost.statusCode).toBe(400);
    });

    it("puts a travelType on the PUT without moving the row", async () => {
      // The direction is create-only (`updateMemberTravelSchema` omits it),
      // and the route's body validation is where a client's word about it
      // stops: zod strips the key, so the PUT answers 200 with the row it
      // already had and the pair keeps one live row. Writing it would flip
      // the row onto the other pair while the row's current pair went
      // free — the second live row this whole change exists to prevent,
      // this time made by an edit.
      app = await buildApp();
      const { token, tripId } = await seed("Direction Lock Test User");

      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-07-01T14:00:00Z",
          arrivalLocation: "Airport",
        },
      });
      expect(created.statusCode).toBe(201);
      const id = JSON.parse(created.body).memberTravel.id;

      const pushed = await app.inject({
        method: "PUT",
        url: `/api/member-travel/${id}`,
        cookies: { auth_token: token },
        payload: { travelType: "departure", details: "Kept the edit" },
      });

      expect(pushed.statusCode).toBe(200);
      const body = JSON.parse(pushed.body);
      // The edit lands, the direction does not.
      expect(body.memberTravel.travelType).toBe("arrival");
      expect(body.memberTravel.details).toBe("Kept the edit");

      const rows = await db
        .select()
        .from(memberTravel)
        .where(
          and(eq(memberTravel.tripId, tripId), isNull(memberTravel.deletedAt)),
        );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(id);
      expect(rows[0]!.travelType).toBe("arrival");
    });
  });

  describe("The mode a leg is filed with", () => {
    it("answers flight for a POST that names no mode", async () => {
      app = await buildApp();
      const { token, tripId } = await seed("Mode Default User");

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-07-01T14:00:00Z",
          arrivalLocation: "Airport",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      // The column's own default, and the reason the entity schema
      // declares the field at all: the route answers through
      // `memberTravelResponseSchema`, which strips every field the entity
      // does not name, so an undeclared mode would never reach a client.
      expect(body.memberTravel.transportMode).toBe("flight");
    });

    it("answers the mode a POST named", async () => {
      app = await buildApp();
      const { token, tripId } = await seed("Mode Post User");

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "departure",
          departureTime: "2026-07-08T09:00:00Z",
          departureLocation: "Valencia",
          transportMode: "car",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.body).memberTravel.transportMode).toBe("car");

      const rows = await db
        .select({ transportMode: memberTravel.transportMode })
        .from(memberTravel)
        .where(
          and(eq(memberTravel.tripId, tripId), isNull(memberTravel.deletedAt)),
        );
      expect(rows.map((row) => row.transportMode)).toEqual(["car"]);
    });

    it("answers the mode a PUT set", async () => {
      app = await buildApp();
      const { token, tripId } = await seed("Mode Put User");

      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-07-01T14:00:00Z",
          arrivalLocation: "St Pancras",
        },
      });
      expect(created.statusCode).toBe(201);
      const id = JSON.parse(created.body).memberTravel.id;

      const updated = await app.inject({
        method: "PUT",
        url: `/api/member-travel/${id}`,
        cookies: { auth_token: token },
        payload: { transportMode: "train" },
      });

      expect(updated.statusCode).toBe(200);
      expect(JSON.parse(updated.body).memberTravel.transportMode).toBe("train");
    });

    it("leaves the filed mode alone when the POST names none", async () => {
      // The route half of the pair-update guard: a phone that has not
      // been updated still POSTs a leg with no mode, and that POST must
      // not read as "make this a flight".
      app = await buildApp();
      const { token, tripId } = await seed("Mode Guard User");

      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-07-01T14:00:00Z",
          arrivalLocation: "BCN T2",
          transportMode: "rental",
        },
      });
      expect(created.statusCode).toBe(201);
      expect(JSON.parse(created.body).memberTravel.transportMode).toBe(
        "rental",
      );

      const again = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-07-01T15:00:00Z",
          arrivalLocation: "BCN T2",
        },
      });

      expect(again.statusCode).toBe(200);
      const body = JSON.parse(again.body);
      expect(body.memberTravel.transportMode).toBe("rental");
      expect(body.memberTravel.arrivalTime).toBe("2026-07-01T15:00:00.000Z");
    });

    it("answers the mode on the trip's listing, where the board's chip reads it", async () => {
      // The board reads a member's mode off the branch's own list, and no
      // test above touches it: the write paths answer one record at a
      // time. `rental` rather than the column's default, so a listing that
      // answered `flight` for everything cannot pass.
      app = await buildApp();
      const { token, tripId } = await seed("Mode List User");

      await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-07-01T14:00:00Z",
          arrivalLocation: "BCN T2",
          transportMode: "rental",
        },
      });

      const listed = await app.inject({
        method: "GET",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
      });

      expect(
        JSON.parse(listed.body).memberTravels.map(
          (row: { transportMode: string }) => row.transportMode,
        ),
      ).toEqual(["rental"]);
    });
  });

  describe("POST /api/member-travel/:id/restore on a replaced pair", () => {
    it("answers 409 MEMBER_TRAVEL_CONFLICT for a pair that is live again", async () => {
      // Delete, then file the same direction again: the create path looks
      // only for a *live* row, so it inserts a replacement and leaves the
      // deleted row beside it. Restoring the old one would put two live
      // rows on the pair — the state that draws the member twice on the
      // board — so the endpoint refuses it. Wire level, because the code
      // and the status are what a client has to read.
      app = await buildApp();
      const { token, tripId } = await seed("Restore Conflict User");

      const payload = {
        travelType: "arrival" as const,
        arrivalTime: "2026-07-01T14:00:00Z",
        arrivalLocation: "Airport",
      };

      const first = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload,
      });
      expect(first.statusCode).toBe(201);
      const deletedId = JSON.parse(first.body).memberTravel.id;

      const deleted = await app.inject({
        method: "DELETE",
        url: `/api/member-travel/${deletedId}`,
        cookies: { auth_token: token },
      });
      expect(deleted.statusCode).toBe(200);

      const replacement = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload: { ...payload, arrivalLocation: "Terminal 1" },
      });
      expect(replacement.statusCode).toBe(201);
      const replacementId = JSON.parse(replacement.body).memberTravel.id;
      expect(replacementId).not.toBe(deletedId);

      const restore = await app.inject({
        method: "POST",
        url: `/api/member-travel/${deletedId}/restore`,
        cookies: { auth_token: token },
      });

      expect(restore.statusCode).toBe(409);
      expect(JSON.parse(restore.body)).toMatchObject({
        success: false,
        error: {
          code: "MEMBER_TRAVEL_CONFLICT",
          message: "This member already has live travel for that direction",
        },
      });

      // The refusal leaves the pair exactly as it was: one live row, the
      // replacement, and the row that asked to come back still deleted.
      const rows = await db
        .select()
        .from(memberTravel)
        .where(
          and(eq(memberTravel.tripId, tripId), isNull(memberTravel.deletedAt)),
        );
      expect(rows.map((row) => row.id)).toEqual([replacementId]);
    });

    it("answers 200 for a row that is already live", async () => {
      // The twin check excludes the row being restored, so the endpoint
      // stays the idempotent no-op it always was: a restore of something
      // that never went away is a 200, not a conflict with itself.
      app = await buildApp();
      const { token, tripId } = await seed("Restore No-op User");

      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-07-01T14:00:00Z",
        },
      });
      expect(created.statusCode).toBe(201);
      const id = JSON.parse(created.body).memberTravel.id;

      const restore = await app.inject({
        method: "POST",
        url: `/api/member-travel/${id}/restore`,
        cookies: { auth_token: token },
      });

      expect(restore.statusCode).toBe(200);
      const body = JSON.parse(restore.body);
      expect(body.success).toBe(true);
      expect(body.memberTravel.id).toBe(id);
      expect(body.memberTravel.deletedAt).toBeNull();

      const rows = await db
        .select()
        .from(memberTravel)
        .where(
          and(eq(memberTravel.tripId, tripId), isNull(memberTravel.deletedAt)),
        );
      expect(rows.map((row) => row.id)).toEqual([id]);
    });
  });

  describe("One live row per member and direction", () => {
    it("answers 201 then 200 for one pair and gives the other its own row", async () => {
      // Filing an arrival twice is the same arrival answered again: 201 the
      // first time, 200 the second, and one live row either way. The other
      // direction is its own pair, so it gets a row of its own instead of
      // folding into the arrival — two live rows for the member, and no
      // third is reachable, because every further POST lands on one of the
      // two and updates it.
      app = await buildApp();
      const { token, tripId } = await seed("Pair Ceiling User");

      const arrival = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-07-01T14:00:00Z",
          arrivalLocation: "Airport",
        },
      });
      expect(arrival.statusCode).toBe(201);
      const arrivalId = JSON.parse(arrival.body).memberTravel.id;

      const arrivalAgain = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-07-01T14:00:00Z",
          arrivalLocation: "Terminal 1",
        },
      });
      expect(arrivalAgain.statusCode).toBe(200);
      expect(JSON.parse(arrivalAgain.body).memberTravel.id).toBe(arrivalId);

      const departure = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "departure",
          departureTime: "2026-07-12T10:00:00Z",
          departureLocation: "Airport",
        },
      });
      expect(departure.statusCode).toBe(201);

      const rows = await db
        .select()
        .from(memberTravel)
        .where(
          and(eq(memberTravel.tripId, tripId), isNull(memberTravel.deletedAt)),
        );
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.travelType).sort()).toEqual([
        "arrival",
        "departure",
      ]);
      expect(rows.map((row) => row.id)).toContain(arrivalId);
    });

    it("lets the pair of a soft-deleted row be filed again", async () => {
      // A soft-deleted row is not what the pair rule reads: the pair is
      // free the moment its row is deleted, so the next POST inserts a new
      // row rather than reviving the old one — that is the restore
      // endpoint's job, and it is refused while this new row holds the
      // pair.
      app = await buildApp();
      const { token, tripId } = await seed("Soft Delete Pair User");

      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-07-01T14:00:00Z",
          arrivalLocation: "Airport",
        },
      });
      expect(created.statusCode).toBe(201);
      const deletedId = JSON.parse(created.body).memberTravel.id;

      const deleted = await app.inject({
        method: "DELETE",
        url: `/api/member-travel/${deletedId}`,
        cookies: { auth_token: token },
      });
      expect(deleted.statusCode).toBe(200);

      const refiled = await app.inject({
        method: "POST",
        url: `/api/trips/${tripId}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-07-01T16:00:00Z",
          arrivalLocation: "Gate 4",
        },
      });
      expect(refiled.statusCode).toBe(201);
      const newId = JSON.parse(refiled.body).memberTravel.id;
      expect(newId).not.toBe(deletedId);

      const rows = await db
        .select()
        .from(memberTravel)
        .where(
          and(eq(memberTravel.tripId, tripId), isNull(memberTravel.deletedAt)),
        );
      expect(rows.map((row) => row.id)).toEqual([newId]);
    });
  });

  describe("Member travel delegation", () => {
    it("should create member travel for another member as organizer (201)", async () => {
      app = await buildApp();

      // Create organizer user
      const [organizer] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer",
          timezone: "UTC",
        })
        .returning();

      // Create regular user
      const [regularUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Regular User",
          timezone: "UTC",
        })
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Delegation Trip",
          destination: "Tokyo",
          preferredTimezone: "Asia/Tokyo",
          createdBy: organizer.id,
        })
        .returning();

      // Add organizer as member (isOrganizer)
      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      // Add regular user as member
      const [regularMember] = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: regularUser.id,
          status: "going",
        })
        .returning();

      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-06-10T14:00:00Z",
          arrivalLocation: "Airport",
          details: "Flight AA123",
          memberId: regularMember.id,
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.memberTravel.memberId).toBe(regularMember.id);
      expect(body.memberTravel.travelType).toBe("arrival");
      expect(body.memberTravel.arrivalLocation).toBe("Airport");
    });

    it("should return 403 when non-organizer creates travel with memberId", async () => {
      app = await buildApp();

      // Create organizer (trip creator)
      const [organizer] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer",
          timezone: "UTC",
        })
        .returning();

      // Create two regular users
      const [user1] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "User 1",
          timezone: "UTC",
        })
        .returning();

      const [user2] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "User 2",
          timezone: "UTC",
        })
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Delegation Trip",
          destination: "Tokyo",
          preferredTimezone: "Asia/Tokyo",
          createdBy: organizer.id,
        })
        .returning();

      // Add organizer as member
      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      // Add user1 and user2 as regular members
      await db.insert(members).values({
        tripId: trip.id,
        userId: user1.id,
        status: "going",
      });

      const [member2] = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: user2.id,
          status: "going",
        })
        .returning();

      // user1 tries to create travel for user2 (not organizer)
      const token = app.jwt.sign({
        sub: user1.id,
        name: user1.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-06-10T14:00:00Z",
          arrivalLocation: "Airport",
          details: "Flight AA123",
          memberId: member2.id,
        },
      });

      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("PERMISSION_DENIED");
    });

    it("should return 404 when memberId does not belong to trip", async () => {
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

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Delegation Trip",
          destination: "Tokyo",
          preferredTimezone: "Asia/Tokyo",
          createdBy: organizer.id,
        })
        .returning();

      // Add organizer as member
      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-06-10T14:00:00Z",
          arrivalLocation: "Airport",
          details: "Flight AA123",
          memberId: "00000000-0000-0000-0000-000000000000",
        },
      });

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("MEMBER_NOT_FOUND");
    });

    it("should create member travel for self without memberId (backward compatibility)", async () => {
      app = await buildApp();

      // Create user
      const [user] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Regular User",
          timezone: "UTC",
        })
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Self Trip",
          destination: "Berlin",
          preferredTimezone: "Europe/Berlin",
          createdBy: user.id,
        })
        .returning();

      // Add as member
      const [member] = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: user.id,
          status: "going",
        })
        .returning();

      const token = app.jwt.sign({
        sub: user.id,
        name: user.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          arrivalTime: "2026-06-10T14:00:00Z",
          arrivalLocation: "Airport",
          details: "Flight AA123",
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.memberTravel.memberId).toBe(member.id);
    });
  });
});
