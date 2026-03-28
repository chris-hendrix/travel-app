import type { PushPayload } from "@journiful/shared/types";

/**
 * Builds a push notification payload from a notification type and data.
 * Maps NotificationType + data → { title, body, url, tag } per the PWA plan.
 */
export function buildPushPayload(
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown> | null,
): PushPayload {
  const tripId = data?.tripId ? String(data.tripId) : "";

  switch (type) {
    case "trip_message":
      return {
        title: title || "New message",
        body: body || "You have a new message",
        url: tripId ? `/trips/${tripId}/messages` : "/",
        tag: tripId ? `msg-${tripId}` : "msg",
      };

    case "trip_update":
      return {
        title: title || "Trip updated",
        body: body || "A trip has been updated",
        url: tripId ? `/trips/${tripId}` : "/",
        tag: tripId ? `update-${tripId}` : "update",
      };

    case "daily_itinerary":
      return {
        title: title || "Today's itinerary",
        body: body || "Check your plans for today",
        url: tripId ? `/trips/${tripId}/itinerary` : "/",
        tag: tripId ? `daily-${tripId}` : "daily",
      };

    case "mutual_invite":
      return {
        title: title || "Trip invitation",
        body: body || "You've been invited to a trip",
        url: tripId ? `/trips/${tripId}` : "/",
        tag: tripId ? `invite-${tripId}` : "invite",
      };

    default:
      return {
        title: title || "Journiful",
        body: body || "You have a new notification",
        url: "/",
        tag: "notification",
      };
  }
}
