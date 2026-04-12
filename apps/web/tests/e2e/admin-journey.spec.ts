import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import {
  generateUniquePhone,
  authenticateViaAPIWithPhone,
} from "./helpers/auth";
import {
  API_BASE,
  NAVIGATION_TIMEOUT,
  ELEMENT_TIMEOUT,
} from "./helpers/timeouts";

/**
 * Admin Journey E2E Test
 *
 * Tests core admin flows: nav visibility, user list, search,
 * user detail, ban/unban, and non-admin access denial.
 *
 * Relies on seeded data: Alice (+15550000001) as admin,
 * auto-promoted via ADMIN_PHONE_NUMBERS env var on login.
 */

/** Login as Alice (seeded admin) and inject auth cookie */
async function loginAsAdmin(page: Page, request: APIRequestContext) {
  const alicePhone = "+15550000001";

  await request.post(`${API_BASE}/auth/request-code`, {
    data: { phoneNumber: alicePhone, smsConsent: true },
  });

  const verifyResp = await request.post(`${API_BASE}/auth/verify-code`, {
    data: { phoneNumber: alicePhone, code: "123456", smsConsent: true },
  });

  const cookies = verifyResp.headers()["set-cookie"] || "";
  const token = cookies.match(/auth_token=([^;]+)/)?.[1] || "";

  // Verify Alice is actually an admin
  const meResp = await request.get(`${API_BASE}/auth/me`, {
    headers: { cookie: cookies },
  });
  const meData = await meResp.json();

  await page.context().addCookies([
    {
      name: "auth_token",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
    },
  ]);

  return { isAdmin: meData.isAdmin === true };
}

test.describe("Admin journey", () => {
  test("admin can view and manage users", async ({ page, request }) => {
    const { isAdmin } = await loginAsAdmin(page, request);
    test.skip(!isAdmin, "ADMIN_PHONE_NUMBERS not configured — skipping");

    await test.step("Admin nav item visible in user menu", async () => {
      await page.goto("/trips");
      await page
        .getByRole("button", { name: "User menu" })
        .waitFor({ timeout: ELEMENT_TIMEOUT });
      await page.getByRole("button", { name: "User menu" }).click();

      await expect(
        page.getByRole("menuitem", { name: /admin/i }),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
    });

    await test.step("Navigate to admin user list", async () => {
      await page.getByRole("menuitem", { name: /admin/i }).click();
      await page.waitForURL("**/admin/users", {
        timeout: NAVIGATION_TIMEOUT,
      });

      await expect(
        page.getByRole("heading", { name: /user management/i }),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });

      // Table has rows
      await expect(page.locator("table tbody tr").first()).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
    });

    await test.step("Search filters the user list", async () => {
      await page.getByPlaceholder(/search/i).fill("Bob");

      // Wait for debounce + query
      await expect(page.getByRole("link", { name: /bob williams/i })).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
    });

    await test.step("Navigate to user detail and ban/unban", async () => {
      await page.getByRole("link", { name: /bob williams/i }).click();
      await page.waitForURL("**/admin/users/**", {
        timeout: NAVIGATION_TIMEOUT,
      });

      // User detail loaded
      await expect(page.getByText("Bob Williams")).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });

      // Ban the user
      await page.getByRole("button", { name: /^ban$/i }).click();
      await page.getByRole("button", { name: /confirm/i }).click();
      await expect(page.getByText(/banned/i).first()).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });

      // Unban the user
      await page.getByRole("button", { name: /unban/i }).click();
      await page.getByRole("button", { name: /confirm/i }).click();
      await expect(page.getByText(/active/i).first()).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
    });
  });

  test("non-admin is redirected from admin pages", async ({
    page,
    request,
  }) => {
    const phone = generateUniquePhone();
    await authenticateViaAPIWithPhone(page, request, phone, "Regular Joe");

    await page.goto("/admin/users");

    // Admin guard redirects non-admins away
    await page.waitForURL(
      (url) => !url.pathname.startsWith("/admin"),
      { timeout: NAVIGATION_TIMEOUT },
    );

    expect(page.url()).not.toContain("/admin");
  });
});
