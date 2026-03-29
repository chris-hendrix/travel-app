import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  payments,
  paymentParticipants,
} from "@/db/schema/index.js";
import { generateUniquePhone } from "../test-utils.js";

describe("Balance Routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  async function setupTripWithPayment() {
    const phoneA = generateUniquePhone();
    const phoneB = generateUniquePhone();

    const [userA] = await db
      .insert(users)
      .values({ phoneNumber: phoneA, displayName: "Alice", timezone: "UTC" })
      .returning();
    const [userB] = await db
      .insert(users)
      .values({ phoneNumber: phoneB, displayName: "Bob", timezone: "UTC" })
      .returning();

    const [trip] = await db
      .insert(trips)
      .values({
        name: "Balance Test",
        destination: "Test",
        preferredTimezone: "UTC",
        createdBy: userA!.id,
      })
      .returning();

    await db.insert(members).values([
      { tripId: trip!.id, userId: userA!.id, status: "going", isOrganizer: true },
      { tripId: trip!.id, userId: userB!.id, status: "going" },
    ]);

    // Alice pays $20 split between Alice and Bob
    const [payment] = await db
      .insert(payments)
      .values({
        tripId: trip!.id,
        description: "Dinner",
        amount: 2000,
        userId: userA!.id,
        createdBy: userA!.id,
      })
      .returning();

    await db.insert(paymentParticipants).values([
      { paymentId: payment!.id, userId: userA!.id, shareAmount: 1000 },
      { paymentId: payment!.id, userId: userB!.id, shareAmount: 1000 },
    ]);

    return { userA: userA!, userB: userB!, trip: trip! };
  }

  describe("GET /api/trips/:tripId/balances", () => {
    it("should return simplified balances", async () => {
      app = await buildApp();
      const { userA, trip } = await setupTripWithPayment();
      const token = app.jwt.sign({ sub: userA.id, name: userA.displayName });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/balances`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.balances).toHaveLength(1);
      expect(body.balances[0]).toMatchObject({
        from: { name: "Bob", isGuest: false },
        to: { name: "Alice", isGuest: false },
        amount: 1000,
      });
    });
  });

  describe("GET /api/trips/:tripId/balances/me", () => {
    it("should return current user's net balance", async () => {
      app = await buildApp();
      const { userA, trip } = await setupTripWithPayment();
      const token = app.jwt.sign({ sub: userA.id, name: userA.displayName });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/balances/me`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.netBalance).toBe(1000); // Alice is owed $10
    });

    it("should return 401 if not authenticated", async () => {
      app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/balances/me",
      });
      expect(response.statusCode).toBe(401);
    });
  });
});
