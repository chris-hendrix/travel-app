import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import { db } from "@/config/database.js";
import { users, blacklistedTokens } from "@/db/schema/index.js";
import { eq, sql } from "drizzle-orm";
import { AuthService } from "@/services/auth.service.js";
import { env } from "@/config/env.js";
import { generateUniquePhone } from "../test-utils.js";

describe("token-blacklist", () => {
  let app: FastifyInstance;
  let authService: AuthService;
  const testPhoneNumber = generateUniquePhone();
  let testUserId: string;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(jwt, {
      secret: env.JWT_SECRET,
      sign: { expiresIn: "7d", algorithm: "HS256" },
    });
    await app.ready();

    authService = new AuthService(db, app);

    // Create a test user
    const baseService = new AuthService(db);
    const user = await baseService.getOrCreateUser(testPhoneNumber);
    testUserId = user.id;
  });

  afterEach(async () => {
    // Clean up blacklisted tokens for this user
    await db
      .delete(blacklistedTokens)
      .where(eq(blacklistedTokens.userId, testUserId));
    // Clean up test user
    await db.delete(users).where(eq(users.phoneNumber, testPhoneNumber));
    if (app) {
      await app.close();
    }
  });

  describe("generateToken includes jti", () => {
    it("should include a valid UUID jti claim in generated tokens", async () => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, testUserId))
        .limit(1);

      const token = authService.generateToken(user);
      const decoded = app.jwt.verify(token);

      expect(decoded.jti).toBeDefined();
      expect(typeof decoded.jti).toBe("string");
      // Validate UUID v4 format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(decoded.jti).toMatch(uuidRegex);
    });

    it("should generate unique jti for each token", async () => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, testUserId))
        .limit(1);

      const token1 = authService.generateToken(user);
      const token2 = authService.generateToken(user);

      const decoded1 = app.jwt.verify(token1);
      const decoded2 = app.jwt.verify(token2);

      expect(decoded1.jti).not.toBe(decoded2.jti);
    });
  });

  describe("blacklistToken", () => {
    it("should insert a record into blacklisted_tokens table", async () => {
      const jti = "test-jti-" + Date.now();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await authService.blacklistToken(jti, testUserId, expiresAt);

      const result = await db
        .select()
        .from(blacklistedTokens)
        .where(eq(blacklistedTokens.jti, jti))
        .limit(1);

      expect(result).toHaveLength(1);
      expect(result[0].jti).toBe(jti);
      expect(result[0].userId).toBe(testUserId);
      expect(result[0].expiresAt).toBeInstanceOf(Date);
    });
  });

  describe("isBlacklisted", () => {
    it("should return true for a blacklisted token", async () => {
      const jti = "blacklisted-jti-" + Date.now();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await authService.blacklistToken(jti, testUserId, expiresAt);

      const result = await authService.isBlacklisted(jti);
      expect(result).toBe(true);
    });

    it("should return false for a non-blacklisted token", async () => {
      const result = await authService.isBlacklisted(
        "non-existent-jti-" + Date.now(),
      );
      expect(result).toBe(false);
    });
  });

  describe("expired cleanup", () => {
    it("should remove expired blacklisted tokens when cleanup runs", async () => {
      // Insert an expired entry (expired 1 hour ago)
      const expiredJti = "expired-jti-" + Date.now();
      const expiredAt = new Date(Date.now() - 60 * 60 * 1000);

      await authService.blacklistToken(expiredJti, testUserId, expiredAt);

      // Verify it was inserted
      const beforeCleanup = await authService.isBlacklisted(expiredJti);
      expect(beforeCleanup).toBe(true);

      // Run cleanup SQL (same as the cron job)
      await db.execute(sql`
        DELETE FROM blacklisted_tokens WHERE expires_at < now()
      `);

      // Expired entry should be removed
      const afterCleanup = await authService.isBlacklisted(expiredJti);
      expect(afterCleanup).toBe(false);
    });

    it("should not remove non-expired blacklisted tokens during cleanup", async () => {
      // Insert a non-expired entry (expires in 7 days)
      const validJti = "valid-jti-" + Date.now();
      const validExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await authService.blacklistToken(validJti, testUserId, validExpiresAt);

      // Run cleanup SQL (same as the cron job)
      await db.execute(sql`
        DELETE FROM blacklisted_tokens WHERE expires_at < now()
      `);

      // Valid entry should still exist
      const result = await authService.isBlacklisted(validJti);
      expect(result).toBe(true);
    });
  });
});
