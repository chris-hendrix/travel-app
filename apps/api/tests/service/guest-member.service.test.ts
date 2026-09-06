import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/config/database.js";
import { users, trips, members } from "@/db/schema/index.js";
import { eq, count } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";
import { GuestMemberService } from "@/services/guest-member.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import {
  PermissionDeniedError,
  MemberLimitExceededError,
  DuplicateMemberError,
} from "@/errors.js";

/**
 * Task 1.1 RED fixture: guest members live in `members` with NULL userId.
 * - insert (tripId, userId NULL, guestDisplayName) succeeds
 * - second insert with same (tripId, guestPhone) fails (partial unique)
 */
describe("guest-member.service (Task 1.1 schema fixture)", () => {
  let creatorId: string;
  let tripId: string;
  let creatorPhone: string;
  const guestPhone = generateUniquePhone();

  beforeEach(async () => {
    creatorPhone = generateUniquePhone();
    const [creator] = await db
      .insert(users)
      .values({ phoneNumber: creatorPhone, displayName: "Guest Test Creator" })
      .returning();
    creatorId = creator.id;
    const [trip] = await db
      .insert(trips)
      .values({
        name: "Guest Schema Trip",
        destination: "Naples",
        preferredTimezone: "Europe/Rome",
        createdBy: creatorId,
      })
      .returning();
    tripId = trip.id;
  });

  afterEach(async () => {
    if (tripId) {
      await db.delete(members).where(eq(members.tripId, tripId));
      await db.delete(trips).where(eq(trips.id, tripId));
    }
    if (creatorId) {
      await db.delete(users).where(eq(users.id, creatorId));
    }
  });

  it("inserts a guest member with NULL userId + guestDisplayName", async () => {
    const [guest] = await db
      .insert(members)
      .values({
        tripId,
        userId: null,
        guestDisplayName: "Mom",
        guestPhone,
      })
      .returning();
    expect(guest.id).toBeDefined();
    expect(guest.userId).toBeNull();
    expect(guest.guestDisplayName).toBe("Mom");
  });

  it("rejects a second guest with the same (tripId, guestPhone)", async () => {
    await db.insert(members).values({
      tripId,
      userId: null,
      guestDisplayName: "Mom",
      guestPhone,
    });
    await expect(
      db.insert(members).values({
        tripId,
        userId: null,
        guestDisplayName: "Mom Duplicate",
        guestPhone,
      }),
    ).rejects.toThrow();
  });
});

/**
 * Task 3.1 RED: GuestMemberService.createGuest
 * - organizer creates guest (name-only) -> row with userId NULL, counts toward cap
 * - guestPhone matching an existing trip member's user phone -> 409
 * - duplicate guestPhone on same trip -> 409
 * - non-organizer -> PermissionDeniedError
 * - 26th member -> MemberLimitExceededError
 */
