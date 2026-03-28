import { test, expect } from "@playwright/test";
import { authenticateViaAPIWithPhone, createUserViaAPI } from "./helpers/auth";
import { removeNextjsDevOverlay, dismissPwaPrompts } from "./helpers/nextjs-dev";
import { snap } from "./helpers/screenshots";
import { createTripViaAPI, inviteAndAcceptViaAPI } from "./helpers/invitations";
import {
  NAVIGATION_TIMEOUT,
  ELEMENT_TIMEOUT,
  DIALOG_TIMEOUT,
  TOAST_TIMEOUT,
} from "./helpers/timeouts";
import { dismissToast } from "./helpers/toast";

test.describe("Mutuals Journey", () => {
  test.beforeEach(async ({ page }) => {
    await removeNextjsDevOverlay(page);
    await dismissPwaPrompts(page);
    await page.context().clearCookies();
  });

  test(
    "view mutuals page and invite mutual from trip dialog",
    { tag: "@regression" },
    async ({ page, request }) => {
      test.slow();

      const timestamp = Date.now();
      const shortTimestamp = timestamp.toString().slice(-10);
      const userAPhone = `+1555${shortTimestamp}`;
      const userBPhone = `+1555${(parseInt(shortTimestamp) + 7000).toString()}`;

      // Setup: Create User A and User B, establish mutual relationship
      const userACookie = await createUserViaAPI(
        request,
        userAPhone,
        "User Alpha",
      );

      const trip1Id = await createTripViaAPI(request, userACookie, {
        name: `Mutual Trip ${timestamp}`,
        destination: "Seattle, WA",
        startDate: "2026-12-10",
        endDate: "2026-12-14",
      });

      // Invite User B and have them accept — now A and B are mutuals
      await inviteAndAcceptViaAPI(
        request,
        trip1Id,
        userAPhone,
        userBPhone,
        "User Bravo",
        userACookie,
      );

      // Create Trip 2 for testing mutual invite
      const trip2Id = await createTripViaAPI(request, userACookie, {
        name: `Invite Test Trip ${timestamp}`,
        destination: "Austin, TX",
        startDate: "2026-12-20",
        endDate: "2026-12-24",
      });

      await test.step("user views mutuals page and sees mutual listed", async () => {
        await authenticateViaAPIWithPhone(
          page,
          request,
          userAPhone,
          "User Alpha",
        );

        await page.goto("/mutuals");
        await expect(
          page.getByRole("heading", { level: 1, name: "My Mutuals" }),
        ).toBeVisible({
          timeout: NAVIGATION_TIMEOUT,
        });

        // User B should appear as a mutual
        await expect(page.getByText("User Bravo")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });

        await snap(page, "30-mutuals-page-with-mutual");
      });

      await test.step("organizer invites mutual from trip dialog", async () => {
        await page.goto(`/trips/${trip2Id}`);
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: `Invite Test Trip ${timestamp}`,
          }),
        ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });

        // Dismiss any toast
        await dismissToast(page);

        // Click "Invite" button
        const inviteButton = page
          .getByRole("button", { name: "Invite" })
          .first();
        await inviteButton.click();

        // Wait for invite dialog
        const inviteHeading = page.getByRole("heading", {
          name: "Invite members",
        });
        if (
          !(await inviteHeading
            .isVisible({ timeout: DIALOG_TIMEOUT })
            .catch(() => false))
        ) {
          await inviteButton.click();
        }
        await expect(inviteHeading).toBeVisible({ timeout: DIALOG_TIMEOUT });

        // Verify mutual suggestions section appears
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByText("User Bravo")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });

        await snap(page, "31-invite-dialog-with-mutual-suggestions");

        // Select the mutual (click checkbox or the row)
        await dialog.getByText("User Bravo").click();

        await snap(page, "32-mutual-selected");

        // Submit
        await dialog.getByRole("button", { name: "Send invitations" }).click();

        // Verify toast
        await expect(
          page.getByText(/member added|invitation.*sent/i),
        ).toBeVisible({
          timeout: TOAST_TIMEOUT,
        });

        await snap(page, "33-mutual-invited-success");
      });

      await test.step("verify mutual was added as trip member", async () => {
        // Wait for dialog to close
        await expect(
          page.getByRole("heading", { name: "Invite members" }),
        ).not.toBeVisible({
          timeout: DIALOG_TIMEOUT,
        });

        // Verify the member count increased (should show "2 going")
        await expect(page.getByText(/2 going/).first()).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });

        await snap(page, "34-mutual-appears-as-member");
      });
    },
  );
});
