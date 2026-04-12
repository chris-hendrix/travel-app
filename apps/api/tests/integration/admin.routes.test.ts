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
});
