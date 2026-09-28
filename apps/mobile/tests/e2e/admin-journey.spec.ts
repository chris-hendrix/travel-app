/**
 * E2E Journey: Admin (mobile).
 *
 * PR justification: the admin surface has no other end-to-end coverage,
 * and impersonation changes the session identity — only the full stack
 * can show the token swap, the band and the way back; and the sign-in
 * identity case exists only in the running app because this suite has
 * no renderer.
 *
 * Same house style as auth-journey.spec.ts: test.step, the `request`
 * fixture, a second testInfo parameter, getByRole/getByText ONLY (never
 * a NativeWind class). Every selector names the screen file and
 * line-shape it matches in a comment.
 */

import { test, expect } from "@playwright/test";
import {
  FIXED_CODE,
  adminPhoneFor,
  authenticateAs,
  authenticateViaAPI,
  generateUniquePhone,
  seedUserViaAPI,
  uniqueLabel,
} from "./helpers/auth";
import {
  ELEMENT_TIMEOUT,
  NAVIGATION_TIMEOUT,
  SLOW_NAVIGATION_TIMEOUT,
} from "./helpers/timeouts";

test.describe("Admin Journey", () => {
  test("an admin finds a user and acts on them", async (
    { page, request },
    testInfo,
  ) => {
    const target = uniqueLabel("Admin Target");
    await test.step("seed the target via API", async () => {
      // helpers/auth.ts: seedUserViaAPI returns the token; the target
      // needs a display NAME so the list row's accessible name is it.
      await seedUserViaAPI(request, generateUniquePhone(), target);
    });

    await test.step("sign in as an admin", async () => {
      await authenticateAs(page, request, adminPhoneFor(testInfo.workerIndex));
    });

    await test.step("profile shows the admin entry first", async () => {
      // app/profile.tsx: the Admin group's Link "User management".
      // First on purpose: when ADMIN_PHONE_NUMBERS never reached the
      // API this fails loudly here instead of confusingly later.
      await page.goto("/profile");
      await expect(page.getByText("User management")).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
    });

    await test.step("find the target and open the record", async () => {
      // app/profile.tsx: the same Link navigates to the list.
      await page.getByText("User management").click();
      await page.waitForURL("**/admin/users", {
        timeout: NAVIGATION_TIMEOUT,
      });
      // app/admin/users/index.tsx: TextField label="Search"; the
      // debounce (250ms) settles the query, then the row — a button
      // whose accessible name is the display name — appears.
      await page.getByRole("textbox", { name: "Search" }).fill(target);
      await expect(
        page.getByRole("button", { name: target }),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      await page.getByRole("button", { name: target }).click();
      await page.waitForURL("**/admin/users/detail*", {
        timeout: NAVIGATION_TIMEOUT,
      });
      // app/admin/users/detail.tsx: the headline renders the name.
      // Visible-only: the list behind the dialog keeps its own copy.
      await expect(
        page.getByText(target).filter({ visible: true }).first(),
      ).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
    });

    await test.step("ban takes two presses", async () => {
      // app/admin/users/detail.tsx: the first press arms the row (the
      // button turns red, a Cancel word appears under it); the second
      // press — same accessible name "Ban user" — sends.
      await page.getByRole("button", { name: "Ban user" }).click();
      await expect(
        page.getByRole("button", { name: "Cancel" }).first(),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      await page.getByRole("button", { name: "Ban user" }).click();
      // On success the badge and the offered actions invert.
      // Visible-only: the list behind the dialog re-renders with its
      // own badge copy, hidden behind the modal — `.first()` alone
      // would resolve to that hidden node.
      await expect(
        page
          .getByText("Banned", { exact: true })
          .filter({ visible: true })
          .first(),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      await expect(
        page.getByRole("button", { name: "Unban user" }),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
    });

    await test.step("unban sends on one press", async () => {
      // detail.tsx: unban has no confirm step — one press sends.
      await page.getByRole("button", { name: "Unban user" }).click();
      await expect(
        page.getByText("Banned", { exact: true }).filter({ visible: true }),
      ).toHaveCount(0, { timeout: ELEMENT_TIMEOUT });
    });

    await test.step("promote sends on one press", async () => {
      // detail.tsx: promote has no confirm step — one press sends.
      await page.getByRole("button", { name: "Promote to admin" }).click();
      await expect(
        page
          .getByText("Admin", { exact: true })
          .filter({ visible: true })
          .first(),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
    });

    await test.step("demote sends on one press", async () => {
      // detail.tsx: demote has no confirm step — one press sends.
      await page.getByRole("button", { name: "Demote from admin" }).click();
      await expect(
        page.getByText("Admin", { exact: true }).filter({ visible: true }),
      ).toHaveCount(0, { timeout: ELEMENT_TIMEOUT });
      await expect(
        page.getByRole("button", { name: "Promote to admin" }),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
    });
  });

  test("impersonation rides the bearer session and comes back", async (
    { page, request },
    testInfo,
  ) => {
    const target = uniqueLabel("Impersonation Target");
    await test.step("seed the target and sign in as an admin", async () => {
      await seedUserViaAPI(request, generateUniquePhone(), target);
      await authenticateAs(page, request, adminPhoneFor(testInfo.workerIndex));
    });

    await test.step("open the target record and impersonate", async () => {
      await page.goto("/admin/users");
      await expect(
        page.getByRole("textbox", { name: "Search" }),
      ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
      await page.getByRole("textbox", { name: "Search" }).fill(target);
      await expect(
        page.getByRole("button", { name: target }),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      await page.getByRole("button", { name: target }).click();
      await page.waitForURL("**/admin/users/detail*", {
        timeout: NAVIGATION_TIMEOUT,
      });
      // detail.tsx: pressing "Impersonate" sends the code to the
      // admin's own number and reveals the "Verification code" field.
      await page.getByRole("button", { name: "Impersonate" }).click();
      await expect(
        page.getByRole("textbox", { name: "Verification code" }),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      await page
        .getByRole("textbox", { name: "Verification code" })
        .fill(FIXED_CODE);
      await page.getByRole("button", { name: "Start impersonating" }).click();
      await page.waitForURL("**/trips", {
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
    });

    await test.step("the band names the target", async () => {
      // components/ui/ImpersonationBand.tsx: TWO nodes — the words
      // `You are {displayName}.` and the `Stop impersonating` control.
      await expect(
        page.getByText(`You are ${target}`).first(),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      await expect(
        page.getByRole("button", { name: "Stop impersonating" }),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
    });

    await test.step("profile shows the target name — the token swapped", async () => {
      // components/ui/AppHeader.tsx: AvatarButton Pressable
      // aria-label="Profile" (app chrome variant on /trips).
      await page.getByLabel("Profile").click();
      await page.waitForURL("**/profile", {
        timeout: NAVIGATION_TIMEOUT,
      });
      // The profile screen renders TARGET's name — the bearer session
      // really is the target's now, not just a band. Asserted on the
      // Display name field rather than a page-wide text match: the
      // list screen stays mounted beneath this route, so `getByText`
      // resolves to that hidden row (and did, in CI, 23 times over).
      await expect(
        page.getByRole("textbox", { name: "Display name" }),
      ).toHaveValue(target, { timeout: ELEMENT_TIMEOUT });
    });

    await test.step("stopping returns to the user list, band gone", async () => {
      await page.getByRole("button", { name: "Stop impersonating" }).click();
      await page.waitForURL("**/admin/users", {
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(
        page.getByRole("textbox", { name: "Search" }),
      ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
      await expect(
        page.getByRole("button", { name: "Stop impersonating" }),
      ).toHaveCount(0, { timeout: ELEMENT_TIMEOUT });
    });
  });

  test("a non-admin is sent to their trips, and a stranger to the landing", async ({
    page,
    request,
    browser,
  }) => {
    await test.step("a fresh non-admin lands on trips", async () => {
      // helpers/auth.ts: authenticateViaAPI seeds a non-admin and arms
      // its session. components/admin/AdminGate.tsx: a signed-in
      // non-admin redirects to /trips.
      await authenticateViaAPI(page, request, "Non Admin User");
      await page.goto("/admin/users");
      await page.waitForURL("**/trips", {
        timeout: NAVIGATION_TIMEOUT,
      });
    });

    await test.step("a sessionless reader lands on the landing", async () => {
      // A clean context carries no init-script token, so this is the
      // stranger path: AdminGate redirects the signed-out to /.
      const anonymous = await browser.newContext();
      const stranger = await anonymous.newPage();
      try {
        await stranger.goto("/admin/users");
        await stranger.waitForURL((url) => url.pathname === "/", {
          timeout: NAVIGATION_TIMEOUT,
        });
      } finally {
        await anonymous.close();
      }
    });
  });

  test("an admin who signs in through the UI sees the group", async (
    { page, request },
    testInfo,
  ) => {
    // THE POINT OF THIS TEST: admin-ness is adopted from GET /auth/me
    // after a sign-in, because verify-code's reply carries no role.
    // Nothing else in this suite can see that path — the other tests
    // use armSession, a cold start that restores instead. If identity
    // adoption regresses, this is the only test that fails.
    const adminPhone = adminPhoneFor(testInfo.workerIndex);
    await test.step("name the admin number first", async () => {
      // Seeded through the API so the UI chain lands on /trips
      // directly (a fresh account would detour to /complete-profile).
      // The sign-in below still runs through the real UI.
      await seedUserViaAPI(request, adminPhone, "E2E Admin");
    });

    await test.step("sign in through the UI", async () => {
      await page.goto("/login");
      // app/login.tsx: heading "Get started".
      await expect(page.getByText("Get started")).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
      // components/ui/PhoneField.tsx: default label "Phone number";
      // pressSequentially, not fill (see auth-journey.spec.ts).
      const phoneInput = page.getByRole("textbox", { name: "Phone number" });
      await phoneInput.click();
      await phoneInput.pressSequentially(adminPhone);
      // components/ui/Checkbox.tsx: the consent row is the only
      // checkbox on app/login.tsx.
      await page.getByRole("checkbox").click();
      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForURL("**/verify", {
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
      // app/verify.tsx: TextField label="Code"; six digits submit on
      // their own, and a profile-complete account lands on /trips.
      await page.getByRole("textbox", { name: "Code" }).fill(FIXED_CODE);
      await page.waitForURL("**/trips", {
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
    });

    await test.step("the group is there without a reload", async () => {
      // components/ui/AppHeader.tsx: AvatarButton Pressable
      // aria-label="Profile" (app chrome variant on /trips).
      await page.getByLabel("Profile").click();
      await page.waitForURL("**/profile", {
        timeout: NAVIGATION_TIMEOUT,
      });
      // app/profile.tsx: the Admin group's Link "User management" —
      // adopted from GET /auth/me after sign-in, no reload involved.
      await expect(page.getByText("User management")).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
    });
  });
});
