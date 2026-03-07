import { test, expect } from "@playwright/test";
import {
  authenticateViaAPIWithPhone,
  createUserViaAPI,
  generateUniquePhone,
} from "./helpers/auth";
import {
  createTripViaAPI,
  inviteViaAPI,
  rsvpViaAPI,
} from "./helpers/invitations";
import { removeNextjsDevOverlay } from "./helpers/nextjs-dev";
import { snap } from "./helpers/screenshots";
import {
  API_BASE,
  NAVIGATION_TIMEOUT,
  ELEMENT_TIMEOUT,
  DIALOG_TIMEOUT,
} from "./helpers/timeouts";

/**
 * E2E Journey: Notification Flows
 *
 * Tests the complete notification lifecycle: global bell, dropdown,
 * click-to-navigate, per-trip bell, and mark-all-as-read.
 * Notifications are created by posting messages (which triggers
 * notifyTripMembers for all other "going" members).
 */

test.describe("Notification Journey", () => {
  test.beforeEach(async ({ page }) => {
    await removeNextjsDevOverlay(page);
    await page.context().clearCookies();
  });

  test(
    "notification flow",
    { tag: ["@smoke", "@slow"] },
    async ({ page, request }) => {
      test.slow(); // Multiple auth cycles and polling waits

      const timestamp = Date.now();
      const organizerPhone = generateUniquePhone();
      const memberPhone = generateUniquePhone();

      let tripId: string;
      let organizerCookie: string;

      await test.step("setup: create users, trip, and seed 3 notifications", async () => {
        organizerCookie = await createUserViaAPI(
          request,
          organizerPhone,
          "Alice",
        );

        tripId = await createTripViaAPI(request, organizerCookie, {
          name: `Notif Trip ${timestamp}`,
          destination: "Portland, OR",
          startDate: "2026-06-15",
          endDate: "2026-06-22",
        });

        const memberCookie = await createUserViaAPI(
          request,
          memberPhone,
          "Bob",
        );
        await inviteViaAPI(request, tripId, organizerCookie, [memberPhone]);
        await rsvpViaAPI(request, tripId, memberCookie, "going");

        // Post 2 messages to create 2 notifications for Bob
        const msg1Response = await request.post(
          `${API_BASE}/trips/${tripId}/messages`,
          {
            data: { content: "First message from Alice" },
            headers: { cookie: organizerCookie },
          },
        );
        expect(msg1Response.ok()).toBeTruthy();

        const msg2Response = await request.post(
          `${API_BASE}/trips/${tripId}/messages`,
          {
            data: { content: "Second message from Alice" },
            headers: { cookie: organizerCookie },
          },
        );
        expect(msg2Response.ok()).toBeTruthy();

        // Poll until all notifications are ready (1 sms_invite + 2 trip_message = 3)
        await expect
          .poll(
            async () => {
              const res = await request.get(
                `${API_BASE}/trips/${tripId}/notifications/unread-count`,
                { headers: { cookie: memberCookie } },
              );
              const json = await res.json();
              return json.count;
            },
            {
              timeout: NAVIGATION_TIMEOUT,
              message: "Waiting for 3 unread notifications",
            },
          )
          .toBe(3);
      });

      await test.step("authenticate as member and navigate to trips", async () => {
        await authenticateViaAPIWithPhone(page, request, memberPhone, "Bob");
      });

      await test.step("verify global notification bell shows 3 unread", async () => {
        await page.reload();
        await page.waitForLoadState("domcontentloaded");

        const bell = page.getByRole("button", {
          name: /Notifications, 3 unread/,
        });
        await expect(bell).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
      });

      await test.step("click bell and verify dropdown with notifications", async () => {
        const bell = page.getByRole("button", {
          name: /Notifications, 3 unread/,
        });
        await bell.click();

        await expect(
          page.getByRole("heading", { name: "Notifications" }),
        ).toBeVisible({ timeout: ELEMENT_TIMEOUT });

        await expect(page.getByText("New message").first()).toBeVisible();
        await expect
          .soft(page.getByText(/Alice:.*First message from Alice/))
          .toBeVisible();

        const notificationItems = page
          .locator("button")
          .filter({ hasText: "New message" });
        await expect(notificationItems).toHaveCount(2, {
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await snap(page, "50-notification-bell-dropdown");

      await test.step("click notification and verify navigation to trip", async () => {
        const notificationItem = page
          .locator("button")
          .filter({ hasText: "New message" })
          .first();
        await notificationItem.click();

        await page.waitForURL(`**/trips/${tripId}**`, {
          timeout: NAVIGATION_TIMEOUT,
        });
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
          timeout: NAVIGATION_TIMEOUT,
        });
      });

      await snap(page, "51-notification-after-click");

      await test.step("verify global bell shows 2 unread after reading one", async () => {
        // After clicking one notification, the global bell should show 2 remaining
        const bell = page.getByRole("button", {
          name: /Notifications, 2 unread/,
        });
        await expect(bell).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
      });

      await test.step("mark all as read via global bell", async () => {
        const bell = page.getByRole("button", {
          name: /Notifications, 2 unread/,
        });
        await bell.click();

        await expect(
          page.getByRole("heading", { name: "Notifications" }),
        ).toBeVisible({ timeout: ELEMENT_TIMEOUT });

        const markAllButton = page.getByRole("button", {
          name: "Mark all as read",
        });
        await expect(markAllButton).toBeVisible();
        await markAllButton.click();
      });

      await snap(page, "52-notification-mark-all-read");

      await test.step("verify global bell reflects zero unread", async () => {
        // Close the popover by pressing Escape
        await page.keyboard.press("Escape");

        const globalBell = page.getByRole("button", {
          name: "Notifications",
          exact: true,
        });
        await expect(globalBell).toBeVisible({ timeout: ELEMENT_TIMEOUT });

        await expect(
          page.getByRole("button", {
            name: /Notifications, \d+ unread/,
          }),
        ).not.toBeVisible();
      });
    },
  );
});
