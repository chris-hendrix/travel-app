import type { Page } from "@playwright/test";

/**
 * Panel labels in the mobile icon strip, ordered by swiper index.
 *
 * - 0 = Home (Info panel)
 * - 1 = Itinerary
 * - 2 = Messages
 * - 3 = Photos
 * - 4 = Settle
 */
export type MobilePanel = "Home" | "Itinerary" | "Messages" | "Photos" | "Settle";

/** Map panel names to their desktop tab route segments. */
const PANEL_TAB_ROUTES: Record<string, string> = {
  Itinerary: "itinerary",
  Messages: "messages",
  Photos: "photos",
  Settle: "settle",
};

/**
 * Navigate to a specific panel in the mobile trip layout.
 *
 * On desktop viewports the icon strip does not exist; instead the desktop
 * tabbed layout is used, so we click the matching tab link to navigate to
 * the correct sub-route.
 */
export async function navigateToMobilePanel(
  page: Page,
  panel: MobilePanel,
): Promise<void> {
  const icon = page.getByRole("button", { name: panel, exact: true });
  // On mobile the icon strip is rendered — click it.
  const mobileVisible = await icon
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (mobileVisible) {
    await icon.click();
    // Allow swiper transition (300ms) to settle before interacting with content.
    await page.waitForTimeout(400);
    return;
  }

  // Desktop: click the tab link to navigate to the sub-route.
  const route = PANEL_TAB_ROUTES[panel];
  if (route) {
    const tab = page.getByRole("tab", { name: panel, exact: true });
    const tabVisible = await tab
      .waitFor({ state: "visible", timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (tabVisible) {
      await tab.click();
      await page.waitForLoadState("networkidle");
    }
  }
}
