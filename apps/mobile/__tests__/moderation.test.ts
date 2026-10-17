import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { reportUserSchema, REPORT_REASONS } from "@journiful/shared/schemas";
import { ApiError, NetworkError } from "@/lib/api";
import type { Member } from "@/lib/members";
import {
  REPORT_NOTE_MAX,
  REPORT_REASON_LABELS,
  REPORT_RECORDED_COPY,
  moderationFailureCopy,
  moderationPendingLabel,
  moderatableUserId,
  reportReasonLabel,
} from "@/lib/moderation";

/** A member row's person, shaped like the roster's own fixture convention. */
function member(over: Partial<Member> = {}): Member {
  return {
    id: "member-1",
    userId: "user-1",
    name: "Liam",
    status: "going",
    isOrganizer: false,
    phone: "+15550000001",
    sharePhone: true,
    handles: null,
    ...over,
  };
}

/**
 * The reason vocabulary is the API's, not this file's.
 *
 * The load-bearing halves are that every value has a label and that no
 * label exists for a value that does not: the list is iterated rather than
 * listed here, so a fifth reason added to `shared` fails this instead of
 * rendering as a blank chip.
 */
describe("the reason vocabulary", () => {
  it("is the four values, each with a label", () => {
    expect([...REPORT_REASONS]).toEqual([
      "spam",
      "harassment",
      "impersonation",
      "other",
    ]);
    for (const reason of REPORT_REASONS) {
      const label = REPORT_REASON_LABELS[reason];
      expect(typeof label).toBe("string");
      expect(label).not.toBe("");
      // One label per value, read through the one accessor the screens use.
      expect(reportReasonLabel(reason)).toBe(label);
    }
  });

  it("has no label without a value", () => {
    // The other direction: a label left behind by a value that moved or
    // was renamed is a map that has quietly stopped matching the API.
    expect(Object.keys(REPORT_REASON_LABELS).sort()).toEqual(
      [...REPORT_REASONS].sort(),
    );
  });

  it("caps the note exactly where the API does", () => {
    // Parsed through `reportUserSchema` rather than compared to a 500
    // typed here: that is the end that accepts or refuses the note, so
    // this fails the day the two numbers stop agreeing.
    const body = {
      userId: "550e8400-e29b-41d4-a716-446655440000",
      reason: "spam" as const,
    };
    expect(
      reportUserSchema.safeParse({
        ...body,
        note: "x".repeat(REPORT_NOTE_MAX),
      }).success,
    ).toBe(true);
    expect(
      reportUserSchema.safeParse({
        ...body,
        note: "x".repeat(REPORT_NOTE_MAX + 1),
      }).success,
    ).toBe(false);
  });
});

describe("moderatableUserId", () => {
  it("names the account behind another member", () => {
    expect(moderatableUserId(member({ userId: "user-2" }), "user-1")).toBe(
      "user-2",
    );
  });

  it("leaves a guest alone", () => {
    // A guest's `userId` is null, which is the same fact `guest: true`
    // carries; the account is what is read, and there is none. An invited
    // row is not an argument at all any more: a card belongs to a member,
    // and an invitation is a phone number with nobody behind it.
    const guest = member({ id: "member-2", userId: null, name: "Mom" });
    expect(moderatableUserId(guest, "user-1")).toBeNull();
  });

  it("leaves your own card alone", () => {
    // You cannot report or block yourself, and the API refuses it, so the
    // control is not offered rather than answered with a 4xx.
    expect(moderatableUserId(member({ userId: "user-1" }), "user-1")).toBeNull();
  });

  it("moderates every other account when the viewer is unknown", () => {
    // An unresolved session matches no id, and nothing matches nothing.
    expect(moderatableUserId(member({ userId: "user-1" }), undefined)).toBe(
      "user-1",
    );
  });
});

