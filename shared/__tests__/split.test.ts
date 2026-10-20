// Tests for the split-scope rule (`shared/utils/split.ts`)

import { describe, it, expect } from "vitest";
import {
  SPLIT_SCOPES,
  equalShares,
  scopeMemberIds,
  withPayerFallback,
} from "../utils/split";
import type { SplitMember } from "../utils/split";

/**
 * One roster row: the id the scope sorts by, the RSVP status, and whether a
 * user account is behind it. A guest row has no user — which is exactly the
 * clause "everyone going" leans on, because a guest never answers an RSVP.
 */
function member(
  id: string,
  status: SplitMember["status"],
  userId: string | null = `user-${id}`,
): SplitMember {
  return { id, status, userId };
}

/**
 * A roster in deliberately scrambled id order, so a scope that returned its
 * input order would fail rather than pass by luck.
 */
const roster: SplitMember[] = [
  member("m-3", "going"),
  member("m-1", "maybe"),
  member("m-5", "no_response"),
  member("m-2", "not_going"),
  member("m-4", "going"),
  // A guest: no account, and the column default is `no_response`.
  member("m-6", "no_response", null),
];

describe("SPLIT_SCOPES", () => {
  it("names the three values, `custom` first", () => {
    expect(SPLIT_SCOPES).toEqual(["custom", "all_going", "all_invited"]);
  });
});

describe("scopeMemberIds", () => {
  it("resolves `all_going` to the going members and every guest", () => {
    // m-6 is a guest with no answer; m-1/m-2/m-5 are accounts that answered
    // otherwise, and an answer is what keeps them out.
    expect(scopeMemberIds("all_going", roster)).toEqual(["m-3", "m-4", "m-6"]);
  });

  it("includes a guest whatever status it holds: the guest clause is the rule", () => {
    // D2 reads `status = 'going' OR user_id IS NULL`, so an organizer's mark
    // on a guest does not take them out of "everyone going" — a guest was
    // invited to share the house, and the scope is "going, including
    // guests" rather than "guests who RSVP'd".
    const guests: SplitMember[] = [
      { id: "g-1", status: "not_going", userId: null },
      { id: "g-2", status: "no_response", userId: null },
      { id: "g-3", status: "going", userId: null },
    ];

    expect(scopeMemberIds("all_going", guests)).toEqual(["g-1", "g-2", "g-3"]);
  });

  it("resolves `all_invited` to the whole roster, declines included", () => {
    expect(scopeMemberIds("all_invited", roster)).toEqual([
      "m-1",
      "m-2",
      "m-3",
      "m-4",
      "m-5",
      "m-6",
    ]);
  });

  it("sorts both scopes by member id, whatever order the rows arrive in", () => {
    const scrambled = [...roster].reverse();

    expect(scopeMemberIds("all_going", scrambled)).toEqual(["m-3", "m-4", "m-6"]);
    expect(scopeMemberIds("all_invited", scrambled)).toEqual([
      "m-1",
      "m-2",
      "m-3",
      "m-4",
      "m-5",
      "m-6",
    ]);
  });

  it("resolves a custom split to nobody: the list is the participant rows", () => {
    expect(scopeMemberIds("custom", roster)).toEqual([]);
  });

  it("has no answer for an empty roster", () => {
    expect(scopeMemberIds("all_going", [])).toEqual([]);
    expect(scopeMemberIds("all_invited", [])).toEqual([]);
  });

  it("does not mutate the roster it was handed", () => {
    const rows = [member("m-2", "going"), member("m-1", "going")];
    const snapshot = [...rows];

    scopeMemberIds("all_invited", rows);

    expect(rows).toEqual(snapshot);
  });
});

describe("withPayerFallback", () => {
  it("leaves a split that resolves to somebody untouched", () => {
    // The floor only ever shows up where the rule gave nothing: a scope with
    // people in it is the split, in the order it resolved.
    expect(withPayerFallback(["m-3", "m-4"], "m-1")).toEqual(["m-3", "m-4"]);
    expect(withPayerFallback(["m-9"], "m-1")).toEqual(["m-9"]);
  });

  it("reads an empty split as the payer owing the lot", () => {
    // D5. The ledger nets a payment as "the payer paid, each participant owes
    // their share", so nobody owing anything would leave the payer's credit
    // standing and the row unshowable. One person owing it is the floor.
    expect(withPayerFallback([], "m-1")).toEqual(["m-1"]);
  });
});

describe("equalShares", () => {
  it("splits evenly when the amount divides", () => {
    expect(equalShares(300, 3)).toEqual([100, 100, 100]);
    expect(equalShares(100, 1)).toEqual([100]);
  });

  it("gives the remainder cents one each to the first rows, in order", () => {
    expect(equalShares(100, 3)).toEqual([34, 33, 33]);
    // The reading that piles the whole remainder on the first share would
    // say [35, 33, 33]; the server says [34, 34, 33] and the form must too.
    expect(equalShares(10001, 3)).toEqual([3334, 3334, 3333]);
    expect(equalShares(101, 3)).toEqual([34, 34, 33]);
  });

  it("always sums to the amount", () => {
    for (const count of [1, 2, 3, 4, 7, 13]) {
      for (const total of [1, 99, 100, 12345, 10001]) {
        const shares = equalShares(total, count);
        expect(shares).toHaveLength(count);
        expect(shares.reduce((sum, share) => sum + share, 0)).toBe(total);
      }
    }
  });

  it("has no shares for nobody — the floor of one is the caller's job", () => {
    expect(equalShares(100, 0)).toEqual([]);
  });
});
