import { describe, it, expect } from "vitest";
import {
  users,
  members,
  invitations,
  pushSubscriptions,
  type User,
  type NewUser,
  type Invitation,
  type NewInvitation,
  type PushSubscription,
  type NewPushSubscription,
} from "@/db/schema/index.js";
import { getTableName, getTableColumns } from "drizzle-orm";

describe("Database Schema", () => {
  describe("Users Table", () => {
    it("should have users table defined", () => {
      expect(users).toBeDefined();
      expect(getTableName(users)).toBe("users");
    });

    it("should have correct columns", () => {
      const columns = getTableColumns(users);

      expect(columns.id).toBeDefined();
      expect(columns.phoneNumber).toBeDefined();
      expect(columns.displayName).toBeDefined();
      expect(columns.profilePhotoUrl).toBeDefined();
      expect(columns.timezone).toBeDefined();
      expect(columns.createdAt).toBeDefined();
      expect(columns.updatedAt).toBeDefined();
    });

    it("should have phone_number as required field", () => {
      const columns = getTableColumns(users);
      expect(columns.phoneNumber.notNull).toBe(true);
    });

    it("should have timezone as nullable without default", () => {
      const columns = getTableColumns(users);
      expect(columns.timezone.notNull).toBe(false);
      expect(columns.timezone.default).toBeUndefined();
    });

    it("should have type exports", () => {
      // Type-level assertions (compile-time checks)
      const selectType: User = {} as User;
      const insertType: NewUser = {} as NewUser;

      expect(selectType).toBeDefined();
      expect(insertType).toBeDefined();
    });
  });

  describe("Members Table - isOrganizer column", () => {
    it("should have isOrganizer column", () => {
      const columns = getTableColumns(members);
      expect(columns.isOrganizer).toBeDefined();
      expect(columns.isOrganizer.dataType).toBe("boolean");
      expect(columns.isOrganizer.notNull).toBe(true);
      expect(columns.isOrganizer.default).toBeDefined();
    });
  });

  describe("Invitations Table", () => {
    it("should have correct table name", () => {
      expect(getTableName(invitations)).toBe("invitations");
    });

    it("should have all required columns", () => {
      const columns = getTableColumns(invitations);
      expect(columns.id).toBeDefined();
      expect(columns.tripId).toBeDefined();
      expect(columns.inviterId).toBeDefined();
      expect(columns.inviteePhone).toBeDefined();
      expect(columns.status).toBeDefined();
      expect(columns.sentAt).toBeDefined();
      expect(columns.respondedAt).toBeDefined();
      expect(columns.createdAt).toBeDefined();
      expect(columns.updatedAt).toBeDefined();
    });

    it("should have correct column types", () => {
      const columns = getTableColumns(invitations);
      expect(columns.id.dataType).toBe("string");
      expect(columns.tripId.dataType).toBe("string");
      expect(columns.inviterId.dataType).toBe("string");
      expect(columns.inviteePhone.dataType).toBe("string");
      expect(columns.status.dataType).toBe("string");
      expect(columns.sentAt.dataType).toBe("date");
      expect(columns.respondedAt.dataType).toBe("date");
    });

    it("should have required constraints", () => {
      const columns = getTableColumns(invitations);
      expect(columns.tripId.notNull).toBe(true);
      expect(columns.inviterId.notNull).toBe(true);
      expect(columns.inviteePhone.notNull).toBe(true);
      expect(columns.status.notNull).toBe(true);
    });

    it("should have type exports", () => {
      const selectType: Invitation = {} as Invitation;
      const insertType: NewInvitation = {} as NewInvitation;

      expect(selectType).toBeDefined();
      expect(insertType).toBeDefined();
    });
  });

  describe("PushSubscriptions Table", () => {
    it("should have correct table name", () => {
      expect(getTableName(pushSubscriptions)).toBe("push_subscriptions");
    });

    it("should have existing VAPID columns", () => {
      const columns = getTableColumns(pushSubscriptions);
      expect(columns.id).toBeDefined();
      expect(columns.userId).toBeDefined();
      expect(columns.endpoint).toBeDefined();
      expect(columns.p256dh).toBeDefined();
      expect(columns.auth).toBeDefined();
      expect(columns.userAgent).toBeDefined();
      expect(columns.createdAt).toBeDefined();
    });

    it("should have required constraints on VAPID columns", () => {
      const columns = getTableColumns(pushSubscriptions);
      expect(columns.endpoint.notNull).toBe(true);
      expect(columns.p256dh.notNull).toBe(true);
      expect(columns.auth.notNull).toBe(true);
    });

    it("should have FCM token column (nullable)", () => {
      const columns = getTableColumns(pushSubscriptions);
      expect(columns.token).toBeDefined();
      expect(columns.token.dataType).toBe("string");
      expect(columns.token.notNull).toBe(false);
      expect(columns.token.default).toBeUndefined();
    });

    it("should have platform column (nullable, enum values)", () => {
      const columns = getTableColumns(pushSubscriptions);
      expect(columns.platform).toBeDefined();
      expect(columns.platform.dataType).toBe("string");
      expect(columns.platform.notNull).toBe(false);
    });

    it("should have provider column (nullable, defaults to 'vapid')", () => {
      const columns = getTableColumns(pushSubscriptions);
      expect(columns.provider).toBeDefined();
      expect(columns.provider.dataType).toBe("string");
      expect(columns.provider.notNull).toBe(true);
      expect(columns.provider.default).toBeDefined();
      // The default value is stored as a SQL expression or string
      expect(columns.provider.default).toBe("vapid");
    });

    it("should have type exports", () => {
      const selectType: PushSubscription = {} as PushSubscription;
      const insertType: NewPushSubscription = {} as NewPushSubscription;

      expect(selectType).toBeDefined();
      expect(insertType).toBeDefined();
    });
  });
});
