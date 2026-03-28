import { test, expect } from "@playwright/test";
import { createUserViaAPI, generateUniquePhone } from "./helpers/auth";
import { API_BASE, ELEMENT_TIMEOUT } from "./helpers/timeouts";
import { removeNextjsDevOverlay } from "./helpers/nextjs-dev";

/**
 * E2E: PWA — offline page, manifest, push API, install prompts
 *
 * Note: Service worker is disabled in dev mode (next-pwa `disable: isDev`),
 * so we can't test SW registration, caching, or push event handling here.
 * Those require a production build and are covered by manual testing.
 */

test.describe("PWA", () => {
  test.beforeEach(async ({ page }) => {
    await removeNextjsDevOverlay(page);
  });

  test("offline page renders", async ({ page }) => {
    await page.goto("/~offline");
    await expect(page.getByText("You're offline")).toBeVisible({
      timeout: ELEMENT_TIMEOUT,
    });
    const retryButton = page.getByRole("button", { name: /retry|try again/i });
    await expect(retryButton).toBeVisible();
  });

  test("manifest is served with correct fields", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBeTruthy();

    const manifest = await response.json();
    expect(manifest.name).toBe("Journiful");
    expect(manifest.display).toBe("standalone");
    expect(manifest.id).toBe("/");
    expect(manifest.categories).toContain("travel");

    // Should have raster icons (not just SVG)
    const icons = manifest.icons as { src: string; sizes: string }[];
    const sizes = icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");

    // Should have shortcuts
    expect(manifest.shortcuts).toBeDefined();
    expect(manifest.shortcuts.length).toBeGreaterThanOrEqual(2);
  });
});

test.describe("Push API", () => {
  let cookie: string;

  test.beforeAll(async ({ request }) => {
    const phone = generateUniquePhone();
    cookie = await createUserViaAPI(request, phone, "PWA Tester");
  });

  test("GET /api/push/vapid-public-key returns key without auth", async ({
    request,
  }) => {
    const response = await request.get(`${API_BASE}/push/vapid-public-key`);
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.publicKey).toBeDefined();
    expect(typeof body.publicKey).toBe("string");
    expect(body.publicKey.length).toBeGreaterThan(20);
  });

  test("POST /api/push/subscribe requires auth", async ({ request }) => {
    const response = await request.post(`${API_BASE}/push/subscribe`, {
      data: {
        endpoint: "https://fcm.googleapis.com/fcm/send/test",
        keys: { p256dh: "test-key", auth: "test-auth" },
      },
    });
    expect(response.status()).toBe(401);
  });

  test("push subscribe and unsubscribe flow", async ({ request }) => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${Date.now()}`;

    // Subscribe
    const subResponse = await request.post(`${API_BASE}/push/subscribe`, {
      headers: { Cookie: cookie },
      data: {
        endpoint,
        keys: { p256dh: "test-p256dh-key", auth: "test-auth-key" },
      },
    });
    expect(subResponse.ok()).toBeTruthy();

    // Unsubscribe
    const unsubResponse = await request.delete(`${API_BASE}/push/subscribe`, {
      headers: { Cookie: cookie },
      data: { endpoint },
    });
    expect(unsubResponse.ok()).toBeTruthy();
  });
});

test.describe("Install prompts", () => {
  test("iOS coaching shows on iOS Safari UA", async ({ browser }) => {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await removeNextjsDevOverlay(page);
    await page.goto("/");

    // iOS coaching should appear with the "Install Journiful" heading
    await expect(
      page.getByRole("heading", { name: "Install Journiful" }),
    ).toBeVisible({ timeout: ELEMENT_TIMEOUT });

    await context.close();
  });
});
