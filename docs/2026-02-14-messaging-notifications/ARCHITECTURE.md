---
date: 2026-02-14
topic: Journiful - Messaging & Notifications Architecture
status: planned
last_updated: 2026-02-14
---

# Messaging & Notifications - Technical Architecture

> **Status**: All phases planned | Last Updated: 2026-02-14

## Table of Contents

- [System Overview](#system-overview)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Backend Services](#backend-services)
- [Frontend Architecture](#frontend-architecture)
- [Shared Package](#shared-package)
- [Scheduler System](#scheduler-system)
- [SMS Service](#sms-service)
- [Data Flow](#data-flow)
- [Security & Permissions](#security--permissions)
- [Performance Considerations](#performance-considerations)
- [Testing Strategy](#testing-strategy)

---

## System Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                      │
│                                                                │
│  ┌─────────────┐  ┌───────────────┐  ┌───────────────────┐  │
│  │ Discussion   │  │ Notification  │  │ Notification      │  │
│  │ Feed         │  │ Bell (Global) │  │ Dialog (Per-Trip) │  │
│  │ (5s poll)    │  │ (30s poll)    │  │                   │  │
│  └──────┬───────┘  └───────┬───────┘  └────────┬──────────┘  │
│         │                  │                    │              │
│         ▼                  ▼                    ▼              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │           TanStack Query (Cache + Polling)              │ │
│  └──────────────────────────┬──────────────────────────────┘ │
└─────────────────────────────┼────────────────────────────────┘
                              │ HTTP (REST)
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                       Backend (Fastify)                        │
│                                                                │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ Message      │  │ Notification     │  │ Scheduler     │  │
│  │ Routes       │  │ Routes           │  │ Service       │  │
│  └──────┬───────┘  └────────┬─────────┘  └───────┬───────┘  │
│         │                   │                     │           │
│         ▼                   ▼                     ▼           │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ Message      │  │ Notification     │  │ SMS           │  │
│  │ Service      │──│ Service          │──│ Service       │  │
│  └──────┬───────┘  └────────┬─────────┘  └───────────────┘  │
│         │                   │                                 │
│         ▼                   ▼                                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Drizzle ORM → PostgreSQL                    │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

Key architectural decisions:

- **Polling over WebSocket**: TanStack Query handles message polling (5s) and notification badge polling (30s). Simpler infrastructure, fits existing patterns, adequate for trip messaging cadence.
- **Shared notification pipeline**: Both messaging and scheduler use `NotificationService.notifyTripMembers()` for consistent delivery across in-app and SMS channels.
- **Abstracted SMS**: `SmsProvider` interface allows swapping mock for Twilio without changing business logic.
- **Cron-based scheduler**: Node.js `setInterval` for event reminders (5 min) and daily itineraries (15 min). Simple, sufficient for current scale.

---

## Database Schema

### New Tables

#### `messages`

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_trip_created ON messages(trip_id, created_at DESC);
CREATE INDEX idx_messages_parent_id ON messages(parent_id);
CREATE INDEX idx_messages_trip_toplevel ON messages(trip_id, created_at DESC)
  WHERE parent_id IS NULL AND deleted_at IS NULL;
```

**Notes**:

- `parent_id` NULL = top-level message, set = reply to that message
- Replies always point to a top-level message (no nested replies)
- Soft delete via `deleted_at` + `deleted_by` (follows existing codebase pattern)
- Partial index on top-level non-deleted messages for efficient feed queries

#### `message_reactions`

```sql
CREATE TABLE message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX idx_reactions_message_id ON message_reactions(message_id);
```

**Notes**:

- `emoji` stores string key: `heart`, `thumbs_up`, `laugh`, `surprised`, `party`, `plane`
- Unique constraint prevents duplicate reactions (same user, same emoji, same message)
- CASCADE delete: reactions removed when message is deleted

#### `notifications`

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_trip_user ON notifications(trip_id, user_id, created_at DESC);
```

**Notes**:

- `type` enum values: `event_reminder`, `daily_itinerary`, `trip_message`, `trip_update`
- `data` JSONB stores deep-link metadata: `{ eventId, messageId, tripId }`
- Partial index on unread notifications for fast badge count queries
- Trip-specific index for per-trip notification listing

#### `notification_preferences`

```sql
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  event_reminders BOOLEAN NOT NULL DEFAULT true,
  daily_itinerary BOOLEAN NOT NULL DEFAULT true,
  trip_messages BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, trip_id)
);
```

**Notes**:

- Created when member first RSVPs "Going" (all defaults: true)
- Three independent toggles per trip per member
- ON UPDATE triggers set `updated_at`

#### `muted_members`

```sql
CREATE TABLE muted_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(trip_id, user_id)
);
```

**Notes**:

- Tracks which organizer muted which member
- Unique constraint prevents double-muting
- CASCADE delete: mute records removed when trip is deleted

#### `sent_reminders`

```sql
CREATE TABLE sent_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL,
  reference_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(type, reference_id, user_id)
);

CREATE INDEX idx_sent_reminders_lookup ON sent_reminders(type, reference_id);
```

**Notes**:

- Deduplication table for scheduler
- `type`: `event_reminder` or `daily_itinerary`
- `reference_id`: event UUID for reminders, `{tripId}:{YYYY-MM-DD}` for daily digests
- Unique constraint prevents sending the same reminder twice

### Drizzle Schema Additions

New tables added to `apps/api/src/db/schema/index.ts`:

```typescript
// Enums
export const notificationTypeEnum = pgEnum("notification_type", [
  "event_reminder",
  "daily_itinerary",
  "trip_message",
  "trip_update",
]);

export const reminderTypeEnum = pgEnum("reminder_type", [
  "event_reminder",
  "daily_itinerary",
]);

// Tables
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references(() => messages.id, {
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
});

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
  (table) => ({
    uniqueReaction: unique().on(table.messageId, table.userId, table.emoji),
  }),
);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tripId: uuid("trip_id").references(() => trips.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  data: jsonb("data"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
    eventReminders: boolean("event_reminders").notNull().default(true),
    dailyItinerary: boolean("daily_itinerary").notNull().default(true),
    tripMessages: boolean("trip_messages").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uniquePref: unique().on(table.userId, table.tripId),
  }),
);

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
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uniqueMute: unique().on(table.tripId, table.userId),
  }),
);

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
  (table) => ({
    uniqueReminder: unique().on(table.type, table.referenceId, table.userId),
  }),
);
```

### Relations

Added to `apps/api/src/db/schema/relations.ts`:

```typescript
// Trip relations (extend existing)
trips.messages → messages (many)
trips.notifications → notifications (many)
trips.notificationPreferences → notificationPreferences (many)
trips.mutedMembers → mutedMembers (many)

// User relations (extend existing)
users.messages → messages (many)
users.messageReactions → messageReactions (many)
users.notifications → notifications (many)
users.notificationPreferences → notificationPreferences (many)

// Message relations
messages.trip → trips (one)
messages.author → users (one)
messages.parent → messages (one, nullable)
messages.replies → messages (many, where parentId = id)
messages.reactions → messageReactions (many)

// Notification relations
notifications.user → users (one)
notifications.trip → trips (one, nullable)
```

---

## API Endpoints

### Messaging Endpoints

All messaging endpoints are scoped under `/api/trips/:tripId/messages`.

#### `GET /api/trips/:tripId/messages`

List top-level messages for a trip (paginated, newest first).

```
Auth: authenticate
Query: page (default 1), limit (default 20)
Response: {
  success: true,
  data: {
    messages: MessageWithReplies[],
    meta: { page, limit, total, totalPages }
  }
}
```

- Returns top-level messages (`parent_id IS NULL`) ordered by `created_at DESC`
- Each message includes: author profile, reaction summaries (with current user's reactions), reply count, and the 2 most recent replies
- Filters out soft-deleted messages but returns placeholder: `{ id, deletedAt, ... }`
- Permission: going member only (403 for non-going)

#### `POST /api/trips/:tripId/messages`

Create a new message or reply.

```
Auth: authenticate, requireCompleteProfile
Body: { content: string, parentId?: string }
Response: { success: true, data: { message: Message } }
```

- Validates: going member, not muted, content 1-2000 chars
- If `parentId` set: validates parent exists, is top-level, belongs to same trip
- Top-level messages: enforces 100 per trip limit
- Triggers `NotificationService.notifyTripMembers()` for top-level messages

#### `PUT /api/trips/:tripId/messages/:messageId`

Edit a message (author only).

```
Auth: authenticate, requireCompleteProfile
Body: { content: string }
Response: { success: true, data: { message: Message } }
```

- Only the message author can edit
- Sets `editedAt` to current timestamp
- Trip must not be locked (past end date)

#### `DELETE /api/trips/:tripId/messages/:messageId`

Soft-delete a message.

```
Auth: authenticate, requireCompleteProfile
Response: { success: true }
```

- Author can delete own message, organizer can delete any
- Sets `deletedAt` and `deletedBy`
- Replies remain visible
- Trip must not be locked

#### `PATCH /api/trips/:tripId/messages/:messageId/pin`

Pin or unpin a message (organizer only).

```
Auth: authenticate, requireCompleteProfile
Body: { pinned: boolean }
Response: { success: true, data: { message: Message } }
```

- Only organizers can pin/unpin
- Only top-level messages can be pinned
- Trip must not be locked

#### `POST /api/trips/:tripId/messages/:messageId/reactions`

Toggle a reaction on a message.

```
Auth: authenticate, requireCompleteProfile
Body: { emoji: string }
Response: { success: true, data: { reactions: ReactionSummary[] } }
```

- Toggle: adds reaction if not exists, removes if exists
- `emoji` must be one of allowed set
- Returns updated reaction summaries for the message
- Trip must not be locked

#### `POST /api/trips/:tripId/members/:memberId/mute`

Mute a member (organizer only).

```
Auth: authenticate, requireCompleteProfile
Response: { success: true }
```

- Only organizers can mute
- Cannot mute other organizers or trip creator
- Returns 409 if already muted

#### `DELETE /api/trips/:tripId/members/:memberId/mute`

Unmute a member (organizer only).

```
Auth: authenticate, requireCompleteProfile
Response: { success: true }
```

- Only organizers can unmute
- Returns 404 if not muted

### Notification Endpoints

#### `GET /api/notifications`

List user's notifications (paginated, newest first).

```
Auth: authenticate
Query: page (default 1), limit (default 20), unreadOnly (default false)
Response: {
  success: true,
  data: {
    notifications: Notification[],
    meta: { page, limit, total, totalPages, unreadCount }
  }
}
```

- Returns all notifications for the authenticated user
- Optional `unreadOnly` filter
- Meta includes total unread count for badge

#### `GET /api/notifications/unread-count`

Quick unread count for badge polling.

```
Auth: authenticate
Response: { success: true, data: { count: number } }
```

- Lightweight query, optimized with partial index
- Used by global bell (30s polling)

#### `PATCH /api/notifications/:id/read`

Mark a single notification as read.

```
Auth: authenticate
Response: { success: true }
```

- Sets `readAt` to current timestamp
- Only the notification owner can mark as read

#### `PATCH /api/notifications/read-all`

Mark all notifications as read.

```
Auth: authenticate
Response: { success: true }
```

- Updates all unread notifications for the user

#### `GET /api/trips/:tripId/notifications`

List notifications for a specific trip.

```
Auth: authenticate
Query: page (default 1), limit (default 20)
Response: {
  success: true,
  data: {
    notifications: Notification[],
    meta: { page, limit, total, totalPages, unreadCount }
  }
}
```

- Filtered to a single trip
- Used by per-trip notification dialog

#### `GET /api/trips/:tripId/notification-preferences`

Get notification preferences for a trip.

```
Auth: authenticate
Response: {
  success: true,
  data: {
    preferences: NotificationPreferences
  }
}
```

- Returns current preferences or defaults if none saved
- Creates default record on first access

#### `PUT /api/trips/:tripId/notification-preferences`

Update notification preferences for a trip.

```
Auth: authenticate
Body: { eventReminders: boolean, dailyItinerary: boolean, tripMessages: boolean }
Response: { success: true, data: { preferences: NotificationPreferences } }
```

- Upserts preferences (creates if not exists, updates if exists)
- Validates user is a going member of the trip

---

## Backend Services

### MessageService

Location: `apps/api/src/services/message.service.ts`

```typescript
class MessageService {
  // Queries
  async getMessages(
    tripId: string,
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<MessageWithReplies>>;
  // - Top-level messages, reverse chronological
  // - Includes author profile (displayName, profilePhotoUrl)
  // - Includes reaction summaries with current user flag
  // - Includes 2 most recent replies with their reactions
  // - Includes total reply count per message
  // - Soft-deleted messages return as placeholders

  async getMessageCount(tripId: string): Promise<number>;
  // - Count of non-deleted top-level messages

  async getLatestMessage(tripId: string): Promise<Message | null>;
  // - Most recent non-deleted top-level message with author

  // Mutations
  async createMessage(
    tripId: string,
    authorId: string,
    data: CreateMessageInput,
  ): Promise<Message>;
  // - Validates going member, not muted, within limit
  // - If reply, validates parent exists and is top-level in same trip
  // - Triggers notification for top-level messages

  async editMessage(
    messageId: string,
    userId: string,
    content: string,
  ): Promise<Message>;
  // - Author only, sets editedAt

  async deleteMessage(
    messageId: string,
    userId: string,
    tripId: string,
  ): Promise<void>;
  // - Author or organizer, soft delete

  async togglePin(
    messageId: string,
    userId: string,
    tripId: string,
    pinned: boolean,
  ): Promise<Message>;
  // - Organizer only, top-level only

  async toggleReaction(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<ReactionSummary[]>;
  // - Add/remove toggle, returns updated summaries

  // Moderation
  async muteMember(
    tripId: string,
    userId: string,
    mutedBy: string,
  ): Promise<void>;
  async unmuteMember(tripId: string, userId: string): Promise<void>;
  async isMuted(tripId: string, userId: string): Promise<boolean>;
}
```

**Permission checks** delegate to existing `PermissionsService`:

```typescript
// New methods added to PermissionsService
canUserViewMessages(userId: string, tripId: string): Promise<boolean>
// - User must be a going member

canUserPostMessage(userId: string, tripId: string): Promise<boolean>
// - Going member + not muted + trip not locked

canUserModerateMessages(userId: string, tripId: string): Promise<boolean>
// - User is organizer or creator

canUserMuteMember(userId: string, tripId: string, targetId: string): Promise<boolean>
// - Organizer + target is not organizer/creator
```

### NotificationService

Location: `apps/api/src/services/notification.service.ts`

```typescript
class NotificationService {
  // Queries
  async getNotifications(
    userId: string,
    options: {
      page: number;
      limit: number;
      unreadOnly?: boolean;
      tripId?: string;
    },
  ): Promise<PaginatedResult<Notification> & { unreadCount: number }>;

  async getUnreadCount(userId: string): Promise<number>;

  // Mutations
  async markAsRead(notificationId: string, userId: string): Promise<void>;
  async markAllAsRead(userId: string): Promise<void>;

  // Creation & Delivery
  async createNotification(params: {
    userId: string;
    tripId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }): Promise<Notification>;
  // - Inserts notification record
  // - Checks user's SMS preferences
  // - If subscribed, sends SMS via SmsService

  async notifyTripMembers(params: {
    tripId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    excludeUserId?: string; // don't notify the actor
  }): Promise<void>;
  // - Gets all going members of the trip
  // - For each (except excluded): creates notification + optional SMS
  // - Respects individual notification preferences

  // Preferences
  async getPreferences(
    userId: string,
    tripId: string,
  ): Promise<NotificationPreferences>;
  async updatePreferences(
    userId: string,
    tripId: string,
    prefs: NotificationPreferencesInput,
  ): Promise<NotificationPreferences>;
  async createDefaultPreferences(userId: string, tripId: string): Promise<void>;
  // - Called when member first RSVPs Going
}
```

### SmsService

Location: `apps/api/src/services/sms.service.ts`

The SMS service is a generic transport layer. It does not contain business logic or message formatting — callers (NotificationService, SchedulerService) compose the message content.

```typescript
export interface ISMSService {
  sendMessage(phoneNumber: string, message: string): Promise<void>;
}

interface SmsProvider {
  sendSms(
    to: string,
    body: string,
  ): Promise<{ success: boolean; messageId?: string }>;
}

class MockSmsProvider implements SmsProvider {
  async sendSms(to: string, body: string) {
    console.log(`[SMS] To: ${to} | Body: ${body}`);
    return { success: true, messageId: `mock_${Date.now()}` };
  }
}

// Future: class TwilioSmsProvider implements SmsProvider { ... }

class SmsService implements ISMSService {
  constructor(private provider: SmsProvider) {}

  async sendMessage(phoneNumber: string, message: string): Promise<void> {
    await this.provider.sendSms(phoneNumber, message);
  }
}
```

**Message formatting lives in callers**, e.g.:

```typescript
// In SchedulerService.processEventReminders():
const message = `${tripName}: ${eventName} starts in 1 hour${location ? ` at ${location}` : ""}`;
await smsService.sendMessage(phone, message);

// In SchedulerService.processDailyItineraries():
const message = `${tripName} - Today's Schedule:\n${events.map((e, i) => `${i + 1}. ${e.time} - ${e.name}`).join("\n")}`;
await smsService.sendMessage(phone, message);

// In NotificationService.notifyTripMembers() for trip_message:
const message = `${tripName} - ${authorName}: ${preview}`;
await smsService.sendMessage(phone, message);
```

**Provider selection**:

```typescript
// In app setup (server.ts or similar)
const smsProvider =
  process.env.SMS_PROVIDER === "twilio"
    ? new TwilioSmsProvider(process.env.TWILIO_SID, process.env.TWILIO_TOKEN)
    : new MockSmsProvider();

const smsService = new SmsService(smsProvider);
```

### SchedulerService

Location: `apps/api/src/services/scheduler.service.ts`

```typescript
class SchedulerService {
  constructor(
    private notificationService: NotificationService,
    private smsService: SmsService,
    private db: DrizzleDB,
  ) {}

  start(): void;
  // - Called on server startup (not in test env)
  // - Registers interval timers

  stop(): void;
  // - Called on server shutdown
  // - Clears interval timers

  // Event Reminders (runs every 5 minutes)
  async processEventReminders(): Promise<void>;
  // 1. Query events with startTime in the next 55-65 minutes
  //    (10-minute window ensures we catch events between scheduler runs)
  // 2. For each event:
  //    a. Get going members of the event's trip
  //    b. Filter to members with event_reminders=true
  //    c. Check sent_reminders to skip already-sent
  //    d. Create in-app notification + SMS for each
  //    e. Record in sent_reminders

  // Daily Itinerary (runs every 15 minutes)
  async processDailyItineraries(): Promise<void>;
  // 1. Get all active trips (not cancelled, not ended)
  // 2. For each trip, check if current UTC time corresponds to
  //    7:45-8:15 AM in the trip's preferredTimezone
  // 3. For matching trips:
  //    a. Get today's events in the trip
  //    b. Get going members with daily_itinerary=true
  //    c. Check sent_reminders to skip already-sent (referenceId: tripId:YYYY-MM-DD)
  //    d. Create in-app notification + SMS for each
  //    e. Record in sent_reminders
}
```

**Design rationale & future migration path**:

The scheduling mechanism (`setInterval` in `start()`/`stop()`) is deliberately separated from the job logic (`processEventReminders()`, `processDailyItineraries()`). The process methods are fully stateless and idempotent - they query the DB, check dedup via `sent_reminders`, create notifications, and return. They don't care what invokes them.

This means migrating to AWS (or any external scheduler) is a deployment change, not a code rewrite:

1. Create Lambda handlers that call `processEventReminders()` / `processDailyItineraries()`
2. Set up EventBridge rules for the 5-min / 15-min schedules
3. Remove the `setInterval` calls from `start()`

No formal `ISchedulerProvider` abstraction is needed now (YAGNI) - the idempotency via `sent_reminders` is the real insurance that makes any trigger mechanism safe, whether it's setInterval, Lambda, a cron job, or manual invocation in tests.

**Timezone handling for daily itinerary**:

```typescript
import { DateTime } from "luxon"; // or date-fns-tz

function isMorningWindowInTimezone(timezone: string): boolean {
  const now = DateTime.now().setZone(timezone);
  const hour = now.hour;
  const minute = now.minute;
  // Check if current time in trip timezone is 7:45-8:15 AM
  return (hour === 7 && minute >= 45) || (hour === 8 && minute <= 15);
}
```

---

## Frontend Architecture

### New Hooks

#### `use-messages.ts`

```typescript
const messageKeys = {
  all: ['messages'] as const,
  trip: (tripId: string) => [...messageKeys.all, tripId] as const,
  count: (tripId: string) => [...messageKeys.all, tripId, 'count'] as const,
  latest: (tripId: string) => [...messageKeys.all, tripId, 'latest'] as const,
};

// Message feed with 5s polling (only when section is visible)
export function useMessages(tripId: string, enabled: boolean) {
  return useQuery({
    queryKey: messageKeys.trip(tripId),
    queryFn: () => apiRequest<GetMessagesResponse>(`/trips/${tripId}/messages`),
    refetchInterval: enabled ? 5000 : false,
  });
}

// Message count for indicator at top of itinerary
export function useMessageCount(tripId: string) {
  return useQuery({
    queryKey: messageKeys.count(tripId),
    queryFn: () => apiRequest<{ count: number }>(`/trips/${tripId}/messages/count`),
    refetchInterval: 30000,
  });
}

// Latest message for preview
export function useLatestMessage(tripId: string) {
  return useQuery({
    queryKey: messageKeys.latest(tripId),
    queryFn: () => apiRequest<{ message: Message | null }>(`/trips/${tripId}/messages/latest`),
    refetchInterval: 30000,
  });
}

// Mutations with optimistic updates
export function useCreateMessage(tripId: string) { ... }
export function useEditMessage(tripId: string) { ... }
export function useDeleteMessage(tripId: string) { ... }
export function useToggleReaction(tripId: string) { ... }
export function usePinMessage(tripId: string) { ... }
export function useMuteMember(tripId: string) { ... }
export function useUnmuteMember(tripId: string) { ... }
```

#### `use-notifications.ts`

```typescript
const notificationKeys = {
  all: ['notifications'] as const,
  list: (params?: { tripId?: string }) =>
    [...notificationKeys.all, 'list', params] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
  tripUnreadCount: (tripId: string) =>
    [...notificationKeys.all, 'unread-count', tripId] as const,
  preferences: (tripId: string) =>
    [...notificationKeys.all, 'preferences', tripId] as const,
};

// Global unread count (30s polling)
export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => apiRequest<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 30000,
  });
}

// Notification list (global or per-trip)
export function useNotifications(options?: { tripId?: string, page?: number }) { ... }

// Mutations
export function useMarkAsRead() { ... }
export function useMarkAllAsRead() { ... }
export function useNotificationPreferences(tripId: string) { ... }
export function useUpdateNotificationPreferences(tripId: string) { ... }
```

### New Components

#### Messaging Components

Location: `apps/web/src/components/messaging/`

```
messaging/
  trip-messages.tsx              # Main container with section header + feed
  message-count-indicator.tsx    # "X messages" link in trip meta (scrolls to discussion)
  message-input.tsx              # Compose input with send button
  message-card.tsx               # Single message (author, content, actions, reactions, replies)
  message-reactions.tsx          # 6 emoji reaction buttons with counts
  message-replies.tsx            # Reply thread (2 latest + expand)
  pinned-messages.tsx            # Pinned messages banner at top of discussion
```

#### Notification Components

Location: `apps/web/src/components/notifications/`

```
notifications/
  notification-bell.tsx          # Bell icon + badge (used in app header)
  notification-dropdown.tsx      # Global dropdown from bell click
  notification-item.tsx          # Single notification row
  trip-notification-bell.tsx     # Per-trip bell icon + badge
  trip-notification-dialog.tsx   # Per-trip dialog with tabs
  notification-preferences.tsx   # Preference toggles (tab content)
```

### Integration Points

**App Header** (`app-header.tsx`):

- Add `<NotificationBell />` between nav links and user avatar

**Trip Detail Page** (trip detail component):

- Add `<TripNotificationBell tripId={trip.id} />` next to edit trip button
- Add `<MessageCountIndicator tripId={trip.id} />` in trip meta section
- Add `<TripMessages tripId={trip.id} />` below itinerary section

**Members Dialog** (members list):

- Add "Mute"/"Unmute" option in member action dropdown (organizer only)
- Add muted badge next to RSVP status for muted members

**RSVP Handler**:

- When member RSVPs "Going": create default notification preferences

---

## Shared Package

### New Types

Location: `shared/types/message.ts`

```typescript
export interface Message {
  id: string;
  tripId: string;
  authorId: string;
  parentId: string | null;
  content: string;
  isPinned: boolean;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    displayName: string;
    profilePhotoUrl: string | null;
  };
  reactions: ReactionSummary[];
}

export interface MessageWithReplies extends Message {
  replies: Message[];
  replyCount: number;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  reacted: boolean; // current user has reacted
}

export const ALLOWED_REACTIONS = [
  "heart",
  "thumbs_up",
  "laugh",
  "surprised",
  "party",
  "plane",
] as const;

export type AllowedReaction = (typeof ALLOWED_REACTIONS)[number];

export const REACTION_EMOJI_MAP: Record<AllowedReaction, string> = {
  heart: "\u2764\ufe0f",
  thumbs_up: "\ud83d\udc4d",
  laugh: "\ud83d\ude02",
  surprised: "\ud83d\ude2e",
  party: "\ud83c\udf89",
  plane: "\u2708\ufe0f",
};
```

Location: `shared/types/notification.ts`

```typescript
export type NotificationType =
  | "event_reminder"
  | "daily_itinerary"
  | "trip_message"
  | "trip_update";

export interface Notification {
  id: string;
  userId: string;
  tripId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreferences {
  eventReminders: boolean;
  dailyItinerary: boolean;
  tripMessages: boolean;
}
```

### New Schemas

Location: `shared/schemas/message.ts`

```typescript
export const createMessageSchema = z.object({
  content: z
    .string()
    .min(1, "Message cannot be empty")
    .max(2000, "Message too long (max 2000 characters)"),
  parentId: z.string().uuid().optional(),
});

export const updateMessageSchema = z.object({
  content: z.string().min(1).max(2000),
});

export const toggleReactionSchema = z.object({
  emoji: z.enum(["heart", "thumbs_up", "laugh", "surprised", "party", "plane"]),
});

export const pinMessageSchema = z.object({
  pinned: z.boolean(),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export type ToggleReactionInput = z.infer<typeof toggleReactionSchema>;
export type PinMessageInput = z.infer<typeof pinMessageSchema>;
```

Location: `shared/schemas/notification.ts`

```typescript
export const notificationPreferencesSchema = z.object({
  eventReminders: z.boolean(),
  dailyItinerary: z.boolean(),
  tripMessages: z.boolean(),
});

export type NotificationPreferencesInput = z.infer<
  typeof notificationPreferencesSchema
>;
```

---

## Data Flow

### Message Creation

```
User types message → useCreateMessage.mutate(data)
  → onMutate: Optimistic add to cache (instant UI)
  → POST /api/trips/:tripId/messages
    → MessageController.createMessage()
      → MessageService.createMessage()
        → Validate: going member, not muted, content valid, within limit
        → INSERT INTO messages
        → If top-level: NotificationService.notifyTripMembers()
          → For each going member (except author):
            → Check notification_preferences.trip_messages
            → INSERT INTO notifications
            → If SMS enabled: SmsService.sendMessage(phone, formattedMessage)
  → onSettled: Invalidate message queries
  → onError: Rollback optimistic update, show toast
```

### Event Reminder

```
SchedulerService (every 5 min):
  → SELECT events WHERE startTime BETWEEN now + 55min AND now + 65min
  → For each event:
    → SELECT going members of event's trip
    → For each member:
      → Check notification_preferences.event_reminders = true
      → Check sent_reminders for dedup
      → NotificationService.createNotification('event_reminder', ...)
        → INSERT INTO notifications
        → If SMS enabled: SmsService.sendMessage(phone, formattedReminder)
      → INSERT INTO sent_reminders
```

### Daily Itinerary

```
SchedulerService (every 15 min):
  → SELECT trips WHERE not cancelled AND has dates
  → For each trip WHERE isMorningWindow(trip.preferredTimezone):
    → Check sent_reminders for tripId:today dedup
    → SELECT today's events for trip
    → SELECT going members with daily_itinerary = true
    → For each member:
      → NotificationService.createNotification('daily_itinerary', ...)
      → INSERT INTO sent_reminders (type: daily_itinerary, ref: tripId:YYYY-MM-DD)
```

### Notification Read

```
User clicks notification → useMarkAsRead.mutate(notificationId)
  → Optimistic: set readAt in cache, decrement unread count
  → PATCH /api/notifications/:id/read
    → NotificationService.markAsRead()
      → UPDATE notifications SET read_at = NOW() WHERE id = :id AND user_id = :userId
  → Navigate to deep-linked content
```

---

## Security & Permissions

### Message Access Control

| Action        | Going Member | Organizer | Muted Member | Non-Going | Past Trip |
| ------------- | ------------ | --------- | ------------ | --------- | --------- |
| View messages | Yes          | Yes       | Yes          | No        | Yes       |
| Post message  | Yes          | Yes       | No           | No        | No        |
| Edit own      | Yes          | Yes       | No           | No        | No        |
| Delete own    | Yes          | Yes       | No           | No        | No        |
| Delete any    | No           | Yes       | No           | No        | No        |
| Pin/Unpin     | No           | Yes       | No           | No        | No        |
| React         | Yes          | Yes       | Yes          | No        | No        |
| Mute member   | No           | Yes       | No           | No        | No        |

### Notification Access Control

- Users can only view/manage their own notifications
- Notification preferences scoped to user + trip
- SMS delivery respects user preferences (no unsolicited texts)

### Rate Limiting

- Message posting: `writeRateLimitConfig` (existing)
- Notification endpoints: `defaultRateLimitConfig` (existing)
- SMS delivery: Inherits existing SMS rate limits

---

## Performance Considerations

### Database Indexes

- `idx_messages_trip_toplevel`: Partial index on non-deleted top-level messages for feed queries
- `idx_notifications_user_unread`: Partial index on unread notifications for fast badge counts
- `idx_sent_reminders_lookup`: For scheduler deduplication checks

### Query Optimization

- Message feed: Single query with subquery for reply counts, reaction aggregation via `json_agg`
- Unread count: Uses partial index, returns single integer
- Scheduler queries: Indexed on `startTime` for event lookups

### Polling Strategy

- Message feed: 5s interval, only when discussion section is in viewport (Intersection Observer)
- Unread count (global): 30s interval, lightweight query
- Message count/latest: 30s interval, only on trip page

### Caching

- TanStack Query handles client-side caching with stale-while-revalidate
- Optimistic updates prevent flicker on mutations
- Scheduler deduplication via `sent_reminders` table prevents double-sends

---

## Testing Strategy

### Backend Unit Tests

- `MessageService`: CRUD, permissions, reaction toggle, mute enforcement, message limits
- `NotificationService`: CRUD, preference checking, bulk notification delivery
- `SmsService`: Provider interface, sendMessage delegation
- `SchedulerService`: Timing logic, deduplication, timezone handling

### Backend Integration Tests

- Message API: All endpoints with auth, permission errors, edge cases
- Notification API: List, read, preferences, trip-scoped queries
- Cross-service: Message creation triggers notification delivery

### Frontend Unit Tests

- Message components: Rendering, interactions, empty states, muted state, past trip state
- Notification components: Bell badge, dropdown, dialog tabs, preferences toggles
- TanStack Query hooks: Optimistic updates, polling, error rollback

### E2E Tests (Playwright)

- Post a message, see it in feed
- Reply to a message, see thread expand
- React to a message, see count update
- Edit own message, see "edited" indicator
- Delete own message, see placeholder
- Organizer: delete other's message, pin message, mute member
- Notification bell: unread count updates
- Mark notification as read
- Update notification preferences
- Past trip: discussion is read-only

---

## Error Types

New error types added to `apps/api/src/errors.ts`:

```typescript
export const MessageNotFoundError = createError(
  "MESSAGE_NOT_FOUND",
  "Message not found",
  404,
);
export const MemberMutedError = createError(
  "MEMBER_MUTED",
  "You have been muted and cannot post messages",
  403,
);
export const MessageLimitExceededError = createError(
  "MESSAGE_LIMIT_EXCEEDED",
  "Maximum 100 messages per trip reached",
  409,
);
export const NotificationNotFoundError = createError(
  "NOTIFICATION_NOT_FOUND",
  "Notification not found",
  404,
);
export const AlreadyMutedError = createError(
  "ALREADY_MUTED",
  "Member is already muted",
  409,
);
export const NotMutedError = createError(
  "NOT_MUTED",
  "Member is not muted",
  404,
);
export const CannotMuteOrganizerError = createError(
  "CANNOT_MUTE_ORGANIZER",
  "Cannot mute an organizer",
  403,
);
```

---

## File References

### Backend

- Schema: `apps/api/src/db/schema/index.ts` (extend)
- Relations: `apps/api/src/db/schema/relations.ts` (extend)
- Services: `apps/api/src/services/message.service.ts`, `notification.service.ts`, `sms.service.ts`, `scheduler.service.ts` (new)
- Controllers: `apps/api/src/controllers/message.controller.ts`, `notification.controller.ts` (new)
- Routes: `apps/api/src/routes/message.routes.ts`, `notification.routes.ts` (new)
- Errors: `apps/api/src/errors.ts` (extend)
- Permissions: `apps/api/src/services/permissions.service.ts` (extend)

### Frontend

- Hooks: `apps/web/src/hooks/use-messages.ts`, `use-notifications.ts` (new)
- Messaging: `apps/web/src/components/messaging/` (new directory)
- Notifications: `apps/web/src/components/notifications/` (new directory)
- App header: `apps/web/src/components/app-header.tsx` (extend)
- Members dialog: `apps/web/src/components/trip/members-dialog.tsx` (extend)

### Shared

- Types: `shared/types/message.ts`, `notification.ts` (new)
- Schemas: `shared/schemas/message.ts`, `notification.ts` (new)
- Barrel: `shared/types/index.ts`, `shared/schemas/index.ts` (extend)
