import type { Page, Locator } from "@playwright/test";

export class TripDetailPage {
  readonly page: Page;
  readonly tripHeading: Locator;
  readonly editButton: Locator;
  readonly editDialogHeading: Locator;
  readonly createDialogHeading: Locator;
  readonly nameInput: Locator;
  readonly destinationInput: Locator;
  readonly startDateButton: Locator;
  readonly endDateButton: Locator;
  readonly descriptionInput: Locator;
  readonly continueButton: Locator;
  readonly backButton: Locator;
  readonly createTripButton: Locator;
  readonly updateTripButton: Locator;
  readonly deleteTripButton: Locator;
  readonly step1Indicator: Locator;
  readonly step2Indicator: Locator;
  readonly goToTripButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tripHeading = page.getByRole("heading", { level: 1 });
    this.editButton = page.getByRole("button", { name: "Edit trip", exact: true });
    this.editDialogHeading = page.getByRole("heading", { name: "Edit trip" });
    this.createDialogHeading = page.getByRole("heading", {
      name: "Create a new trip",
    });
    this.nameInput = page.getByLabel(/trip name/i);
    this.destinationInput = page.getByLabel(/destination/i);
    this.startDateButton = page.getByRole("button", { name: "Start date" });
    this.endDateButton = page.getByRole("button", { name: "End date" });
    this.descriptionInput = page
      .getByRole("dialog")
      .getByLabel(/description/i);
    this.continueButton = page.getByRole("button", { name: "Continue" });
    this.backButton = page.getByRole("button", { name: "Back" });
    this.createTripButton = page.getByRole("button", { name: "Create trip" });
    this.updateTripButton = page.getByRole("button", { name: "Update trip" });
    this.deleteTripButton = page.getByRole("button", { name: "Delete trip" });
    this.step1Indicator = page.getByText("Trip details");
    this.step2Indicator = page.getByText("Customize");
    this.goToTripButton = page.getByRole("button", { name: "Go to trip" });
  }

  async goto(tripId: string) {
    await this.page.goto(`/trips/${tripId}`);
  }
}
