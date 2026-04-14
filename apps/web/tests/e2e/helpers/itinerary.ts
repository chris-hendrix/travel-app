import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { dismissToast } from "./toast";
import { pickDateTime } from "./date-pickers";
import { navigateToMobilePanel } from "./mobile-panels";
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
  // On mobile the FAB is only visible when the Itinerary panel is active.
  await navigateToMobilePanel(page, "Itinerary");

  // Dismiss any Sonner toast so it doesn't intercept the click.
  await dismissToast(page);

  // Dismiss the CalendarSyncCard via localStorage — the card lives in the
  // Info panel (swiper slide 0), so its dismiss button may be in the DOM but
  // off-screen when the Itinerary panel is active.  Clicking an off-screen
  // swiper element hangs forever ("waiting for element to be visible, enabled
  // and stable").  Setting localStorage directly is reliable regardless of
  // which slide is active; the React component re-renders and hides itself.
  await page.evaluate(() =>
    localStorage.setItem("calendar-sync-card-dismissed", "true"),
  );
  // Give React a tick to re-render and remove the card from the DOM.
  await page.waitForTimeout(200);

  const fab = page.getByRole("button", { name: "Add to itinerary" });

  // Wait for either the FAB or the itinerary content to load.
  // We cannot use fab.or(emptyStateBtn) because the InfoPanel sidebar also has
  // an "Add Event" button, causing a strict mode violation when both are in the DOM.
  // Instead, poll for the FAB first; if it doesn't appear, fall back to the
  // empty-state button scoped to the itinerary area.
  const fabVisible = await fab
    .waitFor({ state: "visible", timeout: SLOW_NAVIGATION_TIMEOUT })
    .then(() => true)
    .catch(() => false);

  if (fabVisible) {
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
    // Empty state has direct buttons like "Add Event", "Add Accommodation".
    // Scope to the itinerary empty-state container to avoid matching the
    // InfoPanel sidebar's "Add Event" button which navigates/scrolls instead
    // of opening the create dialog.  The InfoPanel button appears first in
    // DOM order on both desktop (hidden lg:block sidebar) and mobile (swiper
    // slide 0), so a naive .first() picks the wrong element.
    const emptyState = page
      .locator('[data-slot="empty-state"]')
      .filter({ hasText: "No itinerary yet" });
    const emptyStateBtn = emptyState.getByRole("button", {
      name: `Add ${actionName}`,
    });
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

  if (options?.type) {
    // Event type is selected via icon card grid buttons
    const dialog = page.getByRole("dialog");
    await dialog
      .locator(".grid button")
      .filter({ hasText: options.type })
      .click();
  }

  const startTrigger = page.getByRole("button", { name: "Start time" });
  await pickDateTime(page, startTrigger, startDateTime);

  // Location, description, end time are inside a collapsed "More details" section
  if (options?.location || options?.description || options?.endDateTime) {
    const dialog = page.getByRole("dialog");
    await dialog.getByText("More details").click();
  }

  if (options?.description) {
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/description/i).fill(options.description);
  }

  if (options?.location) {
    await page.locator('input[name="location"]').fill(options.location);
  }

  if (options?.endDateTime) {
    const endTrigger = page.getByRole("button", { name: "End time" });
    await pickDateTime(page, endTrigger, options.endDateTime);
  }

  await page.getByRole("button", { name: "Create event" }).click();
}
