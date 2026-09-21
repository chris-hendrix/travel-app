import type { Trip } from "@/components/trip/TripCard";
import { daysBetween } from "@/lib/countdown";
import { toIso } from "@/lib/dateRange";

/**
 * What a notification is about — the API's own vocabulary, verbatim.
 *
 * Which of these the server can actually produce today:
 *   mutual_invite  invitation.service  userId invitee
 *   sms_invite     invitation.service  phone invitee, auto-added
 *   trip_message   message.service     top-level message only
 *   daily_itinerary  daily-itineraries.worker
 *   trip_update    nothing yet — declared, handled by the push payload
 *                  builder, and what an itinerary change should raise
 *
 * The two invites read the same in the UI; the split is about how the
 * person was reached, not about what they see.
 */
export type NotificationType =
  | "daily_itinerary"
  | "trip_message"
  | "trip_update"
  | "mutual_invite"
  | "sms_invite";

/**
 * A notification as the API returns it: `GET /notifications` selects
 * these columns and nothing else. There is no trip name and no cover in
 * the payload — only `tripId`, which the client resolves against the
 * trips it already has. `userId` is omitted because a notification is
 * always the caller's own.
 */
export type Notification = {
  id: string;
  type: NotificationType;
  /**
   * The push headline ("Trip invitation", "New message"). Not rendered
   * in the list: the row's eyebrow comes from `type`, which is stable,
   * while this line belongs to the OS notification.
   */
  title: string;
  /** The message the row actually shows. */
  body: string;
  tripId: string | null;
  /** Type-specific payload: inviterId, messageId, referenceId, … */
  data: Record<string, unknown> | null;
  /** ISO datetime, or null while unread. */
  readAt: string | null;
  /** ISO datetime. */
  createdAt: string;
};

/** Newest first, whatever the read state. */
export function newestFirst(notifications: Notification[]): Notification[] {
  return [...notifications].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function unreadCount(notifications: Notification[]): number {
  return notifications.reduce(
    (count, notification) => (notification.readAt === null ? count + 1 : count),
    0,
  );
}

/**
 * The trip a notification is about, out of the trips already on hand.
 * The API sends a bare `tripId`, so the cover and the trip name are the
 * client's lookup — and a notification with no trip (or one this user
 * has since left) simply has none.
 */
export function tripFor(
  trips: Trip[],
  notification: Notification,
): Trip | undefined {
  if (!notification.tripId) return undefined;
  return trips.find((trip) => trip.id === notification.tripId);
}

/**
 * How long ago, in the app's verbal style: cards say "in 5 days", so a
 * row says "3 hours ago" rather than a bare timestamp.
 *
 * Days are calendar days, so late last night reads as "yesterday"
 * instead of "12 hours ago".
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) {
    return minutes === 1 ? "a minute ago" : `${minutes} minutes ago`;
  }

  const days = daysBetween(toIso(then), toIso(now));
  if (days === 0) {
    const hours = Math.floor(minutes / 60);
    return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  }
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 35) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return months === 1 ? "last month" : `${months} months ago`;
  }
  return "over a year ago";
}