describe("guest-member.service createGuest (Task 3.1)", () => {
  const permissionsService = new PermissionsService(db);
  const guestMemberService = new GuestMemberService(db, permissionsService);

  let organizerId: string;
  let organizerPhone: string;
  let nonOrganizerId: string;
  let nonOrganizerPhone: string;
  let tripId: string;
  const createdUserPhones: string[] = [];

  const createUser = async (displayName: string) => {
    const phone = generateUniquePhone();
    createdUserPhones.push(phone);
    const [user] = await db
      .insert(users)
      .values({ phoneNumber: phone, displayName })
      .returning();
    return user;
  };

  beforeEach(async () => {
    createdUserPhones.length = 0;
    organizerPhone = generateUniquePhone();
    createdUserPhones.push(organizerPhone);
    const [organizer] = await db
      .insert(users)
      .values({ phoneNumber: organizerPhone, displayName: "Trip Organizer" })
      .returning();
    organizerId = organizer.id;

    nonOrganizerPhone = generateUniquePhone();
    createdUserPhones.push(nonOrganizerPhone);
    const [nonOrganizer] = await db
      .insert(users)
      .values({ phoneNumber: nonOrganizerPhone, displayName: "Regular Member" })
      .returning();
    nonOrganizerId = nonOrganizer.id;

    const [trip] = await db
      .insert(trips)
      .values({
        name: "Guest Create Trip",
        destination: "Naples",
        preferredTimezone: "Europe/Rome",
        createdBy: organizerId,
      })
      .returning();
    tripId = trip.id;

    // Organizer + non-organizer member rows (organizer flag via member row;
    // trip creator is also organizer by construction)
    await db.insert(members).values([
      { tripId, userId: organizerId, isOrganizer: true },
      { tripId, userId: nonOrganizerId, isOrganizer: false },
    ]);
  });

  afterEach(async () => {
    if (tripId) {
      await db.delete(members).where(eq(members.tripId, tripId));
      await db.delete(trips).where(eq(trips.id, tripId));
    }
    for (const phone of createdUserPhones) {
      await db.delete(users).where(eq(users.phoneNumber, phone));
    }
  });

  it("organizer creates a name-only guest -> row with userId NULL, counts toward cap", async () => {
    const guest = await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Mom",
    });

    expect(guest.id).toBeDefined();
    expect(guest.userId).toBeNull();
    expect(guest.guestDisplayName).toBe("Mom");
    expect(guest.guestPhone).toBeNull();

    const [row] = await db
      .select({ value: count() })
      .from(members)
      .where(eq(members.tripId, tripId));
    // organizer + non-organizer + guest
    expect(row!.value).toBe(3);
  });

  it("rejects guestPhone matching an existing trip member's user phone (409)", async () => {
    await expect(
      guestMemberService.createGuest(tripId, organizerId, {
        displayName: "Copycat",
        guestPhone: nonOrganizerPhone,
      }),
    ).rejects.toThrow(DuplicateMemberError);
  });

  it("rejects a duplicate guestPhone on the same trip (409)", async () => {
    const dupPhone = generateUniquePhone();
    await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Mom",
      guestPhone: dupPhone,
    });

    await expect(
      guestMemberService.createGuest(tripId, organizerId, {
        displayName: "Mom Again",
        guestPhone: dupPhone,
      }),
    ).rejects.toThrow(DuplicateMemberError);
  });

  it("rejects guest creation by a non-organizer", async () => {
    await expect(
      guestMemberService.createGuest(tripId, nonOrganizerId, {
        displayName: "Sneaky",
      }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it("rejects the 26th member (cap counts guests)", async () => {
    // 2 members exist; fill to 25 with filler users + member rows
    for (let i = 0; i < 23; i++) {
      const filler = await createUser(`Filler ${i}`);
      await db.insert(members).values({ tripId, userId: filler.id });
    }

    const [row] = await db
      .select({ value: count() })
      .from(members)
      .where(eq(members.tripId, tripId));
    expect(row!.value).toBe(25);

    await expect(
      guestMemberService.createGuest(tripId, organizerId, {
        displayName: "Too Many",
      }),
    ).rejects.toThrow(MemberLimitExceededError);
  });
});

/**
 * Task 3.2 RED: GuestMemberService update / delete / get
 * - organizer updates guest displayName/guestPhone/status (organizer-settable RSVP)
 * - guest with travel + participant rows deleted -> rows cascade
 * - guest who is a payer -> 409 until that payment is deleted (ON DELETE RESTRICT)
 * - non-organizer denied
 *
 * NOTE (deviation): balance.service + payment.service are still user-keyed
 * until Phase 6, so cascade assertions are made at the DB level
 * (member_travel / payment_participants rows) rather than via getTripBalances.
 */
describe("guest-member.service update/delete/get (Task 3.2)", () => {
  const permissionsService = new PermissionsService(db);
  const guestMemberService = new GuestMemberService(db, permissionsService);

  let organizerId: string;
  let organizerPhone: string;
  let nonOrganizerId: string;
  let nonOrganizerPhone: string;
  let tripId: string;
  let organizerMemberId: string;
  let nonOrganizerMemberId: string;
  const createdUserPhones: string[] = [];
  void organizerPhone;

  const createUser = async (displayName: string) => {
    const phone = generateUniquePhone();
    createdUserPhones.push(phone);
    const [user] = await db
      .insert(users)
      .values({ phoneNumber: phone, displayName })
      .returning();
    return user;
  };

  beforeEach(async () => {
    createdUserPhones.length = 0;
    const organizer = await createUser("Trip Organizer");
    organizerId = organizer.id;
    organizerPhone = organizer.phoneNumber;
    const nonOrganizer = await createUser("Regular Member");
    nonOrganizerId = nonOrganizer.id;
    nonOrganizerPhone = nonOrganizer.phoneNumber;

    const [trip] = await db
      .insert(trips)
      .values({
        name: "Guest CRUD Trip",
        destination: "Naples",
        preferredTimezone: "Europe/Rome",
        createdBy: organizerId,
      })
      .returning();
    tripId = trip.id;

    const [orgMember] = await db
      .insert(members)
      .values({ tripId, userId: organizerId, isOrganizer: true })
      .returning();
    organizerMemberId = orgMember!.id;
    const [member] = await db
      .insert(members)
      .values({ tripId, userId: nonOrganizerId, isOrganizer: false })
      .returning();
    nonOrganizerMemberId = member!.id;
  });

  afterEach(async () => {
    if (tripId) {
      await db.delete(members).where(eq(members.tripId, tripId));
      await db.delete(trips).where(eq(trips.id, tripId));
    }
    for (const phone of createdUserPhones) {
      await db.delete(users).where(eq(users.phoneNumber, phone));
    }
  });

  it("organizer gets a guest row", async () => {
    const guest = await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Mom",
    });
    const fetched = await guestMemberService.getGuest(
      tripId,
      organizerId,
      guest.id,
    );
    expect(fetched.id).toBe(guest.id);
    expect(fetched.userId).toBeNull();
  });

  it("organizer updates guest displayName/guestPhone/status", async () => {
    const guest = await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Mom",
    });
    const newPhone = generateUniquePhone();
    const updated = await guestMemberService.updateGuest(
      tripId,
      organizerId,
      guest.id,
      { displayName: "Mother", guestPhone: newPhone, status: "going" },
    );
    expect(updated.guestDisplayName).toBe("Mother");
    expect(updated.guestPhone).toBe(newPhone);
    expect(updated.status).toBe("going");
  });

  it("update re-validates phone guards (duplicate + member phone -> 409)", async () => {
    const dupPhone = generateUniquePhone();
    await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Mom",
      guestPhone: dupPhone,
    });
    const other = await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Grandma",
    });
    await expect(
      guestMemberService.updateGuest(tripId, organizerId, other.id, {
        guestPhone: dupPhone,
      }),
    ).rejects.toThrow(DuplicateMemberError);
    await expect(
      guestMemberService.updateGuest(tripId, organizerId, other.id, {
        guestPhone: nonOrganizerPhone,
      }),
    ).rejects.toThrow(DuplicateMemberError);
  });

  it("update keeps the guest's own phone (self-exclusion)", async () => {
    const phone = generateUniquePhone();
    const guest = await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Mom",
      guestPhone: phone,
    });
    const updated = await guestMemberService.updateGuest(
      tripId,
      organizerId,
      guest.id,
      { displayName: "Mom Updated", guestPhone: phone },
    );
    expect(updated.guestDisplayName).toBe("Mom Updated");
    expect(updated.guestPhone).toBe(phone);
  });

  it("update/delete/get of a non-guest member row -> 404", async () => {
    const { MemberNotFoundError } = await import("@/errors.js");
    await expect(
      guestMemberService.updateGuest(tripId, organizerId, organizerMemberId, {
        displayName: "Nope",
      }),
    ).rejects.toThrow(MemberNotFoundError);
    await expect(
      guestMemberService.deleteGuest(tripId, organizerId, organizerMemberId),
    ).rejects.toThrow(MemberNotFoundError);
    await expect(
      guestMemberService.getGuest(tripId, organizerId, nonOrganizerMemberId),
    ).rejects.toThrow(MemberNotFoundError);
  });

  it("non-organizer is denied update/delete/get", async () => {
    const guest = await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Mom",
    });
    await expect(
      guestMemberService.updateGuest(tripId, nonOrganizerId, guest.id, {
        displayName: "Sneaky",
      }),
    ).rejects.toThrow(PermissionDeniedError);
    await expect(
      guestMemberService.deleteGuest(tripId, nonOrganizerId, guest.id),
    ).rejects.toThrow(PermissionDeniedError);
    await expect(
      guestMemberService.getGuest(tripId, nonOrganizerId, guest.id),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it("delete cascades travel + participant rows", async () => {
    const { memberTravel, payments, paymentParticipants } = await import(
      "@/db/schema/index.js"
    );
    const guest = await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Mom",
    });
    // Guest travel row
    await db.insert(memberTravel).values({
      tripId,
      memberId: guest.id,
      travelType: "arrival",
      time: new Date(),
    });
    // Payment recorded by organizer; guest is a participant (owes a share)
    const [payment] = await db
      .insert(payments)
      .values({
        tripId,
        description: "Dinner",
        amount: 10000,
        memberId: organizerMemberId,
        createdBy: organizerId,
      })
      .returning();
    await db.insert(paymentParticipants).values({
      paymentId: payment!.id,
      memberId: guest.id,
      shareAmount: 5000,
    });

    await guestMemberService.deleteGuest(tripId, organizerId, guest.id);

    expect(
      await db
        .select()
        .from(members)
        .where(eq(members.id, guest.id)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(memberTravel)
        .where(eq(memberTravel.memberId, guest.id)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(paymentParticipants)
        .where(eq(paymentParticipants.memberId, guest.id)),
    ).toHaveLength(0);
    // The payment itself survives (only the guest's share row cascades)
    expect(
      await db.select().from(payments).where(eq(payments.id, payment!.id)),
    ).toHaveLength(1);
    // Cleanup payment row (createdBy FK is user-keyed; delete explicitly)
    await db
      .delete(paymentParticipants)
      .where(eq(paymentParticipants.paymentId, payment!.id));
    await db.delete(payments).where(eq(payments.id, payment!.id));
  });

  it("delete of a guest who is a payer -> 409 until the payment is deleted", async () => {
    const { payments } = await import("@/db/schema/index.js");
    const guest = await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Mom",
    });
    const [payment] = await db
      .insert(payments)
      .values({
        tripId,
        description: "Mom paid",
        amount: 5000,
        memberId: guest.id,
        createdBy: organizerId,
      })
      .returning();

    await expect(
      guestMemberService.deleteGuest(tripId, organizerId, guest.id),
    ).rejects.toThrow(/reassign or delete payments paid by this guest first/);
    // Guest row still present after the blocked delete
    expect(
      await db
        .select()
        .from(members)
        .where(eq(members.id, guest.id)),
    ).toHaveLength(1);

    await db.delete(payments).where(eq(payments.id, payment!.id));
    await guestMemberService.deleteGuest(tripId, organizerId, guest.id);
    expect(
      await db
        .select()
        .from(members)
        .where(eq(members.id, guest.id)),
    ).toHaveLength(0);
  });
});

