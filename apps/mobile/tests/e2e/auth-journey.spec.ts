/**
 * E2E Journey: Authentication (mobile).
 *
 * Ported from the retired web E2E suite — same three
 * tests, same shape. The mechanics differ: the old helper injected an
 * `auth_token` cookie, while the mobile app restores its bearer token
 * from `localStorage` (`journiful.authToken`, see `lib/session.ts`),
 * seeded here via `authenticateViaAPI` before the first navigation.
 *
 * Selectors are `getByRole`/`getByText` only: react-native-web renders
 * `role`/`aria-*` as real DOM attributes, while NativeWind classes are
 * never asserted. Every selector names the screen file and line-shape
 * it matches in a comment.
 */

import { test, expect } from "@playwright/test";
import {
  AUTH_TOKEN_KEY,
  FIXED_CODE,
  authenticateViaAPI,
  generateUniquePhone,
} from "./helpers/auth";
import {
  ELEMENT_TIMEOUT,
  NAVIGATION_TIMEOUT,
  SLOW_NAVIGATION_TIMEOUT,
} from "./helpers/timeouts";

test.describe("Auth Journey", () => {
  test("signup chain: phone → code → complete profile → trips", async ({
    page,
  }) => {
    const phone = generateUniquePhone();

    await test.step("login screen renders", async () => {
      await page.goto("/login");
      // app/login.tsx: heading "Get started".
      await expect(page.getByText("Get started")).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
    });

    await test.step("enter phone, consent, and submit", async () => {
      // components/ui/PhoneField.tsx: default label "Phone number",
      // bound via accessibilityLabel/aria-label in TextField.tsx.
      // pressSequentially, not fill: fill() sets the value in one shot
      // and desynchronizes the controlled input's state (same reason
      // the web suite's fillPhoneInput exists), leaving toE164 empty
      // and the Continue button disabled.
      const phoneInput = page.getByRole("textbox", { name: "Phone number" });
      await phoneInput.click();
      await phoneInput.pressSequentially(phone);
      // components/ui/Checkbox.tsx: role="checkbox", the consent row
      // is the only checkbox on app/login.tsx.
      await page.getByRole("checkbox").click();
      // components/ui/Button.tsx: accessibilityRole="button" with the
      // title as its accessible name; app/login.tsx titles it "Continue".
      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForURL("**/verify", {
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
    });

    await test.step("verify screen shows the code field", async () => {
      // app/verify.tsx: heading "Verify your number" + the
      // "Enter the 6-digit code sent to …" explainer.
      await expect(page.getByText("Verify your number")).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
      await expect(page.getByText(/6-digit code/)).toBeVisible();
    });

    await test.step("enter the fixed dev code", async () => {
      // app/verify.tsx: TextField label="Code". Six digits submit on
      // their own (change() calls submit at length 6).
      await page.getByRole("textbox", { name: "Code" }).fill(FIXED_CODE);
      await page.waitForURL("**/complete-profile", {
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
    });

    await test.step("complete profile for the new user", async () => {
      // app/complete-profile.tsx: heading "Complete your profile".
      await expect(
        page.getByText("Complete your profile"),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      // app/complete-profile.tsx: TextField label="Display name".
      await page
        .getByRole("textbox", { name: "Display name" })
        .fill("Test User");
      // app/complete-profile.tsx: Button titled "Continue".
      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForURL("**/trips", {
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
    });

    await test.step("lands on trips", async () => {
      // app/trips/index.tsx: a fresh user has no trips, so the empty
      // state's copy is the mount proof for the list screen. Its inline
      // Button is gone — the page's create action is the ActionBar at the
      // foot now, and that renders on every trip list, so it proves the
      // screen mounted but not that the list resolved empty.
      await expect(page.getByText("No trips yet")).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
    });
  });

  test("logout and post-logout guard", async ({ page, request }) => {
    await test.step("seeded session lands on trips", async () => {
      await authenticateViaAPI(page, request, "Test User");
      await page.goto("/trips");
      // app/trips/index.tsx: a fresh seed has no trips — the empty
      // state's copy proves the list screen mounted.
      await expect(page.getByText("No trips yet")).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
    });

    await test.step("sign out clears the token and redirects", async () => {
      // components/ui/AppHeader.tsx: AvatarButton Pressable
      // aria-label="Profile" (app chrome variant on /trips).
      await page.getByLabel("Profile").click();
      await page.waitForURL("**/profile", {
        timeout: NAVIGATION_TIMEOUT,
      });
      // app/profile.tsx: Button title="Sign out" awaits performSignOut
      // (server POST, token drop, cache clear) before replacing to /login.
      await page.getByRole("button", { name: "Sign out" }).click();
      await page.waitForURL("**/login", {
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
      expect(
        await page.evaluate((key) => localStorage.getItem(key), AUTH_TOKEN_KEY),
      ).toBeNull();
    });

    await test.step("cannot access a guarded route after logout", async () => {
      // app/complete-profile.tsx redirects signed-out readers home to
      // / (the landing explains the product; the form does not).
      // (The init-script seed only writes when the key is absent, so the
      // cleared session stays cleared.)
      await page.goto("/complete-profile");
      await page.waitForURL(
        (url) => url.pathname === "/",
        { timeout: NAVIGATION_TIMEOUT },
      );
      // The landing's identity is its hero's headline, not a button
      // label: "Get started" is also the /login heading, and the
      // landing itself now carries two of those buttons.
      await expect(
        page.getByText("An itinerary your friends will actually read"),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
    });
  });

  test("auth redirects and guards", async ({ page, request }) => {
    await test.step("unauthenticated user redirects home", async () => {
      // app/complete-profile.tsx: `if (!user) Redirect /` — the
      // guarded route with a real redirect today lands a signed-out
      // reader on the landing (its hero's headline says what the app
      // is; the button label does not), not on a form.
      await page.goto("/complete-profile");
      await page.waitForURL((url) => url.pathname === "/", {
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(
        page.getByText("An itinerary your friends will actually read"),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      // The export's prerendered bytes carry no <img> at all: expo-image mounts
      // them on hydration, so attached is the wait that means hydrated. The
      // landing's images are the bundled stock photos, which are decorative and
      // so carry an empty alt — the one place that can see it, since the SEO
      // audit reads the hydrated DOM and no unit test here has a renderer.
      // Critical flow 1 (auth and route guards): the guard lands the reader here.
      await expect(page.locator("img").first()).toBeAttached({ timeout: ELEMENT_TIMEOUT });
      const alts = await page
        .locator("img")
        .evaluateAll((els) => els.map((el) => el.getAttribute("alt")));
      expect(alts.length).toBeGreaterThan(0);
      expect(alts.every((alt) => alt === "")).toBe(true);
    });

    await test.step("existing user skips complete-profile", async () => {
      await authenticateViaAPI(page, request, "Existing User");
      await page.goto("/complete-profile");
      // app/complete-profile.tsx: `profileComplete` redirects to /trips.
      await page.waitForURL("**/trips", { timeout: NAVIGATION_TIMEOUT });
      // The fresh seed has no trips: the empty state's copy is the
      // mount proof (see the signup test above).
      await expect(page.getByText("No trips yet")).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
    });

    await test.step("signed-in user on /login redirects to /trips", async () => {
      // app/login.tsx: `if (user) Redirect /trips`.
      await page.goto("/login");
      await page.waitForURL("**/trips", { timeout: NAVIGATION_TIMEOUT });
    });

    await test.step("signed-in user on / lands on /trips", async () => {
      // app/index.tsx: the cold-start gate restores the seeded token
      // via GET /auth/me, then redirects signed-in users to /trips.
      await page.goto("/");
      await page.waitForURL("**/trips", { timeout: NAVIGATION_TIMEOUT });
    });
  });
});
