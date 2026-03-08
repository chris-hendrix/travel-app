import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { NAVIGATION_TIMEOUT, ELEMENT_TIMEOUT } from "./timeouts";

/** Helper: scroll to the discussion section and wait for it to be visible. */
export async function scrollToDiscussion(page: Page) {
  // Wait for network to settle so React re-renders from data fetching are done,
  // preventing "Element is not attached to the DOM" errors during scroll.
  await page.waitForLoadState("networkidle");
  const heading = page.getByRole("heading", { name: "Discussion" });
  await heading.waitFor({ state: "visible", timeout: NAVIGATION_TIMEOUT });
  // Retry scroll in case a React re-render momentarily detaches the element
  await expect(async () => {
    await heading.scrollIntoViewIfNeeded();
  }).toPass({ timeout: ELEMENT_TIMEOUT });
  await expect(heading).toBeVisible({ timeout: ELEMENT_TIMEOUT });
}
