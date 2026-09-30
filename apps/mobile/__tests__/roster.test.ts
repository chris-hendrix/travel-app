import { describe, expect, it } from "vitest";
import type { Member } from "@/lib/members";
import type { TripInvitationRow } from "@/lib/queries/invitations";
import { rosterRows } from "@/lib/roster";
import { formatPhoneForDisplay } from "@/lib/phone";

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

function invitation(over: Partial<TripInvitationRow> = {}): TripInvitationRow {
  return {
    id: "inv-1",
    phone: "+15550000002",
    status: "pending",
    sentAt: "2026-09-20T10:00:00.000Z",
    name: null,
    ...over,
  };
}

describe("rosterRows order", () => {
  it("lists the organizer first, then members in server order, then guests, then invitees", () => {
    const guest = member({
      id: "m-guest",
      userId: null,
      name: "Mom",
      phone: "",
    });
    const second = member({ id: "m-2", name: "Sarah Chen" });
    const organizer = member({ id: "m-org", name: "Liam", isOrganizer: true });
    const first = member({ id: "m-1", name: "Ben Ortiz" });
    const invitee = invitation({ id: "inv-9", phone: "+15550000009" });
    const rows = rosterRows([guest, second, organizer, first], [invitee]);
    expect(rows.map((r) => (r.kind === "person" ? r.member.id : r.invitationId))).toEqual([
      "m-org",
      "m-2",
      "m-1",
      "m-guest",
      "inv-9",
    ]);
  });
});

describe("rosterRows fold", () => {
  it("folds a pending invitation matching guestPhone ?? phone into the row with no second row", () => {
    const guest = member({
      id: "m-guest",
      userId: null,
      name: "Mom",
      phone: "",
      guestPhone: "+15550000007",
    });
    const rows = rosterRows(
      [guest],
      [invitation({ id: "inv-1", phone: "+15550000007", status: "pending" })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "person", invited: true });
  });

  it("folds a failed invitation matching a member phone", () => {
    const sarah = member({ id: "m-2", phone: "+15550000002" });
    const rows = rosterRows(
      [sarah],
      [invitation({ phone: "+15550000002", status: "failed" })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "person", invited: true });
  });

  it("a blank member phone matches nothing", () => {
    const noNumber = member({ id: "m-3", phone: "" });
    const rows = rosterRows(
      [noNumber],
      [invitation({ phone: "+15550000002", status: "pending" })],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "person", invited: false });
    expect(rows[1]).toMatchObject({ kind: "invited", phone: "+15550000002" });
  });
});

describe("rosterRows invited rows", () => {
  it("labels an unmatched invitation with its name, or the formatted number when unnamed", () => {
    const named = invitation({ id: "inv-a", phone: "+15550000003", name: "Aunt Jo" });
    const unnamed = invitation({ id: "inv-b", phone: "+15550000004", name: null });
    const rows = rosterRows([], [named, unnamed]);
    expect(rows).toEqual([
      { kind: "invited", invitationId: "inv-a", phone: "+15550000003", name: "Aunt Jo" },
      {
        kind: "invited",
        invitationId: "inv-b",
        phone: "+15550000004",
        name: formatPhoneForDisplay("+15550000004"),
      },
    ]);
  });

  it("never renders accepted or declined invitations, neither as rows nor as folds", () => {
    const sarah = member({ id: "m-2", phone: "+15550000002" });
    const rows = rosterRows(
      [sarah],
      [
        invitation({ id: "inv-acc", phone: "+15550000002", status: "accepted" }),
        invitation({ id: "inv-dec", phone: "+15550000005", status: "declined" }),
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "person", invited: false });
  });

  it("an accepted invitation for a participant does not mark the row invited", () => {
    const sarah = member({ id: "m-2", phone: "+15550000002" });
    const rows = rosterRows(
      [sarah],
      [invitation({ phone: "+15550000002", status: "accepted" })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "person", invited: false });
  });

  it("empty invitations yields no invited rows", () => {
    const rows = rosterRows([member()], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "person", invited: false });
  });
});

describe("rosterRows guest flag", () => {
  it("is true exactly for member rows with userId null", () => {
    const guest = member({ id: "m-g", userId: null, name: "Mom", phone: "" });
    const plain = member({ id: "m-p", userId: "user-9", name: "Ben" });
    const rows = rosterRows([plain, guest], []);
    expect(rows.find((r) => r.kind === "person" && r.member.id === "m-g")).toMatchObject({
      guest: true,
    });
    expect(rows.find((r) => r.kind === "person" && r.member.id === "m-p")).toMatchObject({
      guest: false,
    });
  });
});
