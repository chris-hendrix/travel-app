import type { Page } from "@playwright/test";

/**
 * Panel labels in the mobile icon strip, ordered by swiper index.
 *
 * - 0 = Home (Info panel)
 * - 1 = Itinerary
 * - 2 = Discover
 * - 3 = Messages
 * - 4 = Photos
 * - 5 = Settle
 */
export type MobilePanel = "Home" | "Itinerary" | "Discover" | "Messages" | "Photos" | "Settle";

/** Map panel names to their desktop tab route segments. */
const PANEL_TAB_ROUTES: Record<string, string> = {
  Itinerary: "itinerary",
  Discover: "discover",
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
  // Probe with a short timeout: scrollIntoViewIfNeeded would block for the
  // full test timeout when the icon strip doesn't exist (desktop viewport).
  const mobileVisible = await icon
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (mobileVisible) {
    // Scroll the icon into the visible viewport before clicking (belt-and-suspenders).
    await icon.scrollIntoViewIfNeeded();
    await icon.click();
    // Wait for any panel data fetches (TanStack Query) to settle.
    await page.waitForLoadState("networkidle");
    // Give the swiper CSS transition (~300ms) time to complete.
    // networkidle resolves immediately when no requests are in flight,
    // which can happen before the slide animation finishes.
    await page.waitForTimeout(500);
    return;
  }

  // Desktop: click the tab link to navigate to the sub-route.
  const route = PANEL_TAB_ROUTES[panel];
  if (route) {
    const tab = page.getByRole("tab", { name: panel, exact: true });
    const tabVisible = await tab
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (tabVisible) {
      await tab.scrollIntoViewIfNeeded();
      await tab.click();
      await page.waitForLoadState("networkidle");
    }
  }
}
