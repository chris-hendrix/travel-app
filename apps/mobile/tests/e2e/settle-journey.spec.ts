/**
 * E2E Journey: the ledger (mobile).
 *
 * Critical flow 7 (Money), one test: a member opens the trip, opens the
 * `Settle` door, adds an expense, reads it in the ledger, reloads, and
 * both the entry and the debt row are still there — a server
 * round-trip, not the cache.
 *
 * **The second party is a precondition, not decoration.** A trip whose
 * only member is the creator nets to zero: `computeNetBalances` credits
 * and debits the same member key and `simplifyDebts` drops zero
 * balances, so the "Who owes whom" table would be empty and there would
 * be no debt row to read. `seedTripViaAPI` (helpers/trip.ts) makes a
 * one-member trip, so the guest is seeded inline through the organizer's
 * `POST /trips/:tripId/members/guests` (`helpers/members.ts`) and named
 * as the **payer**, which is what puts two people on opposite sides of
 * one number: the payer is credited the whole expense and debited their
 * share of it.
 *
 * The guest's name is `uniqueLabel`d (`helpers/auth.ts`) for the same
 * reason every other generated name here is: the debt row's sentence is
 * its own accessible name and the assertion matches on it, so a name a
 * sibling worker could also have generated would let two trips collide.
 *
 * Selectors are accessible names, never `testID`: `getByRole` for the
 * doors and the fields, `getByText` for the sentences the ledger writes.
 * Nothing here re-verifies a unit test — `__tests__/payments.test.ts`
 * owns `moveFor`, `splitPreview` and `positionFor`, and the amount is
 * the one that divides evenly precisely so this spec is not a second
 * test of the remainder cent. Field-level validation is banned at this
 * level and is not asserted.
 */

import { test, expect } from "@playwright/test";
import {
  armSession,
  generateUniquePhone,
  seedUserViaAPI,
  uniqueLabel,
} from "./helpers/auth";
import {
  ELEMENT_TIMEOUT,
  NAVIGATION_TIMEOUT,
  SLOW_NAVIGATION_TIMEOUT,
} from "./helpers/timeouts";
import { seedTripViaAPI } from "./helpers/trip";
import { seedGuestViaAPI } from "./helpers/members";

