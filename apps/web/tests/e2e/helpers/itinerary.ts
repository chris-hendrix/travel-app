import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { dismissToast } from "./toast";
import { pickDateTime } from "./date-pickers";
import { ELEMENT_TIMEOUT, SLOW_NAVIGATION_TIMEOUT } from "./timeouts";

/**
 * Hide toast DOM elements so they don't intercept clicks.
 *
 * Uses pointer-events:none + opacity:0 instead of el.remove().
 * Removing elements corrupts React's fiber tree — on WebKit this throws
 * NotFoundError ("The object can not be found here") during the commit phase
 * when React tries to unmount the already-removed nodes.
 */
async function hideToasts(page: Page): Promise<void> {
  /* eslint-disable no-undef -- browser globals inside page.evaluate */
  await page.evaluate(() => {
    document
      .querySelectorAll<HTMLElement>("[data-sonner-toaster]")
      .forEach((el) => {
        el.style.pointerEvents = "none";
        el.style.opacity = "0";
      });
  });
  /* eslint-enable no-undef */
}

/** Helper: open the FAB dropdown and click a menu item, or fall back to empty-state button. */
export async function clickFabAction(page: Page, actionName: string) {
  // Dismiss any Sonner toast so it doesn't intercept the click.
  await dismissToast(page);

  const fab = page.getByRole("button", { name: "Add to itinerary" });
  const emptyStateBtn = page.getByRole("button", {
    name: `Add ${actionName}`,
  });

  // Wait for either the FAB (non-empty itinerary) or the empty-state button
  // to appear. locator.isVisible() returns immediately (timeout is deprecated
  // and ignored), so we must use .or() + waitFor to properly wait for the
  // component to finish transitioning between empty and non-empty states.
  await fab.or(emptyStateBtn).waitFor({
    state: "visible",
    timeout: SLOW_NAVIGATION_TIMEOUT,
  });

  if (await fab.isVisible()) {
    // Retry: a late-arriving success toast from the previous action can
    // appear after dismissToast returns and intercept the FAB click.
    // Quick-dismiss on each attempt to clear any new toasts.
    // The FAB may temporarily unmount during React re-renders (TanStack Query
    // refetch or portal remount after SSR recovery), so use a generous inner
    // timeout to wait for it to reappear within each retry iteration.
    await expect(async () => {
      await hideToasts(page);
      await fab.click({ timeout: ELEMENT_TIMEOUT });
    }).toPass({ timeout: SLOW_NAVIGATION_TIMEOUT });
    await page.getByRole("menuitem", { name: actionName }).click();
  } else {
    // Empty state has direct buttons like "Add Event", "Add Accommodation"
    await emptyStateBtn.click();
  }
}

/** Helper: create an event via the UI (assumes on trip detail page). */
export async function createEvent(
  page: Page,
  name: string,
  startDateTime: string,
  options?: {
    type?: string;
    location?: string;
    description?: string;
    endDateTime?: string;
  },
) {
  await clickFabAction(page, "Event");
  await expect(
    page.getByRole("heading", { name: "Create a new event" }),
  ).toBeVisible();

  await page.getByLabel(/event name/i).fill(name);

  if (options?.description) {
    await page.getByLabel(/description/i).fill(options.description);
  }

  if (options?.type) {
    const dialog = page.getByRole("dialog");
    await dialog.locator('button[role="combobox"]').first().click();
    await page
      .locator(`div[role="option"]`)
      .filter({ hasText: options.type })
      .click();
  }

  if (options?.location) {
    await page.locator('input[name="location"]').fill(options.location);
  }

  const startTrigger = page.getByRole("button", { name: "Start time" });
  await pickDateTime(page, startTrigger, startDateTime);

  if (options?.endDateTime) {
    const endTrigger = page.getByRole("button", { name: "End time" });
    await pickDateTime(page, endTrigger, options.endDateTime);
  }

  await page.getByRole("button", { name: "Create event" }).click();
}
