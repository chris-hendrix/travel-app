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

/**
 * Navigate to a specific panel in the mobile trip layout.
 *
 * On desktop viewports the icon strip does not exist; calling this function is
 * a no-op so tests can safely invoke it regardless of viewport size.
 */
export async function navigateToMobilePanel(
  page: Page,
  panel: MobilePanel,
): Promise<void> {
  const icon = page.getByRole("button", { name: panel, exact: true });
  // On desktop the icon strip is not rendered — skip silently.
  const visible = await icon
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return;
  await icon.click();
  // Allow swiper transition (300ms) to settle before interacting with content.
  await page.waitForTimeout(400);
}