describe("the panel's own words", () => {
  it("names the write in flight", () => {
    // The `pendingLabel` idiom: the same button, a different word while it
    // is working, so the thumb that pressed it is not hunting a new one.
    expect(moderationPendingLabel("report")).toBe("Reporting…");
    expect(moderationPendingLabel("block")).toBe("Blocking…");
  });

  it("names the unblock write in flight, in the same voice", () => {
    // The blocked list's one action is the same idiom rather than a second
    // one: one word per write, and it changes only while the write runs.
    expect(moderationPendingLabel("unblock")).toBe("Unblocking…");
  });

  it("says the connection failed when the request never arrived", () => {
    // `toErrorCopy` passes a NetworkError through with no message of its
    // own, and "went wrong" is the wrong sentence for a request that never
    // left the phone.
    expect(
      moderationFailureCopy(new NetworkError("Network request failed"), "block"),
    ).toBe("You're offline. Check your connection and try again.");
  });

  it("uses the mapper's sentence when it has one", () => {
    expect(moderationFailureCopy(new ApiError(403, "Nope"), "report")).toBe(
      "You can't do that here",
    );
  });

  it("falls back to the action's own sentence when the status says nothing", () => {
    // 404 is the one status `toErrorCopy` deliberately passes through with
    // no message: nothing was there to fail, so the screen names the act.
    expect(moderationFailureCopy(new ApiError(404, "Not found"), "block")).toBe(
      "Couldn't block them.",
    );
    expect(
      moderationFailureCopy(new ApiError(404, "Not found"), "report"),
    ).toBe("Couldn't send the report.");
  });

  it("says a report was read, because nothing on screen would", () => {
    expect(REPORT_RECORDED_COPY).toBe("Thanks. An admin will look at this.");
  });
});

/**
 * The panel, read off disk — the word and the answers it opens, which live
 * with the person's own card now (`components/trip/ReportOrBlock.tsx`).
 *
 * A source-level assertion, and the level is the honest one: there is no
 * renderer in this package (`apps/mobile/vitest.config.ts` is plain node),
 * so a screen's markup cannot be rendered here at all. `ruled-block.test.ts`
 * reads the two real row components off disk for the same reason. What this
 * can hold is the one thing the pure tests above cannot: that the panel
 * *draws* the vocabulary rather than a list typed into the screen — the
 * labels are iterated, so a reason added to `shared` has to reach the chips
 * or this fails.
 */
const PANEL = fs.readFileSync(
  path.join(__dirname, "..", "components", "trip", "ReportOrBlock.tsx"),
  "utf8",
);

/**
 * The roll call, read off disk for the one moderation surface that stayed on
 * it: the blocked list under the roster, which is the undo and is nobody
 * else's to draw.
 */
const SCREEN = fs.readFileSync(
  path.join(__dirname, "..", "app", "trips", "members.tsx"),
  "utf8",
);

