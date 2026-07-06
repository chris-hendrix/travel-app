import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, pushSubscriptions } from "@/db/schema/index.js";
import { generateUniquePhone } from "../test-utils.js";
import { eq } from "drizzle-orm";

describe("Push Routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  async function createTestUser() {
    const [testUser] = await db
      .insert(users)
      .values({
        phoneNumber: generateUniquePhone(),
        displayName: "Push Test User",
        timezone: "UTC",
      })
      .returning();
    return testUser;
  }

  function authToken(app: FastifyInstance, userId: string, name: string) {
    return app.jwt.sign({ sub: userId, name });
  }

  function uniqueFcmToken() {
    return `fcm-token-${randomUUID()}`;
  }

  function uniqueEndpoint() {
    return `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
  }

  describe("POST /api/push/subscribe", () => {
    it("should subscribe with FCM payload and return 201", async () => {
      app = await buildApp();
      const user = await createTestUser();
      const token = authToken(app, user.id, user.displayName);
      const fcmToken = uniqueFcmToken();

      const response = await app.inject({
        method: "POST",
        url: "/api/push/subscribe",
        cookies: { auth_token: token },
        payload: {
          token: fcmToken,
          provider: "fcm",
          platform: "android",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.body)).toEqual({ success: true });

      // Verify DB record
      const rows = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, user.id));
      expect(rows).toHaveLength(1);
      expect(rows[0].token).toBe(fcmToken);
      expect(rows[0].provider).toBe("fcm");
      expect(rows[0].platform).toBe("android");
      expect(rows[0].endpoint).toBe(`fcm:${fcmToken}`);
    });

    it("should subscribe with VAPID payload and return 201 (regression)", async () => {
      app = await buildApp();
      const user = await createTestUser();
      const token = authToken(app, user.id, user.displayName);
      const endpoint = uniqueEndpoint();

      const response = await app.inject({
        method: "POST",
        url: "/api/push/subscribe",
        cookies: { auth_token: token },
        payload: {
          endpoint,
          keys: {
            p256dh: "BP2zI0hC0Tc0KY4nG5r7W8xX9yZ0aB1cD2eF3gH4iJ5k=",
            auth: "auth-secret-base64==",
          },
          provider: "vapid",
          platform: "web",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.body)).toEqual({ success: true });

      // Verify DB record
      const rows = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, user.id));
      expect(rows).toHaveLength(1);
      expect(rows[0].endpoint).toBe(endpoint);
      expect(rows[0].provider).toBe("vapid");
      expect(rows[0].platform).toBe("web");
    });

    it("should subscribe with VAPID defaults (provider and platform optional for backward compat)", async () => {
      app = await buildApp();
      const user = await createTestUser();
      const token = authToken(app, user.id, user.displayName);
      const endpoint = uniqueEndpoint();

      const response = await app.inject({
        method: "POST",
        url: "/api/push/subscribe",
        cookies: { auth_token: token },
        payload: {
          endpoint,
          keys: {
            p256dh: "BP2zI0hC0Tc0KY4nG5r7W8xX9yZ0aB1cD2eF3gH4iJ5k=",
            auth: "auth-secret-base64==",
          },
        },
      });

      expect(response.statusCode).toBe(201);

      // Verify defaults were applied
      const rows = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint));
      expect(rows).toHaveLength(1);
      expect(rows[0].provider).toBe("vapid");
      expect(rows[0].platform).toBe("web");
    });

    it("should upsert duplicate FCM subscription (200 or 201)", async () => {
      app = await buildApp();
      const user = await createTestUser();
      const token = authToken(app, user.id, user.displayName);
      const fcmToken = uniqueFcmToken();

      const fcmPayload = {
        token: fcmToken,
        provider: "fcm",
        platform: "ios" as const,
      };

      // First subscribe
      const res1 = await app.inject({
        method: "POST",
        url: "/api/push/subscribe",
        cookies: { auth_token: token },
        payload: fcmPayload,
      });
      expect(res1.statusCode).toBe(201);

      // Subscribe again with same token
      const res2 = await app.inject({
        method: "POST",
        url: "/api/push/subscribe",
        cookies: { auth_token: token },
        payload: fcmPayload,
      });
      expect([200, 201]).toContain(res2.statusCode);

      // Should still only have one subscription
      const rows = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, user.id));
      expect(rows).toHaveLength(1);
      expect(rows[0].token).toBe(fcmToken);
    });

    it("should return 400 for invalid payload (missing token and endpoint)", async () => {
      app = await buildApp();
      const user = await createTestUser();
      const token = authToken(app, user.id, user.displayName);

      const response = await app.inject({
        method: "POST",
        url: "/api/push/subscribe",
        cookies: { auth_token: token },
        payload: {
          provider: "fcm",
          platform: "android",
          // Missing token
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 400 for FCM payload with wrong platform", async () => {
      app = await buildApp();
      const user = await createTestUser();
      const token = authToken(app, user.id, user.displayName);

      const response = await app.inject({
        method: "POST",
        url: "/api/push/subscribe",
        cookies: { auth_token: token },
        payload: {
          token: uniqueFcmToken(),
          provider: "fcm",
          platform: "web", // FCM only allows android/ios
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 401 without authentication", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/push/subscribe",
        payload: {
          token: uniqueFcmToken(),
          provider: "fcm",
          platform: "android",
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("DELETE /api/push/subscribe", () => {
    it("should unsubscribe an existing subscription", async () => {
      app = await buildApp();
      const user = await createTestUser();
      const token = authToken(app, user.id, user.displayName);
      const endpoint = uniqueEndpoint();

      // First subscribe
      await app.inject({
        method: "POST",
        url: "/api/push/subscribe",
        cookies: { auth_token: token },
        payload: {
          endpoint,
          keys: {
            p256dh: "BP2zI0hC0Tc0KY4nG5r7W8xX9yZ0aB1cD2eF3gH4iJ5k=",
            auth: "auth-secret-base64==",
          },
        },
      });

      const response = await app.inject({
        method: "DELETE",
        url: "/api/push/subscribe",
        cookies: { auth_token: token },
        payload: { provider: "vapid", endpoint },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ success: true });
    });
  });

  describe("GET /api/push/vapid-public-key", () => {
    it("should return the VAPID public key (no auth required)", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/push/vapid-public-key",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("publicKey");
      expect(typeof body.publicKey).toBe("string");
    });
  });
});
