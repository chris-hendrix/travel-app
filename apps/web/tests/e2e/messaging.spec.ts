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
} from "./helpers/timeouts";
import { dismissToast } from "./helpers/toast";
import { scrollToDiscussion } from "./helpers/messaging";
import { navigateToMobilePanel } from "./helpers/mobile-panels";

/**
 * E2E Journey: Messaging Flows
 *
 * Consolidates 10 messaging scenarios into 2 journey tests.
 * Uses direct API calls for fast setup and authenticateViaAPIWithPhone
 * to switch between users.
 */

test.describe("Messaging Journey", () => {
  test.beforeEach(async ({ page }) => {
    await removeNextjsDevOverlay(page);
    await page.context().clearCookies();
  });

  test(
    "messaging CRUD journey",
    { tag: ["@smoke", "@slow"] },
    async ({ page, request }) => {
      test.slow(); // Multiple auth cycles and polling waits

      // NOTE: The message feed renders newest-first (API returns messages ordered by
      // createdAt DESC). Tests that use .first() on action buttons rely on the most
      // recently posted message appearing at the top of the feed.

      const timestamp = Date.now();
      const organizerPhone = generateUniquePhone();
      const memberPhone = generateUniquePhone();

      let tripId: string;
      let organizerCookie: string;

      await test.step("setup: create organizer, trip, member", async () => {
        organizerCookie = await createUserViaAPI(
          request,
          organizerPhone,
          "Msg Organizer",
        );

        tripId = await createTripViaAPI(request, organizerCookie, {
          name: `Messaging Trip ${timestamp}`,
          destination: "Portland, OR",
          startDate: "2026-08-01",
          endDate: "2026-08-05",
        });

        const memberCookie = await createUserViaAPI(
          request,
          memberPhone,
          "Msg Member",
        );
        await inviteViaAPI(request, tripId, organizerCookie, [memberPhone]);
        await rsvpViaAPI(request, tripId, memberCookie, "going");
      });

      await test.step("navigate to trip and scroll to discussion", async () => {
        await authenticateViaAPIWithPhone(
          page,
          request,
          organizerPhone,
          "Msg Organizer",
        );
        await page.goto(`/trips/${tripId}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
          timeout: NAVIGATION_TIMEOUT,
        });
        await scrollToDiscussion(page);
      });

      await test.step("verify empty state", async () => {
        await expect(page.getByText("No messages yet")).toBeVisible();
      });

      await test.step("post a message and verify it appears", async () => {
        const input = page.getByPlaceholder("Write a message...");
        await input.fill("Hello from the organizer!");
        await page.getByRole("button", { name: "Send message" }).click();

        await expect(
          page.getByRole("feed").getByText("Hello from the organizer!"),
        ).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
        // Empty state should be gone
        await expect(page.getByText("No messages yet")).not.toBeVisible();
        // Feed container should exist
        await expect(page.getByRole("feed")).toBeVisible();
      });

      await test.step("post a second message for edit/delete tests", async () => {
        const input = page.getByPlaceholder("Write a message...");
        await input.fill("This message will be edited then deleted");
        await page.getByRole("button", { name: "Send message" }).click();

        await expect(
          page
            .getByRole("feed")
            .getByText("This message will be edited then deleted"),
        ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      });

      await test.step("verify feed ordering: newest message appears first", async () => {
        // The feed renders newest-first (API: ORDER BY created_at DESC).
        // Verify the second-posted message appears before the first-posted message.
        const articles = page.getByRole("feed").getByRole("article");
        await expect(articles.first()).toContainText(
          "This message will be edited then deleted",
        );
        await expect(articles.last()).toContainText(
          "Hello from the organizer!",
        );
      });

      await snap(page, "40-messaging-two-messages");

      await test.step("react to the first message with heart", async () => {
        // Find "Hello from the organizer!" article (ordering-independent locator)
        const firstMessageCard = page
          .getByRole("feed")
          .getByRole("article")
          .filter({ hasText: "Hello from the organizer!" });

        // Open the reaction picker popover, then select heart
        await firstMessageCard
          .getByRole("button", { name: "Add reaction" })
          .click();
        await page.getByRole("button", { name: "React with heart" }).click();

        // Verify the reaction button appeared with active state
        const heartButton = firstMessageCard.getByRole("button", {
          name: "React with heart",
        });
        await expect(heartButton).toHaveAttribute("aria-pressed", "true", {
          timeout: ELEMENT_TIMEOUT,
        });
        // Verify count shows "1"
        await expect(heartButton.locator("span").last()).toContainText("1");
      });

      await test.step("edit the second message", async () => {
        await dismissToast(page);

        // Scope to the specific message that was edited
        const editMessageCard = page
          .getByRole("feed")
          .getByRole("article")
          .filter({ hasText: "This message will be edited then deleted" });
        const actionsButton = editMessageCard.getByRole("button", {
          name: "Actions for message by Msg Organizer",
        });
        await actionsButton.click();

        await page.getByRole("menuitem", { name: "Edit" }).click();

        // The edit textarea should appear inside the feed (not the compose input)
        const editTextarea = page.getByRole("feed").getByRole("textbox");
        await expect(editTextarea).toBeVisible();

        await editTextarea.clear();
        await editTextarea.fill("This message has been edited");
        await page.getByRole("button", { name: "Save" }).click();

        // Verify "(edited)" indicator appears
        await expect.soft(page.getByText("(edited)")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
        await expect(
          page.getByRole("feed").getByText("This message has been edited"),
        ).toBeVisible();
      });

      await test.step("delete the second message", async () => {
        await dismissToast(page);

        // Scope to the edited message
        const editedMessageCard = page
          .getByRole("feed")
          .getByRole("article")
          .filter({ hasText: "This message has been edited" });
        const actionsButton = editedMessageCard.getByRole("button", {
          name: "Actions for message by Msg Organizer",
        });
        await actionsButton.click();

        await page.getByRole("menuitem", { name: "Delete" }).click();

        // Confirm delete dialog
        await expect(
          page.getByRole("heading", { name: "Delete message?" }),
        ).toBeVisible();
        // Click the Delete button in the alert dialog (not the menu item)
        await page.getByRole("button", { name: "Delete" }).last().click();

        // Verify "This message was deleted" placeholder
        await expect(
          page.getByRole("feed").getByText("This message was deleted"),
        ).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
        await expect(
          page.getByRole("feed").getByText("This message has been edited"),
        ).not.toBeVisible();
      });

      await test.step("reply to the first message", async () => {
        await dismissToast(page);

        // Scope the Reply button to the "Hello from the organizer!" message
        const firstMessageCard = page
          .getByRole("feed")
          .getByRole("article")
          .filter({ hasText: "Hello from the organizer!" });
        const replyButton = firstMessageCard.getByRole("button", {
          name: "Reply",
        });
        await replyButton.click();

        // The reply input should appear
        const replyInput = page.getByPlaceholder("Write a reply...");
        await expect(replyInput).toBeVisible();

        await replyInput.fill("This is a reply to the first message");
        // Find the send button within the reply area (icon button)
        const sendButtons = page.getByRole("button", { name: "Send message" });
        await sendButtons.last().click();

        // Verify the reply text appears in a rendered paragraph (not the textarea)
        await expect(
          page
            .getByRole("feed")
            .locator("p")
            .getByText("This is a reply to the first message"),
        ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      });

      await snap(page, "41-messaging-after-crud");
    },
  );

  test(
    "organizer actions journey",
    { tag: ["@regression", "@slow"] },
    async ({ page, request }) => {
      test.slow(); // Multiple auth cycles

      const timestamp = Date.now();
      const organizerPhone = generateUniquePhone();
      const memberPhone = generateUniquePhone();

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
          name: `Organizer Actions Trip ${timestamp}`,
          destination: "Seattle, WA",
          startDate: "2026-09-01",
          endDate: "2026-09-05",
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
        await page.goto(`/trips/${tripId}`);
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

      await test.step("pin the member message", async () => {
        await dismissToast(page);

        const actionsButton = page.getByRole("button", {
          name: "Actions for message by Regular Member",
        });
        await actionsButton.click();

        await page.getByRole("menuitem", { name: "Pin" }).click();

        // Verify pinned section appears
        await expect(page.getByText(/Pinned \(1\)/)).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await test.step("expand pinned section and verify content", async () => {
        // Click the pinned toggle to expand
        const pinnedToggle = page
          .locator("button[aria-expanded]")
          .filter({ hasText: /Pinned/ });
        await pinnedToggle.click();

        // Verify pinned message content is visible inside the section
        const pinnedSection = page.getByTestId("pinned-messages");
        await expect(
          pinnedSection.getByText("Hello from the member!"),
        ).toBeVisible();
      });

      await snap(page, "42-messaging-pinned");

      await test.step("unpin the message", async () => {
        await dismissToast(page);

        const actionsButton = page.getByRole("button", {
          name: "Actions for message by Regular Member",
        });
        await actionsButton.click();

        await page.getByRole("menuitem", { name: "Unpin" }).click();

        // Verify pinned section disappears
        await expect(page.getByText(/Pinned \(\d+\)/)).not.toBeVisible({
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

      await test.step("organizer mutes the member via members dialog", async () => {
        await dismissToast(page);

        // On mobile the members count is in the Home/Info panel, not the Messages panel.
        await navigateToMobilePanel(page, "Home");

        // Open members dialog
        await page.getByText(/\d+ members?/).click();

        const dialog = page.getByRole("dialog");
        await expect(
          dialog.getByRole("heading", { name: "Members" }),
        ).toBeVisible();

        // Find and click the actions button for the member
        await page
          .getByRole("button", { name: "Actions for Regular Member" })
          .click();
        await page.getByRole("menuitem", { name: "Mute" }).click();

        // Confirm mute in the dialog
        await expect(page.getByRole("heading", { name: /Mute/ })).toBeVisible();
        // Click the destructive "Mute" button in the alert dialog
        await page
          .getByRole("button", { name: "Mute", exact: true })
          .last()
          .click();

        // Verify toast
        await expect(
          page.getByText(/Regular Member has been muted/),
        ).toBeVisible({ timeout: ELEMENT_TIMEOUT });

        // Verify "Muted" badge appears in the dialog
        await expect(dialog.getByText("Muted")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await snap(page, "43-messaging-member-muted");
    },
  );
});
