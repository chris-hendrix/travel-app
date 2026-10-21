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
 * exactly as the other seeders do: two projects in parallel over one API is
 * what trips a limiter, and no spec exercises the limiter itself.
 */

import type { APIRequestContext } from "@playwright/test";
import { API_BASE } from "./timeouts";

/**
 * POST with retry on 429. Parses the limiter's "retry in N seconds" hint when
 * present, else backs off linearly (~1s per attempt) — the same shape as
 * `helpers/members.ts`'s private retry, kept local for the same reason.
 */
async function postWithRetry(
  request: APIRequestContext,
  url: string,
  options: Parameters<APIRequestContext["post"]>[1],
  which: string,
  maxAttempts = 6,
): Promise<ReturnType<APIRequestContext["post"]>> {
  let last: Awaited<ReturnType<APIRequestContext["post"]>> | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    last = await request.post(url, options);
    if (last.status() !== 429) return last;
    if (attempt === maxAttempts) break;
    const body = await last.text().catch(() => "");
    const hinted = Number(/retry in (\d+)/i.exec(body)?.[1]);
    const waitMs = Number.isFinite(hinted) && hinted > 0 ? hinted * 1000 : 1000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  if (!last) throw new Error(`${which} never ran`);
  return last;
}

/**
 * One expense on a trip, filed by the token's user.
 *
 * A `custom` split may omit `participants` only when it has exactly one; the
 * caller hands the payer's member id (a guest's, usually), and the API's own
 * validation decides whether the row is legal.
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
    participants?: { memberId: string }[];
  },
): Promise<{ id: string }> {
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
        ...(input.participants ? { participants: input.participants } : {}),
      },
    },
    "create-payment",
  );
  if (!res.ok()) {
    throw new Error(`create-payment failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { payment: { id: string } };
  return { id: body.payment.id };
}