/**
 * Task 4.1 RED: claimGuestMember transactional core
 * (a) claim by (tripId, guestPhone) sets userId+claimedAt, clears guest cols,
 *     travel + participant rows intact
 * (b) pending invitations inviteePhone=guestPhone on trip flip to accepted
 * (c) double-claim second returns alreadyClaimed no-op, no duplicate member
 * (d) single-row update, no insert
 */
describe("guest-member.service claimGuestMember (Task 4.1)", () => {
  const permissionsService = new PermissionsService(db);
  const guestMemberService = new GuestMemberService(db, permissionsService);

  let organizerId: string;
  let tripId: string;
  let organizerMemberId: string;
  const createdUserPhones: string[] = [];

  const createUser = async (displayName: string, phone?: string) => {
    const p = phone ?? generateUniquePhone();
    createdUserPhones.push(p);
    const [user] = await db
      .insert(users)
      .values({ phoneNumber: p, displayName })
      .returning();
    return user;
  };

  beforeEach(async () => {
    createdUserPhones.length = 0;
    const organizer = await createUser("Trip Organizer");
    organizerId = organizer.id;
    const [trip] = await db
      .insert(trips)
      .values({
        name: "Guest Claim Trip",
        destination: "Naples",
        preferredTimezone: "Europe/Rome",
        createdBy: organizerId,
      })
      .returning();
    tripId = trip.id;
    const [orgMember] = await db
      .insert(members)
      .values({ tripId, userId: organizerId, isOrganizer: true })
      .returning();
    organizerMemberId = orgMember!.id;
  });

  afterEach(async () => {
    if (tripId) {
      const { invitations, memberTravel, payments, paymentParticipants } =
        await import("@/db/schema/index.js");
      const paymentRows = await db
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.tripId, tripId));
      for (const r of paymentRows) {
        await db
          .delete(paymentParticipants)
          .where(eq(paymentParticipants.paymentId, r.id));
      }
      await db.delete(payments).where(eq(payments.tripId, tripId));
      await db.delete(memberTravel).where(eq(memberTravel.tripId, tripId));
      await db.delete(invitations).where(eq(invitations.tripId, tripId));
      await db.delete(members).where(eq(members.tripId, tripId));
      await db.delete(trips).where(eq(trips.id, tripId));
    }
    for (const phone of createdUserPhones) {
      await db.delete(users).where(eq(users.phoneNumber, phone));
    }
  });

  it("(a) claim sets userId+claimedAt, clears guest cols, keeps travel + participant rows", async () => {
    const { memberTravel, payments, paymentParticipants } = await import(
      "@/db/schema/index.js"
    );
    const guestPhone = generateUniquePhone();
    const guest = await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Mom",
      guestPhone,
    });
    // Claiming user owns the guest phone but is not yet a member
    const claimUser = await createUser("Mom Real", guestPhone);

    await db.insert(memberTravel).values({
      tripId,
      memberId: guest.id,
      travelType: "arrival",
      time: new Date(),
    });
    const [payment] = await db
      .insert(payments)
      .values({
        tripId,
        description: "Dinner",
        amount: 10000,
        memberId: organizerMemberId,
        createdBy: organizerId,
      })
      .returning();
    await db.insert(paymentParticipants).values({
      paymentId: payment!.id,
      memberId: guest.id,
      shareAmount: 5000,
    });

    const result = await db.transaction(async (tx) =>
      guestMemberService.claimGuestMember(tx, {
        tripId,
        userId: claimUser.id,
        guestPhone,
      }),
    );

    expect(result.claimed).toBe(true);
    expect(result.member!.id).toBe(guest.id);
    expect(result.member!.userId).toBe(claimUser.id);
    expect(result.member!.claimedAt).not.toBeNull();
    expect(result.member!.guestDisplayName).toBeNull();
    expect(result.member!.guestPhone).toBeNull();

    // Travel + participant rows intact under the same member id
    expect(
      await db
        .select()
        .from(memberTravel)
        .where(eq(memberTravel.memberId, guest.id)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(paymentParticipants)
        .where(eq(paymentParticipants.memberId, guest.id)),
    ).toHaveLength(1);
  });

  it("(b) pending invitations for the guest phone flip to accepted", async () => {
    const { invitations } = await import("@/db/schema/index.js");
    const guestPhone = generateUniquePhone();
    await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Mom",
      guestPhone,
    });
    const claimUser = await createUser("Mom Real", guestPhone);
    const [invite] = await db
      .insert(invitations)
      .values({ tripId, inviterId: organizerId, inviteePhone: guestPhone })
      .returning();
    expect(invite!.status).toBe("pending");

    await db.transaction(async (tx) =>
      guestMemberService.claimGuestMember(tx, {
        tripId,
        userId: claimUser.id,
        guestPhone,
      }),
    );

    const [updated] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, invite!.id));
    expect(updated!.status).toBe("accepted");
    expect(updated!.respondedAt).not.toBeNull();
  });

  it("(c) double-claim: second returns alreadyClaimed no-op, no duplicate member", async () => {
    const guestPhone = generateUniquePhone();
    const before = await db
      .select({ value: count() })
      .from(members)
      .where(eq(members.tripId, tripId));
    await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Mom",
      guestPhone,
    });
    const claimUser = await createUser("Mom Real", guestPhone);

    const first = await db.transaction(async (tx) =>
      guestMemberService.claimGuestMember(tx, {
        tripId,
        userId: claimUser.id,
        guestPhone,
      }),
    );
    expect(first.claimed).toBe(true);

    const second = await db.transaction(async (tx) =>
      guestMemberService.claimGuestMember(tx, {
        tripId,
        userId: claimUser.id,
        guestPhone,
      }),
    );
    expect(second.claimed).toBe(false);
    expect(second.alreadyClaimed).toBe(true);

    const after = await db
      .select({ value: count() })
      .from(members)
      .where(eq(members.tripId, tripId));
    // organizer + claimed guest row only: no duplicate insert
    expect(after[0]!.value).toBe(before[0]!.value + 1);
  });

  it("(d) claim is a single-row update, no insert; unknown phone returns claimed:false", async () => {
    const guestPhone = generateUniquePhone();
    const guest = await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Mom",
      guestPhone,
    });
    const claimUser = await createUser("Mom Real", guestPhone);

    const before = await db
      .select({ value: count() })
      .from(members)
      .where(eq(members.tripId, tripId));

    const result = await db.transaction(async (tx) =>
      guestMemberService.claimGuestMember(tx, {
        tripId,
        userId: claimUser.id,
        guestPhone,
      }),
    );
    expect(result.claimed).toBe(true);

    const after = await db
      .select({ value: count() })
      .from(members)
      .where(eq(members.tripId, tripId));
    expect(after[0]!.value).toBe(before[0]!.value);
    expect(result.member!.id).toBe(guest.id);

    const stranger = await createUser("Stranger");
    const miss = await db.transaction(async (tx) =>
      guestMemberService.claimGuestMember(tx, {
        tripId,
        userId: stranger.id,
        guestPhone: generateUniquePhone(),
      }),
    );
    expect(miss.claimed).toBe(false);
    expect(miss.alreadyClaimed).toBeUndefined();
  });
});
