import { test, expect } from "@playwright/test";
import { authenticateViaAPIWithPhone } from "./helpers/auth";
import { snap } from "./helpers/screenshots";
import { removeNextjsDevOverlay, dismissPwaPrompts } from "./helpers/nextjs-dev";
import { navigateToMobilePanel } from "./helpers/mobile-panels";
import { ELEMENT_TIMEOUT } from "./helpers/timeouts";

/**
 * E2E Journey: Discover Tab — POI Cards, Detail Sheet, and Create Event Flow
 *
 * Uses seeded Lisbon trip (Alice is organizer, mock POI cache is pre-populated).
 * Validates desktop tab navigation, mobile icon strip navigation,
 * POI card rendering, detail sheet interaction, and the Create Event flow.
 */

test.describe("Discover Journey", () => {
  test.beforeEach(async ({ page }) => {
    await removeNextjsDevOverlay(page);
    await dismissPwaPrompts(page);
    await page.context().clearCookies();
  });

  test(
    "discover tab — view POIs, detail sheet, and create event flow",
    { tag: "@smoke" },
    async ({ page, request }) => {
      test.slow();

      await test.step("authenticate as Alice and navigate to Lisbon trip", async () => {
        await authenticateViaAPIWithPhone(
          page,
          request,
          "+15550000001",
          "Alice Johnson",
        );
        await page.goto("/trips");
        await page.waitForURL("**/trips");

        // Click on the Lisbon trip card
        await page.getByText("Lisbon Getaway").click();
        await page.waitForURL("**/trips/**");
      });

      await test.step("navigate to Discover tab and verify POI cards", async () => {
        await navigateToMobilePanel(page, "Discover");

        // Verify POI cards appear — check for known mock POI names
        await expect(page.getByText("Pastéis de Belém")).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
        await expect(page.getByText("Cervejaria Ramiro")).toBeVisible();
        await expect(page.getByText("MAAT")).toBeVisible();
        await expect(page.getByText("Lux Frágil")).toBeVisible();

        // Verify category section headings
        await expect(page.getByText("Food & Drink")).toBeVisible();
        await expect(page.getByText("Arts & Entertainment")).toBeVisible();
        await expect(page.getByText("Outdoors")).toBeVisible();
        await expect(page.getByText("Nightlife")).toBeVisible();

        await snap(page, "discover-poi-cards");
      });

      await test.step("detail sheet: open and verify content", async () => {
        // Click the first POI card
        await page.getByText("Pastéis de Belém").first().click();

        // Verify detail sheet shows the POI name
        await expect(page.getByText("Pastéis de Belém")).toBeVisible();

        // Should show subcategory
        await expect(page.getByText("Bakery")).toBeVisible();

        // Should show distance (imperial: seeded user has no temperatureUnit → fahrenheit)
        await expect(
          page.getByText("2.6 mi").or(page.getByText("4.2 km")),
        ).toBeVisible();

        // Should show address link with "Google Maps" label
        const addressLink = page.getByRole("link", { name: /Rua de Belém/ });
        await expect(addressLink).toBeVisible();
        await expect(page.getByText("Google Maps")).toBeVisible();

        // Should show "Create Event" button
        await expect(
          page.getByRole("button", { name: /create event/i }),
        ).toBeVisible();

        // Should show position counter "1 of 9"
        await expect(page.getByText("1 of 9")).toBeVisible();

        await snap(page, "discover-detail-sheet");
      });

      await test.step("detail sheet: arrow navigation", async () => {
        // Click right arrow to go to next POI
        await page.getByRole("button", { name: "Next place" }).click();
        await expect(page.getByText("Cervejaria Ramiro")).toBeVisible();
        await expect(page.getByText("2 of 9")).toBeVisible();

        // Click left arrow to go back
        await page.getByRole("button", { name: "Previous place" }).click();
        await expect(page.getByText("1 of 9")).toBeVisible();

        await snap(page, "discover-arrow-navigation");
      });

      await test.step("create event: open pre-filled dialog", async () => {
        // Click "Create Event" button in the detail sheet
        await page
          .getByRole("button", { name: /create event/i })
          .click();

        // The CreateEventDialog should open with the POI name pre-filled
        await expect(
          page.getByRole("heading", { name: /create a new event/i }),
        ).toBeVisible({ timeout: 5_000 });

        await snap(page, "discover-create-event-dialog");

        // Close the dialog
        await page.keyboard.press("Escape");
      });
    },
  );
});
