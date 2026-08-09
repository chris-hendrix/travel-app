import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import {
  authenticateViaAPIWithPhone,
  createUserViaAPI,
} from "./helpers/auth";
import { removeNextjsDevOverlay, dismissPwaPrompts } from "./helpers/nextjs-dev";
import { navigateToMobilePanel } from "./helpers/mobile-panels";
import { snap } from "./helpers/screenshots";
import {
  createTripViaAPI,
  inviteAndAcceptViaAPI,
} from "./helpers/invitations";
import {
  API_BASE,
  NAVIGATION_TIMEOUT,
  ELEMENT_TIMEOUT,
} from "./helpers/timeouts";

/**
 * E2E Journey: Settle (Expenses & Balances)
 *
 * Tests ONLY the critical flow: does the money math appear correctly in the UI?
 * Form-fill, inline-guest-creation, edit, and delete steps are covered by
 * settlement-form.test.tsx (353 lines) + settle-section.test.tsx (317 lines).
 * Backend balance logic is covered by balance.service.test.ts (377 lines)
 * + balance.routes.test.ts (122 lines).
 */

async function fetchUserId(
  request: APIRequestContext,
  cookie: string,
): Promise<string> {
  const res = await request.get(`${API_BASE}/auth/me`, {
    headers: { cookie },
  });
  const json = await res.json();
  return json.user.id;
}

test.describe("Settle Journey", () => {
  test.beforeEach(async ({ page }) => {
    await removeNextjsDevOverlay(page);
    await dismissPwaPrompts(page);
    await page.context().clearCookies();
  });

  test(
    "balance accuracy — UI matches API-calculated balance",
    { tag: "@smoke" },
    async ({ page, request }) => {
      test.slow();
      const timestamp = Date.now();
      const shortTimestamp = timestamp.toString().slice(-10);

      // ── Step 1: Create two users via API ──────────────────────────
      const phoneA = `+1555${shortTimestamp}`;
      const phoneB = `+1555${(parseInt(shortTimestamp) + 1000).toString()}`;

      const cookieA = await createUserViaAPI(request, phoneA, "Settle Tester");
      const cookieB = await createUserViaAPI(request, phoneB, "Trip Buddy");

      const userIdA = await fetchUserId(request, cookieA);
      const userIdB = await fetchUserId(request, cookieB);

      // ── Step 2: Create trip and invite user B (via API) ───────────
      const tripId = await createTripViaAPI(request, cookieA, {
        name: `Settle Trip ${timestamp}`,
        destination: "Denver, CO",
        startDate: "2026-11-01",
        endDate: "2026-11-05",
      });

      await inviteAndAcceptViaAPI(
        request,
        tripId,
        phoneA,
        phoneB,
        "Trip Buddy",
        cookieA,
      );

      // ── Step 3: Create an expense via API ─────────────────────────
      // $50.00 (5000 cents) split between 2 participants
      // User A paid → User B owes $25.00
      await test.step("create expense via API", async () => {
        const res = await request.post(`${API_BASE}/trips/${tripId}/payments`, {
          data: {
            description: "Dinner at restaurant",
            amount: 5000, // cents
            userId: userIdA,
            participants: [{ userId: userIdA }, { userId: userIdB }],
          },
          headers: { cookie: cookieA },
        });
        expect(res.ok()).toBe(true);
      });

      // ── Step 4: Query balances via API (source of truth) ──────────
      const balancesRes = await request.get(
        `${API_BASE}/trips/${tripId}/balances`,
        { headers: { cookie: cookieA } },
      );
      const balancesJson = await balancesRes.json();
      expect(balancesJson.success).toBe(true);
      expect(balancesJson.balances).toHaveLength(1);

      const balanceEntry = balancesJson.balances[0];
      // Trip Buddy owes Settle Tester $25.00
      expect(balanceEntry.from.name).toBe("Trip Buddy");
      expect(balanceEntry.to.name).toBe("Settle Tester");
      expect(balanceEntry.amount).toBe(2500); // cents

      // ── Step 5: Navigate browser to the settle tab ───────────────
      await authenticateViaAPIWithPhone(page, request, phoneA, "Settle Tester");
      await page.goto(`/trips?id=${tripId}`);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: `Settle Trip ${timestamp}`,
        }),
      ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });

      await test.step("navigate to settle section", async () => {
        await navigateToMobilePanel(page, "Settle");
        const settleHeading = page.getByRole("heading", {
          name: "Settle",
          exact: true,
        });
        await expect(settleHeading).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      });

      // ── Step 6: Assert UI shows correct balance ──────────────────
      await test.step("verify balance accuracy in UI", async () => {
        // The balance item renders: "Trip Buddy owes You $25.00"
        await expect(page.getByText(/owes/)).toBeVisible({
          timeout: ELEMENT_TIMEOUT,
        });
        await expect(page.getByText("$25.00")).toBeVisible();

        await snap(page, "30-settle-balance-accuracy");
      });
    },
  );
});
