import { test, expect } from "@playwright/test";

const PAGES = [
  { path: "/", name: "landing" },
  { path: "/login.html", name: "login" },
  { path: "/trips.html", name: "trips" },
  { path: "/verify.html", name: "verify" },
  { path: "/mutuals.html", name: "mutuals" },
  { path: "/~offline.html", name: "offline" },
];

const ASSETS = [
  "/sw.js",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
];

test.describe("Static export integrity", () => {
  test("no error pages in HTML output", async ({ page }) => {
    for (const { path, name } of PAGES) {
      await page.goto(path);
      const html = await page.content();
      expect(html, `${name}: must not contain __next_error__`).not.toContain(
        "__next_error__",
      );
      expect(html, `${name}: must not contain NEXT_REDIRECT`).not.toContain(
        "NEXT_REDIRECT",
      );
    }
  });

  test("key pages render with content", async ({ page }) => {
    // Landing page
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Journiful" })).toBeVisible({ timeout: 5000 });

    // Login page
    await page.goto("/login.html");
    await expect(page.locator("text=Sign in")).toBeVisible({ timeout: 5000 });

    // Trips page (static shell — will show skeleton/placeholder)
    await page.goto("/trips.html");
    const hasContent = await page.locator("body").textContent();
    expect(hasContent?.length || 0, "trips page must not be empty").toBeGreaterThan(100);
  });

  test("no console errors on page load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    for (const { path, name } of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle").catch(() => {});
      // Font preload warnings are harmless, ignore those
      const realErrors = errors.filter(
        (e) =>
          !e.includes("preload") &&
          !e.includes("woff2") &&
          !e.includes("ERR_CONNECTION_REFUSED") &&
          !e.includes("Failed to fetch"),
      );
      expect(realErrors, `${name}: no console errors`).toEqual([]);
    }
  });

  test("critical assets serve with 200", async ({ request }) => {
    for (const asset of ASSETS) {
      const response = await request.get(asset);
      expect(response.status(), `${asset}: must return 200`).toBe(200);
    }

    // Spot-check a JS chunk exists
    const jsResponse = await request.get("/_next/static/chunks/");
    expect(jsResponse.status(), "JS chunks must be accessible").toBe(200);
  });
});
