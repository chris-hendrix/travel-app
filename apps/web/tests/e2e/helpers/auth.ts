import type { Page, APIRequestContext } from "@playwright/test";
import { API_BASE, NAVIGATION_TIMEOUT, ELEMENT_TIMEOUT } from "./timeouts";
import { fillPhoneInput } from "./phone-input";

let phoneCounter = 0;

/**
 * Generate a unique E.164 phone number (max 15 digits).
 * Incorporates process.pid to prevent collisions in parallel Playwright workers.
 * The "555" substring is required by the API's test-number bypass (phone.includes("555")).
 * Format: +1555{pid:2}{ts:5}{counter:2} = 13 digits total (within E.164's 15-digit max).
 */
export function generateUniquePhone(): string {
  const pid = (process.pid % 100).toString().padStart(2, "0");
  const ts = Date.now().toString().slice(-5);
  const counter = (++phoneCounter % 100).toString().padStart(2, "0");
  return `+1555${pid}${ts}${counter}`;
}

/**
 * Create a user via API (request-code → verify-code → complete-profile).
 * Returns the cookie string for subsequent API calls.
 */
export async function createUserViaAPI(
  request: APIRequestContext,
  phone: string,
  displayName: string = "Test User",
): Promise<string> {
  await request.post(`${API_BASE}/auth/request-code`, {
    data: { phoneNumber: phone },
  });

  const verifyResponse = await request.post(`${API_BASE}/auth/verify-code`, {
    data: { phoneNumber: phone, code: "123456" },
  });

  const cookies = verifyResponse.headers()["set-cookie"];

  await request.post(`${API_BASE}/auth/complete-profile`, {
    data: { displayName, timezone: "UTC" },
    headers: { cookie: cookies || "" },
  });

  return cookies || "";
}

/**
 * Login via the browser UI (enter phone → verify code).
 * Assumes the user already exists (created via API or previous browser flow).
 * Ends on /trips.
 */
export async function loginViaBrowser(
  page: Page,
  phone: string,
): Promise<void> {
  await page.goto("/login");

  const phoneInput = page.getByRole("textbox", { name: /phone/i });
  await fillPhoneInput(phoneInput, phone);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.waitForURL("**/verify**");
  const codeInput = page.getByRole("textbox", { name: /verification code/i });
  await codeInput.fill("123456");
  await page.getByRole("button", { name: "Verify" }).click();

  await page.waitForURL("**/trips", { timeout: NAVIGATION_TIMEOUT });
}

/**
 * Full authentication: create user via API, then login via browser.
 * Returns the phone number used.
 */
export async function authenticateUser(
  page: Page,
  request: APIRequestContext,
  displayName: string = "Test User",
): Promise<string> {
  const phone = generateUniquePhone();
  await createUserViaAPI(request, phone, displayName);
  await loginViaBrowser(page, phone);
  return phone;
}

/**
 * Full authentication with a specific phone number.
 * Creates user via API, then logs in via browser.
 */
export async function authenticateUserWithPhone(
  page: Page,
  request: APIRequestContext,
  phone: string,
  displayName: string = "Test User",
): Promise<void> {
  await createUserViaAPI(request, phone, displayName);
  await loginViaBrowser(page, phone);
}

/**
 * Fast API-based authentication: create user via API and inject auth cookie.
 * Skips browser navigation entirely — much faster than browser-based auth.
 * Returns the phone number used.
 */
export async function authenticateViaAPI(
  page: Page,
  request: APIRequestContext,
  displayName: string = "Test User",
): Promise<string> {
  const phone = generateUniquePhone();
  await authenticateViaAPIWithPhone(page, request, phone, displayName);
  return phone;
}

/**
 * Fast API-based authentication with a specific phone number.
 * Skips browser navigation entirely.
 */
export async function authenticateViaAPIWithPhone(
  page: Page,
  request: APIRequestContext,
  phone: string,
  displayName: string = "Test User",
): Promise<void> {
  const cookieString = await createUserViaAPI(request, phone, displayName);
  const token = cookieString.match(/auth_token=([^;]+)/)?.[1] || "";
  await page.context().addCookies([
    {
      name: "auth_token",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
    },
  ]);
  await page.goto("/trips");
  await page.waitForURL("**/trips", { timeout: NAVIGATION_TIMEOUT });
  // Ensure page is fully interactive — wait for client-rendered navigation
  // which confirms React hydration and auth context are complete.
  // The "User menu" avatar button is visible on all viewport sizes.
  await page
    .getByRole("button", { name: "User menu" })
    .waitFor({ timeout: ELEMENT_TIMEOUT });
}

/**
 * Browser-only authentication (no API request context needed).
 * Handles both new users (complete-profile) and existing users.
 * Returns the phone number used.
 */
export async function authenticateUserViaBrowser(
  page: Page,
  displayName: string = "Test User",
): Promise<string> {
  const phone = generateUniquePhone();
  await authenticateUserViaBrowserWithPhone(page, phone, displayName);
  return phone;
}

/**
 * Browser-only authentication with a specific phone number.
 * Handles both new users (complete-profile) and existing users.
 */
export async function authenticateUserViaBrowserWithPhone(
  page: Page,
  phone: string,
  displayName: string = "Test User",
): Promise<void> {
  await page.goto("/login");

  const phoneInput = page.getByRole("textbox", { name: /phone/i });
  await fillPhoneInput(phoneInput, phone);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.waitForURL("**/verify**");
  const codeInput = page.getByRole("textbox", { name: /verification code/i });
  await codeInput.fill("123456");
  await page.getByRole("button", { name: "Verify" }).click();

  await Promise.race([
    page.waitForURL("**/trips"),
    page.waitForURL("**/complete-profile"),
  ]);

  const currentUrl = page.url();
  if (currentUrl.includes("/complete-profile")) {
    const displayNameInput = page.getByRole("textbox", {
      name: /display name/i,
    });
    await displayNameInput.fill(displayName);
    await page.getByRole("button", { name: "Complete profile" }).click();
    await page.waitForURL("**/trips");
  }
}
