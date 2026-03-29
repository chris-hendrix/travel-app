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

        // Fill the expense form
        await expect(
          page.getByRole("heading", { name: "Add Expense" }),
        ).toBeVisible({ timeout: DIALOG_TIMEOUT });

        await page.getByLabel(/description/i).fill("Dinner at restaurant");
        await page.getByLabel(/amount/i).fill("50.00");

        // Submit
        await page.getByRole("button", { name: "Add Expense" }).last().click();

        // Verify expense appears
        await expect(page.getByText("Dinner at restaurant")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
        await expect(page.getByText("$50.00")).toBeVisible();
      });

      await snap(page, "30-settle-first-expense");

      await test.step("edit expense", async () => {
        await page.getByText("Dinner at restaurant").click();

        await expect(
          page.getByRole("heading", { name: "Edit Expense" }),
        ).toBeVisible({ timeout: DIALOG_TIMEOUT });

        // Verify fields are pre-filled
        const descInput = page.getByLabel(/description/i);
        await expect(descInput).toHaveValue("Dinner at restaurant");

        // Update description
        await descInput.clear();
        await descInput.fill("Dinner at steakhouse");

        await page.getByRole("button", { name: "Save Changes" }).click();

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
        await page.getByPlaceholder("Name").fill("Tom");
        // Submit via the check button
        await page.locator("button:has(svg.lucide-check)").click();

        // Verify guest chip appears
        await expect(page.getByText("Tom")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await snap(page, "31-settle-guest-added");

      await test.step("add expense split with guest", async () => {
        await page.getByRole("button", { name: "Expenses" }).click();

        // Use the Add Expense button at the bottom of the list
        await page.getByRole("button", { name: "Add Expense" }).first().click();

        await page.getByLabel(/description/i).fill("Taxi ride");
        await page.getByLabel(/amount/i).fill("30.00");

        await page.getByRole("button", { name: "Add Expense" }).last().click();

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

        await expect(
          page.getByRole("heading", { name: "Edit Expense" }),
        ).toBeVisible({ timeout: DIALOG_TIMEOUT });

        await page.getByRole("button", { name: /Delete Expense/ }).click();

        await expect(page.getByText(/deleted/i)).toBeVisible({
          timeout: TOAST_TIMEOUT,
        });
        await dismissToast(page);
      });

      await test.step("remove guest", async () => {
        await page.getByRole("button", { name: "Guests" }).click();

        // Click the X on the Tom chip
        await page.getByLabel("Remove Tom").click();

        // Confirm removal
        await expect(
          page.getByRole("heading", { name: "Remove guest" }),
        ).toBeVisible({ timeout: DIALOG_TIMEOUT });
        await page.getByRole("button", { name: "Remove" }).click();

        // Guest should be gone
        await expect(page.getByText("Tom")).not.toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
      });

      await snap(page, "33-settle-guest-removed");
    },
  );
});
