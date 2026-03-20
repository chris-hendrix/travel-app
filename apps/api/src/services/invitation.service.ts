import {
  invitations,
  members,
  users,
  trips,
  mutedMembers,
  type Invitation as DBInvitation,
} from "@/db/schema/index.js";
import { eq, and, inArray, count, sql } from "drizzle-orm";
import type { AppDatabase } from "@/types/index.js";
import type { IPermissionsService } from "./permissions.service.js";
import type { ISMSService } from "./sms.service.js";
import type { INotificationService } from "./notification.service.js";
import type { Logger } from "@/types/logger.js";
import type { MemberWithProfile } from "@journiful/shared/types";
import type { PgBoss } from "pg-boss";
import { QUEUE } from "@/queues/types.js";
import type { InvitationSendPayload } from "@/queues/types.js";
import {
  PermissionDeniedError,
  TripNotFoundError,
  MemberLimitExceededError,
  InvitationNotFoundError,
  MemberNotFoundError,
  CannotRemoveCreatorError,
  CannotDemoteCreatorError,
  CannotModifyOwnRoleError,
  LastOrganizerError,
  NotAMutualError,
} from "../errors.js";

/**
 * Invitation Service Interface
 * Defines the contract for invitation and RSVP management operations
 */
export interface IInvitationService {
  /**
   * Creates batch invitations for a trip
   * @param userId - The ID of the user creating invitations (must be organizer)
   * @param tripId - The ID of the trip
   * @param phoneNumbers - Array of phone numbers to invite
   * @param userIds - Array of mutual user IDs to invite directly
   * @returns Created invitations, skipped entries, and added members
   */
  createInvitations(
    userId: string,
    tripId: string,
    phoneNumbers: string[],
    userIds?: string[],
  ): Promise<{
    invitations: DBInvitation[];
    skipped: string[];
    addedMembers: { userId: string; displayName: string }[];
  }>;

  /**
   * Gets all invitations for a trip
   * @param tripId - The ID of the trip
   * @returns Invitations with optional invitee names
   */
  getInvitationsByTrip(
    tripId: string,
  ): Promise<(DBInvitation & { inviteeName?: string })[]>;

  /**
   * Revokes an invitation
   * @param userId - The ID of the user revoking (must be organizer)
   * @param invitationId - The ID of the invitation to revoke
   */
  revokeInvitation(userId: string, invitationId: string): Promise<void>;

  /**
   * Updates RSVP status for a trip member
   * @param userId - The ID of the user updating their RSVP
   * @param tripId - The ID of the trip
   * @param status - The new RSVP status
   * @returns Updated member with profile information
   */
  updateRsvp(
    userId: string,
    tripId: string,
    status: "going" | "not_going" | "maybe",
    sharePhone?: boolean,
  ): Promise<MemberWithProfile>;

  /**
   * Gets the current member's per-trip settings
   * @param userId - The ID of the requesting user
   * @param tripId - The ID of the trip
   * @returns Current settings (sharePhone)
   */
  getMySettings(
    userId: string,
    tripId: string,
  ): Promise<{ sharePhone: boolean; calendarExcluded: boolean }>;

  /**
   * Updates the current member's per-trip settings
   * @param userId - The ID of the requesting user
   * @param tripId - The ID of the trip
   * @param sharePhone - Whether to share phone number with other members
   * @returns Updated settings (sharePhone)
   */
  updateMySettings(
    userId: string,
    tripId: string,
    sharePhone: boolean,
  ): Promise<{ sharePhone: boolean; calendarExcluded: boolean }>;

  /**
   * Gets all members of a trip with profile information
   * Phone numbers are included when requesting user is an organizer or member has opted in via sharePhone.
   * Non-organizer view is filtered to going/maybe members unless trip has showAllMembers enabled.
   * @param tripId - The ID of the trip
   * @param requestingUserId - The ID of the requesting user
   * @returns Members with profile information
   */
  getTripMembers(
    tripId: string,
    requestingUserId: string,
  ): Promise<MemberWithProfile[]>;

  /**
   * Removes a member from a trip
   * @param userId - The ID of the user performing the removal (must be organizer)
   * @param tripId - The ID of the trip
   * @param memberId - The ID of the member record to remove
   */
  removeMember(userId: string, tripId: string, memberId: string): Promise<void>;

