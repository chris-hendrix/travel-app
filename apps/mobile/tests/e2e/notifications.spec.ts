/**
 * E2E: Notifications (mobile) — Phase 7, Task 5.
 *
 * Bell badge → center → tap → marked read, plus mark-all-read.
 *
 * NOTIFICATION-SEEDING TRIGGER (no helper exists; no backend changes
 * per the plan): an organizer invites the phone number of an already
 * registered user through the real batch endpoint
 * (`POST /api/trips/:tripId/invitations` with
 * `{phoneNumbers: [phone], userIds: []}`). Server-side, an invited
 * phone that belongs to an existing user is auto-added as a member
 * (`apps/api/src/services/invitation.service.ts:372-390`, the
 * `phoneAutoAddedUserIds` push) and each auto-added id gets a
 * `sms_invite` row via `notificationService.createNotification`
 * (`invitation.service.ts:732-744`: type `sms_invite`, title
 * `"Trip invitation"`, body `` `${inviter} invited you to ${trip}` ``).
 * The invite POST awaits the insert, so the notification exists as
 * soon as the seeding request returns. Ordering matters: the guest
 * user must be seeded FIRST, then invited — inviting an unknown number
 * leaves a pending invitation with no user and no notification.
 *
 * WHAT "TAP → NAVIGATE" MEANS HERE: the plan's shorthand says
 * "tap → navigate → marked read", but `app/notifications.tsx` wires
 * `onPress` to `markRead` only ("Tapping should open the trip it is
 * about and then mark it read. Trip detail does not exist yet, so for
 * now it only marks read."). There is no navigation to drive and the
 * plan forbids building UI, so the spec asserts the implemented half:
 * tap → marked read (row read server-side, badge count drops),
 * documented here rather than silently narrowed.
 *
 * SELECTOR NOTES (every selector names its screen match):
 * - The header bell (`components/ui/AppHeader.tsx` `BellButton`) is a
 *   Pressable with `aria-label="Notifications"` and NO role, so
 *   `getByRole` cannot match it — `getByLabel("Notifications")`, the
 *   same justified exception the trip spec uses for the icon-only
 *   DatePicker arrows. The unread dot itself is a bare View with no
 *   text or role, so the badge COUNT is asserted through its backing
 *   query (`GET /notifications/unread-count`, the exact endpoint
 *   `unreadCountOptions` reads) via `expect.poll`, not through the
 *   dot's paint (class assertions are banned).
 * - `NotificationRow` (`components/notification/NotificationRow.tsx`)
 *   is a Pressable with NO role — rows are tapped via their body text
 *   (`getByText(body)`), which bubbles to the row's `onPress`.
 * - Read state has no text or role signal either (weight + strawberry
 *   edge only), so "marked read" is asserted server-side: the row's
 *   `readAt` in `GET /notifications` plus the unread-count drop.
 * - `getByRole("button", { name: "Mark all read" })` is the
 *   FullscreenDialog primary action (`app/notifications.tsx`
 *   `primaryTitle="Mark all read"` → ActionBar → Button).
 */

import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  AUTH_TOKEN_KEY,
  generateUniquePhone,
  seedUserViaAPI,
} from "./helpers/auth";
import {
  API_BASE,
  ELEMENT_TIMEOUT,
  NAVIGATION_TIMEOUT,
  SLOW_NAVIGATION_TIMEOUT,
} from "./helpers/timeouts";

const HOST_NAME = "Notify Host";
const GUEST_NAME = "Notify Guest";

function isoIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Seed a trip through the real create endpoint. Returns the trip id. */
async function seedTripViaAPI(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<string> {
  const res = await request.post(`${API_BASE}/trips`, {
    data: {
      name,
      destination: "Mallorca, Spain",
      timezone: "America/Chicago",
      startDate: isoIn(30),
      endDate: isoIn(35),
    },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`create-trip failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { trip: { id: string } };
  return body.trip.id;
}

/**
 * Invite one number through the real batch endpoint. When the number
 * belongs to a registered user the server auto-adds them AND emits the
 * `sms_invite` notification (see file header) — no return value needed.
 */
async function seedInviteViaAPI(
  request: APIRequestContext,
  organizerToken: string,
  tripId: string,
  guestPhone: string,
): Promise<void> {
  // POST /api/trips/:tripId/invitations — the batch shape
  // {phoneNumbers, userIds} (lib/queries/invitations.ts:invite).
  const res = await request.post(`${API_BASE}/trips/${tripId}/invitations`, {
    data: { phoneNumbers: [guestPhone], userIds: [] },
    headers: { Authorization: `Bearer ${organizerToken}` },
  });
  if (!res.ok()) {
    throw new Error(
      `create-invitations failed: ${res.status()} ${await res.text()}`,
    );
  }
}

async function seedPageWithToken(page: Page, token: string): Promise<void> {
  // Same mechanic as authenticateViaAPI (helpers/auth.ts): write
  // `journiful.authToken` into localStorage before the app boots; the
  // guard keeps sign-out working. Local copy because the invitation
  // spec's identical helper is file-private.
  await page.addInitScript(
    ({ key, value }) => {
      try {
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, value);
        }
      } catch {
        // Private-mode storage failure: the app treats a missing token
        // as signed-out, so the spec fails at its guard assertion
        // rather than here.
      }
    },
    { key: AUTH_TOKEN_KEY, value: token },
  );
}

type NotificationRow = {
  id: string;
  tripId: string | null;
  title: string;
  body: string;
  readAt: string | null;
};

async function listNotifications(
  request: APIRequestContext,
  token: string,
): Promise<NotificationRow[]> {
  // GET /notifications — the exact endpoint notificationsListOptions
  // reads (lib/queries/notifications.ts); `.notifications` is the wire
  // field the queryFn unwraps.
  const res = await request.get(`${API_BASE}/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(
      `list-notifications failed: ${res.status()} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { notifications: NotificationRow[] };
  return body.notifications;
}

async function unreadCount(
  request: APIRequestContext,
  token: string,
): Promise<number> {
  // GET /notifications/unread-count — the exact endpoint
  // unreadCountOptions reads; the wire field is `count`.
  const res = await request.get(`${API_BASE}/notifications/unread-count`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(
      `unread-count failed: ${res.status()} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { count: number };
  return body.count;
}

test.describe("Notifications", () => {
  test("bell badge → center → tap marks read → mark-all-read persists", async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const tripA = `E2E Notify A ${stamp}`;
    const tripB = `E2E Notify B ${stamp}`;
    // invitation.service.ts:737-741 — body is the inviter display name
    // + the FULL trip name (truncation is SMS-only).
    const bodyA = `${HOST_NAME} invited you to ${tripA}`;
    const bodyB = `${HOST_NAME} invited you to ${tripB}`;
    let guestToken: string;
    let guestPhone: string;

    await test.step("guest registers first, then is invited to two trips", async () => {
      // Guest-first ordering is load-bearing (see file header): only
      // an existing user's number produces the sms_invite row.
      guestPhone = generateUniquePhone();
      ({ token: guestToken } = await seedUserViaAPI(
        request,
        guestPhone,
        GUEST_NAME,
      ));
      const { token: orgToken } = await seedUserViaAPI(
        request,
        generateUniquePhone(),
        HOST_NAME,
      );
      const tripIdA = await seedTripViaAPI(request, orgToken, tripA);
      const tripIdB = await seedTripViaAPI(request, orgToken, tripB);
      await seedInviteViaAPI(request, orgToken, tripIdA, guestPhone);
      await seedInviteViaAPI(request, orgToken, tripIdB, guestPhone);
      // The invite POST awaits createNotification, but poll anyway so
      // a slow insert reads as a wait, not a flake.
      await expect
        .poll(() => unreadCount(request, guestToken), {
          timeout: ELEMENT_TIMEOUT,
        })
        .toBe(2);
    });

    await test.step("bell badge: the header bell renders with 2 unread behind it", async () => {
      await seedPageWithToken(page, guestToken);
      await page.goto("/trips");
      // app/trips/index.tsx: the "With trips"/"Empty" toggle row is
      // always rendered, so it proves the list screen mounted (same
      // mount proof the trip spec uses). The guest is a member of two
      // trips now, so the list is non-empty.
      await expect(page.getByText("With trips")).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      // components/ui/AppHeader.tsx BellButton: Pressable with
      // aria-label="Notifications" and no role — getByLabel is the
      // only accessible selector (trip-spec DatePicker exception
      // pattern). The strawberry dot it paints for unreadCount > 0
      // carries no text or role, so the count behind the badge is
      // asserted through the badge's own backing query.
      await expect(page.getByLabel("Notifications")).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
      await expect
        .poll(() => unreadCount(request, guestToken), {
          timeout: ELEMENT_TIMEOUT,
        })
        .toBe(2);
    });

    await test.step("center lists both invitation notifications", async () => {
      // components/ui/AppHeader.tsx: the bell links to
      // /notifications; clicking it exercises the real chrome path
      // rather than a bare goto.
      await page.getByLabel("Notifications").click();
      await page.waitForURL("**/notifications", {
        timeout: NAVIGATION_TIMEOUT,
      });
      // app/notifications.tsx: FullscreenDialog title="Notifications".
      await expect(page.getByText("Notifications").first()).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
      // components/notification/NotificationRow.tsx: the server's
      // title is the eyebrow, its body the message — both rows render
      // off the wire.
      await expect(page.getByText(bodyA)).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
      await expect(page.getByText(bodyB)).toBeVisible();
    });

    await test.step("tap one notification → it is marked read, count drops", async () => {
      // NotificationRow is a role-less Pressable: tap via its body
      // text (bubbles to onPress → markRead → PATCH
      // /notifications/:id/read).
      await page.getByText(bodyA).click();
      // Server-side read proof: the row's readAt is stamped. Scoped
      // by body text so the sibling row cannot satisfy the poll.
      await expect
        .poll(
          async () =>
            (await listNotifications(request, guestToken)).find(
              (n) => n.body === bodyA,
            )?.readAt ?? null,
          { timeout: ELEMENT_TIMEOUT },
        ).not.toBeNull();
      // Badge backing query drops 2 → 1.
      await expect
        .poll(() => unreadCount(request, guestToken), {
          timeout: ELEMENT_TIMEOUT,
        })
        .toBe(1);
    });

    await test.step("mark-all-read clears the rest", async () => {
      // app/notifications.tsx primaryTitle="Mark all read" →
      // ActionBar → Button (accessibilityRole="button" with the title
      // as its name, per components/ui/Button.tsx).
      await page.getByRole("button", { name: "Mark all read" }).click();
      // PATCH /notifications/read-all answers {success:true} with no
      // entity; the store paints optimistically and invalidates. Poll
      // the backing query so the click is proven server-side.
      await expect
        .poll(() => unreadCount(request, guestToken), {
          timeout: ELEMENT_TIMEOUT,
        })
        .toBe(0);
      // The notifications screen uses the title variant of AppHeader
      // (title="Notifications"), which carries no bell — so the bell
      // is re-asserted back on /trips, where the app-chrome variant
      // renders BellButton. The dot itself has no text/role (see file
      // header); the zero count above is the badge assertion, the
      // bell's presence the chrome-still-mounted proof. While loading
      // the badge shows nothing (BellButton: `data ?? 0`, dot only
      // when > 0).
      await page.goto("/trips");
      await expect(page.getByLabel("Notifications")).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
    });

    await test.step("reload: read state persisted server-side", async () => {
      // Reload re-fetches list + count from the server (the seeded
      // token survives in localStorage), so a zero count proves the
      // reads landed in the database rather than in the optimistic
      // cache. Both rows remain listed (read rows are not removed),
      // and the empty-state copy stays absent.
      await page.goto("/notifications");
      await expect(page.getByText("Notifications").first()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      // A full reload re-fetches list + count from the server (see below).
      await page.reload();
      await expect(page.getByText("Notifications").first()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(page.getByText(bodyA)).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
      await expect(page.getByText(bodyB)).toBeVisible();
      await expect
        .poll(() => unreadCount(request, guestToken), {
          timeout: SLOW_NAVIGATION_TIMEOUT,
        })
        .toBe(0);
      const rows = await listNotifications(request, guestToken);
      expect(rows.filter((n) => n.readAt === null)).toEqual([]);
    });
  });
});
