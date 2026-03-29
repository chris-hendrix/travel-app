import { test, expect } from "@playwright/test";
import { authenticateViaAPI } from "./helpers/auth";
import { createTrip } from "./helpers/trips";
import { removeNextjsDevOverlay, dismissPwaPrompts } from "./helpers/nextjs-dev";
import { navigateToMobilePanel } from "./helpers/mobile-panels";
import { dismissToast } from "./helpers/toast";
import { snap } from "./helpers/screenshots";
import {
  ELEMENT_TIMEOUT,
  TOAST_TIMEOUT,
  DIALOG_TIMEOUT,
} from "./helpers/timeouts";

/**
 * E2E Journey: Settle (Expenses, Balances, Guests)
 *
 * Tests the core settle flow: add expense, check balances, manage guests.
 */

test.describe("Settle Journey", () => {
  test.beforeEach(async ({ page }) => {
    await removeNextjsDevOverlay(page);
    await dismissPwaPrompts(page);
    await page.context().clearCookies();
  });

  test(
    "expense CRUD and balance flow",
    { tag: "@smoke" },
    async ({ page, request }) => {
      test.slow();
      await authenticateViaAPI(page, request, "Settle Tester");
      const tripName = `Settle Trip ${Date.now()}`;

      await test.step("create trip", async () => {
        await createTrip(
          page,
          tripName,
          "Denver, CO",
          "2026-11-01",
          "2026-11-05",
        );
      });

      // Navigate to Settle — on mobile it's a tab, on desktop scroll down
      await test.step("navigate to settle section", async () => {
        // Try mobile panel first, falls back silently on desktop
        await navigateToMobilePanel(page, "Settle");

        // On desktop, scroll to the settle section
        const settleHeading = page.getByRole("heading", { name: "Settle", exact: true });
        const visible = await settleHeading
          .waitFor({ state: "visible", timeout: 3_000 })
          .then(() => true)
          .catch(() => false);
        if (!visible) {
          await page.evaluate(() =>
            document.getElementById("settle")?.scrollIntoView({ behavior: "instant" }),
          );
        }
        await expect(settleHeading).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      });

      await test.step("verify empty state", async () => {
        await expect(page.getByText("Nothing to settle yet")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await test.step("add first expense", async () => {
        await page.getByRole("button", { name: "Add Expense" }).first().click();

        // Fill the expense form in the sheet dialog
        const sheet = page.getByRole("dialog");
        await expect(
          sheet.getByRole("heading", { name: "Add Expense" }),
        ).toBeVisible({ timeout: DIALOG_TIMEOUT });

        await sheet.getByLabel(/description/i).fill("Dinner at restaurant");
        await sheet.getByLabel(/amount/i).fill("50.00");

        // Submit
        await sheet.getByRole("button", { name: "Add Expense" }).click();

        // Verify expense appears
        await expect(page.getByText("Dinner at restaurant")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
        await expect(page.getByText("$50.00")).toBeVisible();
      });

      await snap(page, "30-settle-first-expense");

      await test.step("edit expense", async () => {
        await page.getByText("Dinner at restaurant").click();

        const sheet = page.getByRole("dialog");
        await expect(
          sheet.getByRole("heading", { name: "Edit Expense" }),
        ).toBeVisible({ timeout: DIALOG_TIMEOUT });

        // Verify fields are pre-filled
        const descInput = sheet.getByLabel(/description/i);
        await expect(descInput).toHaveValue("Dinner at restaurant");

        // Update description
        await descInput.clear();
        await descInput.fill("Dinner at steakhouse");

        await sheet.getByRole("button", { name: "Save Changes" }).click();

        // Verify updated
        await expect(page.getByText("Dinner at steakhouse")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await test.step("check balances tab", async () => {
        await page.getByRole("button", { name: "Balances" }).click();

        // With only one member (self), there should be no balances
        await expect(page.getByText("All settled up!")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await test.step("add guest via Guests tab", async () => {
        await page.getByRole("button", { name: "Guests" }).click();

        // Click the Add Guest chip
        await page.getByRole("button", { name: "Add Guest" }).click();
        await page.getByPlaceholder("Name").fill("Tomislav");

        // Submit via the check/confirm button next to the input
        await page.getByPlaceholder("Name").press("Enter");

        // Verify guest chip appears
        await expect(page.getByRole("button", { name: /Tomislav/ })).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await snap(page, "31-settle-guest-added");

      await test.step("add expense split with guest", async () => {
        await page.getByRole("button", { name: "Expenses" }).click();

        // Use the Add Expense button at the bottom of the list
        await page.getByRole("button", { name: "Add Expense" }).first().click();

        const sheet = page.getByRole("dialog");
        await sheet.getByLabel(/description/i).fill("Taxi ride");
        await sheet.getByLabel(/amount/i).fill("30.00");

        await sheet.getByRole("button", { name: "Add Expense" }).click();

        await expect(page.getByText("Taxi ride")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await test.step("verify balances with guest", async () => {
        await page.getByRole("button", { name: "Balances" }).click();

        // Now there should be a balance since the guest owes money
        await expect(page.getByText(/owes/)).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await snap(page, "32-settle-balances-with-guest");

      await test.step("delete expense", async () => {
        await page.getByRole("button", { name: "Expenses" }).click();
        await page.getByText("Taxi ride").click();

        const sheet = page.getByRole("dialog");
        await expect(
          sheet.getByRole("heading", { name: "Edit Expense" }),
        ).toBeVisible({ timeout: DIALOG_TIMEOUT });

        await sheet.getByRole("button", { name: /Delete Expense/ }).click();

        // Wait for toast confirmation — match "Expense deleted" specifically
        await expect(page.getByText("Expense deleted")).toBeVisible({
          timeout: TOAST_TIMEOUT,
        });
        await dismissToast(page);
      });

      await test.step("remove guest", async () => {
        await page.getByRole("button", { name: "Guests" }).click();

        // Click the X on the Tomislav chip
        await page.getByLabel("Remove Tomislav").click();

        // Confirm removal in the alert dialog
        const dialog = page.getByRole("alertdialog");
        await expect(
          dialog.getByRole("heading", { name: "Remove guest" }),
        ).toBeVisible({ timeout: DIALOG_TIMEOUT });
        await dialog.getByRole("button", { name: "Remove" }).click();

        // Guest should be gone
        await expect(page.getByRole("button", { name: /Tomislav/ })).not.toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await snap(page, "33-settle-guest-removed");
    },
  );
});
