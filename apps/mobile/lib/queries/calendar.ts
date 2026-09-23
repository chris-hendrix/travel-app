/**
 * The account's calendar feed: one row per member, holding the token that
 * makes `GET /calendar/:token.ics` theirs.
 *
 * The feed URL is a bearer secret with no expiry: anyone holding it can
 * read the trips, so the profile screen offers both ways to take it
 * back — disabling (the URL stops working) and regenerating (a new URL
 * that breaks every existing subscription). Enabling is idempotent
 * server-side: it hands back the existing token if there is one, which is
 * why the profile screen can call it on every press instead of reading
 * the status first and racing itself.
 */

import { apiFetch } from "@/lib/api";

/**
 * Inline mirror of `calendarEnableResponseSchema`
 * (`shared/schemas/calendar.ts`). zod is not a mobile dep, so the shape is
 * declared here, as the notifications and events queries do.
 */
export type CalendarEnableResponse = {
  success: true;
  calendarUrl: string;
  calendarToken: string;
};

/** `POST /users/me/calendar`. Returns the feed's URL, and its token. */
export async function enableCalendar(): Promise<CalendarEnableResponse> {
  return apiFetch<CalendarEnableResponse>("/users/me/calendar", {
    method: "POST",
  });
}

/**
 * `DELETE /users/me/calendar`. Revokes the feed: the old URL stops
 * working, and no new one is issued.
 */
export async function disableCalendar(): Promise<{ success: true }> {
  return apiFetch<{ success: true }>("/users/me/calendar", {
    method: "DELETE",
  });
}

/**
 * `POST /users/me/calendar/regenerate`. Issues a new feed URL and
 * invalidates the old one, so every existing subscription breaks and
 * must be set up again from the new link.
 */
export async function regenerateCalendar(): Promise<CalendarEnableResponse> {
  return apiFetch<CalendarEnableResponse>("/users/me/calendar/regenerate", {
    method: "POST",
  });
}
