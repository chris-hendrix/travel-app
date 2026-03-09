import type { Page, Locator } from "@playwright/test";
import { RETRY_INTERVAL } from "../timeouts";

export class TripsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly createTripButton: Locator;
  readonly userMenuButton: Locator;
  readonly mobileMenuButton: Locator;
  readonly emptyStateHeading: Locator;
  readonly emptyStateCreateButton: Locator;
  readonly upcomingTripsHeading: Locator;
  readonly logoutItem: Locator;
  readonly mobileLogoutButton: Locator;
  readonly profileItem: Locator;
  readonly mobileProfileButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "My Trips" });
    this.createTripButton = page.getByRole("button", {
      name: "New Trip",
    });
    this.userMenuButton = page.getByRole("button", { name: "User menu" });
    this.mobileMenuButton = page.getByRole("button", { name: "Open menu" });
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
    this.mobileLogoutButton = page.getByTestId("mobile-menu-logout-button");
    this.profileItem = page.getByTestId("profile-menu-item");
    this.mobileProfileButton = page.getByTestId("mobile-menu-profile-button");
  }

  async goto() {
    await this.page.goto("/trips");
  }

  /** Returns true if the mobile hamburger menu is visible (small viewport). */
  private async isMobileViewport(): Promise<boolean> {
    return this.mobileMenuButton.isVisible();
  }

  async openUserMenu() {
    if (await this.isMobileViewport()) {
      // Retry click — on mobile WebKit the Sheet can fail to open on first click
      for (let attempt = 0; attempt < 3; attempt++) {
        await this.mobileMenuButton.click();
        const opened = await this.mobileLogoutButton
          .waitFor({ state: "visible", timeout: RETRY_INTERVAL })
          .then(() => true)
          .catch(() => false);
        if (opened) return;
      }
    } else {
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
  }

  async logout() {
    await this.openUserMenu();
    // After openUserMenu(), check which logout element is visible.
    // Don't re-check isMobileViewport() — the hamburger button is hidden
    // behind the Sheet overlay once the mobile menu is open.
    if (await this.mobileLogoutButton.isVisible()) {
      await this.mobileLogoutButton.click();
    } else {
      await this.logoutItem.click();
    }
  }
}
