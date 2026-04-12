import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";

async function createUser(
  overrides?: Partial<{
    displayName: string;
    role: string;
    status: string;
    phoneNumber: string;
  }>,
) {
  const result = await db
    .insert(users)
    .values({
      phoneNumber: overrides?.phoneNumber ?? generateUniquePhone(),
      displayName: overrides?.displayName ?? "Test User",
      role: overrides?.role ?? "user",
      status: overrides?.status ?? "active",
    })
    .returning();
  return result[0];
}

function adminToken(app: FastifyInstance, userId: string) {
  return app.jwt.sign({ sub: userId, name: "Admin" });
}

describe("Admin Routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("GET /api/admin/users", () => {
    it("should return 200 with user list for admin", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });
      await createUser({ displayName: "Regular User" });

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/users",
        cookies: { auth_token: adminToken(app, admin.id) },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.users).toBeDefined();
      expect(body.total).toBeGreaterThanOrEqual(2);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
    });

    it("should return 403 for non-admin", async () => {
      app = await buildApp();
      const regularUser = await createUser({ displayName: "Not Admin" });

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/users",
        cookies: { auth_token: adminToken(app, regularUser.id) },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("should support pagination", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/users?page=1&limit=2",
        cookies: { auth_token: adminToken(app, admin.id) },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.users.length).toBeLessThanOrEqual(2);
      expect(body.limit).toBe(2);
    });

    it("should support search filter", async () => {
      app = await buildApp();
      const admin = await createUser({
        displayName: "SearchAdmin",
        role: "admin",
      });
      await createUser({ displayName: "UniqueSearchTarget123" });

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/users?search=UniqueSearchTarget123",
        cookies: { auth_token: adminToken(app, admin.id) },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.users.length).toBeGreaterThanOrEqual(1);
      expect(
        body.users.some(
          (u: { displayName: string }) =>
            u.displayName === "UniqueSearchTarget123",
        ),
      ).toBe(true);
    });

    it("should support status filter", async () => {
      app = await buildApp();
      const admin = await createUser({
        displayName: "StatusAdmin",
        role: "admin",
      });
      await createUser({ displayName: "Banned User", status: "banned" });

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/users?status=banned",
        cookies: { auth_token: adminToken(app, admin.id) },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(
        body.users.every((u: { status: string }) => u.status === "banned"),
      ).toBe(true);
    });

    it("should support role filter", async () => {
      app = await buildApp();
      const admin = await createUser({
        displayName: "RoleFilterAdmin",
        role: "admin",
      });
      await createUser({ displayName: "Regular User" });

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/users?role=admin",
        cookies: { auth_token: adminToken(app, admin.id) },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.users.length).toBeGreaterThanOrEqual(1);
      expect(
        body.users.every((u: { role: string }) => u.role === "admin"),
      ).toBe(true);
    });

    it("should search by phone number", async () => {
      app = await buildApp();
      const admin = await createUser({
        displayName: "PhoneSearchAdmin",
        role: "admin",
      });
      const targetPhone = "+15559876543";
      await createUser({
        displayName: "Phone Target",
        phoneNumber: targetPhone,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/users?search=9876543",
        cookies: { auth_token: adminToken(app, admin.id) },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(
        body.users.some(
          (u: { phoneNumber: string }) => u.phoneNumber === targetPhone,
        ),
      ).toBe(true);
    });

    it("should search by UUID", async () => {
      app = await buildApp();
      const admin = await createUser({
        displayName: "UUIDSearchAdmin",
        role: "admin",
      });
      const target = await createUser({ displayName: "UUID Target" });

      const response = await app.inject({
        method: "GET",
        url: `/api/admin/users?search=${target.id}`,
        cookies: { auth_token: adminToken(app, admin.id) },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(
        body.users.some((u: { id: string }) => u.id === target.id),
      ).toBe(true);
    });

    it("should sort by newest first", async () => {
      app = await buildApp();
      const admin = await createUser({
        displayName: "SortAdmin",
        role: "admin",
      });
      await createUser({ displayName: "Older User" });
      await createUser({ displayName: "Newer User" });

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/users",
        cookies: { auth_token: adminToken(app, admin.id) },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // Verify descending order — each createdAt should be >= the next
      for (let i = 0; i < body.users.length - 1; i++) {
        expect(
          new Date(body.users[i].createdAt).getTime(),
        ).toBeGreaterThanOrEqual(
          new Date(body.users[i + 1].createdAt).getTime(),
        );
      }
    });
  });

  describe("GET /api/admin/users/:id", () => {
    it("should return 200 with user detail for admin", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });
      const target = await createUser({ displayName: "Target User" });

      const response = await app.inject({
        method: "GET",
        url: `/api/admin/users/${target.id}`,
        cookies: { auth_token: adminToken(app, admin.id) },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.user.id).toBe(target.id);
      expect(body.user.displayName).toBe("Target User");
      expect(body.user.tripCount).toBeDefined();
    });

    it("should return 404 for non-existent user", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/users/00000000-0000-0000-0000-000000000000",
        cookies: { auth_token: adminToken(app, admin.id) },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("PUT /api/admin/users/:id", () => {
    it("should return 200 on update", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });
      const target = await createUser({ displayName: "Old Name" });

      const response = await app.inject({
        method: "PUT",
        url: `/api/admin/users/${target.id}`,
        cookies: { auth_token: adminToken(app, admin.id) },
        payload: { displayName: "Updated Name" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.user.displayName).toBe("Updated Name");
    });
  });

  describe("POST /api/admin/users/:id/ban", () => {
    it("should ban a user and return 200", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });
      const target = await createUser({ displayName: "To Ban" });

      const response = await app.inject({
        method: "POST",
        url: `/api/admin/users/${target.id}/ban`,
        cookies: { auth_token: adminToken(app, admin.id) },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      // Verify user is banned in DB
      const updated = await db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, target.id))
        .limit(1);
      expect(updated[0].status).toBe("banned");
    });

    it("should result in banned user getting 403 on protected endpoints", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });
      const target = await createUser({ displayName: "To Ban" });

      // Ban the user
      await app.inject({
        method: "POST",
        url: `/api/admin/users/${target.id}/ban`,
        cookies: { auth_token: adminToken(app, admin.id) },
      });

      // Try to access a protected endpoint as the banned user
      const bannedToken = app.jwt.sign({
        sub: target.id,
        name: "To Ban",
      });

      const tripResponse = await app.inject({
        method: "GET",
        url: "/api/trips",
        cookies: { auth_token: bannedToken },
      });

      expect(tripResponse.statusCode).toBe(403);
      const body = JSON.parse(tripResponse.body);
      expect(body.error.code).toBe("ACCOUNT_SUSPENDED");
    });
  });

  describe("POST /api/admin/users/:id/unban", () => {
    it("should unban a user and return 200", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });
      const target = await createUser({
        displayName: "Banned",
        status: "banned",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/admin/users/${target.id}/unban`,
        cookies: { auth_token: adminToken(app, admin.id) },
      });

      expect(response.statusCode).toBe(200);

      // Verify user is active in DB
      const updated = await db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, target.id))
        .limit(1);
      expect(updated[0].status).toBe("active");
    });
  });

  describe("POST /api/admin/users/:id/promote", () => {
    it("should promote user to admin", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });
      const target = await createUser({ displayName: "To Promote" });

      const response = await app.inject({
        method: "POST",
        url: `/api/admin/users/${target.id}/promote`,
        cookies: { auth_token: adminToken(app, admin.id) },
      });

      expect(response.statusCode).toBe(200);

      // Verify role changed in DB
      const updated = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, target.id))
        .limit(1);
      expect(updated[0].role).toBe("admin");
    });
  });

  describe("POST /api/admin/users/:id/demote", () => {
    it("should demote admin to user", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });
      const target = await createUser({
        displayName: "Other Admin",
        role: "admin",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/admin/users/${target.id}/demote`,
        cookies: { auth_token: adminToken(app, admin.id) },
      });

      expect(response.statusCode).toBe(200);

      // Verify role changed in DB
      const updated = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, target.id))
        .limit(1);
      expect(updated[0].role).toBe("user");
    });

    it("should return 400 when trying to demote self", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });

      const response = await app.inject({
        method: "POST",
        url: `/api/admin/users/${admin.id}/demote`,
        cookies: { auth_token: adminToken(app, admin.id) },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("Authentication and Authorization", () => {
    it("should return 401 for unauthenticated requests", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/users",
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 403 for non-admin authenticated requests", async () => {
      app = await buildApp();
      const user = await createUser({ displayName: "Regular" });

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/users",
        cookies: { auth_token: adminToken(app, user.id) },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe("POST /api/admin/impersonate/:userId", () => {
    it("should start impersonation with valid re-auth code", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });
      const target = await createUser({ displayName: "Target" });

      const response = await app.inject({
        method: "POST",
        url: `/api/admin/impersonate/${target.id}`,
        cookies: { auth_token: adminToken(app, admin.id) },
        payload: { code: "123456" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe("Impersonation started");

      // Verify cookie was set
      const cookies = response.cookies;
      const authCookie = cookies.find(
        (c: { name: string }) => c.name === "auth_token",
      );
      expect(authCookie).toBeDefined();
    });

    it("should return 401 with wrong verification code", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });
      const target = await createUser({ displayName: "Target" });

      const response = await app.inject({
        method: "POST",
        url: `/api/admin/impersonate/${target.id}`,
        cookies: { auth_token: adminToken(app, admin.id) },
        payload: { code: "000000" },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("INVALID_CODE");
    });

    it("should return 403 when trying to impersonate another admin", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });
      const otherAdmin = await createUser({
        displayName: "Other Admin",
        role: "admin",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/admin/impersonate/${otherAdmin.id}`,
        cookies: { auth_token: adminToken(app, admin.id) },
        payload: { code: "123456" },
      });

      expect(response.statusCode).toBe(403);
    });

    it("should return 404 for non-existent target user", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });

      const response = await app.inject({
        method: "POST",
        url: "/api/admin/impersonate/00000000-0000-0000-0000-000000000000",
        cookies: { auth_token: adminToken(app, admin.id) },
        payload: { code: "123456" },
      });

      expect(response.statusCode).toBe(404);
    });

    it("should allow impersonated requests to use target user identity", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });
      const target = await createUser({ displayName: "Target User" });

      // Start impersonation
      const impersonateResponse = await app.inject({
        method: "POST",
        url: `/api/admin/impersonate/${target.id}`,
        cookies: { auth_token: adminToken(app, admin.id) },
        payload: { code: "123456" },
      });

      const impersonationCookie = impersonateResponse.cookies.find(
        (c: { name: string }) => c.name === "auth_token",
      );

      // Use impersonation token to call /auth/me
      const meResponse = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        cookies: { auth_token: impersonationCookie!.value },
      });

      expect(meResponse.statusCode).toBe(200);
      const meBody = JSON.parse(meResponse.body);
      expect(meBody.user.id).toBe(target.id);
      expect(meBody.user.displayName).toBe("Target User");
      expect(meBody.impersonating).toBe(true);
      expect(meBody.isAdmin).toBe(true);
      expect(meBody.impersonatingUser.id).toBe(target.id);
    });
  });

  describe("POST /api/admin/stop-impersonate", () => {
    it("should stop impersonation and return admin token", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });
      const target = await createUser({ displayName: "Target" });

      // Start impersonation
      const impersonateResponse = await app.inject({
        method: "POST",
        url: `/api/admin/impersonate/${target.id}`,
        cookies: { auth_token: adminToken(app, admin.id) },
        payload: { code: "123456" },
      });

      const impersonationCookie = impersonateResponse.cookies.find(
        (c: { name: string }) => c.name === "auth_token",
      );

      // Stop impersonation
      const stopResponse = await app.inject({
        method: "POST",
        url: "/api/admin/stop-impersonate",
        cookies: { auth_token: impersonationCookie!.value },
      });

      expect(stopResponse.statusCode).toBe(200);
      const body = JSON.parse(stopResponse.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe("Impersonation stopped");

      // Verify the new token is for the admin, not the target
      const adminCookie = stopResponse.cookies.find(
        (c: { name: string }) => c.name === "auth_token",
      );

      const meResponse = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        cookies: { auth_token: adminCookie!.value },
      });

      const meBody = JSON.parse(meResponse.body);
      expect(meBody.user.id).toBe(admin.id);
      expect(meBody.impersonating).toBeUndefined();
    });

    it("should return 400 when not impersonating", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });

      const response = await app.inject({
        method: "POST",
        url: "/api/admin/stop-impersonate",
        cookies: { auth_token: adminToken(app, admin.id) },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("BAD_REQUEST");
    });
  });

  describe("POST /api/admin/revoke-impersonation/:userId", () => {
    it("should revoke impersonation for target user", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });
      const target = await createUser({ displayName: "Target" });

      const response = await app.inject({
        method: "POST",
        url: `/api/admin/revoke-impersonation/${target.id}`,
        cookies: { auth_token: adminToken(app, admin.id) },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe("Impersonation revoked");
    });
  });

  describe("GET /api/auth/me - admin context", () => {
    it("should return isAdmin for admin users", async () => {
      app = await buildApp();
      const admin = await createUser({ displayName: "Admin", role: "admin" });

      const response = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        cookies: { auth_token: adminToken(app, admin.id) },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isAdmin).toBe(true);
      expect(body.impersonating).toBeUndefined();
    });

    it("should not return isAdmin for regular users", async () => {
      app = await buildApp();
      const user = await createUser({ displayName: "Regular" });

      const response = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        cookies: { auth_token: adminToken(app, user.id) },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isAdmin).toBeUndefined();
      expect(body.impersonating).toBeUndefined();
    });
  });
});
