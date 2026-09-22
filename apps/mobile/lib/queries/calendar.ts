/**
 * The account's calendar feed: one row per member, holding the token that
 * makes `GET /calendar/:token.ics` theirs.
 *
 * Only `enable` is here. The API also disables and regenerates the token
 * (`DELETE` and `POST /users/me/calendar/regenerate`), and neither has a
 * screen yet, so neither has a client — a function nobody calls is a
 * promise the code is keeping for nobody. Enabling is idempotent
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
