import { members, users, payments, invitations } from "@/db/schema/index.js";
import { eq, and, count, ne, inArray } from "drizzle-orm";
import type { AppDatabase } from "@/types/index.js";
import type { IPermissionsService } from "./permissions.service.js";
import type {
  CreateGuestInput,
  UpdateGuestInput,
} from "@journiful/shared/schemas";
import { phoneNumberSchema } from "@journiful/shared/schemas";
import {
  PermissionDeniedError,
  MemberLimitExceededError,
  DuplicateMemberError,
  MemberNotFoundError,
  GuestHasPaymentsError,
} from "../errors.js";

export const MAX_TRIP_MEMBERS = 25;

/** Executor supporting SELECT ... FOR UPDATE + UPDATEs + savepoint tx (db or caller tx). */
type ClaimExecutor = Pick<
  AppDatabase,
  "select" | "update" | "transaction"
>;

export interface ClaimGuestMemberInput {
  tripId: string;
  userId: string;
  guestPhone: string;
}

export interface ClaimGuestMemberResult {
  claimed: boolean;
  alreadyClaimed?: boolean;
  member?: typeof members.$inferSelect;
}

export interface IGuestMemberService {
  createGuest(
    tripId: string,
    requesterUserId: string,
    input: CreateGuestInput,
  ): Promise<typeof members.$inferSelect>;
  getGuest(
    tripId: string,
    requesterUserId: string,
    memberId: string,
  ): Promise<typeof members.$inferSelect>;
  updateGuest(
    tripId: string,
    requesterUserId: string,
    memberId: string,
    input: UpdateGuestInput,
  ): Promise<typeof members.$inferSelect>;
  deleteGuest(
    tripId: string,
    requesterUserId: string,
    memberId: string,
  ): Promise<void>;
  claimGuestMember(
    tx: ClaimExecutor,
    input: ClaimGuestMemberInput,
  ): Promise<ClaimGuestMemberResult>;
}

export class GuestMemberService implements IGuestMemberService {
  constructor(
    private db: AppDatabase,
    private permissionsService: IPermissionsService,
  ) {}

  async createGuest(
    tripId: string,
    requesterUserId: string,
    input: CreateGuestInput,
  ) {
    const isOrg = await this.permissionsService.isOrganizer(
      requesterUserId,
      tripId,
    );
    if (!isOrg) {
      throw new PermissionDeniedError(
        "Permission denied: only organizers can add guests",
      );
    }

    // Normalize phone via the same shared validator invitations use
    const guestPhone =
      input.guestPhone !== undefined
        ? phoneNumberSchema.parse(input.guestPhone)
        : undefined;

    // Cap: count(*) FROM members WHERE trip_id (guests count too)
    const [countRow] = await this.db
      .select({ value: count() })
      .from(members)
      .where(eq(members.tripId, tripId));
    if ((countRow?.value ?? 0) + 1 > MAX_TRIP_MEMBERS) {
      throw new MemberLimitExceededError(
        "Member limit exceeded: trip already has 25 members",
      );
    }

    if (guestPhone !== undefined) {
      // Guard: guest phone matches an existing trip member's user phone -> 409
      const memberPhoneMatch = await this.db
        .select({ id: members.id })
        .from(members)
        .innerJoin(users, eq(members.userId, users.id))
        .where(
          and(
            eq(members.tripId, tripId),
            eq(users.phoneNumber, guestPhone),
          ),
        )
        .limit(1);
      if (memberPhoneMatch.length > 0) {
        throw new DuplicateMemberError(
          "A member with this phone number is already in this trip",
        );
      }

      // Guard: duplicate guestPhone on the same trip -> 409
      const guestPhoneMatch = await this.db
        .select({ id: members.id })
        .from(members)
        .where(
          and(
            eq(members.tripId, tripId),
            eq(members.guestPhone, guestPhone),
          ),
        )
        .limit(1);
      if (guestPhoneMatch.length > 0) {
        throw new DuplicateMemberError(
          "A guest with this phone number is already in this trip",
        );
      }

      // Guard: guestPhone matches a pending/failed invitation for the same
      // trip -> 409. Such a guest becomes a hidden member (excluded from
      // getTripMembers, visible only in Invited).
      const invitedPhoneMatch = await this.db
        .select({ id: invitations.id })
        .from(invitations)
        .where(
          and(
            eq(invitations.tripId, tripId),
            eq(invitations.inviteePhone, guestPhone),
            inArray(invitations.status, ["pending", "failed"]),
          ),
        )
        .limit(1);
      if (invitedPhoneMatch.length > 0) {
        throw new DuplicateMemberError(
          "This phone number has a pending invitation for this trip",
        );
      }
    }

    const [guest] = await this.db
      .insert(members)
      .values({
        tripId,
        userId: null,
        guestDisplayName: input.displayName,
        ...(guestPhone !== undefined ? { guestPhone } : {}),
      })
      .returning();
    return guest!;
  }

