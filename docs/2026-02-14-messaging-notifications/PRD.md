---
date: 2026-02-14
topic: Journiful - Messaging & Notifications PRD
---

# Journiful - Messaging & Notifications

## Overview

A messaging and notification system for Journiful that enables trip members to communicate within trips and stay informed about important updates. The messaging service provides a Partiful-style discussion feed on each trip page where going members can post, reply, and react. The notification service delivers in-app and SMS alerts for event reminders, daily itineraries, and trip messages.

## Goals

1. Enable going members to discuss trip plans in context, directly on the trip page
2. Keep members informed about upcoming events and daily schedules without leaving the app
3. Give organizers moderation tools to manage conversations (delete, pin, mute)
4. Support SMS delivery for members who want alerts outside the app
5. Let members control their notification preferences per trip

## Target Users

- **Primary**: Trip members who want to coordinate logistics, share excitement, and stay in the loop
- **Secondary**: Trip organizers who need to broadcast important updates and moderate discussion

## Terminology

| Term                         | Definition                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| **Message**                  | A text post in a trip's discussion feed                                                |
| **Reply**                    | A response to a top-level message (flat threading, not nested)                         |
| **Reaction**                 | An emoji response to a message from a predefined set                                   |
| **Notification**             | An in-app alert about trip activity (event reminder, daily itinerary, new message)     |
| **Notification Preferences** | Per-trip toggles controlling which notification types a member receives (in-app + SMS) |
| **Pinned Message**           | A message promoted to the top of the feed by an organizer                              |
| **Muted Member**             | A member blocked from posting messages by an organizer                                 |

## Core User Flows

### 1. Viewing the Discussion Feed

- Going member scrolls past the itinerary on the trip page
- Below the itinerary, a "Discussion" section displays a message count with a preview of the latest message
- At the top of the itinerary, a clickable "X messages" indicator with the latest message preview scrolls the user down to the discussion section when clicked
- The discussion section shows:
  - Pinned messages at the top (if any)
  - Message input for composing a new post
  - Top-level messages in reverse chronological order (newest first)
  - Each message shows author avatar, name, content, timestamp, reactions, and reply count
  - Under each message, the 2 most recent replies are visible with a "View X more replies" button to expand all
- Non-going members (Maybe/Not Going) do not see the discussion section
- Past trips show the discussion in read-only mode (no posting, editing, or reacting)

### 2. Posting a Message

- Going member types in the message input at the top of the discussion section
- Presses send (button or Enter)
- Message appears instantly (optimistic update) at the top of the feed
- Other members see the new message on their next poll (5-second interval)
- A notification is created for all other going members
- Members subscribed to trip message SMS receive a text with the author name and message preview

### 3. Replying to a Message

- Member clicks "Reply" on a top-level message
- A reply input appears below the message
- Member types and sends their reply
- Reply appears under the parent message (flat, not nested)
- Replies are sorted oldest first within each thread
- The parent message author receives a notification (in-app, and SMS if subscribed)

### 4. Reacting to a Message

- Member clicks a reaction button on any message or reply
- Predefined reaction set: heart, thumbs_up, laugh, surprised, party, plane
- Displayed as: :heart: :thumbs_up: :laughing: :open_mouth: :tada: :airplane:
- Toggle behavior: clicking again removes the reaction
- Reaction counts displayed with a highlight if the current user has reacted
- No notification generated for reactions

### 5. Editing a Message

- Author clicks the edit option on their own message
- Message content becomes editable inline
- Author saves the edit
- Message displays an "edited" indicator with timestamp
- Edit is visible to all members on next poll

### 6. Deleting a Message

- Author can delete their own message; organizers can delete any message
- Confirmation dialog shown before deletion
- After deletion, message shows "This message was deleted" placeholder
- Replies under a deleted message remain visible
- Soft delete with `deletedBy` tracking

### 7. Pinning a Message (Organizer)

- Organizer clicks "Pin" on any top-level message
- Message moves to the pinned section at the top of the discussion
- No limit on number of pinned messages
- Organizer can unpin at any time
- Pinned messages show a pin indicator

### 8. Muting a Member (Organizer)

- Organizer opens the Members dialog
- Clicks the mute option on a member's action menu (alongside existing "Remove" option)
- Muted member can still view messages but cannot post or reply
- Muted member sees a notice that they have been muted
- Organizer can unmute from the same Members dialog

### 9. Viewing Notifications (Global)

