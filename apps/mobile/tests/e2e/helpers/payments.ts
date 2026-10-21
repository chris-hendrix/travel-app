/**
 * Expense seeding for E2E: a row the browser does not have to type.
 *
 * The delete spec is about a row's **exit**, not about the form that writes
 * it, so the row arrives through `POST /trips/:tripId/payments` (the shape
 * `lib/queries/payments.ts:createPayment` sends, body per
 * `createPaymentSchema`) and the test spends its steps on the two presses
 * and the navigation that follows.
 *
 * The route carries the **write** rate limit, so the POST retries on 429
 * through `helpers/http.ts`: two projects in parallel over one API is what
 * trips a limiter, and no spec exercises the limiter itself.
 */

import type { APIRequestContext } from "@playwright/test";
import { postWithRetry } from "./http";
import { API_BASE } from "./timeouts";

/**
 * One expense on a trip, filed by the token's user.
 *
 * A rule, not a list: the caller hands the payer's member id (a guest's,
 * usually) and the scope, and the API resolves the people. A spec that needs
 * a fixed list should type the form — `participants` is not here because
 * nothing has needed it yet, and an unused parameter is a shape nobody has
 * tested.
 */
export async function seedExpenseViaAPI(
  request: APIRequestContext,
  organizerToken: string,
  tripId: string,
  input: {
    description: string;
    /** Cents, as the API stores it. */
    amount: number;
    payerMemberId: string;
    splitScope?: "custom" | "all_going" | "all_invited";
  },
): Promise<void> {
  const res = await postWithRetry(
    request,
    `${API_BASE}/trips/${tripId}/payments`,
    {
      headers: { Authorization: `Bearer ${organizerToken}` },
      data: {
        description: input.description,
        amount: input.amount,
        payerMemberId: input.payerMemberId,
        splitScope: input.splitScope ?? "all_invited",
      },
    },
    "create-payment",
  );
  if (!res.ok()) {
    throw new Error(`create-payment failed: ${res.status()} ${await res.text()}`);
  }
}