test.describe("Settle Journey", () => {
  test("record an expense → read the debt → reload keeps both", async ({
    page,
    request,
  }) => {
    const tripName = uniqueLabel("E2E Ledger");
    const guestName = uniqueLabel("Money Guest");
    const description = uniqueLabel("Harbour dinner");
    // $45.00 between two people is $22.50 each with no remainder cent, so
    // the sentence below does not depend on which of the two the roster
    // happens to list first (the server hands the remainder to the first
    // participant it is sent — `lib/payments.ts:splitPreview`).
    const amount = "45.00";
    const share = "$22.50";
    let tripId: string;
    let token: string;

    await test.step("seed a session, a trip and the second party", async () => {
      ({ token } = await seedUserViaAPI(
        request,
        generateUniquePhone(),
        "Money Host",
      ));
      ({ id: tripId } = await seedTripViaAPI(request, token, tripName));
      // Organizer-only, body per `createGuestSchema` — the guest row the
      // debt below is between. `seedTripViaAPI` made a one-member trip.
      await seedGuestViaAPI(request, token, tripId, guestName);
    });

    await test.step("open the trip", async () => {
      // The seeded token is written into `localStorage` before the app
      // boots (`armSession`, helpers/auth.ts), and the app restores the
      // session through `GET /auth/me`.
      await armSession(page, token);
      await page.goto(`/trips/detail?id=${tripId}`);
      // app/trips/detail.tsx: the header renders the trip title as
      // display text (same shape the other specs assert with `.last()`).
      await expect(page.getByText(tripName).last()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
    });

    await test.step("open the ledger from the Settle door", async () => {
      // app/trips/detail.tsx: the hero's fourth door is
      // `QuietAction label="Settle"` — `role="button"`, and the door
      // carries no condition on role or balance.
      await page.getByRole("button", { name: "Settle" }).click();
      // components/trip/SettleLedger.tsx: a trip with no money says the
      // same sentence under both tables, so the first of the two is the
      // guard that the ledger resolved rather than still loading.
      await expect(page.getByText("Nothing here yet.").first()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
    });

    await test.step("add the expense", async () => {
      // The ledger's ActionBar (`app/trips/settle.tsx`:
      // `primaryTitle="Add expense"`). `.last()` because the ledger
      // beneath the form carries the same two words — the same call the
      // itinerary spec makes for "Add event".
      await page.getByRole("button", { name: "Add expense" }).last().click();

      // components/trip/ExpenseDialog.tsx: TextField label="What was it?".
      // `pressSequentially`, not `fill`: the trip spec's input lesson —
      // `fill()` desynchronizes controlled RN inputs.
      const descriptionInput = page.getByRole("textbox", {
        name: "What was it?",
      });
      await descriptionInput.click();
      await descriptionInput.pressSequentially(description);

      // TextField label="Amount", decimal-pad, USD suffix. The day is
      // not typed: the form defaults it to today in the zone the ledger
      // reads it back in (`app/trips/settle/form.tsx`).
      const amountInput = page.getByRole("textbox", { name: "Amount" });
      await amountInput.click();
      await amountInput.pressSequentially(amount);

      // Dropdown label="Paid by" over every member row, guests labelled
      // with the roster's own word for them ("<name> · Guest"). The list
      // opens on a change, not on a focus, so the field is selected and
      // retyped rather than merely clicked; the guest's unique name is
      // the whole of the query, so exactly one row can match.
      // components/ui/SuggestionList.tsx: each row is `role="button"`
      // named by its label (`lib/dropdown.ts:entryAccessibilityLabel`).
      const payerInput = page.getByRole("textbox", { name: "Paid by" });
      await payerInput.click();
      await payerInput.selectText();
      await payerInput.pressSequentially(guestName);
      await page.getByRole("button", { name: guestName }).click();

      // `Split with` — one `Checkbox` per member row, `role="checkbox"`
      // with `aria-checked` (`components/ui/Checkbox.tsx`). The default
      // split already carries every `going` member and every guest, so
      // the loop only clicks what is not ticked: it is what makes "all
      // participants" a fact of this expense rather than a fact of the
      // default. Two rows, because the trip has exactly two members —
      // asserted rather than assumed, since the arithmetic below is over
      // the split.
      const boxes = page.getByRole("checkbox");
      await expect(boxes).toHaveCount(2);
      for (let i = 0; i < 2; i += 1) {
        const box = boxes.nth(i);
        if ((await box.getAttribute("aria-checked")) !== "true") {
          await box.click();
        }
        await expect(box).toHaveAttribute("aria-checked", "true");
      }

      // components/ui/FullscreenDialog.tsx + ActionBar: the dialog's one
      // primary action, the same two words as its title.
      await page.getByRole("button", { name: "Add expense" }).last().click();
    });

    await test.step("the ledger reads the expense and the debt", async () => {
      // SettleLedger's ExpenseRow: the description leads the row and the
      // payer's line sits under it (`joinFacts` — "<name> paid · <day>").
      await expect(page.getByText(description).first()).toBeVisible({
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
      await expect(page.getByText(`${guestName} paid`).first()).toBeVisible({
        timeout: ELEMENT_TIMEOUT,
      });
      // SettleLedger's MoveRow: `lib/payments.ts:moveFor` reads the one
      // simplified move from the viewer's side, so the guest — who paid
      // and is on half the split — is owed the viewer's share.
      await expect(page.getByText(`You owe ${guestName} ${share}`)).toBeVisible({
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
      // The headline: `positionFor` on `/balances/me` — a different string
      // from the row above, so this is the position and not the move. Its
      // own read, fired beside the balances one, hence the same patience.
      await expect(page.getByText(`You owe ${share}`)).toBeVisible({
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
    });

    await test.step("reload: both rows are the server's, not the cache", async () => {
      // The ledger is a route, not an overlay: a reload lands on the same
      // sheet, reads the trip, the balances and the expenses again.
      await page.reload();
      await expect(page.getByText(description).first()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(page.getByText(`You owe ${guestName} ${share}`)).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
    });
  });
});