- A notification bell icon appears in the app header (all pages)
- Badge shows unread count (polls every 30 seconds)
- Clicking opens a dropdown with the 10 most recent notifications across all trips
- Each notification shows: type icon, title, body preview, timestamp, unread indicator
- Clicking a notification marks it as read and navigates to the relevant content:
  - Event reminder: navigates to trip itinerary
  - Daily itinerary: navigates to trip itinerary
  - Trip message: navigates to trip discussion, scrolls to the specific message
- "Mark all as read" button at the top of the dropdown

### 10. Viewing Notifications (Per-Trip)

- On the trip page, a notification bell icon appears next to the edit trip button
- Badge shows unread count for this trip only
- Clicking opens a dialog with two tabs:
  - **Notifications**: List of all notifications for this trip (paginated)
  - **Preferences**: Toggle switches for notification subscriptions

### 11. Managing Notification Preferences

- Member opens the per-trip notification dialog and switches to the Preferences tab
- Three toggles:
  - **Event reminders**: SMS + in-app notification 1 hour before each event (default: ON)
  - **Daily itinerary**: SMS + in-app summary of the day's events at 8am trip timezone (default: ON)
  - **Trip messages**: SMS + in-app notification for each new top-level message (default: ON)
- Changes saved immediately on toggle
- Preferences are per-trip per-user

### 12. Receiving Event Reminders

- System checks every 5 minutes for events starting in the next hour
- For each upcoming event, all going members with event reminders enabled receive:
  - In-app notification: "[Event Name] starts in 1 hour"
  - SMS (if subscribed): "[Trip Name]: [Event Name] starts in 1 hour at [Location]"
- Deduplication ensures each reminder is sent only once per event per member

### 13. Receiving Daily Itinerary

- System checks every 15 minutes for trips where it's approximately 8am in the trip's timezone
- For each active trip day, all going members with daily itinerary enabled receive:
  - In-app notification: "Today's itinerary for [Trip Name]: [X] events"
  - SMS (if subscribed): Formatted list of the day's events with times and locations
- Sent once per trip per day

## Acceptance Criteria

### AC1: Message Posting

**Given** a going member views a trip's discussion section
**When** they type a message (1-2000 characters) and press send
**Then** the message should appear at the top of the feed instantly
**And** other going members should see it within 5 seconds
**And** a notification should be created for all other going members

**Given** a non-going member (Maybe/Not Going) views the trip page
**When** they scroll past the itinerary
**Then** the discussion section should not be visible

**Given** a muted member views the discussion section
**When** they attempt to post a message
**Then** they should see "You have been muted by an organizer and cannot post messages"
**And** the message input should be disabled

**Given** a trip has reached the 100 top-level message limit
**When** a member tries to post a new top-level message
**Then** they should see "Message limit reached for this trip"

### AC2: Replies

**Given** a going member views a top-level message with replies
**When** the message has more than 2 replies
**Then** the 2 most recent replies should be visible
**And** a "View X more replies" button should expand all replies

**Given** a member clicks "Reply" on a top-level message
**When** they type and send a reply
**Then** the reply should appear under the parent message
**And** replies should be ordered oldest first

**Given** a member tries to reply to a reply
**When** they attempt to nest a reply
**Then** the reply should be attached to the top-level parent (flat threading, no nesting)

### AC3: Reactions

**Given** a member views a message
**When** they click a reaction emoji (heart, thumbs_up, laugh, surprised, party, plane)
**Then** the reaction should toggle on (if not reacted) or off (if already reacted)
**And** the reaction count should update immediately (optimistic)
**And** the member's own reaction should be highlighted

**Given** a message has reactions from multiple users
**When** displayed in the feed
**Then** each unique emoji should show with its count
**And** reactions the current user has added should be visually highlighted

### AC4: Edit & Delete

**Given** a message author views their own message
**When** they click "Edit"
**Then** the message should become editable inline
**And** after saving, an "edited" indicator should appear

**Given** a member views a deleted message
**When** the message has been soft-deleted
**Then** they should see "This message was deleted" placeholder
**And** replies under the deleted message should remain visible

**Given** an organizer views any message
**When** they click "Delete"
**Then** the message should be soft-deleted regardless of author
**And** `deletedBy` should track who performed the deletion

### AC5: Pinning

**Given** an organizer views a top-level message
**When** they click "Pin"
**Then** the message should appear in the pinned section at the top of the discussion
**And** a pin indicator should be shown on the message

