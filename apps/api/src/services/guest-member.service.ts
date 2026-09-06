import { members, users, payments } from "@/db/schema/index.js";
import { eq, and, count, isNull, ne } from "drizzle-orm";
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
} from "../errors.js";

export const MAX_TRIP_MEMBERS = 25;

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

    // Payer-protected: payments.member_id is ON DELETE RESTRICT — surface a
    // 409 with a actionable message instead of a raw FK violation.
    const payerRows = await this.db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.tripId, tripId),
          eq(payments.memberId, guest.id),
          isNull(payments.deletedAt),
        ),
      )
      .limit(1);
    if (payerRows.length > 0) {
      throw new DuplicateMemberError(
        "Cannot delete this guest: reassign or delete payments paid by this guest first",
      );
    }

    // Member delete cascades to member_travel + payment_participants rows;
    // balances recompute on read (member:<id> keys).
    await this.db.delete(members).where(eq(members.id, guest.id));
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