  /**
   * Updates the organizer role of a trip member
   * @param userId - The ID of the user performing the update (must be organizer)
   * @param tripId - The ID of the trip
   * @param memberId - The ID of the member record to update
   * @param isOrganizer - Whether the member should be a co-organizer
   * @returns Updated member with profile information
   */
  updateMemberRole(
    userId: string,
    tripId: string,
    memberId: string,
    isOrganizer: boolean,
  ): Promise<MemberWithProfile>;

  /**
   * Processes pending invitations for a user after signup/login
   * @param userId - The ID of the user
   * @param phoneNumber - The phone number to match invitations against
   */
  processPendingInvitations(userId: string, phoneNumber: string): Promise<void>;
}

/**
 * Invitation Service Implementation
 * Handles invitation creation, RSVP management, and member queries
 */
export class InvitationService implements IInvitationService {
  constructor(
    private db: AppDatabase,
    private permissionsService: IPermissionsService,
    private smsService: ISMSService,
    private notificationService: INotificationService,
    private logger?: Logger,
    private boss: PgBoss | null = null,
  ) {}

  /**
   * Creates batch invitations for a trip
   * Skips already-invited and already-member phone numbers
   * Creates member records for phones that belong to existing users
   * Also supports direct mutual invites via userIds
   */
  async createInvitations(
    userId: string,
    tripId: string,
    phoneNumbers: string[],
    userIds: string[] = [],
  ): Promise<{
    invitations: DBInvitation[];
    skipped: string[];
    addedMembers: { userId: string; displayName: string }[];
  }> {
    // Check permission
    const canInvite = await this.permissionsService.canInviteMembers(
      userId,
      tripId,
    );
    if (!canInvite) {
      // Check if trip exists for better error message
      const tripExists = await this.db
        .select({ id: trips.id })
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);

      if (tripExists.length === 0) {
        throw new TripNotFoundError();
      }

      throw new PermissionDeniedError(
        "Permission denied: only organizers can invite members",
      );
    }

    // Fetch inviter display name and trip name for notification bodies
    const [inviterRow] = await this.db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const inviterDisplayName = inviterRow?.displayName ?? "Someone";

    const [tripRow] = await this.db
      .select({ name: trips.name })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    const tripName = tripRow?.name ?? "a trip";

    let createdInvitations: DBInvitation[] = [];
    let skipped: string[] = [];
    let newPhones: string[] = [];
    const addedMembers: { userId: string; displayName: string }[] = [];

    // Track phone-based auto-added users for sms_invite notifications
    const phoneAutoAddedUserIds: string[] = [];