**Given** an organizer views a pinned message
**When** they click "Unpin"
**Then** the message should return to its chronological position in the feed

**Given** multiple messages are pinned
**When** the discussion loads
**Then** all pinned messages should appear at the top, sorted by pin date (newest first)

### AC6: Muting

**Given** an organizer opens the Members dialog
**When** they click "Mute" on a member
**Then** the member should be prevented from posting messages or replies
**And** the member should see a muted notice in the discussion section

**Given** an organizer views a muted member in the Members dialog
**When** they click "Unmute"
**Then** the member should be able to post messages again

### AC7: Notification Bell (Global)

**Given** an authenticated user is on any page
**When** they have unread notifications
**Then** the app header bell icon should display an unread count badge
**And** the count should update every 30 seconds

**Given** a user clicks the global notification bell
**When** the dropdown opens
**Then** they should see the 10 most recent notifications across all trips
**And** each notification should show type icon, title, body, timestamp, and unread state
**And** a "Mark all as read" button should be available

**Given** a user clicks a message notification
**When** they are navigated
**Then** they should land on the trip's discussion section scrolled to the specific message
**And** the notification should be marked as read

### AC8: Notification Bell (Per-Trip)

**Given** a going member views a trip page
**When** the trip has unread notifications
**Then** a bell icon next to the edit button should show the unread count for this trip

**Given** a member clicks the per-trip notification bell
**When** the dialog opens
**Then** they should see two tabs: "Notifications" and "Preferences"
**And** the Notifications tab should list all notifications for this trip
**And** the Preferences tab should show toggle switches for each notification type

### AC9: Notification Preferences

**Given** a member RSVPs "Going" to a trip for the first time
**When** their notification preferences are initialized
**Then** all three toggles should default to ON (event reminders, daily itinerary, trip messages)

**Given** a member toggles a notification preference
**When** they turn off "Trip messages"
**Then** they should stop receiving SMS and in-app notifications for new messages in that trip
**And** the change should take effect immediately

### AC10: Event Reminders

**Given** an event starts in approximately 1 hour
**When** the scheduler runs
**Then** all going members with event reminders enabled should receive an in-app notification
**And** members subscribed to SMS should receive a text message
**And** each reminder should be sent only once per event per member

### AC11: Daily Itinerary

**Given** it is approximately 8am in a trip's preferred timezone on an active trip day
**When** the scheduler runs
**Then** all going members with daily itinerary enabled should receive an in-app notification
**And** members subscribed to SMS should receive a formatted text with the day's events
**And** the digest should be sent only once per trip per day

### AC12: Past Trip Discussion

**Given** a trip's end date has passed
**When** a going member views the discussion section
**Then** all existing messages, replies, and reactions should be visible
**And** the message input should be disabled with a "Trip has ended" notice
**And** edit, delete, pin, and react actions should be disabled

## Data Validation Requirements

### Message Constraints

- Message content: 1-2000 characters
- Maximum top-level messages per trip: 100
- No limit on replies per message
- Parent ID for replies must reference a valid top-level message in the same trip

### Reaction Constraints

- Emoji must be one of: heart, thumbs_up, laugh, surprised, party, plane
- One reaction per emoji per user per message (unique constraint)

### Notification Constraints

- Notification title: max 200 characters
- Notification body: max 500 characters
- Notification data: JSON object for deep linking metadata

### Notification Preferences

- Three boolean toggles per trip per member
- Defaults: all ON when member first RSVPs Going

## Core Entities

### Message

- id (UUID)
- trip_id (FK → trips)
- author_id (FK → users)
- parent_id (FK → messages, nullable) - NULL for top-level, set for replies
- content (text, 1-2000 characters)
- is_pinned (boolean, default false)
- edited_at (timestamp, nullable)
- deleted_at (timestamp, nullable - soft delete)
- deleted_by (FK → users, nullable)
- created_at
- updated_at

### Message Reaction

- id (UUID)
- message_id (FK → messages)
- user_id (FK → users)
- emoji (varchar) - one of: heart, thumbs_up, laugh, surprised, party, plane
- created_at
- Unique constraint: (message_id, user_id, emoji)

### Notification

- id (UUID)
- user_id (FK → users)
- trip_id (FK → trips, nullable)
- type (enum: event_reminder, daily_itinerary, trip_message, trip_update)
- title (text)
- body (text)
- data (JSONB, nullable) - deep linking metadata (eventId, messageId, etc.)
- read_at (timestamp, nullable)
- created_at

