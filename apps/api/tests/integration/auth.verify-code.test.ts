import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, trips, members, invitations } from "@/db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";

describe("POST /api/auth/verify-code", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  // In test mode, MockVerificationService is used.
  // sendCode() is a no-op, checkCode() accepts "123456" only.
  // We must call request-code first to make the flow realistic,
  // then verify with the fixed code.

  async function requestCode(phoneNumber: string) {
    await app.inject({
      method: "POST",
      url: "/api/auth/request-code",
      payload: { phoneNumber, smsConsent: true },
    });
  }

  describe("Success Cases", () => {
    it("should return 200 and create new user with requiresProfile: true", async () => {
      app = await buildApp();

      const phoneNumber = generateUniquePhone();

      await requestCode(phoneNumber);

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/verify-code",
        payload: {
          phoneNumber,
          code: "123456",
          smsConsent: true,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("user");
      expect(body).toHaveProperty("requiresProfile", true);

      expect(body.user).toHaveProperty("id");
      expect(body.user).toHaveProperty("phoneNumber", phoneNumber);
      expect(body.user).toHaveProperty("displayName", "");
      expect(body.user).toHaveProperty("timezone", null);
      expect(body.user).toHaveProperty("createdAt");
      expect(body.user).toHaveProperty("updatedAt");
    });

    it("should return 200 for existing user with displayName (requiresProfile: false)", async () => {
      app = await buildApp();

      const phoneNumber = generateUniquePhone();

      // Create existing user with displayName
      await db.insert(users).values({
        phoneNumber,
        displayName: "John Doe",
        timezone: "America/New_York",
      });

      await requestCode(phoneNumber);

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/verify-code",
        payload: {
          phoneNumber,
          code: "123456",
          smsConsent: true,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("requiresProfile", false);
      expect(body.user.displayName).toBe("John Doe");
      expect(body.user.timezone).toBe("America/New_York");
    });

    it("should return 200 for existing user without displayName (requiresProfile: true)", async () => {
      app = await buildApp();

      const phoneNumber = generateUniquePhone();

      // Create existing user without displayName
      await db.insert(users).values({
        phoneNumber,
        displayName: "",
        timezone: "UTC",
      });

      await requestCode(phoneNumber);

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/verify-code",
        payload: {
          phoneNumber,
          code: "123456",
          smsConsent: true,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("requiresProfile", true);
      expect(body.user.displayName).toBe("");
    });

    it("should set auth_token cookie", async () => {
      app = await buildApp();

      const phoneNumber = generateUniquePhone();

      await requestCode(phoneNumber);

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/verify-code",
        payload: {
          phoneNumber,
          code: "123456",
          smsConsent: true,
        },
      });

      expect(response.statusCode).toBe(200);

      const cookies = response.cookies;
      expect(cookies).toHaveLength(1);
      expect(cookies[0]).toHaveProperty("name", "auth_token");
      expect(cookies[0]).toHaveProperty("value");
      expect(cookies[0].value).toBeTruthy();

      expect(cookies[0]).toHaveProperty("httpOnly", true);
      expect(cookies[0]).toHaveProperty("path", "/");
      expect(cookies[0]).toHaveProperty("sameSite", "Lax");
      expect(cookies[0]).toHaveProperty("maxAge", 7 * 24 * 60 * 60);
    });

    it("should return valid JWT token in cookie", async () => {
      app = await buildApp();

      const phoneNumber = generateUniquePhone();

      await requestCode(phoneNumber);

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/verify-code",
        payload: {
          phoneNumber,
          code: "123456",
          smsConsent: true,
        },
      });

      expect(response.statusCode).toBe(200);

      const cookies = response.cookies;
      const authCookie = cookies.find((c) => c.name === "auth_token");
      expect(authCookie).toBeDefined();
      expect(authCookie!.value).toBeTruthy();

      const decoded = app.jwt.verify(authCookie!.value);
      expect(decoded).toHaveProperty("sub");
      expect(decoded).not.toHaveProperty("phone");
    });
  });

  describe("Validation Errors", () => {
    it("should return 400 when phoneNumber is missing", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/verify-code",
        payload: {
          code: "123456",
          smsConsent: true,
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

    it("should return 400 when code is missing", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/verify-code",
        payload: {
          phoneNumber: generateUniquePhone(),
          smsConsent: true,
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

    it("should return 400 for invalid phone format", async () => {
      app = await buildApp();

      const invalidPhoneNumbers = [
        "not-a-phone-number",
        "abcdefghijkl",
        "+99999999999999",
      ];

      for (const phoneNumber of invalidPhoneNumbers) {
        const response = await app.inject({
          method: "POST",
          url: "/api/auth/verify-code",
          payload: {
            phoneNumber,
            code: "123456",
            smsConsent: true,
          },
        });

        expect(response.statusCode).toBe(400);

        const body = JSON.parse(response.body);
        expect(body).toMatchObject({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid phone number format",
          },
        });
      }
    });

    it("should return 400 when code is not 6 digits", async () => {
      app = await buildApp();

      const invalidCodes = ["12345", "1234567", "abcdef", "12345a"];
      const phoneNumber = generateUniquePhone();

      for (const code of invalidCodes) {
        const response = await app.inject({
          method: "POST",
          url: "/api/auth/verify-code",
          payload: {
            phoneNumber,
            code,
            smsConsent: true,
          },
        });

        expect(response.statusCode).toBe(400);

        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("VALIDATION_ERROR");
      }
    });
  });

  describe("Invalid Code Cases", () => {
    it("should return 400 for wrong code", async () => {
      app = await buildApp();

      const phoneNumber = generateUniquePhone();

      await requestCode(phoneNumber);

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/verify-code",
        payload: {
          phoneNumber,
          code: "654321",
          smsConsent: true,
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "INVALID_CODE",
          message: "Invalid or expired verification code",
        },
      });
    });
  });

  describe("Database Verification", () => {
    it("should create new user with empty displayName", async () => {
      app = await buildApp();

      const phoneNumber = generateUniquePhone();

      await requestCode(phoneNumber);

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/verify-code",
        payload: {
          phoneNumber,
          code: "123456",
          smsConsent: true,
        },
      });

      expect(response.statusCode).toBe(200);

      const result = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, phoneNumber))
        .limit(1);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeDefined();
      expect(result[0].phoneNumber).toBe(phoneNumber);
      expect(result[0].displayName).toBe("");
      expect(result[0].timezone).toBeNull();
      expect(result[0].id).toBeTruthy();
      expect(result[0].createdAt).toBeInstanceOf(Date);
      expect(result[0].updatedAt).toBeInstanceOf(Date);
    });

    it("should not duplicate existing users", async () => {
      app = await buildApp();

      const phoneNumber = generateUniquePhone();

      // Create existing user
      const existingUserResult = await db
        .insert(users)
        .values({
          phoneNumber,
          displayName: "Original User",
          timezone: "America/Los_Angeles",
        })
        .returning();

      const existingUser = existingUserResult[0];

      // First verification
      await requestCode(phoneNumber);
      const response1 = await app.inject({
        method: "POST",
        url: "/api/auth/verify-code",
        payload: { phoneNumber, code: "123456", smsConsent: true },
      });

      expect(response1.statusCode).toBe(200);

      // Second verification
      await requestCode(phoneNumber);
      const response2 = await app.inject({
        method: "POST",
        url: "/api/auth/verify-code",
        payload: { phoneNumber, code: "123456", smsConsent: true },
      });

      expect(response2.statusCode).toBe(200);

      // Verify only one user exists with same ID
      const allUsers = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, phoneNumber));

      expect(allUsers).toHaveLength(1);
      expect(allUsers[0].id).toBe(existingUser.id);
      expect(allUsers[0].displayName).toBe("Original User");
      expect(allUsers[0].timezone).toBe("America/Los_Angeles");
    });
  });

  describe("Pending Invitations Processing", () => {
    it("processes pending invitations after verify-code", async () => {
      app = await buildApp();

      const inviteePhone = generateUniquePhone();

      // Create an organizer user and a trip
      const [organizer] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Trip Organizer",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Invitation Trip",
          destination: "Barcelona, Spain",
          preferredTimezone: "Europe/Madrid",
          createdBy: organizer.id,
        })
        .returning();

      // Add organizer as member
      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      // Create a pending invitation for the invitee phone
      await db.insert(invitations).values({
        tripId: trip.id,
        inviterId: organizer.id,
        inviteePhone: inviteePhone,
        status: "pending",
      });

      // Request and verify code
      await requestCode(inviteePhone);

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/verify-code",
        payload: {
          phoneNumber: inviteePhone,
          code: "123456",
          smsConsent: true,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      const userId = body.user.id;

      // Verify that a member record was created for the invitee
      const memberRecords = await db
        .select()
        .from(members)
        .where(and(eq(members.tripId, trip.id), eq(members.userId, userId)));

      expect(memberRecords).toHaveLength(1);
      expect(memberRecords[0].status).toBe("no_response");
      expect(memberRecords[0].isOrganizer).toBe(false);

      // Verify the invitation status was updated to accepted
      const updatedInvitations = await db
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.tripId, trip.id),
            eq(invitations.inviteePhone, inviteePhone),
          ),
        );

      expect(updatedInvitations).toHaveLength(1);
      expect(updatedInvitations[0].status).toBe("accepted");
    });
  });
});
