import { test, expect } from "@playwright/test";
import { authenticateUser, generateUniquePhone } from "./helpers/auth";
import { LoginPage, TripsPage } from "./helpers/pages";
import { snap } from "./helpers/screenshots";
import { removeNextjsDevOverlay } from "./helpers/nextjs-dev";
import { fillPhoneInput } from "./helpers/phone-input";
import {
  NAVIGATION_TIMEOUT,
  SLOW_NAVIGATION_TIMEOUT,
} from "./helpers/timeouts";
import { formatPhoneNumber } from "../../src/lib/format";

/**
 * E2E Journey: Authentication
 *
 * Tests the complete authentication flow using browser-based auth
 * (since this IS the test of the login UI).
 */

test.describe("Auth Journey", () => {
  test.beforeEach(async ({ page }) => {
    await removeNextjsDevOverlay(page);
    await page.context().clearCookies();
  });

  test("complete auth journey", { tag: "@smoke" }, async ({ page }) => {
    const phone = generateUniquePhone();
    const loginPage = new LoginPage(page);
    const trips = new TripsPage(page);

    await test.step("login page renders correctly", async () => {
      await loginPage.goto();
      await expect(loginPage.heading).toBeVisible();
      await snap(page, "01-login");
    });

    await test.step("enter phone and submit", async () => {
      // Use pressSequentially via fillPhoneInput — Playwright's fill() sets
      // the value in one shot, but react-phone-number-input's input-format
      // library processes input character-by-character. fill() desynchronizes
      // the internal state from react-hook-form, silently breaking submission.
      await fillPhoneInput(loginPage.phoneInput, phone);
      await loginPage.smsConsentCheckbox.check();
      await loginPage.continueButton.click();
      await expect(page).toHaveURL(/verify/, {
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
    });

    await test.step("verify code page shows phone number", async () => {
      expect(page.url()).toContain("/verify?phone=");
      await expect(loginPage.verifyHeading).toBeVisible();
      await expect(page.getByText(formatPhoneNumber(phone))).toBeVisible();
      await snap(page, "02-verify-code");
    });

    await test.step("enter verification code", async () => {
      await loginPage.codeInput.fill("123456");
      await loginPage.verifyButton.click();
    });

    await test.step("complete profile for new user", async () => {
      await page.waitForURL("**/complete-profile");
      await expect(loginPage.completeProfileHeading).toBeVisible();
      await snap(page, "03-complete-profile");
      await loginPage.completeProfile("Test User");
    });

    await test.step("lands on trips", async () => {
      await page.waitForURL("**/trips");
      await expect(trips.heading).toBeVisible();
      await snap(page, "04-trips-empty");
    });

    await test.step("auth cookie is set correctly", async () => {
      const cookies = await page.context().cookies();
      const authCookie = cookies.find((c) => c.name === "auth_token");
      expect(authCookie).toBeDefined();
      expect.soft(authCookie?.httpOnly).toBe(true);
      expect.soft(authCookie?.value).toBeTruthy();
    });

    await test.step("logout clears session and redirects", async () => {
      await trips.logout();
      await page.waitForURL("**/login");
      expect(page.url()).toContain("/login");

      const cookies = await page.context().cookies();
      const authCookie = cookies.find((c) => c.name === "auth_token");
      if (authCookie) {
        expect(authCookie.value).toBe("");
      }
    });

    await test.step("cannot access protected route after logout", async () => {
      await page.goto("/trips");
      await page.waitForURL("**/login", { timeout: SLOW_NAVIGATION_TIMEOUT });
      expect(page.url()).toContain("/login");
    });
  });

  test(
    "auth redirects and guards",
    { tag: "@regression" },
    async ({ page, request }) => {
      const loginPage = new LoginPage(page);
      const trips = new TripsPage(page);

      await test.step("unauthenticated user redirects to login", async () => {
        await page.goto("/trips");
        await page.waitForURL("**/login", { timeout: NAVIGATION_TIMEOUT });
        expect(page.url()).toContain("/login");
        await expect(loginPage.heading).toBeVisible();
      });

      await test.step("existing user skips complete-profile", async () => {
        await authenticateUser(page, request, "Existing User");
        await expect(trips.heading).toBeVisible();
      });

      await test.step("authenticated user on landing page redirects to /trips", async () => {
        await page.goto("/");
        await page.waitForURL("**/trips", { timeout: NAVIGATION_TIMEOUT });
        expect(page.url()).toContain("/trips");
      });

      await test.step("authenticated user on /login redirects to /trips", async () => {
        await page.goto("/login");
        await page.waitForURL("**/trips", { timeout: NAVIGATION_TIMEOUT });
        expect(page.url()).toContain("/trips");
      });
    },
  );
});
