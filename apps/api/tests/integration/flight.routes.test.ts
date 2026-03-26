import { describe, it, expect, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users } from "@/db/schema/index.js";
import { generateUniquePhone } from "../test-utils.js";

describe("Flight Routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (app) {
      await app.close();
    }
  });

  describe("POST /api/flights/lookup", () => {
    it("returns flight data for valid request", async () => {
      app = await buildApp();

      // Create test user
      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Flight Test User",
          timezone: "UTC",
        })
        .returning();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      // Mock the flight service
      const mockResult = {
        available: true as const,
        flight: {
          departureAirport: { iata: "LHR", name: "London Heathrow" },
          departureTime: "2026-03-26T08:00+00:00",
          arrivalAirport: { iata: "EWR", name: "Newark Liberty" },
          arrivalTime: "2026-03-26T12:20-04:00",
        },
      };
      vi.spyOn(app.flightService, "lookupFlight").mockResolvedValueOnce(
        mockResult,
      );

      const response = await app.inject({
        method: "POST",
        url: "/api/flights/lookup",
        cookies: { auth_token: token },
        payload: { flightNumber: "UA123", date: "2026-03-26" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.available).toBe(true);
      expect(body.flight.departureAirport.iata).toBe("LHR");
      expect(body.flight.arrivalTime).toBe("2026-03-26T12:20-04:00");
    });

    it("returns 401 when not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/flights/lookup",
        payload: { flightNumber: "UA123", date: "2026-03-26" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 400 for invalid body", async () => {
      app = await buildApp();

      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Validation Test User",
          timezone: "UTC",
        })
        .returning();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      // Missing date field
      const response = await app.inject({
        method: "POST",
        url: "/api/flights/lookup",
        cookies: { auth_token: token },
        payload: { flightNumber: "UA123" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 400 for invalid flight number format", async () => {
      app = await buildApp();

      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Format Test User",
          timezone: "UTC",
        })
        .returning();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/flights/lookup",
        cookies: { auth_token: token },
        payload: { flightNumber: "INVALID!", date: "2026-03-26" },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