### Notification Preferences

- id (UUID)
- user_id (FK → users)
- trip_id (FK → trips)
- event_reminders (boolean, default true)
- daily_itinerary (boolean, default true)
- trip_messages (boolean, default true)
- created_at
- updated_at
- Unique constraint: (user_id, trip_id)

### Muted Member

- id (UUID)
- trip_id (FK → trips)
- user_id (FK → users) - the muted member
- muted_by (FK → users) - the organizer who muted
- created_at
- Unique constraint: (trip_id, user_id)

### Sent Reminder

- id (UUID)
- type (enum: event_reminder, daily_itinerary)
- reference_id (text) - event ID or trip_id + date combo
- user_id (FK → users)
- sent_at (timestamp)
- Unique constraint: (type, reference_id, user_id)

## Key Features

### Messaging

- Text-only messages with flat reply threading
- Predefined emoji reactions (6 options)
- Edit and delete own messages
- Organizer moderation: delete any, pin, mute members
- "Message deleted" placeholder for soft-deleted messages
- Polling-based updates (5-second interval)
- Optimistic UI updates with rollback on error
- 100 top-level messages per trip cap

### Notifications

- In-app notification bell with unread badge (global + per-trip)
- Per-trip notification dialog with notifications list + preferences
- Deep linking to specific content (messages, events)
- Event reminders: 1 hour before event start
- Daily itinerary: 8am in trip's preferred timezone
- Trip message alerts: per top-level message
- SMS delivery via abstracted provider interface (mock in dev)
- Scheduler-based delivery with deduplication

### Security & Privacy

- Only going members can view and post messages
- Muted members cannot post but can read
- Notification preferences respected for all delivery channels
- SMS delivery rate-limited to prevent abuse
- Messages scoped to trip membership (no cross-trip visibility)
- Soft delete preserves audit trail (who deleted, when)

### Performance

- Message feed loads in < 2 seconds (paginated, 20 messages per page)
- Unread count badge updates every 30 seconds (lightweight query)
- Message feed polls every 5 seconds (only when discussion section visible)
- Scheduler runs on fixed intervals (5 min for reminders, 15 min for daily)
- Indexes on high-query columns (trip_id, created_at, user_id, read_at)

## Out of Scope (Future Enhancements)

- WebSocket/SSE real-time messaging (currently polling)
- Image/file attachments in messages
- Message search/filtering
- @mentions and targeted notifications
- Message threads deeper than one level (currently flat replies only)
- Email notification delivery
- Push notifications (mobile native)
- Message formatting (bold, italic, links)
- Read receipts per message
- Typing indicators
- Direct messages between members
- Scheduled messages
- Message templates for organizers

## Success Metrics

1. **Engagement**
   - % of going members who post at least one message
   - Average messages per trip
   - % of messages that receive at least one reaction
   - Reply rate (% of top-level messages with replies)

2. **Notification Effectiveness**
   - % of members who keep default preferences (all ON)
   - Click-through rate on notifications (notification → trip page)
   - % of event reminders that lead to timely attendance

3. **Platform Health**
   - SMS delivery success rate (> 95%)
   - Notification delivery latency (< 1 minute for in-app)
   - Scheduler reliability (< 0.1% missed reminders)

## User Stories

### Member Stories

- As a member, I want to discuss trip plans with the group so we can coordinate logistics
- As a member, I want to reply to specific messages so conversations stay organized
- As a member, I want to react to messages quickly so I can express agreement without typing
- As a member, I want to edit my messages if I made a mistake
- As a member, I want to delete my messages if I posted something by accident
- As a member, I want to get reminded about upcoming events so I don't miss anything
- As a member, I want a daily summary of the day's itinerary so I know what's planned
- As a member, I want to control which notifications I receive per trip
- As a member, I want to see a preview of the latest message on the trip page so I know there's activity

### Organizer Stories

- As an organizer, I want to delete inappropriate messages so the discussion stays on topic
- As an organizer, I want to pin important messages so everyone sees key information
- As an organizer, I want to mute disruptive members so they can't spam the discussion
- As an organizer, I want trip messages to notify members so important updates get seen

### Platform Stories

- As the system, I need to send event reminders exactly once per event per member
- As the system, I need to send daily itineraries at the correct time in each trip's timezone
- As the system, I need to respect notification preferences before delivering any alert
- As the system, I need to abstract SMS delivery so providers can be swapped without code changes