    await this.db.transaction(async (tx) => {
      // Count current members
      const countResult = await tx
        .select({ value: count() })
        .from(members)
        .where(eq(members.tripId, tripId));
      const currentMemberCount = countResult[0]!.value;

      // Check initial limit (before dedup) including both phone and userId invites
      if (currentMemberCount + phoneNumbers.length + userIds.length > 25) {
        throw new MemberLimitExceededError(
          `Member limit exceeded: current ${currentMemberCount} + ${phoneNumbers.length + userIds.length} invites would exceed 25`,
        );
      }

      // === Phone-based invitation flow ===
      if (phoneNumbers.length > 0) {
        // Get already-invited phones
        const alreadyInvited = await tx
          .select({ inviteePhone: invitations.inviteePhone })
          .from(invitations)
          .where(
            and(
              eq(invitations.tripId, tripId),
              inArray(invitations.inviteePhone, phoneNumbers),
            ),
          );
        const alreadyInvitedPhones = new Set(
          alreadyInvited.map((r) => r.inviteePhone),
        );

        // Get phones that are already members
        const existingUsers = await tx
          .select({
            id: users.id,
            phoneNumber: users.phoneNumber,
            displayName: users.displayName,
          })
          .from(users)
          .where(inArray(users.phoneNumber, phoneNumbers));

        const phoneToUserMap = new Map(
          existingUsers.map((u) => [u.phoneNumber, u]),
        );

        const existingUserIds = existingUsers.map((u) => u.id);
        let alreadyMemberUserIds = new Set<string>();

        if (existingUserIds.length > 0) {
          const existingMembers = await tx
            .select({ userId: members.userId })
            .from(members)
            .where(
              and(
                eq(members.tripId, tripId),
                inArray(members.userId, existingUserIds),
              ),
            );
          alreadyMemberUserIds = new Set(existingMembers.map((m) => m.userId));
        }

        // Build skipped list for phones
        const alreadyMemberPhones = new Set<string>();
        for (const [phone, user] of phoneToUserMap) {
          if (alreadyMemberUserIds.has(user.id)) {
            alreadyMemberPhones.add(phone);
          }
        }

        const phoneSkipped = phoneNumbers.filter(
          (phone) =>
            alreadyInvitedPhones.has(phone) || alreadyMemberPhones.has(phone),
        );
        skipped.push(...phoneSkipped);

        // Build newPhones
        const skippedSet = new Set(phoneSkipped);
        newPhones = phoneNumbers.filter((phone) => !skippedSet.has(phone));

        if (newPhones.length > 0) {
          // Batch insert invitations
          createdInvitations = await tx
            .insert(invitations)
            .values(
              newPhones.map((phone) => ({
                tripId,
                inviterId: userId,
                inviteePhone: phone,
                status: "pending" as const,
              })),
            )
            .returning();

          // Create member records for phones that belong to existing users
          const newMemberValues: {
            tripId: string;
            userId: string;
            status: "no_response";
            isOrganizer: boolean;
          }[] = [];

          for (const phone of newPhones) {
            const existingUser = phoneToUserMap.get(phone);
            if (existingUser && !alreadyMemberUserIds.has(existingUser.id)) {
              newMemberValues.push({
                tripId,
                userId: existingUser.id,
                status: "no_response",
                isOrganizer: false,
              });
              addedMembers.push({
                userId: existingUser.id,
                displayName: existingUser.displayName,
              });
              phoneAutoAddedUserIds.push(existingUser.id);
            }
          }

          if (newMemberValues.length > 0) {
            await tx.insert(members).values(newMemberValues);
          }
        }
      }

      // === Mutual (userId) invitation flow ===
      if (userIds.length > 0) {
        // Verify each userId is a mutual of the inviter (shares at least one trip)
        const mutualCheckResult = await tx.execute<{
          user_id: string;
        }>(sql`
          SELECT m2.user_id
          FROM members m1
          JOIN members m2 ON m1.trip_id = m2.trip_id AND m1.user_id != m2.user_id
          WHERE m1.user_id = ${userId}
            AND m2.user_id IN (${sql.join(
              userIds.map((id) => sql`${id}`),
              sql`, `,
            )})
          GROUP BY m2.user_id
        `);

        const verifiedMutualIds = new Set(
          mutualCheckResult.rows.map((r) => r.user_id),
        );

        // Reject any non-mutual userIds
        for (const uid of userIds) {
          if (!verifiedMutualIds.has(uid)) {
            throw new NotAMutualError(
              `User ${uid} is not a mutual and cannot be invited directly`,
            );
          }
        }

        // Check which userIds are already members of this trip
        const existingTripMembers = await tx
          .select({ userId: members.userId })
          .from(members)
          .where(
            and(eq(members.tripId, tripId), inArray(members.userId, userIds)),
          );
        const alreadyMemberMutualIds = new Set(
          existingTripMembers.map((m) => m.userId),
        );

        // Filter out already-member userIds
        const newMutualUserIds = userIds.filter(
          (uid) => !alreadyMemberMutualIds.has(uid),
        );
        const skippedMutualUserIds = userIds.filter((uid) =>
          alreadyMemberMutualIds.has(uid),
        );
        skipped.push(...skippedMutualUserIds);

        // Re-check limit after filtering both phone and mutual dedup
        const totalNew = newPhones.length + newMutualUserIds.length;
        if (currentMemberCount + totalNew > 25) {
          throw new MemberLimitExceededError(
            `Member limit exceeded: current ${currentMemberCount} + ${totalNew} new invites would exceed 25`,
          );
        }

        if (newMutualUserIds.length > 0) {
          // Fetch display names for the new mutual invitees
          const mutualUsers = await tx
            .select({ id: users.id, displayName: users.displayName })
            .from(users)
            .where(inArray(users.id, newMutualUserIds));
          const mutualUserMap = new Map(
            mutualUsers.map((u) => [u.id, u.displayName]),
          );

          // Create member records for mutual invitees
          await tx.insert(members).values(
            newMutualUserIds.map((uid) => ({
              tripId,
              userId: uid,
              status: "no_response" as const,
              isOrganizer: false,
            })),
          );

          // Build addedMembers entries for mutual invitees
          for (const uid of newMutualUserIds) {
            addedMembers.push({
              userId: uid,
              displayName: mutualUserMap.get(uid) ?? "Unknown",
            });
          }
        }
      }
    });

