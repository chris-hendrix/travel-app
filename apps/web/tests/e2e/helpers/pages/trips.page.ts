import type { Page, Locator } from "@playwright/test";
import { RETRY_INTERVAL } from "../timeouts";

export class TripsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly createTripButton: Locator;
  readonly userMenuButton: Locator;
  readonly emptyStateHeading: Locator;
  readonly emptyStateCreateButton: Locator;
  readonly upcomingTripsHeading: Locator;
  readonly logoutItem: Locator;
  readonly profileItem: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "My Trips" });
    this.createTripButton = page.getByRole("button", {
      name: "New Trip",
    });
    this.userMenuButton = page.getByRole("button", { name: "User menu" });
    this.emptyStateHeading = page.getByRole("heading", {
      name: "Your adventures await",
    });
    this.emptyStateCreateButton = page.getByRole("button", {
      name: "Create your first trip",
    });
    this.upcomingTripsHeading = page.getByRole("heading", {
      name: "Upcoming trips",
    });
    this.logoutItem = page.getByRole("menuitem", { name: "Log out" });
    this.profileItem = page.getByTestId("profile-menu-item");
  }

  async goto() {
    await this.page.goto("/trips");
  }

  async openUserMenu() {
    // Radix DropdownMenu can sometimes fail to stay open on the first click
    // due to pointer event timing in Playwright. Retry if menu doesn't appear.
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.userMenuButton.click();
      const opened = await this.logoutItem
        .waitFor({ state: "visible", timeout: RETRY_INTERVAL })
        .then(() => true)
        .catch(() => false);
      if (opened) return;
    }
  }

  async logout() {
    await this.openUserMenu();
    await this.logoutItem.click();
  }
}