describe("the person's panel", () => {
  it("lists the reasons from the vocabulary, never from a list typed here", () => {
    expect(PANEL).toMatch(/REPORT_REASONS\.map\(/);
    for (const label of Object.values(REPORT_REASON_LABELS)) {
      // A hardcoded chip reads as `label="Spam"`; neither of the two
      // spellings can appear if the map is what draws them.
      expect(PANEL).not.toContain(`"${label}"`);
      expect(PANEL).not.toContain(`>${label}<`);
    }
  });

  it("reports a failure in the panel, and keeps a block out of the alert colour", () => {
    // The app has no toast: a failed write says so where the content
    // would have been, which is `InlineError`'s whole contract.
    expect(PANEL).toContain("<InlineError");
    // A block is undone from the same route's DELETE, so it is never the
    // colour reserved for what cannot be taken back.
    expect(PANEL).not.toContain('variant="danger"');
  });

  it("announces the reasons as the one choice they are", () => {
    // Four chips in a wrap row are one answer, not four filters: the group
    // says which it is and the chip is what carries it — the pair
    // `Segmented` draws for the same choice (`role="radio"` +
    // `aria-selected`), which the repo's own rule names and `aria-pressed`
    // is not.
    expect(PANEL).toMatch(/role="radiogroup"/);
    expect(PANEL).toMatch(/role="radio"/);
    // And the primitive has to forward it rather than swallow it: a
    // `ChipToggle` that took the prop and drew a button would leave this
    // group a radiogroup over four buttons.
    const chip = fs.readFileSync(
      path.join(__dirname, "..", "components", "ui", "ChipToggle.tsx"),
      "utf8",
    );
    expect(chip).toMatch(/role=\{role\}/);
    expect(chip).toMatch(/aria-selected=\{selected\}/);
  });

  it("announces the Cancel's guard rather than leaving it silent", () => {
    // `QuietAction` carries no disabled state, so the panel's Cancel keeps
    // its press while the handler refuses it — a screen reader would be
    // offered a control that silently does nothing. The state is announced
    // around it, the way `profile.tsx`'s calendar row and the trip page's
    // RSVP control say it.
    expect(PANEL).toMatch(/aria-busy=\{busy !== null\}/);
    expect(PANEL).toMatch(/role="group"/);
  });
});

/**
 * The wiring, which neither describe above can hold.
 *
 * `moderatableUserId` is exercised for real above and the panel's
 * vocabulary beside it, and neither would notice if the card stopped
 * *routing* through them: draw the panel for every member rather than
 * through the gate and every assertion here stays green, with a word on
 * your own card and on a guest's. `ruled-block.test.ts` writes its own "the
 * mark has to arrive, not just be composed" case for exactly this shape.
 * There is no renderer in this package, so the source is where the wiring
 * can be held — and the arrival itself, the card that draws the component
 * at all, is the third file.
 */
describe("the card's wiring", () => {
  /** The person's card: where a reader actually meets the word. */
  const CARD = fs.readFileSync(
    path.join(__dirname, "..", "app", "trips", "members", "detail.tsx"),
    "utf8",
  );

  it("gates the panel on the one pure decision, and mounts it on the card", () => {
    // The gate decides whether there is anybody to moderate, and a press on
    // the roll call is what the card is opened by.
    expect(PANEL).toMatch(/moderatableUserId\(member, user\?\.id\)/);
    expect(CARD).toContain("<ReportOrBlock");
  });

  it("hands the demo visitor nothing at all", () => {
    // The demo serves the roster read, but no block and no report is served
    // there: an ungated word would be a control on the public demo whose
    // only answer is a 404.
    expect(PANEL).toMatch(/if \(isDemoIdentity\(user\)\) return null;/);
    // The predicate is the app's own, read off the store the real routes'
    // session guards read it off — never a demo id spelled here.
    expect(PANEL).toMatch(
      /import \{ isDemoIdentity, useAuth \} from "@\/lib\/authStore"/,
    );
  });

  it("keeps the word off the roll call", () => {
    // The roll call drew it under every account-backed row, which is what
    // turned the list into a column of buttons wearing people's names. It is
    // one word on one card now, and this is the guard against it creeping
    // back into the list.
    expect(SCREEN).not.toContain("Report or block");
  });
});

/**
 * The repeated words name their subject.
 *
 * The row's word and the undo's word are each drawn once per person, and a
 * word on its own names the act and never the person it belongs to: a
 * reader walking the roster hears the same button N times with nothing
 * saying whose row it is on. Both call sites add the name, and the
 * primitive has to forward it rather than swallow it — a `QuietAction` that
 * took `ariaLabel` and drew the word alone would leave every one of them
 * anonymous again.
 */
describe("the repeated words name their subject", () => {
  it("names the person the card's own word is about", () => {
    expect(PANEL).toMatch(/ariaLabel=\{`Report or block \$\{name\}`\}/);
    // The name is the display name — the one thing the card shows for
    // everybody, and never a handle or a number the card withholds.
    expect(PANEL).toMatch(/name=\{member\.name\}/);
  });

  it("names the person the undo is about, without losing the pending word", () => {
    expect(SCREEN).toMatch(
      /ariaLabel=\{`\$\{word\} \$\{person\.displayName\}`\}/,
    );
    // One word, read twice: the label and the announced name are the same
    // value, so the in-flight word is not dropped from the name.
    expect(SCREEN).toMatch(/label=\{word\}/);
  });

  it("forwards it from the primitive rather than only accepting it", () => {
    const quiet = fs.readFileSync(
      path.join(__dirname, "..", "components", "ui", "QuietAction.tsx"),
      "utf8",
    );
    expect(quiet).toMatch(/aria-label=\{ariaLabel\}/);
  });
});

/**
 * The blocked list, off disk, in the same style and for the same reason:
 * no renderer in this package, so what can be held here is the shape the
 * claim depends on. The plan's own RED put the undo in the roster row's
 * dialog, which is a state the roster can never be in — Task 31's filter
 * omits the blocked pair's rows in both directions, so an already-blocked
 * member has no row to open a panel from. The undo is a block under the
 * roster instead, and these are the claims that keep it honest.
 */
describe("the blocked list on the roll call", () => {
  /**
   * The whole block is the non-empty branch of one ternary: the guard is
   * `blocked.length > 0`, and the branch ends at the `: null` the dialog
   * renders otherwise. Everything the block draws has to be inside it.
   */
  const guardAt = SCREEN.indexOf("blocked.length > 0 ?");
  const guarded =
    guardAt === -1
      ? ""
      : SCREEN.slice(guardAt, SCREEN.indexOf(") : null}", guardAt));

  it("draws nothing at all when there is nobody blocked", () => {
    // Loading, failed and nobody-blocked are one render, and it is
    // nothing: a heading over an empty list says you have blocked nobody,
    // which a read that never answered has not earned. This is
    // `admin/users/detail.tsx`'s own rule about its reports block.
    expect(guardAt).toBeGreaterThan(-1);
    expect(SCREEN).toContain("useBlockedUsers(");
    // The heading is drawn once, and it is inside the guard: one heading,
    // no other place it could be reached from.
    expect(SCREEN.match(/Blocked\s*<\/Text>/g)).toHaveLength(1);
    expect(guarded).toContain("Blocked");
  });

  it("stands under the roster and under the organizer's own block", () => {
    // Under the list it takes people off, and after the one block already
    // there — where a person who has just blocked somebody will look.
    expect(guardAt).toBeGreaterThan(SCREEN.indexOf("Add a guest"));
    // Not the organizer's: blocking is offered on every member's row, so
    // the undo is not a permission either. The guard is the read alone.
    expect(guarded).not.toContain("viewerIsOrganizer");
  });

  it("offers one Unblock per person, saying what it is doing while it works", () => {
    expect(guarded).toMatch(/blocked\.map\(/);
    expect(guarded).toContain("<QuietAction");
    // The in-flight word is the mapper's, never a literal typed here.
    expect(guarded).toMatch(/moderationPendingLabel\("unblock"\)/);
    expect(SCREEN).not.toContain("Unblocking…");
    // `QuietAction` carries no `disabled`: the press is guarded while the
    // write is in flight, which is the panel's own Cancel pattern — a
    // second press is a no-op rather than a second DELETE.
    expect(SCREEN).toMatch(/if \(unblockingId !== null\) return;/);
  });

  it("says the failure under the block, from the same mapper as every write", () => {
    // `removeTrip` in `app/trips/edit.tsx` is the shape: `toErrorCopy`, the
    // offline sentence, and the act's own sentence as the fallback for the
    // status that carries none (a 404). The app has no toast.
    expect(guarded).toContain("<InlineError");
    expect(SCREEN).toContain("toErrorCopy(caught)");
    expect(SCREEN).toContain(
      "You're offline. Check your connection and try again.",
    );
  });

  it("adds no rule of its own to the screen", () => {
    // The block mirrors "Add a guest": plain `View`s, so the census does
    // not move. The roster's one `<RuledRows>` came off this screen with
    // the row it holds — the roll call's table is drawn in
    // `components/trip/RosterList.tsx` now, which `ruled-block.test.ts`
    // reads for the same reason — so what is left to hold here is that
    // the block added no second rule site, and `InlineError` still carries
    // the one `RuledBlock` it already owns.
    expect(SCREEN).not.toMatch(/<(RuledRows|Section|RuledBlock)\b/);
  });

  /**
   * The read itself, off disk. A plain query with no retry is the whole
   * difference between a side read and a gate, and it is not something a
   * render in this package can be asked about: the roster's gate is
   * above it, and this must not be able to add a second one.
   */
  const QUERY_SOURCE = fs.readFileSync(
    path.join(__dirname, "..", "lib", "queries", "moderation.ts"),
    "utf8",
  );

  it("reads the blocked list with a plain query and no retry", () => {
    // The module names the suspended read in its own prose and must never
    // call it: the roster's gate is above this one, and a side read that
    // can add a second gate is not a side read.
    expect(QUERY_SOURCE).not.toMatch(/useSuspenseQuery\s*\(/);
    expect(QUERY_SOURCE).toMatch(
      /useQuery\(\{\s*\.\.\.blockedUsersOptions\(\),\s*retry: false,\s*\}\)/,
    );
  });
});
