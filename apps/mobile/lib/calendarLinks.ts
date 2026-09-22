/**
 * Turning the feed's own URL into the two links that subscribe to it.
 *
 * The API hands back `webcal://<host>/api/calendar/<token>.ics`
 * (`apps/api/src/controllers/calendar.controller.ts`), and that is
 * already the right thing to hand Apple: `webcal:` is the scheme the
 * Calendar app claims, so opening it raises its own "Subscribe?" sheet
 * rather than downloading a file. Google has no such scheme — its
 * calendar is a web app — so it takes the same URL as a parameter to a
 * URL of its own, and that is the one transformation here.
 *
 * Both are pure and both are tested: a link built wrong fails silently
 * (a tab that opens on nothing), which is the kind of thing that is only
 * ever caught by reading the string.
 */

/** Where Google Calendar's "add by URL" form lives. */
const GOOGLE_ADD = "https://calendar.google.com/calendar/render?cid=";

/**
 * The feed, as a link that subscribes to it in Google Calendar.
 *
 * Percent-encoded whole, query string and all: Google reads the value of
 * `cid` as one URL, and it takes a `webcal:` one — that is how its own
 * "Add calendar → From URL" produces the link.
 */
export function googleCalendarUrl(feedUrl: string): string {
  return `${GOOGLE_ADD}${encodeURIComponent(feedUrl)}`;
}

/**
 * The feed, as a link Apple's Calendar claims.
 *
 * Already `webcal:` from the server, and this makes the scheme this
 * client's business rather than the server's habit: an https feed URL
 * handed to Apple downloads a file instead of offering a subscription,
 * and the failure looks like a working download.
 */
export function appleCalendarUrl(feedUrl: string): string {
  if (feedUrl.startsWith("webcal://")) return feedUrl;
  return `webcal://${feedUrl.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")}`;
}
