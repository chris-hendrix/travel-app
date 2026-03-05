import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  date,
  boolean,
  pgEnum,
  unique,
  jsonb,
  integer,
} from "drizzle-orm/pg-core";

// Users table
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneNumber: varchar("phone_number", { length: 20 }).notNull().unique(),
    displayName: varchar("display_name", { length: 50 }).notNull(),
    profilePhotoUrl: text("profile_photo_url"),
    handles: jsonb("handles").$type<Record<string, string>>(),
    timezone: varchar("timezone", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("users_phone_number_idx").on(table.phoneNumber),
  ],
);

// Inferred types for users table
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// RSVP status enum
export const rsvpStatusEnum = pgEnum("rsvp_status", [
  "going",
  "not_going",
  "maybe",
  "no_response",
]);

// Event type enum
export const eventTypeEnum = pgEnum("event_type", [
  "travel",
  "meal",
  "activity",
]);

// Member travel type enum
export const memberTravelTypeEnum = pgEnum("member_travel_type", [
  "arrival",
  "departure",
]);

// Invitation status enum
export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "declined",
  "failed",
]);

// Trips table
export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    destination: text("destination").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    preferredTimezone: varchar("preferred_timezone", { length: 100 }).notNull(),
    description: text("description"),
    coverImageUrl: text("cover_image_url"),
    themeId: varchar("theme_id", { length: 50 }),
    themeFont: varchar("theme_font", { length: 30 }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    allowMembersToAddEvents: boolean("allow_members_to_add_events")
      .notNull()
      .default(true),
    showAllMembers: boolean("show_all_members").notNull().default(false),
    cancelled: boolean("cancelled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("trips_created_by_idx").on(table.createdBy),
  ],
);

// Inferred types for trips table
export type Trip = typeof trips.$inferSelect;
export type NewTrip = typeof trips.$inferInsert;

// Members table (trip membership and RSVP status)
export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: rsvpStatusEnum("status").notNull().default("no_response"),
    isOrganizer: boolean("is_organizer").notNull().default(false),
    sharePhone: boolean("share_phone").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("members_trip_id_idx").on(table.tripId),
    index("members_user_id_idx").on(table.userId),
    unique("members_trip_user_unique").on(
      table.tripId,
      table.userId,
    ),
    index("members_trip_id_is_organizer_idx").on(
      table.tripId,
      table.isOrganizer,
    ),
  ],
);

// Inferred types for members table
export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;

// Invitations table
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => users.id),
    inviteePhone: varchar("invitee_phone", { length: 20 }).notNull(),
    status: invitationStatusEnum("status").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("invitations_trip_id_idx").on(table.tripId),
    index("invitations_invitee_phone_idx").on(
      table.inviteePhone,
    ),
    unique("invitations_trip_phone_unique").on(
      table.tripId,
      table.inviteePhone,
    ),
  ],
);

// Inferred types for invitations table
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;

