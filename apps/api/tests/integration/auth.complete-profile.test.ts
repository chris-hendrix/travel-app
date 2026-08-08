import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";

describe("POST /api/auth/complete-profile", () => {
  let app: FastifyInstance;

  // No cleanup needed - unique phone numbers prevent conflicts

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("Success Cases", () => {
    it("should return 200 and update user profile with displayName and timezone", async () => {
      app = await buildApp();

      // Create test user with empty displayName
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/complete-profile",
        cookies: {
          auth_token: token,
        },
        payload: {
          displayName: "John Doe",
          timezone: "America/New_York",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("user");
      expect(body.user.displayName).toBe("John Doe");
      expect(body.user.timezone).toBe("America/New_York");
      expect(body.user.phoneNumber).toBe(testUser.phoneNumber);

      // Verify cookie is set with new token
      const cookies = response.cookies;
      const authCookie = cookies.find((c) => c.name === "auth_token");
      expect(authCookie).toBeDefined();
      expect(authCookie!.value).toBeTruthy();

      // Verify new token includes updated displayName
      const decoded = app.jwt.verify(authCookie!.value);
      expect(decoded).toHaveProperty("sub", testUser.id);
      expect(decoded).not.toHaveProperty("phone");
      expect(decoded).toHaveProperty("name", "John Doe");
    });

    it("should return 200 and update user profile with displayName only (timezone optional)", async () => {
      app = await buildApp();

      // Create test user
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/complete-profile",
        cookies: {
          auth_token: token,
        },
        payload: {
          displayName: "Jane Smith",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.user.displayName).toBe("Jane Smith");
      expect(body.user.timezone).toBe("UTC"); // Should remain UTC
    });

    it("should set auth_token cookie with correct settings", async () => {
      app = await buildApp();

      // Create test user
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/complete-profile",
        cookies: {
          auth_token: token,
        },
        payload: {
          displayName: "Test User",
          timezone: "America/Los_Angeles",
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify cookie settings
      const cookies = response.cookies;
      const authCookie = cookies.find((c) => c.name === "auth_token");
      expect(authCookie).toBeDefined();
      expect(authCookie).toHaveProperty("httpOnly", true);
      expect(authCookie).toHaveProperty("path", "/");
      expect(authCookie).toHaveProperty("sameSite", "Lax");
      expect(authCookie).toHaveProperty("maxAge", 7 * 24 * 60 * 60);
    });

    it("should update existing displayName if user already has one", async () => {
      app = await buildApp();

      // Create test user with existing displayName
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Old Name",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: "Old Name",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/complete-profile",
        cookies: {
          auth_token: token,
        },
        payload: {
          displayName: "New Name",
          timezone: "Europe/London",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.user.displayName).toBe("New Name");
      expect(body.user.timezone).toBe("Europe/London");
    });
  });

  describe("Validation Errors", () => {
    it("should return 400 when displayName is missing", async () => {
      app = await buildApp();

      // Create test user
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/complete-profile",
        cookies: {
          auth_token: token,
        },
        payload: {
          timezone: "America/New_York",
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
          details: expect.any(Array),
        },
      });
    });

    it("should return 400 when displayName is too short (< 3 chars)", async () => {
      app = await buildApp();

      // Create test user
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/complete-profile",
        cookies: {
          auth_token: token,
        },
        payload: {
          displayName: "AB",
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.details[0].message).toContain("at least 3 characters");
    });

    it("should return 400 when displayName is too long (> 50 chars)", async () => {
      app = await buildApp();

      // Create test user
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
      });

      const longName = "A".repeat(51);

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/complete-profile",
        cookies: {
          auth_token: token,
        },
        payload: {
          displayName: longName,
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.details[0].message).toContain(
        "not exceed 50 characters",
      );
    });

    it("should return 400 when displayName is empty string", async () => {
      app = await buildApp();

      // Create test user
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/complete-profile",
        cookies: {
          auth_token: token,
        },
        payload: {
          displayName: "",
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Unauthorized Cases", () => {
    it("should return 401 when no token is provided", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/complete-profile",
        payload: {
          displayName: "John Doe",
          timezone: "America/New_York",
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or expired token",
        },
      });
    });

    it("should return 401 when invalid token is provided", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/complete-profile",
        cookies: {
          auth_token: "invalid.token.here",
        },
        payload: {
          displayName: "John Doe",
          timezone: "America/New_York",
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("should return 401 when token is expired", async () => {
      app = await buildApp();

      // Create test user
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Generate expired JWT token (expired 1 second ago)
      const expiredToken = app.jwt.sign({
        sub: testUser.id,
        exp: Math.floor(Date.now() / 1000) - 60, // Expired 60 seconds ago
      }, {});

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/complete-profile",
        cookies: {
          auth_token: expiredToken,
        },
        payload: {
          displayName: "John Doe",
          timezone: "America/New_York",
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("Database Verification", () => {
    it("should update user in database with new profile data", async () => {
      app = await buildApp();

      // Create test user
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/complete-profile",
        cookies: {
          auth_token: token,
        },
        payload: {
          displayName: "Database Test User",
          timezone: "Asia/Tokyo",
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify user was updated in database
      const result = await db
        .select()
        .from(users)
        .where(eq(users.id, testUser.id))
        .limit(1);

      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe("Database Test User");
      expect(result[0].timezone).toBe("Asia/Tokyo");
      expect(result[0].updatedAt.getTime()).toBeGreaterThanOrEqual(
        result[0].createdAt.getTime(),
      );
    });

    it("should preserve other user fields when updating profile", async () => {
      app = await buildApp();

      // Create test user
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];
      const originalCreatedAt = testUser.createdAt;
      const originalId = testUser.id;

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/complete-profile",
        cookies: {
          auth_token: token,
        },
        payload: {
          displayName: "Preserved User",
          timezone: "Europe/Paris",
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify other fields are preserved
      const result = await db
        .select()
        .from(users)
        .where(eq(users.id, testUser.id))
        .limit(1);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(originalId);
      expect(result[0].phoneNumber).toBe(testUser.phoneNumber);
      expect(result[0].createdAt.getTime()).toBe(originalCreatedAt.getTime());
    });
  });
});
