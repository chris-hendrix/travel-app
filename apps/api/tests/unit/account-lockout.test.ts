import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import { db } from "@/config/database.js";
import { authAttempts } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";
import { AuthService } from "@/services/auth.service.js";
import { env } from "@/config/env.js";
import { generateUniquePhone } from "../test-utils.js";

describe("account-lockout", () => {
  let app: FastifyInstance;
  let authService: AuthService;
  const testPhones: string[] = [];

  function newPhone(): string {
    const phone = generateUniquePhone();
    testPhones.push(phone);
    return phone;
  }

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(jwt, {
      secret: env.JWT_SECRET,
      sign: { expiresIn: "7d", algorithm: "HS256" },
    });
    await app.ready();

    authService = new AuthService(db, app);
  });

  afterEach(async () => {
    // Clean up auth attempts for test phones
    for (const phone of testPhones) {
      await db.delete(authAttempts).where(eq(authAttempts.phoneNumber, phone));
    }
    testPhones.length = 0;
    if (app) {
      await app.close();
    }
  });

  describe("checkAccountLocked", () => {
    it("should not throw when no record exists", async () => {
      const phone = newPhone();
      await expect(
        authService.checkAccountLocked(phone),
      ).resolves.toBeUndefined();
    });

    it("should not throw when lockedUntil is in the past", async () => {
      const phone = newPhone();

      // Insert a row with lockedUntil in the past
      await db.insert(authAttempts).values({
        phoneNumber: phone,
        failedCount: 5,
        lastFailedAt: new Date(Date.now() - 30 * 60 * 1000),
        lockedUntil: new Date(Date.now() - 1 * 60 * 1000), // 1 minute ago
      });

      await expect(
        authService.checkAccountLocked(phone),
      ).resolves.toBeUndefined();
    });

    it("should throw AccountLockedError when lockedUntil is in the future", async () => {
      const phone = newPhone();

      // Insert a row with lockedUntil 15 minutes in the future
      await db.insert(authAttempts).values({
        phoneNumber: phone,
        failedCount: 5,
        lastFailedAt: new Date(),
        lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
      });

      await expect(authService.checkAccountLocked(phone)).rejects.toMatchObject(
        {
          statusCode: 429,
          message: expect.stringContaining("Account is locked"),
        },
      );
    });
  });

  describe("recordFailedAttempt", () => {
    it("should create new record on first failure", async () => {
      const phone = newPhone();

      const result = await authService.recordFailedAttempt(phone);

      expect(result.failedCount).toBe(1);
      expect(result.locked).toBe(false);

      // Verify DB state
      const rows = await db
        .select()
        .from(authAttempts)
        .where(eq(authAttempts.phoneNumber, phone))
        .limit(1);

      expect(rows).toHaveLength(1);
      expect(rows[0].failedCount).toBe(1);
      expect(rows[0].lastFailedAt).toBeInstanceOf(Date);
    });

    it("should increment counter on subsequent failures", async () => {
      const phone = newPhone();

      await authService.recordFailedAttempt(phone);
      await authService.recordFailedAttempt(phone);
      const result = await authService.recordFailedAttempt(phone);

      expect(result.failedCount).toBe(3);
      expect(result.locked).toBe(false);

      // Verify DB state
      const rows = await db
        .select()
        .from(authAttempts)
        .where(eq(authAttempts.phoneNumber, phone))
        .limit(1);

      expect(rows).toHaveLength(1);
      expect(rows[0].failedCount).toBe(3);
    });

    it("should set lockedUntil after 5 failures", async () => {
      const phone = newPhone();

      for (let i = 0; i < 5; i++) {
        await authService.recordFailedAttempt(phone);
      }

      const rows = await db
        .select()
        .from(authAttempts)
        .where(eq(authAttempts.phoneNumber, phone))
        .limit(1);

      expect(rows).toHaveLength(1);
      expect(rows[0].failedCount).toBe(5);
      expect(rows[0].lockedUntil).toBeInstanceOf(Date);
      expect(rows[0].lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    });

    it("should return locked: true after 5 failures", async () => {
      const phone = newPhone();

      let result;
      for (let i = 0; i < 5; i++) {
        result = await authService.recordFailedAttempt(phone);
      }

      expect(result).toEqual({ locked: true, failedCount: 5 });
    });
  });

  describe("resetFailedAttempts", () => {
    it("should delete the record", async () => {
      const phone = newPhone();

      // Record some failures
      await authService.recordFailedAttempt(phone);
      await authService.recordFailedAttempt(phone);
      await authService.recordFailedAttempt(phone);

      // Verify row exists
      const beforeRows = await db
        .select()
        .from(authAttempts)
        .where(eq(authAttempts.phoneNumber, phone))
        .limit(1);
      expect(beforeRows).toHaveLength(1);

      // Reset
      await authService.resetFailedAttempts(phone);

      // Verify row is deleted
      const afterRows = await db
        .select()
        .from(authAttempts)
        .where(eq(authAttempts.phoneNumber, phone))
        .limit(1);
      expect(afterRows).toHaveLength(0);
    });

    it("should not throw when no record exists", async () => {
      const phone = newPhone();

      await expect(
        authService.resetFailedAttempts(phone),
      ).resolves.toBeUndefined();
    });
  });
});
