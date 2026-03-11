import { relations } from "drizzle-orm";
import {
  users,
  trips,
  members,
  events,
  accommodations,
  memberTravel,
  invitations,
  messages,
  messageReactions,
  notifications,
  notificationPreferences,
  mutedMembers,
  sentReminders,
  blacklistedTokens,
  weatherCache,
  tripPhotos,
} from "./index.js";

export const usersRelations = relations(users, ({ many }) => ({
  createdTrips: many(trips),
  memberships: many(members),
  createdEvents: many(events),
  createdAccommodations: many(accommodations),
  invitations: many(invitations),
  messages: many(messages),
  messageReactions: many(messageReactions),
  notifications: many(notifications),
  notificationPreferences: many(notificationPreferences),
  blacklistedTokens: many(blacklistedTokens),
  uploadedPhotos: many(tripPhotos),
}));

export const tripsRelations = relations(trips, ({ one, many }) => ({
  creator: one(users, { fields: [trips.createdBy], references: [users.id] }),
  members: many(members),
  events: many(events),
  accommodations: many(accommodations),
  memberTravel: many(memberTravel),
  invitations: many(invitations),
  messages: many(messages),
  notifications: many(notifications),
  notificationPreferences: many(notificationPreferences),
  mutedMembers: many(mutedMembers),
  weatherCache: one(weatherCache),
  photos: many(tripPhotos),
}));

export const membersRelations = relations(members, ({ one, many }) => ({
  trip: one(trips, { fields: [members.tripId], references: [trips.id] }),
  user: one(users, { fields: [members.userId], references: [users.id] }),
  travel: many(memberTravel),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  trip: one(trips, { fields: [events.tripId], references: [trips.id] }),
  creator: one(users, { fields: [events.createdBy], references: [users.id] }),
}));

export const accommodationsRelations = relations(accommodations, ({ one }) => ({
  trip: one(trips, {
    fields: [accommodations.tripId],
    references: [trips.id],
  }),
  creator: one(users, {
    fields: [accommodations.createdBy],
    references: [users.id],
  }),
}));

export const memberTravelRelations = relations(memberTravel, ({ one }) => ({
  trip: one(trips, {
    fields: [memberTravel.tripId],
    references: [trips.id],
  }),
  member: one(members, {
    fields: [memberTravel.memberId],
    references: [members.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  trip: one(trips, { fields: [invitations.tripId], references: [trips.id] }),
  inviter: one(users, {
    fields: [invitations.inviterId],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  trip: one(trips, { fields: [messages.tripId], references: [trips.id] }),
  author: one(users, {
    fields: [messages.authorId],
    references: [users.id],
  }),
  parent: one(messages, {
    fields: [messages.parentId],
    references: [messages.id],
    relationName: "messageReplies",
  }),
  replies: many(messages, { relationName: "messageReplies" }),
  reactions: many(messageReactions),
}));

export const messageReactionsRelations = relations(
  messageReactions,
  ({ one }) => ({
    message: one(messages, {
      fields: [messageReactions.messageId],
      references: [messages.id],
    }),
    user: one(users, {
      fields: [messageReactions.userId],
      references: [users.id],
    }),
  }),
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  trip: one(trips, {
    fields: [notifications.tripId],
    references: [trips.id],
  }),
}));

export const notificationPreferencesRelations = relations(
  notificationPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [notificationPreferences.userId],
      references: [users.id],
    }),
    trip: one(trips, {
      fields: [notificationPreferences.tripId],
      references: [trips.id],
    }),
  }),
);

export const mutedMembersRelations = relations(mutedMembers, ({ one }) => ({
  trip: one(trips, {
    fields: [mutedMembers.tripId],
    references: [trips.id],
  }),
  user: one(users, {
    fields: [mutedMembers.userId],
    references: [users.id],
    relationName: "mutedUser",
  }),
  mutedByUser: one(users, {
    fields: [mutedMembers.mutedBy],
    references: [users.id],
    relationName: "mutedByUser",
  }),
}));

export const sentRemindersRelations = relations(sentReminders, ({ one }) => ({
  user: one(users, {
    fields: [sentReminders.userId],
    references: [users.id],
  }),
}));

export const blacklistedTokensRelations = relations(
  blacklistedTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [blacklistedTokens.userId],
      references: [users.id],
    }),
  }),
);

export const weatherCacheRelations = relations(weatherCache, ({ one }) => ({
  trip: one(trips, {
    fields: [weatherCache.tripId],
    references: [trips.id],
  }),
}));

export const tripPhotosRelations = relations(tripPhotos, ({ one }) => ({
  trip: one(trips, {
    fields: [tripPhotos.tripId],
    references: [trips.id],
  }),
  uploader: one(users, {
    fields: [tripPhotos.uploadedBy],
    references: [users.id],
  }),
}));
