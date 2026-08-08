import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users } from "@/db/schema/index.js";
import { generateUniquePhone } from "../test-utils.js";

describe("GET /api/auth/me", () => {
  let app: FastifyInstance;

  // No cleanup needed - unique phone numbers prevent conflicts

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("Success Cases", () => {
    it("should return 200 and user data when authenticated with valid token", async () => {
      app = await buildApp();

      // Create test user
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "America/New_York",
        })
        .returning();

      const testUser = testUserResult[0];

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("user");
      expect(body.user.id).toBe(testUser.id);
      expect(body.user.phoneNumber).toBe(testUser.phoneNumber);
      expect(body.user.displayName).toBe("Test User");
      expect(body.user.timezone).toBe("America/New_York");
    });

    it("should return user with empty displayName if not set", async () => {
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
        method: "GET",
        url: "/api/auth/me",
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.user.displayName).toBe("");
      expect(body.user.timezone).toBe("UTC");
    });
  });

  describe("Unauthorized Cases", () => {
    it("should return 401 when no token is provided", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/auth/me",
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
        method: "GET",
        url: "/api/auth/me",
        cookies: {
          auth_token: "invalid.token.here",
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
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Generate expired JWT token (expired 60 seconds ago)
      const expiredToken = app.jwt.sign({
        sub: testUser.id,
        exp: Math.floor(Date.now() / 1000) - 60, // Expired 60 seconds ago
      }, {});

      const response = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        cookies: {
          auth_token: expiredToken,
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("should return 401 when user does not exist in database", async () => {
      app = await buildApp();

      // Generate token with non-existent user ID
      const token = app.jwt.sign({
        sub: "00000000-0000-0000-0000-000000000000",
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "User not found",
        },
      });
    });
  });
});

describe("POST /api/auth/logout", () => {
  let app: FastifyInstance;

  // No cleanup needed - unique phone numbers prevent conflicts

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("Success Cases", () => {
    it("should return 200 and clear auth cookie when authenticated", async () => {
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

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toEqual({
        success: true,
        message: "Logged out successfully",
      });

      // Verify cookie is cleared
      const cookies = response.cookies;
      const authCookie = cookies.find((c) => c.name === "auth_token");
      expect(authCookie).toBeDefined();
      expect(authCookie!.value).toBe("");
      expect(authCookie!.path).toBe("/");
    });
  });

  describe("Unauthorized Cases", () => {
    it("should return 401 when no token is provided", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
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
        url: "/api/auth/logout",
        cookies: {
          auth_token: "invalid.token.here",
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
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Generate expired JWT token (expired 60 seconds ago)
      const expiredToken = app.jwt.sign({
        sub: testUser.id,
        exp: Math.floor(Date.now() / 1000) - 60, // Expired 60 seconds ago
      }, {});

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        cookies: {
          auth_token: expiredToken,
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("Integration with GET /me", () => {
    it("should not be able to access GET /me after logout", async () => {
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

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      // First verify we can access /me with the token
      const getMeResponse1 = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        cookies: {
          auth_token: token,
        },
      });

      expect(getMeResponse1.statusCode).toBe(200);

      // Logout
      const logoutResponse = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        cookies: {
          auth_token: token,
        },
      });

      expect(logoutResponse.statusCode).toBe(200);

      // Try to access /me without token (simulating cleared cookie)
      const getMeResponse2 = await app.inject({
        method: "GET",
        url: "/api/auth/me",
      });

      expect(getMeResponse2.statusCode).toBe(401);

      const body = JSON.parse(getMeResponse2.body);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or expired token",
        },
      });
    });
  });
});
