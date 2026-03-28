import type { Page, Locator } from "@playwright/test";
import { fillPhoneInput } from "../phone-input";

export class LoginPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly phoneInput: Locator;
  readonly smsConsentCheckbox: Locator;
  readonly continueButton: Locator;
  readonly verifyHeading: Locator;
  readonly codeInput: Locator;
  readonly verifyButton: Locator;
  readonly completeProfileHeading: Locator;
  readonly displayNameInput: Locator;
  readonly completeProfileButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Get started" });
    this.phoneInput = page.getByRole("textbox", { name: /phone/i });
    this.smsConsentCheckbox = page.getByRole("checkbox", { name: /I agree to receive text messages/i });
    this.continueButton = page.getByRole("button", { name: "Continue" });
    this.verifyHeading = page.getByRole("heading", {
      name: "Verify your number",
    });
    this.codeInput = page.getByRole("textbox", { name: /verification code/i });
    this.verifyButton = page.getByRole("button", { name: "Verify" });
    this.completeProfileHeading = page.getByRole("heading", {
      name: "Complete your profile",
    });
    this.displayNameInput = page.getByRole("textbox", {
      name: /display name/i,
    });
    this.completeProfileButton = page.getByRole("button", {
      name: "Complete profile",
    });
  }

  async goto() {
    await this.page.goto("/login");
  }

  async login(phone: string) {
    await fillPhoneInput(this.phoneInput, phone);
    await this.smsConsentCheckbox.check();
    await this.continueButton.click();
    await this.page.waitForURL("**/verify**");
    await this.codeInput.fill("123456");
    await this.verifyButton.click();
  }

  async completeProfile(displayName: string) {
    await this.displayNameInput.fill(displayName);
    await this.completeProfileButton.click();
  }
}
