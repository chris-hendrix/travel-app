import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { navigateToMobilePanel } from "./mobile-panels";
import { NAVIGATION_TIMEOUT, ELEMENT_TIMEOUT } from "./timeouts";

/**
 * Helper: navigate to the messages/discussion section and wait for it to be visible.
 *
 * On desktop the tabbed layout navigates to /trips/{id}/messages via
 * `navigateToMobilePanel` (which clicks the tab link). On mobile it swipes
 * to the Messages panel.
 */
export async function scrollToDiscussion(page: Page) {
  // On mobile this swipes to Messages panel; on desktop it clicks the Messages tab.
  await navigateToMobilePanel(page, "Messages");

  // Wait for network to settle so React re-renders from data fetching are done,
  // preventing "Element is not attached to the DOM" errors during scroll.
  await page.waitForLoadState("networkidle");

  // The section has heading "Messages" (or "Discussion" in older layouts) and
  // an aria-labelled region. Try all variants.
  const heading = page
    .getByRole("heading", { name: "Messages" })
    .or(page.getByRole("heading", { name: "Discussion" }));
  const section = page.getByRole("region", { name: "Trip discussion" });

  const target = heading.or(section);

  await target.first().waitFor({ state: "visible", timeout: NAVIGATION_TIMEOUT });
  // Retry scroll in case a React re-render momentarily detaches the element
  await expect(async () => {
    await target.first().scrollIntoViewIfNeeded();
  }).toPass({ timeout: ELEMENT_TIMEOUT });
  await expect(target.first()).toBeVisible({ timeout: ELEMENT_TIMEOUT });
}
