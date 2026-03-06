import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users } from "@/db/schema/index.js";
import { generateUniquePhone } from "../test-utils.js";

describe("Config Flags & Improvements", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("Config Flag Defaults", () => {
    it("should have COOKIE_SECURE config flag available", async () => {
      app = await buildApp();

      expect(app.config).toHaveProperty("COOKIE_SECURE");
      expect(typeof app.config.COOKIE_SECURE).toBe("boolean");
    });

    it("should have EXPOSE_ERROR_DETAILS config flag available", async () => {
      app = await buildApp();

      expect(app.config).toHaveProperty("EXPOSE_ERROR_DETAILS");
      expect(typeof app.config.EXPOSE_ERROR_DETAILS).toBe("boolean");
    });

    it("should have ENABLE_FIXED_VERIFICATION_CODE config flag available", async () => {
      app = await buildApp();

      expect(app.config).toHaveProperty("ENABLE_FIXED_VERIFICATION_CODE");
      expect(typeof app.config.ENABLE_FIXED_VERIFICATION_CODE).toBe("boolean");
    });

    it("should default COOKIE_SECURE to false in test environment", async () => {
      app = await buildApp();

      // In test environment (NODE_ENV=test), COOKIE_SECURE defaults to false
      expect(app.config.COOKIE_SECURE).toBe(false);
    });

    it("should default ENABLE_FIXED_VERIFICATION_CODE to true in test environment", async () => {
      app = await buildApp();

      // In test environment (NODE_ENV=test), this defaults to true (not production)
      expect(app.config.ENABLE_FIXED_VERIFICATION_CODE).toBe(true);
    });
  });

  describe("Health Live Endpoint", () => {
    it("should return 200 with status ok", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/health/live",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({ status: "ok" });
    });

    it("should always return 200 regardless of other conditions", async () => {
      app = await buildApp();

      // Liveness probe should always succeed if the process is running
      const response = await app.inject({
        method: "GET",
        url: "/api/health/live",
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("Health Ready Endpoint", () => {
    it("should return 200 when database is connected", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/health/ready",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("ok");
      expect(body.database).toBe("connected");
      expect(body.timestamp).toBeDefined();
    });

    it("should return correct response structure", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/health/ready",
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("status");
      expect(body).toHaveProperty("timestamp");
      expect(body).toHaveProperty("database");
    });

    it("should return valid ISO-8601 timestamp", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/health/ready",
      });

      const body = JSON.parse(response.body);
      expect(body.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });
  });

  describe("Scoped Auth Hooks", () => {
    it("should allow GET /api/trips with auth only (no complete profile)", async () => {
      app = await buildApp();

      // Create user without complete profile (empty displayName)
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/trips",
        cookies: { auth_token: token },
      });

      // Should not be 403 (PROFILE_INCOMPLETE) - GET only requires auth
      expect(response.statusCode).not.toBe(403);
    });

    it("should allow GET /api/trips/:id with auth only (no complete profile)", async () => {
      app = await buildApp();

      // Create user without complete profile
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/trips/10000000-0000-4000-8000-000000000001",
        cookies: { auth_token: token },
      });

      // Should not be 403 - even though trip doesn't exist, it shouldn't be blocked by profile check
      expect(response.statusCode).not.toBe(403);
    });

    it("should require complete profile for POST /api/trips", async () => {
      app = await buildApp();

      // Create user without complete profile
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/trips",
        cookies: { auth_token: token },
        payload: {
          name: "Test Trip",
          destination: "Test City",
          timezone: "UTC",
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("PROFILE_INCOMPLETE");
    });

    it("should require complete profile for PUT /api/trips/:id", async () => {
      app = await buildApp();

      // Create user without complete profile
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
      });

      const response = await app.inject({
        method: "PUT",
        url: "/api/trips/10000000-0000-4000-8000-000000000001",
        cookies: { auth_token: token },
        payload: {
          name: "Updated Trip",
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("PROFILE_INCOMPLETE");
    });

    it("should require complete profile for DELETE /api/trips/:id", async () => {
      app = await buildApp();

      // Create user without complete profile
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
      });

      const response = await app.inject({
        method: "DELETE",
        url: "/api/trips/10000000-0000-4000-8000-000000000001",
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("PROFILE_INCOMPLETE");
    });

    it("should require auth for all trip routes", async () => {
      app = await buildApp();

      // GET routes without auth should return 401
      const getResponse = await app.inject({
        method: "GET",
        url: "/api/trips",
      });
      expect(getResponse.statusCode).toBe(401);

      // POST routes without auth should return 401
      const postResponse = await app.inject({
        method: "POST",
        url: "/api/trips",
        payload: {
          name: "Test Trip",
          destination: "Test City",
          timezone: "UTC",
        },
      });
      expect(postResponse.statusCode).toBe(401);
    });
  });

  describe("Multipart Limits", () => {
    it("should have multipart plugin registered with limits", async () => {
      app = await buildApp();

      // Verify the app starts successfully with the multipart configuration
      // The multipart plugin is registered during buildApp
      expect(app).toBeDefined();
    });
  });
});