    // Send invitation SMS via queue or fallback to inline delivery
    if (this.boss && newPhones.length > 0) {
      await this.boss.insert(
        QUEUE.INVITATION_SEND,
        newPhones.map((phone) => ({
          data: {
            phoneNumber: phone,
            message: "You've been invited to a trip on Journiful!",
          } as InvitationSendPayload,
        })),
      );
    } else {
      for (const phone of newPhones) {
        await this.smsService.sendMessage(
          phone,
          "You've been invited to a trip on Journiful!",
        );
      }
    }

    // Send sms_invite notifications for existing users auto-added via phone
    for (const autoAddedUserId of phoneAutoAddedUserIds) {
      try {
        await this.notificationService.createNotification({
          userId: autoAddedUserId,
          tripId,
          type: "sms_invite",
          title: "Trip invitation",
          body: `${inviterDisplayName} invited you to ${tripName}`,
          data: { inviterId: userId },
        });
      } catch (err) {
        this.logger?.error(err, "Failed to send sms_invite notification");
      }
    }

    // Send mutual_invite notifications for userId-based invitees
    for (const added of addedMembers) {
      // Skip phone-auto-added users (they already got sms_invite above)
      if (phoneAutoAddedUserIds.includes(added.userId)) {
        continue;
      }
      try {
        await this.notificationService.createNotification({
          userId: added.userId,
          tripId,
          type: "mutual_invite",
          title: "Trip invitation",
          body: `${inviterDisplayName} invited you to ${tripName}`,
          data: { inviterId: userId },
        });
      } catch (err) {
        this.logger?.error(err, "Failed to send mutual_invite notification");
      }
    }

