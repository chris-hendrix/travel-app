import { Page } from "@playwright/test";

/**
 * Log in via the Capacitor WebView UI.
 * Assumes the login page is currently displayed.
 */
export async function loginViaUI(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  // Fill email field
  const emailInput = page.locator('input[type="email"], input[name="email"]');
  await emailInput.fill(email);

  // Fill password field
  const passwordInput = page.locator(
    'input[type="password"], input[name="password"]',
  );
  await passwordInput.fill(password);

  // Click submit button
  const submitButton = page.locator(
    'button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")',
  );
  await submitButton.click();

  // Wait for navigation away from login
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 10000,
  });
}

/**
 * Log out via the UI.
 */
export async function logoutViaUI(page: Page): Promise<void> {
  // Click logout button (assumes it's in the nav or user menu)
  const logoutButton = page.locator(
    'button:has-text("Logout"), a:has-text("Logout"), button:has-text("Sign out")',
  );
  if (await logoutButton.isVisible()) {
    await logoutButton.click();
    await page.waitForURL(/\/login/, { timeout: 10000 });
  }
}

/**
 * Check if the user is on the login page.
 */
export async function isOnLoginPage(page: Page): Promise<boolean> {
  return page.url().includes("/login");
}

/**
 * Check if the user is on the trips page (authenticated).
 */
export async function isOnTripsPage(page: Page): Promise<boolean> {
  return page.url().includes("/trips");
}
