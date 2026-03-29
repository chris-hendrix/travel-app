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
 * E2E Journey: Settle (Expenses & Balances)
 *
 * Tests the core settle flow: add expense, check balances, inline guest creation.
 * The settle section is a single view with balances on top and expenses below.
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

      // Navigate to Settle — on mobile it's a tab, on desktop it's a tab link
      await test.step("navigate to settle section", async () => {
        await navigateToMobilePanel(page, "Settle");

        // Verify settle section loaded
        const settleHeading = page.getByRole("heading", { name: "Settle", exact: true });
        await expect(settleHeading).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      });

      await test.step("verify empty state", async () => {
        await expect(page.getByText("Nothing to settle yet")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await test.step("add first expense", async () => {
        // Click the FAB (floating action button) to add an expense
        await page.getByRole("button", { name: /add expense/i }).first().click();

        // Fill the expense form in the sheet dialog
        const sheet = page.getByRole("dialog");
        await expect(
          sheet.getByRole("heading", { name: "Add Expense" }),
        ).toBeVisible({ timeout: DIALOG_TIMEOUT });

        await sheet.getByLabel(/description/i).fill("Dinner at restaurant");
        await sheet.getByLabel(/amount/i).fill("50.00");

        // Submit
        await sheet.getByRole("button", { name: "Add Expense" }).click();

        // Wait for the dialog to close
        await expect(sheet).toBeHidden({ timeout: DIALOG_TIMEOUT });

        // Verify expense appears in the list
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

        // Wait for the dialog to close
        await expect(sheet).toBeHidden({ timeout: DIALOG_TIMEOUT });

        // Verify updated
        await expect(page.getByText("Dinner at steakhouse")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await test.step("check balances visible", async () => {
        // Balances section is always visible (no tab to click)
        // With only one member (self), there should be no balances
        await expect(page.getByText("All settled up!")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await test.step("add expense with inline guest", async () => {
        // Open the add expense form via FAB
        await page.getByRole("button", { name: /add expense/i }).first().click();

        const sheet = page.getByRole("dialog");
        await expect(
          sheet.getByRole("heading", { name: "Add Expense" }),
        ).toBeVisible({ timeout: DIALOG_TIMEOUT });

        await sheet.getByLabel(/description/i).fill("Taxi ride");
        await sheet.getByLabel(/amount/i).fill("30.00");

        // Add a guest inline in the expense form
        await sheet.getByPlaceholder("Add guest...").fill("Tomislav");
        await sheet.getByPlaceholder("Add guest...").press("Enter");

        // Wait for the guest to appear in the participant list
        await expect(sheet.getByText("Tomislav (guest)")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });

        await sheet.getByRole("button", { name: "Add Expense" }).click();

        // Wait for the dialog to close
        await expect(sheet).toBeHidden({ timeout: DIALOG_TIMEOUT });

        await expect(page.getByText("Taxi ride")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await snap(page, "31-settle-expense-with-guest");

      await test.step("verify balances with guest", async () => {
        // Balances section is always visible — now there should be a balance
        await expect(page.getByText(/owes/)).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await snap(page, "32-settle-balances-with-guest");

      await test.step("delete expense", async () => {
        // Click the expense to open edit form
        await page.getByText("Taxi ride").click();

        const sheet = page.getByRole("dialog");
        await expect(
          sheet.getByRole("heading", { name: "Edit Expense" }),
        ).toBeVisible({ timeout: DIALOG_TIMEOUT });

        await sheet.getByRole("button", { name: /Delete Expense/ }).click();

        // Wait for toast confirmation (use .first() — Sonner can render duplicate toasts)
        await expect(page.getByText("Expense deleted").first()).toBeVisible({
          timeout: TOAST_TIMEOUT,
        });
        await dismissToast(page);
      });

    },
  );
});
