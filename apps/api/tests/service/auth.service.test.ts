import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import { db } from "@/config/database.js";
import { users } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";
import { AuthService } from "@/services/auth.service.js";
import { env } from "@/config/env.js";
import { generateUniquePhone } from "../test-utils.js";

// Create service instance with db for testing
const authService = new AuthService(db);

describe("auth.service", () => {
  // Use unique phone numbers per test run to enable parallel execution
  const testPhoneNumber = generateUniquePhone();
  const testPhoneNumber2 = generateUniquePhone();

  // Clean up only this test file's data (safe for parallel execution)
  const cleanup = async () => {
    await db.delete(users).where(eq(users.phoneNumber, testPhoneNumber));
    await db.delete(users).where(eq(users.phoneNumber, testPhoneNumber2));
  };

  beforeEach(cleanup);
  afterEach(cleanup);

  describe("getOrCreateUser", () => {
    it("should create a new user when one does not exist", async () => {
      const user = await authService.getOrCreateUser(testPhoneNumber);

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.phoneNumber).toBe(testPhoneNumber);
      expect(user.displayName).toBe("");
      expect(user.timezone).toBeNull();
      expect(user.profilePhotoUrl).toBeNull();
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it("should return existing user when one already exists", async () => {
      const user1 = await authService.getOrCreateUser(testPhoneNumber);
      const user2 = await authService.getOrCreateUser(testPhoneNumber);

      expect(user2.id).toBe(user1.id);
      expect(user2.phoneNumber).toBe(testPhoneNumber);
      expect(user2.createdAt.getTime()).toBe(user1.createdAt.getTime());
    });

    it("should not create duplicate users for same phone number", async () => {
      await authService.getOrCreateUser(testPhoneNumber);
      await authService.getOrCreateUser(testPhoneNumber);

      const allUsers = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, testPhoneNumber));

      expect(allUsers).toHaveLength(1);
    });

    it("should create different users for different phone numbers", async () => {
      const user1 = await authService.getOrCreateUser(testPhoneNumber);
      const user2 = await authService.getOrCreateUser(testPhoneNumber2);

      expect(user1.id).not.toBe(user2.id);
      expect(user1.phoneNumber).toBe(testPhoneNumber);
      expect(user2.phoneNumber).toBe(testPhoneNumber2);
    });
  });

  describe("updateProfile", () => {
    it("should update display name", async () => {
      const user = await authService.getOrCreateUser(testPhoneNumber);
      const newDisplayName = "John Doe";

      const updatedUser = await authService.updateProfile(user.id, {
        displayName: newDisplayName,
      });

      expect(updatedUser.id).toBe(user.id);
      expect(updatedUser.displayName).toBe(newDisplayName);
      expect(updatedUser.timezone).toBeNull();
    });

    it("should update timezone", async () => {
      const user = await authService.getOrCreateUser(testPhoneNumber);
      const newTimezone = "America/New_York";

      const updatedUser = await authService.updateProfile(user.id, {
        timezone: newTimezone,
      });

      expect(updatedUser.id).toBe(user.id);
      expect(updatedUser.timezone).toBe(newTimezone);
      expect(updatedUser.displayName).toBe("");
    });

    it("should update both display name and timezone", async () => {
      const user = await authService.getOrCreateUser(testPhoneNumber);
      const newDisplayName = "Jane Smith";
      const newTimezone = "Europe/London";

      const updatedUser = await authService.updateProfile(user.id, {
        displayName: newDisplayName,
        timezone: newTimezone,
      });

      expect(updatedUser.id).toBe(user.id);
      expect(updatedUser.displayName).toBe(newDisplayName);
      expect(updatedUser.timezone).toBe(newTimezone);
    });

    it("should update the updatedAt timestamp", async () => {
      const user = await authService.getOrCreateUser(testPhoneNumber);
      const originalUpdatedAt = user.updatedAt.getTime();

      await new Promise((resolve) => setTimeout(resolve, 10));

      const updatedUser = await authService.updateProfile(user.id, {
        displayName: "Updated Name",
      });

      expect(updatedUser.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt,
      );
    });

    it("should not affect other user fields", async () => {
      const user = await authService.getOrCreateUser(testPhoneNumber);

      const updatedUser = await authService.updateProfile(user.id, {
        displayName: "New Name",
      });

      expect(updatedUser.phoneNumber).toBe(user.phoneNumber);
      expect(updatedUser.profilePhotoUrl).toBe(user.profilePhotoUrl);
      expect(updatedUser.createdAt.getTime()).toBe(user.createdAt.getTime());
    });
  });

  describe("generateToken", () => {
    let app: FastifyInstance;
    let testAuthService: AuthService;
    const testUserId = "123e4567-e89b-12d3-a456-426614174000";

    afterEach(async () => {
      if (app) {
        await app.close();
      }
    });

    it("should generate a valid JWT token for user with complete profile", async () => {
      app = Fastify({ logger: false });
      await app.register(jwt, {
        secret: env.JWT_SECRET,
        sign: { expiresIn: "7d", algorithm: "HS256" },
      });
      await app.ready();

      testAuthService = new AuthService(db, app);

      const user = await authService.getOrCreateUser(testPhoneNumber);
      await authService.updateProfile(user.id, {
        displayName: "Test User",
        timezone: "America/New_York",
      });
      const updatedUser = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      const token = testAuthService.generateToken(updatedUser[0]);

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);
    });

    it("should generate a valid JWT token for user with incomplete profile", async () => {
      app = Fastify({ logger: false });
      await app.register(jwt, {
        secret: env.JWT_SECRET,
        sign: { expiresIn: "7d", algorithm: "HS256" },
      });
      await app.ready();

      testAuthService = new AuthService(db, app);

      const user = await authService.getOrCreateUser(testPhoneNumber);

      const token = testAuthService.generateToken(user);

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);
    });

    it("should include correct payload in generated token", async () => {
      app = Fastify({ logger: false });
      await app.register(jwt, {
        secret: env.JWT_SECRET,
        sign: { expiresIn: "7d", algorithm: "HS256" },
      });
      await app.ready();

      testAuthService = new AuthService(db, app);

      const user = await authService.getOrCreateUser(testPhoneNumber);
      await authService.updateProfile(user.id, { displayName: "John Doe" });
      const updatedUser = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      const token = testAuthService.generateToken(updatedUser[0]);
      const decoded = app.jwt.verify(token);

      expect(decoded.sub).toBe(updatedUser[0].id);
      expect(decoded).not.toHaveProperty("phone");
      expect(decoded.name).toBe("John Doe");
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    it("should set token expiry to 7 days from now", async () => {
      app = Fastify({ logger: false });
      await app.register(jwt, {
        secret: env.JWT_SECRET,
        sign: { expiresIn: "7d", algorithm: "HS256" },
      });
      await app.ready();

      testAuthService = new AuthService(db, app);

      const user = await authService.getOrCreateUser(testPhoneNumber);
      const beforeGenerate = Math.floor(Date.now() / 1000);

      const token = testAuthService.generateToken(user);
      const decoded = app.jwt.verify(token);

      const afterGenerate = Math.floor(Date.now() / 1000);
      const expectedExpiry = beforeGenerate + 7 * 24 * 60 * 60;
      const expectedExpiryMax = afterGenerate + 7 * 24 * 60 * 60;

      expect(decoded.exp).toBeGreaterThanOrEqual(expectedExpiry);
      expect(decoded.exp).toBeLessThanOrEqual(expectedExpiryMax);
    });

    it("should throw error when FastifyInstance not available", () => {
      const serviceWithoutFastify = new AuthService(db);
      const mockUser = {
        id: testUserId,
        phoneNumber: testPhoneNumber,
        displayName: "Test User",
        profilePhotoUrl: null,
        timezone: null,
        handles: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => serviceWithoutFastify.generateToken(mockUser)).toThrow(
        "FastifyInstance not available",
      );
    });

    it("should omit name field when displayName is empty", async () => {
      app = Fastify({ logger: false });
      await app.register(jwt, {
        secret: env.JWT_SECRET,
        sign: { expiresIn: "7d", algorithm: "HS256" },
      });
      await app.ready();

      testAuthService = new AuthService(db, app);

      const user = await authService.getOrCreateUser(testPhoneNumber);

      const token = testAuthService.generateToken(user);
      const decoded = app.jwt.verify(token);

      expect(decoded.name).toBeUndefined();
      expect(decoded.sub).toBeDefined();
      expect(decoded).not.toHaveProperty("phone");
    });
  });

  describe("verifyToken", () => {
    let app: FastifyInstance;
    let testAuthService: AuthService;

    afterEach(async () => {
      if (app) {
        await app.close();
      }
    });

    it("should verify a valid token and return payload", async () => {
      app = Fastify({ logger: false });
      await app.register(jwt, {
        secret: env.JWT_SECRET,
        sign: { expiresIn: "7d", algorithm: "HS256" },
      });
      await app.ready();

      testAuthService = new AuthService(db, app);

      const user = await authService.getOrCreateUser(testPhoneNumber);
      await authService.updateProfile(user.id, { displayName: "Test User" });
      const updatedUser = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      const token = testAuthService.generateToken(updatedUser[0]);
      const payload = testAuthService.verifyToken(token);

      expect(payload).toBeDefined();
      expect(payload.sub).toBe(updatedUser[0].id);
      expect(payload).not.toHaveProperty("phone");
      expect(payload.name).toBe("Test User");
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });

    it("should throw error for expired token", async () => {
      app = Fastify({ logger: false });
      await app.register(jwt, {
        secret: env.JWT_SECRET,
        sign: { expiresIn: "1ms", algorithm: "HS256" },
        verify: { algorithms: ["HS256"] },
      });
      await app.ready();

      testAuthService = new AuthService(db, app);

      const user = await authService.getOrCreateUser(testPhoneNumber);
      const token = testAuthService.generateToken(user);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(() => testAuthService.verifyToken(token)).toThrow(
        "Token verification failed",
      );
    });

    it("should throw error for invalid token format", async () => {
      app = Fastify({ logger: false });
      await app.register(jwt, {
        secret: env.JWT_SECRET,
        sign: { expiresIn: "7d", algorithm: "HS256" },
      });
      await app.ready();

      testAuthService = new AuthService(db, app);

      expect(() =>
        testAuthService.verifyToken("this.is.not.a.valid.jwt"),
      ).toThrow("Token verification failed");
    });

    it("should throw error for token with wrong signature", async () => {
      app = Fastify({ logger: false });
      await app.register(jwt, {
        secret: env.JWT_SECRET,
        sign: { expiresIn: "7d", algorithm: "HS256" },
      });
      await app.ready();

      testAuthService = new AuthService(db, app);

      const differentSecretApp = Fastify({ logger: false });
      await differentSecretApp.register(jwt, {
        secret: "different-secret-key-for-testing-purposes-only",
        sign: { expiresIn: "7d", algorithm: "HS256" },
      });
      await differentSecretApp.ready();

      const user = await authService.getOrCreateUser(testPhoneNumber);
      const tokenWithWrongSignature = differentSecretApp.jwt.sign({
        sub: user.id,
        name: user.displayName,
      });

      await differentSecretApp.close();

      expect(() =>
        testAuthService.verifyToken(tokenWithWrongSignature),
      ).toThrow("Token verification failed");
    });

    it("should throw error for malformed token", async () => {
      app = Fastify({ logger: false });
      await app.register(jwt, {
        secret: env.JWT_SECRET,
        sign: { expiresIn: "7d", algorithm: "HS256" },
      });
      await app.ready();

      testAuthService = new AuthService(db, app);

      expect(() => testAuthService.verifyToken("not-a-token")).toThrow(
        "Token verification failed",
      );
    });

    it("should throw error when FastifyInstance not available", () => {
      const serviceWithoutFastify = new AuthService(db);

      expect(() => serviceWithoutFastify.verifyToken("any-token")).toThrow(
        "FastifyInstance not available",
      );
    });

    it("should handle token without name field (optional field)", async () => {
      app = Fastify({ logger: false });
      await app.register(jwt, {
        secret: env.JWT_SECRET,
        sign: { expiresIn: "7d", algorithm: "HS256" },
      });
      await app.ready();

      testAuthService = new AuthService(db, app);

      const user = await authService.getOrCreateUser(testPhoneNumber);

      const token = testAuthService.generateToken(user);
      const payload = testAuthService.verifyToken(token);

      expect(payload.sub).toBe(user.id);
      expect(payload).not.toHaveProperty("phone");
      expect(payload.name).toBeUndefined();
    });
  });

  describe("integration: token round-trip", () => {
    let app: FastifyInstance;
    let testAuthService: AuthService;

    afterEach(async () => {
      if (app) {
        await app.close();
      }
    });

    it("should successfully generate and verify a token round-trip", async () => {
      app = Fastify({ logger: false });
      await app.register(jwt, {
        secret: env.JWT_SECRET,
        sign: { expiresIn: "7d", algorithm: "HS256" },
        verify: { algorithms: ["HS256"] },
      });
      await app.ready();

      testAuthService = new AuthService(db, app);

      const user = await authService.getOrCreateUser(testPhoneNumber);
      await authService.updateProfile(user.id, {
        displayName: "Integration Test User",
        timezone: "Europe/London",
      });
      const updatedUser = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      const token = testAuthService.generateToken(updatedUser[0]);
      expect(token).toBeDefined();

      const payload = testAuthService.verifyToken(token);

      expect(payload.sub).toBe(updatedUser[0].id);
      expect(payload).not.toHaveProperty("phone");
      expect(payload.name).toBe("Integration Test User");
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();

      const sevenDays = 7 * 24 * 60 * 60;
      expect(payload.exp - payload.iat).toBeCloseTo(sevenDays, -2);
    });
  });
});
