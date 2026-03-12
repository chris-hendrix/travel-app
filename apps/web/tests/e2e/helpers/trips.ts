import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { TripsPage, TripDetailPage } from "./pages";
import { pickDate } from "./date-pickers";
import { dismissToast } from "./toast";
import { NAVIGATION_TIMEOUT, RETRY_INTERVAL } from "./timeouts";

/** Create a trip via the UI and land on the trip detail page. */
export async function createTrip(
  page: Page,
  tripName: string,
  destination: string,
  startDate: string,
  endDate: string,
) {
  const tripDetail = new TripDetailPage(page);
  const trips = new TripsPage(page);

  // Dismiss any Sonner toast that could intercept the FAB click
  await dismissToast(page);

  // Retry click — on mobile WebKit the first click can be swallowed during React hydration
  await expect(async () => {
    await trips.createTripButton.click();
    await expect(tripDetail.createDialogHeading).toBeVisible({
      timeout: RETRY_INTERVAL,
    });
  }).toPass({ timeout: NAVIGATION_TIMEOUT });
  await tripDetail.nameInput.fill(tripName);
  await tripDetail.destinationInput.fill(destination);
  await pickDate(page, tripDetail.startDateButton, startDate);
  await pickDate(page, tripDetail.endDateButton, endDate);
  await tripDetail.continueButton.click();
  await expect(tripDetail.step2Indicator).toBeVisible();
  await tripDetail.createTripButton.click();
  await page.waitForURL("**/trips/**");
  await expect(
    page.getByRole("heading", { level: 1, name: tripName }),
  ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
}
