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
import { removeNextjsDevOverlay, dismissPwaPrompts } from "./helpers/nextjs-dev";
import {
  API_BASE,
  NAVIGATION_TIMEOUT,
  ELEMENT_TIMEOUT,
} from "./helpers/timeouts";
import { dismissToast } from "./helpers/toast";
import { scrollToDiscussion } from "./helpers/messaging";

/**
 * E2E Journey: Messaging Flows
 *
 * Covers only E2E-critical flows: send+receive (cross-user visibility)
 * and organizer action (delete member message). All other messaging behavior
 * (empty state, reactions, edit, delete, reply, pin, expand, unpin, mute)
 * is covered by RTL component integration and service-level tests.
 */

test.describe("Messaging Journey", () => {
  test.beforeEach(async ({ page }) => {
    await removeNextjsDevOverlay(page);
    await dismissPwaPrompts(page);
    await page.context().clearCookies();
  });

  test(
    "send and receive message flow",
    { tag: ["@smoke", "@slow"] },
    async ({ page, request }) => {
      test.slow();

      const timestamp = Date.now();
      const organizerPhone = generateUniquePhone();
      const memberPhone = generateUniquePhone();

      // Dynamic future dates — trip must not be locked for messaging to work
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() + 1);
      const end = new Date(today);
      end.setDate(end.getDate() + 5);
      const startDate = start.toISOString().split("T")[0];
      const endDate = end.toISOString().split("T")[0];

      let tripId: string;
      let organizerCookie: string;

      await test.step("setup: create organizer, trip, member", async () => {
        organizerCookie = await createUserViaAPI(
          request,
          organizerPhone,
          "Msg Organizer",
        );

        tripId = await createTripViaAPI(request, organizerCookie, {
          name: `Msg Flow ${timestamp}`,
          destination: "Portland, OR",
          startDate,
          endDate,
        });

        const memberCookie = await createUserViaAPI(
          request,
          memberPhone,
          "Msg Member",
        );
        await inviteViaAPI(request, tripId, organizerCookie, [memberPhone]);
        await rsvpViaAPI(request, tripId, memberCookie, "going");
      });

      await test.step("organizer navigates to trip and scrolls to discussion", async () => {
        await authenticateViaAPIWithPhone(
          page,
          request,
          organizerPhone,
          "Msg Organizer",
        );
        await page.goto(`/trips?id=${tripId}`, { waitUntil: "networkidle" });
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
          timeout: NAVIGATION_TIMEOUT,
        });
        await scrollToDiscussion(page);
      });

      await test.step("organizer posts a message and sees it appear", async () => {
        const input = page.getByPlaceholder("Write a message...");
        await input.fill("Hello from the organizer!");
        await page.getByRole("button", { name: "Send message" }).click();

        await expect(
          page.getByRole("feed").getByText("Hello from the organizer!"),
        ).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
        await expect(page.getByRole("feed")).toBeVisible();
      });

      await test.step("member sees the message (cross-user visibility)", async () => {
        await authenticateViaAPIWithPhone(
          page,
          request,
          memberPhone,
          "Msg Member",
        );
        await page.goto(`/trips?id=${tripId}`, { waitUntil: "networkidle" });
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
          timeout: NAVIGATION_TIMEOUT,
        });
        await scrollToDiscussion(page);

        await expect(
          page.getByRole("feed").getByText("Hello from the organizer!"),
        ).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });
    },
  );

  test(
    "organizer deletes member message",
    { tag: ["@regression", "@slow"] },
    async ({ page, request }) => {
      test.slow();

      const timestamp = Date.now();
      const organizerPhone = generateUniquePhone();
      const memberPhone = generateUniquePhone();

      // Dynamic future dates — trip must not be locked for messaging to work
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() + 1);
      const end = new Date(today);
      end.setDate(end.getDate() + 5);
      const startDate = start.toISOString().split("T")[0];
      const endDate = end.toISOString().split("T")[0];

      let tripId: string;
      let organizerCookie: string;
      let memberCookie: string;

      await test.step("setup: create organizer, trip, member with message", async () => {
        organizerCookie = await createUserViaAPI(
          request,
          organizerPhone,
          "Org Admin",
        );

        tripId = await createTripViaAPI(request, organizerCookie, {
          name: `Org Actions Trip ${timestamp}`,
          destination: "Seattle, WA",
          startDate,
          endDate,
        });

        memberCookie = await createUserViaAPI(
          request,
          memberPhone,
          "Regular Member",
        );
        await inviteViaAPI(request, tripId, organizerCookie, [memberPhone]);
        await rsvpViaAPI(request, tripId, memberCookie, "going");

        // Member posts a message via API
        const msgResponse = await request.post(
          `${API_BASE}/trips/${tripId}/messages`,
          {
            data: { content: "Hello from the member!" },
            headers: { cookie: memberCookie },
          },
        );
        expect(msgResponse.ok()).toBeTruthy();
      });

      await test.step("organizer navigates to trip and sees member message", async () => {
        await authenticateViaAPIWithPhone(
          page,
          request,
          organizerPhone,
          "Org Admin",
        );
        await page.goto(`/trips?id=${tripId}`, { waitUntil: "networkidle" });
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
          timeout: NAVIGATION_TIMEOUT,
        });
        await scrollToDiscussion(page);

        await expect(
          page.getByRole("feed").getByText("Hello from the member!"),
        ).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await test.step("organizer deletes the member message", async () => {
        await dismissToast(page);

        const actionsButton = page.getByRole("button", {
          name: "Actions for message by Regular Member",
        });
        await actionsButton.click();

        await page.getByRole("menuitem", { name: "Delete" }).click();

        // Confirm in dialog
        await expect(
          page.getByRole("heading", { name: "Delete message?" }),
        ).toBeVisible();
        await page.getByRole("button", { name: "Delete" }).last().click();

        // Verify deleted placeholder
        await expect(
          page.getByRole("feed").getByText("This message was deleted"),
        ).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
        await expect(
          page.getByRole("feed").getByText("Hello from the member!"),
        ).not.toBeVisible();
      });
    },
  );
});
