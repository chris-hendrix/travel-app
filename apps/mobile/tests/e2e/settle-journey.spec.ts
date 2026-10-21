/**
 * E2E Journey: the ledger (mobile).
 *
 * Critical flow 7 (Money), three tests, because the split has two halves and
 * an exit, and they fail differently.
 *
 * **One: the rule.** A member opens the trip, opens the `Settle` door, adds
 * an expense, reads it in the ledger, reloads, and both the entry and the
 * debt row are still there — a server round-trip, not the cache. The last
 * step then adds a **third member** through the API and reads the same
 * expense again: the split is a rule (`Everyone going`, the form's default),
 * so the new guest is on a cost they were never ticked into, and the
 * arithmetic moves from `$22.50` to `$15.00` without anybody editing it. No
 * split control is touched anywhere in it: the rule is the default and the
 * point is that it follows the roster by itself.
 *
 * **Two: the choice.** The same five steps with one control added — `Split
 * with` set to `Choose people`, the second member unticked, the expense read
 * back with exactly one share of the whole amount. That half of the control
 * (the dropdown, the checkbox list and the per-person shares it draws) is
 * covered by nothing else in the suite, and it is not a fat journey: it is a
 * second, shorter walk of the same one flow, with a different answer to the
 * one question the ledger form asks about people. Keeping it separate keeps
 * each test's arithmetic readable — the first reads a split that grows, the
 * second a split the reader narrowed — and a reader debugging one of them
 * does not have to reason about the other's roster.
 *
 * **Three: the exit.** An expense is deleted from its own sheet and the
 * ledger's X has to leave the ledger rather than walk back into the row that
 * is gone. Deleting is permanent (`0059`), so the form asks first, and the
 * two presses plus the X are the only coverage this flow has: nothing else in
 * the suite deletes an expense at all, and the failure it guards is a door
 * that opens onto a screen that no longer exists.
 *
 * **The second party is a precondition, not decoration.** A trip whose
 * only member is the creator nets to zero: `computeNetBalances` credits
 * and debits the same member key and `simplifyDebts` drops zero
 * balances, so the "Who owes whom" table would be empty and there would
 * be no debt row to read. `seedTripViaAPI` (helpers/trip.ts) makes a
 * one-member trip, so the guest is seeded inline through the organizer's
 * `POST /trips/:tripId/members/guests` (`helpers/members.ts`) and named
 * as the **payer** in the first test, which is what puts two people on
 * opposite sides of one number: the payer is credited the whole expense
 * and debited their share of it. The second test leaves the payer at the
 * form's default — the reader — because its assertion is an absence: the
 * unticked guest is nowhere on the row, which only holds if they are not
 * its payer either.
 *
 * The guest's name is `uniqueLabel`d (`helpers/auth.ts`) for the same
 * reason every other generated name here is: the debt row's sentence is
 * its own accessible name and the assertion matches on it, so a name a
 * sibling worker could also have generated would let two trips collide.
 *
 * Selectors are accessible names, never `testID`: `getByRole` for the
 * doors and the fields, `getByText` for the sentences the ledger writes.
 * Nothing here re-verifies a unit test — `__tests__/payments.test.ts`
 * owns `moveFor`, `splitPreview` and `positionFor`, and the amounts are
 * the ones that divide evenly precisely so neither test is a second test
 * of the remainder cent. Field-level validation is banned at this level
 * and is not asserted.
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
import { seedExpenseViaAPI } from "./helpers/payments";

test.describe("Settle Journey", () => {
  test("record an expense → read the debt → reload keeps both", async ({
    page,
    request,
  }) => {
    const tripName = uniqueLabel("E2E Ledger");
    const guestName = uniqueLabel("Money Guest");
    const laterGuestName = uniqueLabel("Later Guest");
    const description = uniqueLabel("Harbour dinner");
    // $45.00 between two people is $22.50 each with no remainder cent, so
    // the sentence below does not depend on which of the two the roster
    // happens to list first (the server hands the remainder to the first
    // participant it is sent — `lib/payments.ts:splitPreview`).
    const amount = "45.00";
    const share = "$22.50";
    // The same $45.00 across three is $15.00 each, again with no remainder
    // cent to hand out: the third person joins without re-dividing an odd
    // cent, so the shares below are three equal numbers.
    const thirdShare = "$15.00";
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

      // No split control is touched. The form's default scope is
      // `Everyone going` (`components/trip/ExpenseDialog.tsx`), and it
      // renders the resolved people and their shares rather than a box
      // per person — the expense is between the whole roster by
      // construction, and the roster here is exactly the two members
      // seeded above: the creator (`going` at creation) and the guest
      // (`user_id IS NULL`, which the rule counts as going). The other
      // answer — `Choose people`, and the boxes it draws — is the second
      // test's, which is where a control is actually touched.

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

    // **After** the step above, not before: a third participant turns the
    // $22.50 shares into $15.00 ones, and every assertion up to here reads
    // the two-person arithmetic. This is the dynamic half of the flow — the
    // split is a rule resolved on every read, not a snapshot of who was
    // ticked — so the cost has to be recorded first and the roster moved
    // second, which is also the order a real trip happens in.
    await test.step("a guest added later joins the split", async () => {
      // The organizer's own guest endpoint (`helpers/members.ts`), the same
      // POST the roster's "Add a guest" screen sends. The name is
      // `uniqueLabel`d like every generated name here (the header's rule) and
      // for a second reason: the split row is matched by its text, and the
      // **hidden** ledger beneath the detail names this guest too — it is on
      // the end of a simplified move — so the assertions below are
      // visible-only rather than plain text matches.
      await seedGuestViaAPI(request, token, tripId, laterGuestName);

      // A **reload**, not a re-open. The ledger's three reads sit inside a
      // 30s `staleTime`, so navigating back into the route would repaint the
      // cached people; only a fresh load refetches the balances and the
      // expenses, which is what a second phone's member has to reach.
      await page.reload();
      await expect(page.getByText(description).first()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });

      // The entry is the way in: `SettleLedger`'s `ExpenseRow` is a
      // `Pressable role="button"` named by the words it carries, and the
      // description is the one of them nothing else in the ledger shares.
      // Substring, explicitly: the name is the whole row — description,
      // payer line, day and amount — so an exact match would never find it.
      await page
        .getByRole("button", { name: description, exact: false })
        .click();
      await page.waitForURL("**/trips/settle/detail*", {
        timeout: NAVIGATION_TIMEOUT,
      });

      // `components/trip/ExpenseDetail.tsx`: the split block lists the
      // people the server resolved. Three rows, because the roster is now
      // three — the viewer, the guest who paid, and the guest added a
      // moment ago, who was never part of this expense as it was recorded.
      // Visible-only, because the ledger stays mounted behind a pushed
      // route (the admin and invitation specs' own fix).
      await expect(
        page
          .getByText(laterGuestName)
          .filter({ visible: true })
          .first(),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });
      // And the shares followed the roster: $45.00 across three, three
      // times. `exact` so a row's sentence cannot count as one of them.
      await expect(
        page
          .getByText(thirdShare, { exact: true })
          .filter({ visible: true }),
      ).toHaveCount(3, { timeout: ELEMENT_TIMEOUT });
    });
  });

  // The other half of the same flow: the split is the reader's own list
  // rather than a rule, which is the one path in the form that draws a box
  // per person. Create, seed the second party, open the ledger, record
  // $45.00 with `Choose people` and the guest unticked, then read the entry
  // back: one share of the whole is what says the unticked person is out,
  // not merely cheaper.
  test("choose who shares it → one share of the whole", async ({
    page,
    request,
  }) => {
    const tripName = uniqueLabel("E2E Split");
    const guestName = uniqueLabel("Split Guest");
    const description = uniqueLabel("Beach umbrella");
    // $45.00 across the two people the trip starts with would be $22.50
    // each. Unticked, the reader is the list, and the whole $45.00 is one
    // share — a number the two-person split can never produce, which is why
    // it is the assertion.
    const amount = "45.00";
    const whole = "$45.00";
    let tripId: string;
    let token: string;

    await test.step("seed a session, a trip and the second party", async () => {
      ({ token } = await seedUserViaAPI(
        request,
        generateUniquePhone(),
        "Split Host",
      ));
      ({ id: tripId } = await seedTripViaAPI(request, token, tripName));
      // The row the boxes are drawn for, and the one that gets unticked.
      await seedGuestViaAPI(request, token, tripId, guestName);
    });

    await test.step("open the ledger from the Settle door", async () => {
      await armSession(page, token);
      await page.goto(`/trips/detail?id=${tripId}`);
      await expect(page.getByText(tripName).last()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await page.getByRole("button", { name: "Settle" }).click();
      await expect(page.getByText("Nothing here yet.").first()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
    });

    await test.step("add the expense, split with the people the reader picks", async () => {
      await page.getByRole("button", { name: "Add expense" }).last().click();

      const descriptionInput = page.getByRole("textbox", {
        name: "What was it?",
      });
      await descriptionInput.click();
      await descriptionInput.pressSequentially(description);

      const amountInput = page.getByRole("textbox", { name: "Amount" });
      await amountInput.click();
      await amountInput.pressSequentially(amount);

      // "Paid by" is left alone on purpose: a new expense defaults the payer
      // to the person holding the phone (`ExpenseDialog`'s `defaultPayerId`,
      // over the roster the form suspends until it has), and that is this
      // reader. So the guest below is nobody on this row — not a share and
      // not the payer — which is what makes the absence assertion mean
      // something.
      //
      // components/ui/Dropdown.tsx, `searchable={false}`: the field is a
      // value that opens a list rather than an input (`PickerField`), so it
      // is a `role="button"` whose accessible name is **the value it shows**
      // (the label is a sibling `Text`, not bound to the pressable — every
      // picker in the app is named this way), and it is **clicked**, not
      // typed into. The third row of the list it opens is the answer that
      // draws boxes (`SCOPE_ORDER` in `ExpenseDialog.tsx`), and each row is a
      // `role="button"` named by its label (`SuggestionList.tsx`).
      await page.getByRole("button", { name: "Everyone going" }).click();
      await page.getByRole("button", { name: "Choose people" }).click();

      // components/ui/Checkbox.tsx: the whole row is the target and the row
      // is `role="checkbox"`, named by the words inside it — the guest's
      // unique name and, beside it, their share, so the name is matched as
      // a substring. A tick is a state, so this leaves both seeded rows
      // ticked but one: the guest's own row.
      await page
        .getByRole("checkbox", { name: guestName, exact: false })
        .click();

      await page.getByRole("button", { name: "Add expense" }).last().click();
    });

    await test.step("the entry has one share, and it is the whole amount", async () => {
      await expect(page.getByText(description).first()).toBeVisible({
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });

      // The ledger's entry is the way in: `SettleLedger`'s `ExpenseRow` is a
      // `Pressable role="button"` named by the words it carries, and the
      // description is the one of them nothing else in the ledger shares.
      // Substring, because the name is the whole row.
      await page
        .getByRole("button", { name: description, exact: false })
        .click();
      await page.waitForURL("**/trips/settle/detail*", {
        timeout: NAVIGATION_TIMEOUT,
      });

      // `components/trip/ExpenseDetail.tsx`: the block over the people is
      // titled by the rule, and a fixed list reads `Split`. It is the check
      // that the menu's third answer was committed at all — a row left on
      // `Everyone going` would head this block `Everyone going`.
      await expect(
        page
          .getByText("Split", { exact: true })
          .filter({ visible: true })
          .first(),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });

      // Exactly one share of the whole: the amount at the top of the entry
      // is the second `$45.00` on the screen and the split block's one row
      // is the first, so two — not three, which is what a share per person
      // would draw. Visible-only, because the ledger stays mounted behind
      // the pushed route and its entry carries the same amount.
      await expect(
        page.getByText(whole, { exact: true }).filter({ visible: true }),
      ).toHaveCount(2, { timeout: ELEMENT_TIMEOUT });

      // And the person who was unticked is not on the row at all.
      await expect(
        page.getByText(guestName).filter({ visible: true }),
      ).toHaveCount(0);
    });
  });

  test("delete an expense → the ledger's X leaves the ledger", async ({
    page,
    request,
  }) => {
    const tripName = uniqueLabel("E2E Delete");
    const guestName = uniqueLabel("Delete Guest");
    const description = uniqueLabel("Harbour lunch");
    let tripId: string;
    let token: string;

    await test.step("seed a session, a trip and the expense to delete", async () => {
      ({ token } = await seedUserViaAPI(
        request,
        generateUniquePhone(),
        "Delete Host",
      ));
      ({ id: tripId } = await seedTripViaAPI(request, token, tripName));
      const payerMemberId = await seedGuestViaAPI(
        request,
        token,
        tripId,
        guestName,
      );
      // The row, not the form: this test is about the exit. `all_invited` is
      // the trip's whole roster, so the sheet has a split block to paint
      // without the seeder having to name participants.
      await seedExpenseViaAPI(request, token, tripId, {
        description,
        amount: 3000,
        payerMemberId,
        splitScope: "all_invited",
      });
    });

    await test.step("open the ledger and the expense's own sheet", async () => {
      await armSession(page, token);
      // The path a reader actually takes: the trip, its `Settle` door, the
      // row. The stack this builds is what the exit has to walk back down —
      // trip → ledger → sheet — so a deep link to the sheet would test a
      // stack the app never makes.
      await page.goto(`/trips/detail?id=${tripId}`);
      await expect(page.getByText(tripName).last()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await page.getByRole("button", { name: "Settle" }).click();
      // components/trip/SettleLedger.tsx: the row is the entry, pressed to
      // open its sheet.
      await page.getByText(description).first().click();
      // The sheet's own door: the ledger behind it carries the description
      // too, so the assertion names something only the sheet has.
      await expect(
        page.getByRole("button", { name: "Edit expense" }),
      ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
    });

    await test.step("delete it: the first press asks, the second does it", async () => {
      // components/trip/ExpenseDialog.tsx: the detail sheet's one primary
      // action is the edit door (`canEdit` — the seeded row is the
      // organizer's).
      await page.getByRole("button", { name: "Edit expense" }).click();

      // The danger button's first press arms the confirmation rather than
      // firing: deleting is permanent, so there is no undo to offer.
      await page
        .getByRole("button", { name: "Delete expense", exact: true })
        .last()
        .click();
      await expect(
        page.getByText("Deleting an expense is permanent."),
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT });

      // The second press is the delete. It lands on the ledger — the surface
      // the row left (`useDismissTo`), not the sheet that read it.
      await page
        .getByRole("button", { name: "Delete expense, for good" })
        .click();
      await expect(page.getByText(description)).toHaveCount(0, {
        timeout: SLOW_NAVIGATION_TIMEOUT,
      });
      await expect(
        page.getByRole("button", { name: "Add expense" }).last(),
      ).toBeVisible({ timeout: NAVIGATION_TIMEOUT });
    });

    await test.step("X on the ledger exits to the trip", async () => {
      // components/ui/AppHeader.tsx: `aria-label="Close"`, the X in the
      // dialog's header. Located by the label rather than by role: the X is a
      // bare `Pressable` with no `accessibilityRole`, so RN Web gives it no
      // button role — `getByRole` finds nothing, and this is the one selector
      // in the suite that has to say so.
      await page.locator('[aria-label="Close"]').last().click();

      // The trip, and not the deleted row's sheet — which is what the exit
      // used to reach, because the sheet stayed in the stack under the
      // ledger. Its sentence is the tell.
      await expect(page.getByText(tripName).last()).toBeVisible({
        timeout: NAVIGATION_TIMEOUT,
      });
      await expect(
        page.getByText("That expense is not here any more."),
      ).toHaveCount(0);
    });
  });
});
