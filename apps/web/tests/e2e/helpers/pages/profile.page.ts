import type { Page, Locator } from "@playwright/test";
import { ELEMENT_TIMEOUT } from "../timeouts";

export class ProfilePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly displayNameInput: Locator;
  readonly phoneNumberInput: Locator;
  readonly timezoneSelect: Locator;
  readonly venmoInput: Locator;
  readonly instagramInput: Locator;
  readonly saveButton: Locator;
  readonly uploadPhotoButton: Locator;
  readonly removePhotoButton: Locator;
  readonly photoFileInput: Locator;
  readonly profileAvatar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Profile" });
    this.displayNameInput = page.getByTestId("display-name-input");
    this.phoneNumberInput = page.getByTestId("phone-number-input");
    this.timezoneSelect = page.getByTestId("timezone-select");
    this.venmoInput = page.getByTestId("venmo-handle-input");
    this.instagramInput = page.getByTestId("instagram-handle-input");
    this.saveButton = page.getByTestId("save-profile-button");
    this.uploadPhotoButton = page.getByTestId("upload-photo-button");
    this.removePhotoButton = page.getByTestId("remove-photo-button");
    this.photoFileInput = page.getByTestId("photo-file-input");
    this.profileAvatar = page.getByTestId("profile-avatar");
  }

  /** Navigate to trips page and open the profile dialog from the header dropdown */
  async goto() {
    await this.page.goto("/trips");
    // Wait for auth context to load user data before opening the dropdown,
    // otherwise the profile menu item won't render (it's gated on user !== null).
    await this.page.waitForLoadState("networkidle");
    await this.openDialog();
  }

  /** Open the profile dialog from the header dropdown */
  async openDialog() {
    await this.page.waitForLoadState("networkidle");
    const userMenuBtn = this.page.getByRole("button", {
      name: "User menu",
    });
    await userMenuBtn.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
    await userMenuBtn.click();
    await this.page
      .getByTestId("profile-menu-item")
      .waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
    await this.page.getByTestId("profile-menu-item").click();
    await this.heading.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
  }
}