    return { invitations: createdInvitations, skipped, addedMembers };
  }

  /**
   * Gets all invitations for a trip with optional invitee names
   */
  async getInvitationsByTrip(
    tripId: string,
  ): Promise<(DBInvitation & { inviteeName?: string })[]> {
    const results = await this.db
      .select({
        invitation: invitations,
        displayName: users.displayName,
      })
      .from(invitations)
      .leftJoin(users, eq(invitations.inviteePhone, users.phoneNumber))
      .where(eq(invitations.tripId, tripId));

    return results.map((r) => {
      const entry: DBInvitation & { inviteeName?: string } = {
        ...r.invitation,
      };
      if (r.displayName) {
        entry.inviteeName = r.displayName;
      }
      return entry;
    });
  }

  /**
   * Revokes an invitation and removes associated member record
   */
  async revokeInvitation(userId: string, invitationId: string): Promise<void> {
    // Look up invitation
    const [invitation] = await this.db
      .select({
        id: invitations.id,
        tripId: invitations.tripId,
        inviteePhone: invitations.inviteePhone,
      })
      .from(invitations)
      .where(eq(invitations.id, invitationId))
      .limit(1);

    if (!invitation) {
      throw new InvitationNotFoundError();
    }

    // Check if user is organizer
    const isOrg = await this.permissionsService.isOrganizer(
      userId,
      invitation.tripId,
    );
    if (!isOrg) {
      throw new PermissionDeniedError(
        "Permission denied: only organizers can revoke invitations",
      );
    }

    // Look up user by phone to delete member record
    const [inviteeUser] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phoneNumber, invitation.inviteePhone))
      .limit(1);

    if (inviteeUser) {
      await this.db
        .delete(members)
        .where(
          and(
            eq(members.tripId, invitation.tripId),
            eq(members.userId, inviteeUser.id),
          ),
        );
    }

    // Delete the invitation record
    await this.db.delete(invitations).where(eq(invitations.id, invitationId));
  }

  /**
   * Removes a member from a trip
   * Deletes the member record and associated invitation if one exists
   */
  async removeMember(
    userId: string,
    tripId: string,
    memberId: string,
  ): Promise<void> {
    // Check if requesting user is organizer
    const isOrg = await this.permissionsService.isOrganizer(userId, tripId);
    if (!isOrg) {
      throw new PermissionDeniedError(
        "Permission denied: only organizers can remove members",
      );
    }

    // Load target member and trip creator in parallel
    const [memberResult, tripResult] = await Promise.all([
      this.db
        .select({
          id: members.id,
          userId: members.userId,
          isOrganizer: members.isOrganizer,
        })
        .from(members)
        .where(and(eq(members.id, memberId), eq(members.tripId, tripId)))
        .limit(1),
      this.db
        .select({ createdBy: trips.createdBy })
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1),
    ]);

    const member = memberResult[0];
    const trip = tripResult[0];

    if (!member) {
      throw new MemberNotFoundError();
    }

    if (trip && member.userId === trip.createdBy) {
      throw new CannotRemoveCreatorError();
    }

    // If target is an organizer, check they're not the last one
    if (member.isOrganizer) {
      const [organizerCount] = await this.db
        .select({ value: count() })
        .from(members)
        .where(and(eq(members.tripId, tripId), eq(members.isOrganizer, true)));

      if (organizerCount!.value <= 1) {
        throw new LastOrganizerError();
      }
    }

    // Delete invitation and member in a transaction for consistency
    await this.db.transaction(async (tx) => {
      // Find and delete associated invitation via user's phone number
      const [targetUser] = await tx
        .select({ phoneNumber: users.phoneNumber })
        .from(users)
        .where(eq(users.id, member.userId))
        .limit(1);

      if (targetUser) {
        await tx
          .delete(invitations)
          .where(
            and(
              eq(invitations.tripId, tripId),
              eq(invitations.inviteePhone, targetUser.phoneNumber),
            ),
          );
      }

      // Delete the member record (cascades to member_travel)
      await tx.delete(members).where(eq(members.id, memberId));
    });
  }

  /**
   * Updates RSVP status for a trip member
   */
  async updateRsvp(
    userId: string,
    tripId: string,
    status: "going" | "not_going" | "maybe",
    sharePhone?: boolean,
  ): Promise<MemberWithProfile> {
    // Check permission
    const canUpdate = await this.permissionsService.canUpdateRsvp(
      userId,
      tripId,
    );
    if (!canUpdate) {
      // Check if trip exists for better error message
      const tripExists = await this.db
        .select({ id: trips.id })
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);

      if (tripExists.length === 0) {
        throw new TripNotFoundError();
      }

      throw new PermissionDeniedError(
        "Permission denied: only members can update RSVP",
      );
    }

    // Update member status
    await this.db
      .update(members)
      .set({
        status,
        ...(sharePhone !== undefined ? { sharePhone } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(members.tripId, tripId), eq(members.userId, userId)));

    // Create default notification preferences when RSVP changes to "going"
    if (status === "going") {
      try {
        await this.notificationService.createDefaultPreferences(userId, tripId);
      } catch (err) {
        this.logger?.error(
          err,
          "Failed to create default notification preferences",
        );
      }
    }

    // Query updated member with profile info
    const queryResult = await this.db
      .select({
        id: members.id,
        userId: members.userId,
        displayName: users.displayName,
        profilePhotoUrl: users.profilePhotoUrl,
        handles: users.handles,
        status: members.status,
        isOrganizer: members.isOrganizer,
        createdAt: members.createdAt,
      })
      .from(members)
      .innerJoin(users, eq(members.userId, users.id))
      .where(and(eq(members.tripId, tripId), eq(members.userId, userId)))
      .limit(1);

    const result = queryResult[0]!;

    return {
      id: result.id,
      userId: result.userId,
      displayName: result.displayName,
      profilePhotoUrl: result.profilePhotoUrl,
      handles: result.handles ?? null,
      status: result.status,
      isOrganizer: result.isOrganizer,
      createdAt: result.createdAt.toISOString(),
    };
  }

  /**
   * Gets the current member's per-trip settings
   */
  async getMySettings(
    userId: string,
    tripId: string,
  ): Promise<{ sharePhone: boolean; calendarExcluded: boolean }> {
    const membershipInfo = await this.permissionsService.getMembershipInfo(
      userId,
      tripId,
    );
    if (!membershipInfo.isMember) {
      throw new PermissionDeniedError(
        "Permission denied: only members can view settings",
      );
    }

    const result = await this.db
      .select({
        sharePhone: members.sharePhone,
        calendarExcluded: members.calendarExcluded,
      })
      .from(members)
      .where(and(eq(members.tripId, tripId), eq(members.userId, userId)))
      .limit(1);

    return {
      sharePhone: result[0]!.sharePhone,
      calendarExcluded: result[0]!.calendarExcluded,
    };
  }

  /**
   * Updates the current member's per-trip settings
   */
  async updateMySettings(
    userId: string,
    tripId: string,
    sharePhone: boolean,
  ): Promise<{ sharePhone: boolean; calendarExcluded: boolean }> {
    const membershipInfo = await this.permissionsService.getMembershipInfo(
      userId,
      tripId,
    );
    if (!membershipInfo.isMember) {
      throw new PermissionDeniedError(
        "Permission denied: only members can update settings",
      );
    }

    await this.db
      .update(members)
      .set({ sharePhone, updatedAt: new Date() })
      .where(and(eq(members.tripId, tripId), eq(members.userId, userId)));

    const updatedResult = await this.db
      .select({
        sharePhone: members.sharePhone,
        calendarExcluded: members.calendarExcluded,
      })
      .from(members)
      .where(and(eq(members.tripId, tripId), eq(members.userId, userId)))
      .limit(1);

    return {
      sharePhone: updatedResult[0]!.sharePhone,
      calendarExcluded: updatedResult[0]!.calendarExcluded,
    };
  }

  /**
   * Gets all members of a trip with profile information
   * Phone numbers included when requesting user is organizer or member has sharePhone enabled.
   * Non-organizers see only going/maybe members unless trip.showAllMembers is true.
   */
  async getTripMembers(
    tripId: string,
    requestingUserId: string,
  ): Promise<MemberWithProfile[]> {
    // Check membership and organizer status in a single query
    const membershipInfo = await this.permissionsService.getMembershipInfo(
      requestingUserId,
      tripId,
    );
    if (!membershipInfo.isMember) {
      throw new PermissionDeniedError(
        "Permission denied: only members can view trip members",
      );
    }

    const isOrg = membershipInfo.isOrganizer;

    // Fetch trip's showAllMembers setting
    const tripSettings = await this.db
      .select({ showAllMembers: trips.showAllMembers })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    // Query members with user profiles
    const results = await this.db
      .select({
        id: members.id,
        userId: members.userId,
        displayName: users.displayName,
        profilePhotoUrl: users.profilePhotoUrl,
        handles: users.handles,
        phoneNumber: users.phoneNumber,
        sharePhone: members.sharePhone,
        status: members.status,
        isOrganizer: members.isOrganizer,
        createdAt: members.createdAt,
      })
      .from(members)
      .innerJoin(users, eq(members.userId, users.id))
      .where(eq(members.tripId, tripId));

    // Get muted members for this trip (only when requesting user is organizer)
    let mutedUserIds: Set<string> = new Set();
    if (isOrg) {
      const mutedRows = await this.db
        .select({ userId: mutedMembers.userId })
        .from(mutedMembers)
        .where(eq(mutedMembers.tripId, tripId));
      mutedUserIds = new Set(mutedRows.map((r) => r.userId));
    }

    // Filter members for non-organizers when showAllMembers is off
    const filteredResults =
      !isOrg && !tripSettings[0]?.showAllMembers
        ? results.filter((r) => r.status === "going" || r.status === "maybe")
        : results;

    return filteredResults.map((r) => ({
      id: r.id,
      userId: r.userId,
      displayName: r.displayName,
      profilePhotoUrl: r.profilePhotoUrl,
      handles: r.handles ?? null,
      ...(isOrg || r.sharePhone ? { phoneNumber: r.phoneNumber } : {}),
      status: r.status,
      isOrganizer: r.isOrganizer,
      ...(isOrg ? { isMuted: mutedUserIds.has(r.userId) } : {}),
      ...(isOrg ? { sharePhone: r.sharePhone } : {}),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Updates the organizer role of a trip member
   * Validates permissions, prevents demoting trip creator and self-modification
   */
  async updateMemberRole(
    userId: string,
    tripId: string,
    memberId: string,
    isOrganizer: boolean,
  ): Promise<MemberWithProfile> {
    // Check if requesting user is organizer
    const canManage = await this.permissionsService.isOrganizer(userId, tripId);
    if (!canManage) {
      // Check if trip exists for better error message
      const tripExists = await this.db
        .select({ id: trips.id })
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);

      if (tripExists.length === 0) {
        throw new TripNotFoundError();
      }

      throw new PermissionDeniedError(
        "Permission denied: only organizers can update member roles",
      );
    }

    // Load target member and trip creator in parallel
    const [memberResult, tripResult] = await Promise.all([
      this.db
        .select({
          id: members.id,
          userId: members.userId,
          isOrganizer: members.isOrganizer,
        })
        .from(members)
        .where(and(eq(members.id, memberId), eq(members.tripId, tripId)))
        .limit(1),
      this.db
        .select({ createdBy: trips.createdBy })
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1),
    ]);

    const member = memberResult[0];
    const trip = tripResult[0];

    if (!member) {
      throw new MemberNotFoundError();
    }

    // Prevent self-promote/demote
    if (member.userId === userId) {
      throw new CannotModifyOwnRoleError();
    }

    if (trip && member.userId === trip.createdBy) {
      throw new CannotDemoteCreatorError();
    }

    // If demoting, check they're not the last organizer
    if (!isOrganizer && member.isOrganizer) {
      const [organizerCount] = await this.db
        .select({ value: count() })
        .from(members)
        .where(and(eq(members.tripId, tripId), eq(members.isOrganizer, true)));

      if (organizerCount!.value <= 1) {
        throw new LastOrganizerError();
      }
    }

    // Update the member's organizer status
    await this.db
      .update(members)
      .set({ isOrganizer, updatedAt: new Date() })
      .where(eq(members.id, memberId));

    // Query updated member with profile info
    const queryResult = await this.db
      .select({
        id: members.id,
        userId: members.userId,
        displayName: users.displayName,
        profilePhotoUrl: users.profilePhotoUrl,
        handles: users.handles,
        status: members.status,
        isOrganizer: members.isOrganizer,
        createdAt: members.createdAt,
      })
      .from(members)
      .innerJoin(users, eq(members.userId, users.id))
      .where(eq(members.id, memberId))
      .limit(1);

    const result = queryResult[0]!;

    return {
      id: result.id,
      userId: result.userId,
      displayName: result.displayName,
      profilePhotoUrl: result.profilePhotoUrl,
      handles: result.handles ?? null,
      status: result.status,
      isOrganizer: result.isOrganizer,
      createdAt: result.createdAt.toISOString(),
    };
  }

  /**
   * Processes pending invitations for a user after signup/login
   * Creates member records and updates invitation status
   */
  async processPendingInvitations(
    userId: string,
    phoneNumber: string,
  ): Promise<void> {
    // Find all pending invitations for this phone
    const pendingInvitations = await this.db
      .select({ id: invitations.id, tripId: invitations.tripId })
      .from(invitations)
      .where(
        and(
          eq(invitations.inviteePhone, phoneNumber),
          eq(invitations.status, "pending"),
        ),
      );

    if (pendingInvitations.length === 0) return;

    const tripIds = pendingInvitations.map((inv) => inv.tripId);

    await this.db.transaction(async (tx) => {
      // Batch: get all existing memberships for these trips
      const existingMembers = await tx
        .select({ tripId: members.tripId })
        .from(members)
        .where(
          and(inArray(members.tripId, tripIds), eq(members.userId, userId)),
        );

      const existingTripIds = new Set(existingMembers.map((m) => m.tripId));

      // Batch: insert new members for trips where user isn't already a member
      const newMemberTrips = pendingInvitations.filter(
        (inv) => !existingTripIds.has(inv.tripId),
      );

      if (newMemberTrips.length > 0) {
        await tx.insert(members).values(
          newMemberTrips.map((inv) => ({
            tripId: inv.tripId,
            userId,
            status: "no_response" as const,
            isOrganizer: false,
          })),
        );
      }

      // Batch: update all invitations to accepted
      const invitationIds = pendingInvitations.map((inv) => inv.id);
      await tx
        .update(invitations)
        .set({
          status: "accepted",
          respondedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(inArray(invitations.id, invitationIds));
    });
  }
}
