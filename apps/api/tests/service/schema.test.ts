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
import { getTableName, getTableColumns, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/config/database.js";

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

  // Deletion does not blank a phone number, it moves it to a
  // `deleted:<uuid>` tombstone so the real number can sign up again. The row
  // stays, and so do the rows that copy that number into a phone column —
  // an invitation's `invitee_phone` and a guest's `guest_phone` are written
  // verbatim from `users.phone_number`. A column that is narrower than the
  // value it receives is not a validation error the caller can handle: the
  // insert raises Postgres 22001 mid-transaction, the transaction aborts and
  // the whole batch of invitations goes with it. This is the assertion that
  // catches a future narrowing in review rather than in production.
  describe("Phone columns that can receive a deletion tombstone", () => {
    const tombstone = `deleted:${randomUUID()}`;

    /** What the code assumes: the declared schemas agree on the width. */
    it("declares the copied phone columns at the width of users.phone_number", () => {
      expect(tombstone).toHaveLength(44);

      const userColumns = getTableColumns(users);
      const invitationColumns = getTableColumns(invitations);
      const memberColumns = getTableColumns(members);

      expect(userColumns.phoneNumber.length).toBe(64);
      expect(invitationColumns.inviteePhone.length).toBe(64);
      expect(memberColumns.guestPhone.length).toBe(64);
    });

    /** What the database actually has: the migration applied, and applies
     * from empty as well, because the schema declares it. */
    it("has those widths in the database, and room for a tombstone", async () => {
      const result = await db.execute<{
        table_name: string;
        column_name: string;
        character_maximum_length: number | null;
      }>(sql`
        SELECT table_name, column_name, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND ((table_name = 'users' AND column_name = 'phone_number')
            OR (table_name = 'invitations' AND column_name = 'invitee_phone')
            OR (table_name = 'members' AND column_name = 'guest_phone'))
      `);

      const widths = new Map(
        result.rows.map((row) => [
          `${row.table_name}.${row.column_name}`,
          row.character_maximum_length,
        ]),
      );

      // A missing row is a failure, not a skip: the column has to exist.
      expect(widths.size).toBe(3);
      for (const column of [
        "users.phone_number",
        "invitations.invitee_phone",
        "members.guest_phone",
      ]) {
        expect(widths.get(column)).toBe(64);
        // The value deletion can copy is 44 characters; the column must hold
        // it with room to spare rather than merely fit it today.
        expect(widths.get(column)! >= tombstone.length).toBe(true);
      }
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