// Events table
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    eventType: eventTypeEnum("event_type").notNull(),
    location: text("location"),
    meetupLocation: text("meetup_location"),
    meetupTime: timestamp("meetup_time", { withTimezone: true }),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    isOptional: boolean("is_optional").notNull().default(false),
    links: text("links").array(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("events_trip_id_idx").on(table.tripId),
    index("events_created_by_idx").on(table.createdBy),
    index("events_start_time_idx").on(table.startTime),
    index("events_deleted_at_idx").on(table.deletedAt),
    index("events_trip_id_deleted_at_idx").on(
      table.tripId,
      table.deletedAt,
    ),
    index("events_trip_id_not_deleted_idx")
      .on(table.tripId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

// Inferred types for events table
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

// Accommodations table
export const accommodations = pgTable(
  "accommodations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 255 }).notNull(),
    address: text("address"),
    description: text("description"),
    checkIn: timestamp("check_in", { withTimezone: true }).notNull(),
    checkOut: timestamp("check_out", { withTimezone: true }).notNull(),
    links: text("links").array(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("accommodations_trip_id_idx").on(table.tripId),
    index("accommodations_created_by_idx").on(table.createdBy),
    index("accommodations_check_in_idx").on(table.checkIn),
    index("accommodations_deleted_at_idx").on(table.deletedAt),
    index("accommodations_trip_id_deleted_at_idx").on(
      table.tripId,
      table.deletedAt,
    ),
    index("accommodations_trip_id_not_deleted_idx")
      .on(table.tripId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

// Inferred types for accommodations table
export type Accommodation = typeof accommodations.$inferSelect;
export type NewAccommodation = typeof accommodations.$inferInsert;

// Member travel table
export const memberTravel = pgTable(
  "member_travel",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    travelType: memberTravelTypeEnum("travel_type").notNull(),
    time: timestamp("time", { withTimezone: true }).notNull(),
    location: text("location"),
    details: text("details"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("member_travel_trip_id_idx").on(table.tripId),
    index("member_travel_member_id_idx").on(table.memberId),
    index("member_travel_time_idx").on(table.time),
    index("member_travel_deleted_at_idx").on(table.deletedAt),
    index("member_travel_member_id_deleted_at_idx").on(
      table.memberId,
      table.deletedAt,
    ),
    index("member_travel_trip_id_deleted_at_idx").on(
      table.tripId,
      table.deletedAt,
    ),
    index("member_travel_trip_id_not_deleted_idx")
      .on(table.tripId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

// Inferred types for member_travel table
export type MemberTravel = typeof memberTravel.$inferSelect;
export type NewMemberTravel = typeof memberTravel.$inferInsert;

// Messages table
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => messages.id, {
      onDelete: "cascade",
    }),
    content: text("content").notNull(),
    isPinned: boolean("is_pinned").notNull().default(false),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("messages_trip_id_created_at_idx").on(
      table.tripId,
      table.createdAt,
    ),
    index("messages_parent_id_idx").on(table.parentId),
    index("messages_author_id_idx").on(table.authorId),
    index("messages_trip_toplevel_idx")
      .on(table.tripId, table.createdAt)
      .where(sql`${table.parentId} IS NULL AND ${table.deletedAt} IS NULL`),
    index("messages_trip_id_not_deleted_idx")
      .on(table.tripId)
      .where(sql`${table.deletedAt} IS NULL AND ${table.parentId} IS NULL`),
  ],
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

// Message reactions table
export const messageReactions = pgTable(
  "message_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: varchar("emoji", { length: 20 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("message_reactions_message_id_idx").on(table.messageId),
    index("message_reactions_user_id_idx").on(table.userId),
    unique(
      "message_reactions_message_user_emoji_unique",
    ).on(table.messageId, table.userId, table.emoji),
  ],
);

export type MessageReaction = typeof messageReactions.$inferSelect;
export type NewMessageReaction = typeof messageReactions.$inferInsert;

// Notifications table
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id").references(() => trips.id, {
      onDelete: "cascade",
    }),
    type: varchar("type", { length: 50 }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    data: jsonb("data"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notifications_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    index(
      "notifications_user_id_created_at_desc_idx",
    ).on(table.userId, table.createdAt.desc()),
    index("notifications_user_unread_idx")
      .on(table.userId, table.createdAt)
      .where(sql`${table.readAt} IS NULL`),
    index("notifications_trip_user_created_at_idx").on(
      table.tripId,
      table.userId,
      table.createdAt,
    ),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

// Notification preferences table
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    dailyItinerary: boolean("daily_itinerary").notNull().default(true),
    tripMessages: boolean("trip_messages").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("notification_preferences_user_trip_unique").on(
      table.userId,
      table.tripId,
    ),
  ],
);

export type NotificationPreference =
  typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference =
  typeof notificationPreferences.$inferInsert;

// Muted members table
export const mutedMembers = pgTable(
  "muted_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mutedBy: uuid("muted_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("muted_members_trip_user_unique").on(
      table.tripId,
      table.userId,
    ),
  ],
);

export type MutedMember = typeof mutedMembers.$inferSelect;
export type NewMutedMember = typeof mutedMembers.$inferInsert;

// Sent reminders table
export const sentReminders = pgTable(
  "sent_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: varchar("type", { length: 50 }).notNull(),
    referenceId: text("reference_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("sent_reminders_type_ref_user_unique").on(
      table.type,
      table.referenceId,
      table.userId,
    ),
    index("sent_reminders_type_ref_idx").on(
      table.type,
      table.referenceId,
    ),
  ],
);

export type SentReminder = typeof sentReminders.$inferSelect;
export type NewSentReminder = typeof sentReminders.$inferInsert;

// Token Blacklist
export const blacklistedTokens = pgTable(
  "blacklisted_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jti: text("jti").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("blacklisted_tokens_expires_at_idx").on(
      table.expiresAt,
    ),
  ],
);

export type BlacklistedToken = typeof blacklistedTokens.$inferSelect;
export type NewBlacklistedToken = typeof blacklistedTokens.$inferInsert;

// Auth Attempts (Account Lockout)
export const authAttempts = pgTable("auth_attempts", {
  phoneNumber: text("phone_number").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  lastFailedAt: timestamp("last_failed_at", { withTimezone: true }),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});

export type AuthAttempt = typeof authAttempts.$inferSelect;
export type NewAuthAttempt = typeof authAttempts.$inferInsert;

// Rate Limit Entries
export const rateLimitEntries = pgTable(
  "rate_limit_entries",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("rate_limit_entries_expires_at_idx").on(
      table.expiresAt,
    ),
  ],
);

export type RateLimitEntry = typeof rateLimitEntries.$inferSelect;
export type NewRateLimitEntry = typeof rateLimitEntries.$inferInsert;
