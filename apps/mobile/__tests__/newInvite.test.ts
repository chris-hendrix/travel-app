import { describe, expect, it } from "vitest";
import {
  filterTripmates,
  phoneNumberError,
  sendInvitations,
} from "@/lib/newInvite";
import type { Tripmate } from "@/mocks/tripmates";

const TRIPMATES: Tripmate[] = [
  { id: "tripmate-0", name: "Dana Mercer", phone: "+15550000000", sharedTripCount: 3 },
  { id: "tripmate-1", name: "Rafa Moreno", phone: "+15550000137", sharedTripCount: 1 },
];

const MEMBERS = [
  { name: "Sofia Reyes", phone: "+15550000274" },
  { name: "Marcus Bell", phone: "+15550000411" },
];

describe("phoneNumberError", () => {
  it("asks for a number when the field is empty", () => {
    expect(phoneNumberError("  ", [])).toBe("Enter a number.");
  });

  it("treats a lone country code as nothing typed yet", () => {
    expect(phoneNumberError("+1", [])).toBe("Enter a number.");
  });

  it("says so when the number is there and does not add up", () => {
    // Nine digits, which is not a number anywhere, so the field asks
    // rather than guessing which country it was meant for.
    expect(phoneNumberError("600 123 456", [])).toBe(
      "That does not look like a number.",
    );
    expect(phoneNumberError("+1 555 123 4567 891 234", [])).toBe(
      "That does not look like a number.",
    );
  });

  it("takes a number with no country code, now that one is not required", () => {
    expect(phoneNumberError("415 555 2671", [])).toBeUndefined();
  });

  it("refuses the same number twice, however it was typed", () => {
    expect(phoneNumberError("+34 600 123 456", ["+34600123456"])).toBe(
      "That number is already added.",
    );
    // The same number in two shapes, which the old hand-rolled
    // normalizer only caught when both happened to be typed the same way.
    expect(phoneNumberError("4155552671", ["+14155552671"])).toBe(
      "That number is already added.",
    );
  });

  it("accepts a number nobody has added yet", () => {
    expect(phoneNumberError("+34 600 123 456", ["+34600999999"])).toBeUndefined();
  });
});

describe("sendInvitations", () => {
  it("invites a tripmate by name", () => {
    const outcome = sendInvitations({
      input: { tripmateIds: ["tripmate-0"], phoneNumbers: [] },
      tripmates: TRIPMATES,
      members: MEMBERS,
    });

    expect(outcome).toEqual({
      invited: ["Dana Mercer"],
      added: [],
      skipped: [],
    });
  });

  it("invites a number nobody has an account on", () => {
    const outcome = sendInvitations({
      input: { tripmateIds: [], phoneNumbers: ["+15559999999"] },
      tripmates: TRIPMATES,
      members: MEMBERS,
    });

    expect(outcome.invited).toEqual(["+1 555 999 9999"]);
    expect(outcome.added).toEqual([]);
  });

  it("adds a number that already has an account instead of inviting it", () => {
    const outcome = sendInvitations({
      input: { tripmateIds: [], phoneNumbers: ["+15550000137"] },
      tripmates: TRIPMATES,
      members: MEMBERS,
    });

    expect(outcome.invited).toEqual([]);
    expect(outcome.added).toEqual(["Rafa Moreno"]);
  });

  it("skips a number that is already on the trip", () => {
    const outcome = sendInvitations({
      input: { tripmateIds: [], phoneNumbers: ["+15550000274"] },
      tripmates: TRIPMATES,
      members: MEMBERS,
    });

    expect(outcome.skipped).toEqual(["Sofia Reyes"]);
    expect(outcome.invited).toEqual([]);
    expect(outcome.added).toEqual([]);
  });

  it("keeps the order of the screen: the people, then the numbers", () => {
    const outcome = sendInvitations({
      input: {
        tripmateIds: ["tripmate-1", "tripmate-0"],
        phoneNumbers: ["+15559999999", "+15550000137"],
      },
      tripmates: TRIPMATES,
      members: MEMBERS,
    });

    expect(outcome.invited).toEqual([
      "Rafa Moreno",
      "Dana Mercer",
      "+1 555 999 9999",
    ]);
    expect(outcome.added).toEqual(["Rafa Moreno"]);
  });
});

describe("filterTripmates", () => {
  it("matches the start of a name, the way the server does", () => {
    expect(filterTripmates(TRIPMATES, "Dan").map((t) => t.name)).toEqual([
      "Dana Mercer",
    ]);
  });

  it("does not match the middle of a name", () => {
    // The server's filter is LIKE search%, not %search%; a UI that
    // accepted more would offer somebody the next screen cannot find.
    expect(filterTripmates(TRIPMATES, "Mercer")).toEqual([]);
  });

  it("is case-insensitive and ignores the edges of what was typed", () => {
    expect(filterTripmates(TRIPMATES, "  rAfA ").map((t) => t.name)).toEqual([
      "Rafa Moreno",
    ]);
  });

  it("shows everyone when nothing has been typed", () => {
    expect(filterTripmates(TRIPMATES, "")).toHaveLength(TRIPMATES.length);
  });

  it("puts the people you have travelled with most at the top", () => {
    const shared: Tripmate[] = [
      { id: "a", name: "Ana", phone: "+15550000001", sharedTripCount: 1 },
      { id: "b", name: "Ben", phone: "+15550000002", sharedTripCount: 4 },
      { id: "c", name: "Cam", phone: "+15550000003", sharedTripCount: 2 },
    ];

    // The empty query is the case the section opens in, so it has to be
    // ordered too: the early return used to hand back the raw rows.
    expect(filterTripmates(shared, "").map((t) => t.name)).toEqual([
      "Ben",
      "Cam",
      "Ana",
    ]);
  });

  it("breaks a tie on the name, so the same list cannot reshuffle", () => {
    const tied: Tripmate[] = [
      { id: "a", name: "Zoe", phone: "+15550000001", sharedTripCount: 2 },
      { id: "b", name: "Ada", phone: "+15550000002", sharedTripCount: 2 },
    ];

    expect(filterTripmates(tied, "").map((t) => t.name)).toEqual([
      "Ada",
      "Zoe",
    ]);
    // And the same answer from the other direction.
    expect(filterTripmates([...tied].reverse(), "").map((t) => t.name)).toEqual([
      "Ada",
      "Zoe",
    ]);
  });

  it("leaves the caller's array alone", () => {
    const rows: Tripmate[] = [
      { id: "a", name: "Ana", phone: "+15550000001", sharedTripCount: 1 },
      { id: "b", name: "Ben", phone: "+15550000002", sharedTripCount: 4 },
    ];

    filterTripmates(rows, "");
    expect(rows.map((t) => t.name)).toEqual(["Ana", "Ben"]);
  });
});
