import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  tripGuests,
  payments,
} from "@/db/schema/index.js";
import { generateUniquePhone } from "../test-utils.js";

describe("Guest Routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  async function setupTrip() {
    const phone = generateUniquePhone();
    const [user] = await db
      .insert(users)
      .values({ phoneNumber: phone, displayName: "Test User", timezone: "UTC" })
      .returning();

    const [trip] = await db
      .insert(trips)
      .values({
        name: "Test Trip",
        destination: "Test",
        preferredTimezone: "UTC",
        createdBy: user!.id,
      })
      .returning();

    await db.insert(members).values({
      tripId: trip!.id,
      userId: user!.id,
      status: "going",
      isOrganizer: true,
    });

    return { user: user!, trip: trip! };
  }

  describe("POST /api/trips/:tripId/guests", () => {
    it("should create a guest and return 201", async () => {
      app = await buildApp();
      const { user, trip } = await setupTrip();
      const token = app.jwt.sign({ sub: user.id, name: user.displayName });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/guests`,
        cookies: { auth_token: token },
        payload: { name: "Dave" },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.guest).toMatchObject({
        name: "Dave",
        tripId: trip.id,
        createdBy: user.id,
      });
    });

    it("should return 401 if not authenticated", async () => {
      app = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/guests",
        payload: { name: "Dave" },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/trips/:tripId/guests", () => {
    it("should list guests for a trip", async () => {
      app = await buildApp();
      const { user, trip } = await setupTrip();
      const token = app.jwt.sign({ sub: user.id, name: user.displayName });

      // Create a guest directly
      await db.insert(tripGuests).values({
        tripId: trip.id,
        name: "Eve",
        createdBy: user.id,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/guests`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.guests).toHaveLength(1);
      expect(body.guests[0].name).toBe("Eve");
    });
  });

  describe("PUT /api/guests/:id", () => {
    it("should update a guest name", async () => {
      app = await buildApp();
      const { user, trip } = await setupTrip();
      const token = app.jwt.sign({ sub: user.id, name: user.displayName });

      const [guest] = await db
        .insert(tripGuests)
        .values({ tripId: trip.id, name: "Old Name", createdBy: user.id })
        .returning();

      const response = await app.inject({
        method: "PUT",
        url: `/api/guests/${guest!.id}`,
        cookies: { auth_token: token },
        payload: { name: "New Name" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.guest.name).toBe("New Name");
    });
  });

  describe("DELETE /api/guests/:id", () => {
    it("should delete a guest with no payments", async () => {
      app = await buildApp();
      const { user, trip } = await setupTrip();
      const token = app.jwt.sign({ sub: user.id, name: user.displayName });

      const [guest] = await db
        .insert(tripGuests)
        .values({ tripId: trip.id, name: "Temp", createdBy: user.id })
        .returning();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/guests/${guest!.id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
    });

    it("should reject deleting a guest with payments", async () => {
      app = await buildApp();
      const { user, trip } = await setupTrip();
      const token = app.jwt.sign({ sub: user.id, name: user.displayName });

      const [guest] = await db
        .insert(tripGuests)
        .values({ tripId: trip.id, name: "Has Payments", createdBy: user.id })
        .returning();

      // Create a payment where this guest is the payer
      await db.insert(payments).values({
        tripId: trip.id,
        description: "Test",
        amount: 1000,
        guestId: guest!.id,
        createdBy: user.id,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/guests/${guest!.id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(409);
    });
  });
});
