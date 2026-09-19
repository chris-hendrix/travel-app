import type { Notification, NotificationType } from "@/lib/notifications";

/**
 * Mock notifications, shaped exactly like the API's rows: a type, a push
 * headline, a message, a trip id, and a type-specific payload. Titles and
 * bodies follow the strings the producers actually write, so the list
 * reads like the real thing.
 *
 * All five types appear so every label is exercised, including
 * `trip_update`, which nothing produces yet.
 *
 * Timestamps are relative to now, and no message contains a relative
 * time of its own: a mock is written once and read whenever, so time
 * lives in the meta line where it is always true.
 */
function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const hours = (n: number) => ago(n * 60);
const days = (n: number) => ago(n * 60 * 24);

type Seed = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  tripId: string;
  data: Record<string, unknown>;
  createdAt: string;
  readAt?: string;
};

const SEEDS: Seed[] = [
  {
    id: "invite-picos",
    type: "mutual_invite",
    title: "Trip invitation",
    body: "Dana invited you to Los Picos Trail",
    tripId: "picos",
    data: { inviterId: "user-dana" },
    createdAt: ago(40),
  },
  {
    id: "invite-lisbon",
    type: "sms_invite",
    title: "Trip invitation",
    body: "Rafa invited you to Dana's 30th",
    tripId: "lisbon",
    data: { inviterId: "user-rafa" },
    createdAt: hours(3),
  },
  {
    id: "update-dinner",
    type: "trip_update",
    title: "Trip updated",
    body: "Dana moved Dinner to 8:30pm",
    tripId: "lisbon",
    data: { tripId: "lisbon" },
    createdAt: days(1.1),
  },
  {
    id: "daily-picos",
    type: "daily_itinerary",
    title: "Los Picos Trail - Today's Schedule",
    body: "1. 9:00 AM - Breakfast at the market\n2. 11:00 AM - Hike the ridge",
    tripId: "picos",
    data: { referenceId: "picos:2026-09-16" },
    createdAt: days(3),
    readAt: days(2.9),
  },
  {
    id: "message-sunscreen",
    type: "trip_message",
    title: "New message",
    body: "Rafa: bringing the good sunscreen",
    tripId: "picos",
    data: { messageId: "message-1" },
    createdAt: days(6),
    readAt: days(5.9),
  },
  {
    id: "message-table",
    type: "trip_message",
    title: "New message",
    body: "Sofia: I booked the table for six",
    tripId: "lisbon",
    data: { messageId: "message-2" },
    createdAt: days(9),
    readAt: days(8.5),
  },
];

export const NOTIFICATIONS: Notification[] = SEEDS.map(
  ({ readAt, ...seed }) => ({ ...seed, readAt: readAt ?? null }),
);
