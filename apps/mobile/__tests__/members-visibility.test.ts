import { describe, expect, it } from "vitest";
import { visiblePhone, type Member } from "@/lib/members";

function member(over: Partial<Member> = {}): Member {
  return {
    id: "m1",
    userId: null,
    name: "Dana Mercer",
    status: "going",
    isOrganizer: false,
    phone: "+15551234567",
    sharePhone: false,
    handles: null,
    ...over,
  };
}

describe("visiblePhone", () => {
  it("shows a traveler the numbers of the members who shared theirs", () => {
    expect(visiblePhone(member({ sharePhone: true }), false)).toBe(
      "+15551234567",
    );
  });

  it("withholds a number that was not shared from a traveler", () => {
    // The whole point of the rule: an account's number is not the
    // trip's information.
    expect(visiblePhone(member({ sharePhone: false }), false)).toBeNull();
  });

  it("shows the organizer everyone's, shared or not", () => {
    expect(visiblePhone(member({ sharePhone: false }), true)).toBe(
      "+15551234567",
    );
    expect(visiblePhone(member({ sharePhone: true }), true)).toBe(
      "+15551234567",
    );
  });

  it("is about the viewer, not the member's own role", () => {
    // An organizer's number is still theirs to share — other travelers
    // only see it if they opted in.
    const organizer = member({ isOrganizer: true, sharePhone: false });
    expect(visiblePhone(organizer, false)).toBeNull();
    expect(visiblePhone(organizer, true)).toBe("+15551234567");
  });
});