  async getGuest(
    tripId: string,
    requesterUserId: string,
    memberId: string,
  ) {
    await this.requireOrganizer(requesterUserId, tripId);
    return this.requireGuestRow(tripId, memberId);
  }

  async updateGuest(
    tripId: string,
    requesterUserId: string,
    memberId: string,
    input: UpdateGuestInput,
  ) {
    await this.requireOrganizer(requesterUserId, tripId);
    const guest = await this.requireGuestRow(tripId, memberId);

    // Re-validate phone guards when guestPhone is being set
    let guestPhone: string | undefined;
    if (input.guestPhone !== undefined) {
      guestPhone = phoneNumberSchema.parse(input.guestPhone);
      await this.assertPhoneAvailable(tripId, guestPhone, memberId);
    }

    const [updated] = await this.db
      .update(members)
      .set({
        ...(input.displayName !== undefined
          ? { guestDisplayName: input.displayName }
          : {}),
        ...(guestPhone !== undefined ? { guestPhone } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      })
      .where(eq(members.id, guest.id))
      .returning();
    return updated!;
  }

  async deleteGuest(
    tripId: string,
    requesterUserId: string,
    memberId: string,
  ): Promise<void> {
    await this.requireOrganizer(requesterUserId, tripId);
    const guest = await this.requireGuestRow(tripId, memberId);

    // Payer-protected: payments.member_id is ON DELETE RESTRICT regardless
    // of soft-delete — include soft-deleted payments in the pre-check so the
    // clean 409 path fires instead of a raw FK 500.
    const payerRows = await this.db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.tripId, tripId),
          eq(payments.memberId, guest.id),
        ),
      )
      .limit(1);
    if (payerRows.length > 0) {
      throw new GuestHasPaymentsError(
        "Guest has payments — reassign or delete them first",
      );
    }

    // Member delete cascades to member_travel + payment_participants rows;
    // balances recompute on read (member:<id> keys).
    await this.db.delete(members).where(eq(members.id, guest.id));
  }

  /**
   * Task 4.1: one transactional claim used by all three claim paths.
   * Must run inside the caller's transaction (SELECT ... FOR UPDATE).
   * Cap-neutral: the guest row already counted toward the 25 cap — no count.
   */
  async claimGuestMember(
    tx: ClaimExecutor,
    input: ClaimGuestMemberInput,
  ): Promise<ClaimGuestMemberResult> {
    const guestPhone = phoneNumberSchema.parse(input.guestPhone);

    const [guest] = await tx
      .select()
      .from(members)
      .where(
        and(
          eq(members.tripId, input.tripId),
          eq(members.guestPhone, guestPhone),
        ),
      )
      .for("update")
      .limit(1);

    if (!guest) {
      // No guest row left: either never existed or already claimed (first
      // claim cleared guest_phone). Distinguish via the (tripId, userId) row.
      const [existing] = await tx
        .select()
        .from(members)
        .where(
          and(
            eq(members.tripId, input.tripId),
            eq(members.userId, input.userId),
          ),
        )
        .limit(1);
      if (existing) {
        return { claimed: false, alreadyClaimed: true, member: existing };
      }
      return { claimed: false };
    }

    if (guest.userId !== null) {
      return { claimed: false, alreadyClaimed: true, member: guest };
    }

    // Backstop for the concurrent-claim race: two txns can both pass the
    // pre-check above; the loser hits the partial unique index
    // members_trip_user_unique (23505) on UPDATE. Catch it and return the
    // existing already-claimed semantics instead of an uncaught 500.
    let claimed;
    try {
      // Savepoint: a 23505 aborts the surrounding tx (25P02) unless the
      // failing statement is rolled back to a savepoint first.
      claimed = await tx.transaction(async (sp) => {
        const [row] = await sp
          .update(members)
          .set({
            userId: input.userId,
            claimedAt: new Date(),
            guestDisplayName: null,
            guestPhone: null,
          })
          .where(eq(members.id, guest.id))
          .returning();
        return row;
      });
    } catch (err) {
      // Drizzle wraps driver errors: the 23505 may sit on err.code or
      // err.cause.code depending on the wrap layer.
      const pgCode =
        err !== null && typeof err === "object"
          ? ((err as { code?: unknown }).code ??
            (err as { cause?: { code?: unknown } }).cause?.code)
          : undefined;
      if (pgCode === "23505") {
        const [existing] = await tx
          .select()
          .from(members)
          .where(
            and(
              eq(members.tripId, input.tripId),
              eq(members.userId, input.userId),
            ),
          )
          .limit(1);
        if (!existing) {
          // The winner's update is not yet visible to this tx snapshot and
          // the guest row update was rejected — surface as a clean conflict.
          throw new DuplicateMemberError(
            "Member already claimed for this user",
          );
        }
        return { claimed: false, alreadyClaimed: true, member: existing };
      }
      throw err;
    }

    await tx
      .update(invitations)
      .set({ status: "accepted", respondedAt: new Date() })
      .where(
        and(
          eq(invitations.tripId, input.tripId),
          eq(invitations.inviteePhone, guestPhone),
          eq(invitations.status, "pending"),
        ),
      );

    return { claimed: true, member: claimed! };
  }

  private async requireOrganizer(
    requesterUserId: string,
    tripId: string,
  ): Promise<void> {
    const isOrg = await this.permissionsService.isOrganizer(
      requesterUserId,
      tripId,
    );
    if (!isOrg) {
      throw new PermissionDeniedError(
        "Permission denied: only organizers can manage guests",
      );
    }
  }

  private async requireGuestRow(tripId: string, memberId: string) {
    const [row] = await this.db
      .select()
      .from(members)
      .where(and(eq(members.id, memberId), eq(members.tripId, tripId)))
      .limit(1);
    if (!row) {
      throw new MemberNotFoundError("Member not found");
    }
    if (row.userId !== null) {
      throw new MemberNotFoundError("Member is not a guest");
    }
    return row;
  }

  private async assertPhoneAvailable(
    tripId: string,
    guestPhone: string,
    excludeMemberId?: string,
  ): Promise<void> {
    // Guard: guest phone matches an existing trip member's user phone -> 409
    const memberPhoneMatch = await this.db
      .select({ id: members.id })
      .from(members)
      .innerJoin(users, eq(members.userId, users.id))
      .where(
        and(
          eq(members.tripId, tripId),
          eq(users.phoneNumber, guestPhone),
        ),
      )
      .limit(1);
    if (memberPhoneMatch.length > 0) {
      throw new DuplicateMemberError(
        "A member with this phone number is already in this trip",
      );
    }

    // Guard: duplicate guestPhone on the same trip -> 409 (excluding self)
    const guestPhoneMatch = await this.db
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.tripId, tripId),
          eq(members.guestPhone, guestPhone),
          ...(excludeMemberId !== undefined
            ? [ne(members.id, excludeMemberId)]
            : []),
        ),
      )
      .limit(1);
    if (guestPhoneMatch.length > 0) {
      throw new DuplicateMemberError(
        "A guest with this phone number is already in this trip",
      );
    }
  }
}
