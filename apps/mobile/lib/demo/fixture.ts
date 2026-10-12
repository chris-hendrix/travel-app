/**
 * The demo fixture's own writing: the two id spaces it names people in,
 * and the wall clock it stamps rows on.
 *
 * They live here rather than in `lib/demo.ts` — which keeps the three
 * trips, their rosters, their itineraries and their stays — for one
 * structural reason. The ledger's rows are built in `lib/demo/money.ts`
 * and `lib/demo.ts` reads those rows back, so `money.ts` may not import
 * `lib/demo.ts` for them: the two would be a cycle, and a cycle's failure
 * mode here is an undefined binding at the first call rather than a
 * compile error (the same hazard `lib/demo/adapter.ts` documents for
 * itself). This module imports neither, so both read one copy of each
 * helper instead of settling for two.
 *
 * `lib/demo.ts` re-exports the two ids, so every reader of them
 * (`lib/authStore.tsx`, `components/demo/DemoGuard.tsx`, `app/demo.tsx`,
 * the adapter and the session-gate test) still names one place.
 */

/** The viewer's own row. The RSVP control and the roster row share it. */
export const DEMO_VIEWER_MEMBER_ID = "demo-you";

/** The demo session: the anonymous visitor reads as this traveler. */
export const DEMO_AUTH_USER = {
  id: "demo-viewer",
  phoneNumber: "+15550000001",
  displayName: "You",
  profileComplete: true,
} as const;

/**
 * A wall clock on a day, as the instant it names *in the viewer's own
 * zone*: `new Date("…T19:00:00")` with no trailing `Z` is parsed as
 * local time, which is what makes a 19:00 dinner read back as 7:00 PM
 * rather than as 3:00 PM in New York. `lib/newEvent.ts` stamps a real
 * event the same way, off the trip's own zone — there is no trip zone
 * here to read it off, which is the whole point of the demo.
 */
export function atClock(dayIso: string, clock: string): string {
  return new Date(`${dayIso}T${clock}:00`).toISOString();
}

/**
 * The **user** id behind a member row: the account the row belongs to.
 *
 * Two id spaces meet here and are never interchangeable. This returns a
 * user id — what `payments.createdBy` holds — while `payerMemberId` and
 * every `participants[].memberId` are **member** ids. Crossing them is
 * what makes an Edit button appear on somebody else's row. The viewer's
 * user id is `DEMO_AUTH_USER.id`, the account the demo signs in as.
 *
 * Each trip carries the viewer's own row under its own id (row ids are
 * globally unique per D2) and all of them resolve to the same demo user,
 * which is what the RSVP path keys on — hence the prefix test.
 */
export function userIdOf(memberId: string): string {
  const isViewer =
    memberId === DEMO_VIEWER_MEMBER_ID ||
    memberId.startsWith(`${DEMO_VIEWER_MEMBER_ID}-`);
  return isViewer ? DEMO_AUTH_USER.id : `demo-user-${memberId}`;
}
