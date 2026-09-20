import { describe, expect, it } from "vitest";
import {
  filterTripmates,
  normalizePhone,
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

describe("normalizePhone", () => {
  it("takes a number the way a person writes it", () => {
    expect(normalizePhone("+34 600 123 456")).toBe("+34600123456");
    expect(normalizePhone(" +1 (555) 123-4567 ")).toBe("+15551234567");
  });

  it("does not invent a country code", () => {
    expect(normalizePhone("600 123 456")).toBe("600123456");
  });
});

describe("phoneNumberError", () => {
  it("asks for a number when the field is empty", () => {
    expect(phoneNumberError("  ", [])).toBe("Enter a number.");
  });

  it("asks for a country code rather than rejecting the number", () => {
    expect(phoneNumberError("600 123 456", [])).toBe(
      "A country code, like +1 555 123 4567.",
    );
  });

  it("treats the country code it starts with as nothing typed yet", () => {
    // The field arrives holding "+1 ", so this is the empty case.
    expect(phoneNumberError("+1 ", [])).toBe("Enter a number.");
    expect(phoneNumberError("+1", [])).toBe("Enter a number.");
  });

  it("says so when the number is there and does not add up", () => {
    expect(phoneNumberError("+1 555 123 4567 891 234", [])).toBe(
      "That does not look like a number.",
    );
  });

  it("refuses the same number twice, however it was typed", () => {
    expect(phoneNumberError("+34 600 123 456", ["+34600123456"])).toBe(
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
});
