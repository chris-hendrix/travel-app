import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { reportUserSchema, REPORT_REASONS } from "@journiful/shared/schemas";
import { ApiError, NetworkError } from "@/lib/api";
import type { Member } from "@/lib/members";
import type { RosterRow } from "@/lib/roster";
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

function personRow(over: Partial<Member> = {}, guest = false): RosterRow {
  return { kind: "person", member: member(over), guest, invited: false };
}

const INVITED_ROW: RosterRow = {
  kind: "invited",
  invitationId: "inv-1",
  phone: "+15550000009",
  name: null,
};

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
  it("names the account behind another person's row", () => {
    expect(moderatableUserId(personRow({ userId: "user-2" }), "user-1")).toBe(
      "user-2",
    );
  });

  it("leaves an invitation alone", () => {
    // An invited row is a phone number: there is no account to block.
    expect(moderatableUserId(INVITED_ROW, "user-1")).toBeNull();
  });

  it("leaves a guest alone", () => {
    // A guest's `userId` is null, which is the same fact `guest: true`
    // carries; the account is what is read, and there is none.
    const guest = personRow({ id: "member-2", userId: null, name: "Mom" }, true);
    expect(moderatableUserId(guest, "user-1")).toBeNull();
  });

  it("leaves your own row alone", () => {
    // You cannot report or block yourself, and the API refuses it, so the
    // control is not offered rather than answered with a 4xx.
    expect(moderatableUserId(personRow({ userId: "user-1" }), "user-1")).toBeNull();
  });

  it("moderates every other account when the viewer is unknown", () => {
    // An unresolved session matches no id, and nothing matches nothing.
    expect(moderatableUserId(personRow({ userId: "user-1" }), undefined)).toBe(
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
 * The roster row's panel, read off disk.
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
const SCREEN = fs.readFileSync(
  path.join(__dirname, "..", "app", "trips", "members.tsx"),
  "utf8",
);

describe("the roster row's panel", () => {
  it("lists the reasons from the vocabulary, never from a list typed here", () => {
    expect(SCREEN).toMatch(/REPORT_REASONS\.map\(/);
    for (const label of Object.values(REPORT_REASON_LABELS)) {
      // A hardcoded chip reads as `label="Spam"`; neither of the two
      // spellings can appear if the map is what draws them.
      expect(SCREEN).not.toContain(`"${label}"`);
      expect(SCREEN).not.toContain(`>${label}<`);
    }
  });

  it("reports a failure in the panel, and keeps a block out of the alert colour", () => {
    // The app has no toast: a failed write says so where the content
    // would have been, which is `InlineError`'s whole contract.
    expect(SCREEN).toContain("<InlineError");
    // A block is undone from the same route's DELETE, so it is never the
    // colour reserved for what cannot be taken back.
    expect(SCREEN).not.toContain('variant="danger"');
  });
});
