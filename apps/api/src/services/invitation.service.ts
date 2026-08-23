import {
  invitations,
  members,
  users,
  trips,
  mutedMembers,
  memberTravel,
  payments,
  paymentParticipants,
  type Invitation as DBInvitation,
} from "@/db/schema/index.js";
import { eq, and, inArray, count, sql, isNull } from "drizzle-orm";
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
  PhoneTakenError,
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

  /**
   * Gets a public preview of an invitation for the invite deep link page
   * @param invitationId - The invitation UUID
   * @returns Preview data for pending, redirect hint for accepted, or null for declined/failed/not found
   */
  getInvitationPreview(invitationId: string): Promise<
    | {
        tripName: string;
        destination: string;
        startDate: string | null;
        endDate: string | null;
        inviterName: string;
        inviteePhone: string;
        tripId: string;
      }
    | { status: "accepted"; tripId: string }
    | null
  >;

  /**
   * Accepts an invitation for an authenticated user
   * @param invitationId - The invitation UUID
   * @param userId - The authenticated user's ID
   * @returns The tripId on success, or null if not found/not pending/phone mismatch
   */
  acceptInvitation(
    invitationId: string,
    userId: string,
  ): Promise<{ tripId: string } | null>;

  /**
   * Creates a placeholder member (not-yet-invited user)
   */
  createPlaceholder(
    userId: string,
    tripId: string,
    data: { name: string; phoneNumber?: string },
  ): Promise<MemberWithProfile>;

  /**
   * Updates a placeholder member's name/phone
   */
  updatePlaceholder(
    userId: string,
    memberId: string,
    data: { name?: string; phoneNumber?: string | null },
  ): Promise<MemberWithProfile>;

  /**
   * Deletes a placeholder member (hard delete, cascades travel/payments)
   */
  deletePlaceholder(userId: string, memberId: string): Promise<void>;

  /**
   * Sends an SMS invite for a placeholder that has a phone number
   */
  invitePlaceholder(
    userId: string,
    memberId: string,
  ): Promise<DBInvitation>;

  /**
   * Directly links a placeholder to an existing mutual user, merging if needed
   */
  linkPlaceholder(
    userId: string,
    memberId: string,
    targetUserId: string,
  ): Promise<MemberWithProfile>;

  /**
   * Attaches a phone number or links a mutual to a placeholder.
   * If phoneNumber matches a registered user, instantly converts (merge if needed).
   * If phoneNumber unknown, stages phoneNumber without converting.
   * If targetUserId provided, delegates to link logic (requires mutual).
   */
  attachPlaceholder(
    userId: string,
    memberId: string,
    data: { phoneNumber?: string; targetUserId?: string },
  ): Promise<MemberWithProfile>;
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
    private frontendUrl: string = "https://journiful.app",
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
    let mutualCreatedInvitations: DBInvitation[] = [];
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
          alreadyMemberUserIds = new Set(existingMembers.map((m) => m.userId).filter((id): id is string => id !== null));
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
          // Fetch display names and phone numbers for the new mutual invitees
          const mutualUsers = await tx
            .select({
              id: users.id,
              displayName: users.displayName,
              phoneNumber: users.phoneNumber,
            })
            .from(users)
            .where(inArray(users.id, newMutualUserIds));
          const mutualUserMap = new Map(
            mutualUsers.map((u) => [u.id, u]),
          );

          // Check for already-invited phones among mutuals (dedup)
          const mutualPhones = mutualUsers.map((u) => u.phoneNumber);
          const alreadyInvitedMutualRows = await tx
            .select({ inviteePhone: invitations.inviteePhone })
            .from(invitations)
            .where(
              and(
                eq(invitations.tripId, tripId),
                inArray(invitations.inviteePhone, mutualPhones),
              ),
            );
          const alreadyInvitedMutualPhones = new Set(
            alreadyInvitedMutualRows.map((r) => r.inviteePhone),
          );

          // Find mutuals whose phones are already invited and add their userId to skipped
          const phonesToSkipUserIds = new Set<string>();
          for (const u of mutualUsers) {
            if (alreadyInvitedMutualPhones.has(u.phoneNumber)) {
              skipped.push(u.id);
              phonesToSkipUserIds.add(u.id);
            }
          }

          // Filter to mutuals whose phones are NOT already invited
          const eligibleMutualUserIds = newMutualUserIds.filter(
            (uid) => !phonesToSkipUserIds.has(uid),
          );

          // Create invitation records for eligible mutuals
          if (eligibleMutualUserIds.length > 0) {
            const mutualInviteValues = eligibleMutualUserIds
              .map((uid) => {
                const u = mutualUserMap.get(uid);
                if (!u) return null;
                return {
                  tripId,
                  inviterId: userId,
                  inviteePhone: u.phoneNumber,
                  status: "pending" as const,
                };
              })
              .filter(
                (v): v is NonNullable<typeof v> => v !== null,
              );

            if (mutualInviteValues.length > 0) {
              mutualCreatedInvitations = await tx
                .insert(invitations)
                .values(mutualInviteValues)
                .returning();
            }
          }

          // Create member records for mutual invitees (all eligible, not just those with invitations)
          if (eligibleMutualUserIds.length > 0) {
            await tx.insert(members).values(
              eligibleMutualUserIds.map((uid) => ({
                tripId,
                userId: uid,
                status: "no_response" as const,
                isOrganizer: false,
              })),
            );
          }

          // Build addedMembers entries for mutual invitees
          for (const uid of eligibleMutualUserIds) {
            const u = mutualUserMap.get(uid);
            addedMembers.push({
              userId: uid,
              displayName: u?.displayName ?? "Unknown",
            });
          }
        }
      }
    });

    // Send invitation SMS via queue or fallback to inline delivery
    // Each phone gets a unique deep link to its invitation
    const safeName = inviterDisplayName.slice(0, 20);
    const safeTrip = tripName.slice(0, 30);
    const phoneToInvitationId = new Map(
      createdInvitations.map((inv) => [inv.inviteePhone, inv.id]),
    );
    if (this.boss && newPhones.length > 0) {
      await this.boss.insert(
        QUEUE.INVITATION_SEND,
        newPhones.map((phone) => ({
          data: {
            phoneNumber: phone,
            message: `${safeName} invited you to "${safeTrip}" on Journiful!\n${this.frontendUrl}/invite?id=${phoneToInvitationId.get(phone)}`,
          } as InvitationSendPayload,
        })),
      );
    } else {
      for (const phone of newPhones) {
        await this.smsService.sendMessage(
          phone,
          `${safeName} invited you to "${safeTrip}" on Journiful!\n${this.frontendUrl}/invite?id=${phoneToInvitationId.get(phone)}`,
          "invite",
        );
      }
    }

    // Send invitation SMS for mutual invites via queue or fallback to inline delivery
    const mutualPhoneToInvitationId = new Map(
      mutualCreatedInvitations.map((inv) => [inv.inviteePhone, inv.id]),
    );
    const mutualPhonesForSms = mutualCreatedInvitations.map(
      (inv) => inv.inviteePhone,
    );
    if (this.boss && mutualPhonesForSms.length > 0) {
      await this.boss.insert(
        QUEUE.INVITATION_SEND,
        mutualPhonesForSms.map((phone) => ({
          data: {
            phoneNumber: phone,
            message: `${safeName} invited you to "${safeTrip}" on Journiful!\n${this.frontendUrl}/invite?id=${mutualPhoneToInvitationId.get(phone)}`,
          } as InvitationSendPayload,
        })),
      );
    } else {
      for (const phone of mutualPhonesForSms) {
        await this.smsService.sendMessage(
          phone,
          `${safeName} invited you to "${safeTrip}" on Journiful!\n${this.frontendUrl}/invite?id=${mutualPhoneToInvitationId.get(phone)}`,
          "invite",
        );
      }
    }

    // Merge mutual invitations into createdInvitations for the return value
    createdInvitations = [...createdInvitations, ...mutualCreatedInvitations];

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
        memberId: invitations.memberId,
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

    // If invitation is linked to a placeholder, delete that placeholder directly
    if (invitation.memberId) {
      await this.db.delete(members).where(eq(members.id, invitation.memberId));
    } else {
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
      // Delete invitations linked via memberId (placeholder invites) and via phone (legacy/real)
      await tx.delete(invitations).where(eq(invitations.memberId, memberId));

      if (member.userId) {
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
      } else {
        // Placeholder: also clean invitation by phoneNumber stored on member row if any
        const [placeholder] = await tx
          .select({ phoneNumber: members.phoneNumber })
          .from(members)
          .where(eq(members.id, memberId))
          .limit(1);
        if (placeholder?.phoneNumber) {
          await tx
            .delete(invitations)
            .where(
              and(
                eq(invitations.tripId, tripId),
                eq(invitations.inviteePhone, placeholder.phoneNumber),
              ),
            );
        }
      }

      // Delete the member record (cascades to member_travel/payments/participants)
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

    // Query updated member with profile info (leftJoin to support placeholders, though updater is real user)
    const queryResult = await this.db
      .select({
        id: members.id,
        userId: members.userId,
        memberDisplayName: members.displayName,
        userDisplayName: users.displayName,
        profilePhotoUrl: users.profilePhotoUrl,
        handles: users.handles,
        status: members.status,
        isOrganizer: members.isOrganizer,
        createdAt: members.createdAt,
      })
      .from(members)
      .leftJoin(users, eq(members.userId, users.id))
      .where(and(eq(members.tripId, tripId), eq(members.userId, userId)))
      .limit(1);

    const result = queryResult[0]!;

    return {
      id: result.id,
      userId: result.userId,
      displayName: result.userDisplayName ?? result.memberDisplayName ?? "Unknown",
      profilePhotoUrl: result.profilePhotoUrl ?? null,
      handles: result.handles ?? null,
      isPlaceholder: result.userId === null,
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

    // Query members with user profiles (leftJoin to include placeholders)
    const results = await this.db
      .select({
        id: members.id,
        userId: members.userId,
        memberDisplayName: members.displayName,
        memberPhoneNumber: members.phoneNumber,
        userDisplayName: users.displayName,
        profilePhotoUrl: users.profilePhotoUrl,
        handles: users.handles,
        userPhoneNumber: users.phoneNumber,
        sharePhone: members.sharePhone,
        status: members.status,
        isOrganizer: members.isOrganizer,
        createdAt: members.createdAt,
      })
      .from(members)
      .leftJoin(users, eq(members.userId, users.id))
      .where(eq(members.tripId, tripId));

    // Get muted members for this trip (only when requesting user is organizer)
    let mutedUserIds: Set<string> = new Set();
    if (isOrg) {
      const mutedRows = await this.db
        .select({ userId: mutedMembers.userId })
        .from(mutedMembers)
        .where(eq(mutedMembers.tripId, tripId));
      const filteredIds = mutedRows
        .map((r) => r.userId)
        .filter((id): id is string => id !== null);
      mutedUserIds = new Set(filteredIds);
    }

    // Filter members for non-organizers when showAllMembers is off
    const filteredResults =
      !isOrg && !tripSettings[0]?.showAllMembers
        ? results.filter((r) => r.status === "going" || r.status === "maybe")
        : results;

    return filteredResults.map((r) => {
      const isPlaceholder = r.userId === null;
      const displayName = r.userDisplayName ?? r.memberDisplayName ?? "Unknown";
      const effectivePhone = r.userPhoneNumber ?? r.memberPhoneNumber ?? undefined;
      const shouldIncludePhone = isOrg || r.sharePhone;
      return {
        id: r.id,
        userId: r.userId,
        displayName,
        profilePhotoUrl: r.profilePhotoUrl ?? null,
        handles: r.handles ?? null,
        ...(shouldIncludePhone && effectivePhone ? { phoneNumber: effectivePhone } : {}),
        isPlaceholder,
        status: r.status,
        isOrganizer: r.isOrganizer,
        ...(isOrg && r.userId ? { isMuted: mutedUserIds.has(r.userId) } : {}),
        ...(isOrg ? { sharePhone: r.sharePhone } : {}),
        createdAt: r.createdAt.toISOString(),
      };
    });
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

    // Query updated member with profile info (leftJoin for placeholders)
    const queryResult = await this.db
      .select({
        id: members.id,
        userId: members.userId,
        memberDisplayName: members.displayName,
        userDisplayName: users.displayName,
        profilePhotoUrl: users.profilePhotoUrl,
        handles: users.handles,
        status: members.status,
        isOrganizer: members.isOrganizer,
        createdAt: members.createdAt,
      })
      .from(members)
      .leftJoin(users, eq(members.userId, users.id))
      .where(eq(members.id, memberId))
      .limit(1);

    const result = queryResult[0]!;

    return {
      id: result.id,
      userId: result.userId,
      displayName: result.userDisplayName ?? result.memberDisplayName ?? "Unknown",
      profilePhotoUrl: result.profilePhotoUrl ?? null,
      handles: result.handles ?? null,
      isPlaceholder: result.userId === null,
      status: result.status,
      isOrganizer: result.isOrganizer,
      createdAt: result.createdAt.toISOString(),
    };
  }

  /**
   * Processes pending invitations for a user after signup/login
   * Creates member records and updates invitation status
   * Placeholder-aware: claims placeholder rows by memberId or phone fallback, merging if needed
   */
  async processPendingInvitations(
    userId: string,
    phoneNumber: string,
  ): Promise<void> {
    // Find all pending invitations for this phone (include memberId for placeholder reconcile)
    const pendingInvitations = await this.db
      .select({ id: invitations.id, tripId: invitations.tripId, memberId: invitations.memberId })
      .from(invitations)
      .where(
        and(
          eq(invitations.inviteePhone, phoneNumber),
          eq(invitations.status, "pending"),
        ),
      );

    if (pendingInvitations.length === 0) return;

    await this.db.transaction(async (tx) => {
      for (const inv of pendingInvitations) {
        // Try to find placeholder by invitation.memberId first, fallback to phone match
        let placeholderId: string | null = inv.memberId ?? null;
        if (!placeholderId) {
          const [placeholder] = await tx
            .select({ id: members.id })
            .from(members)
            .where(
              and(
                eq(members.tripId, inv.tripId),
                eq(members.phoneNumber, phoneNumber),
                isNull(members.userId),
              ),
            )
            .limit(1);
          placeholderId = placeholder?.id ?? null;
        } else {
          // Verify placeholder still exists and is still a placeholder
          const [placeholder] = await tx
            .select({ id: members.id, userId: members.userId })
            .from(members)
            .where(eq(members.id, placeholderId))
            .limit(1);
          if (!placeholder || placeholder.userId !== null) {
            placeholderId = null;
          }
        }

        if (placeholderId) {
          // Check if user already has a member row in this trip (duplicate)
          const [existing] = await tx
            .select({ id: members.id })
            .from(members)
            .where(and(eq(members.tripId, inv.tripId), eq(members.userId, userId)))
            .limit(1);

          if (existing && existing.id !== placeholderId) {
            // Merge placeholder into existing member: transfer travel/payments/participants
            await tx.update(memberTravel).set({ memberId: existing.id }).where(eq(memberTravel.memberId, placeholderId));
            await tx.update(payments).set({ memberId: existing.id }).where(eq(payments.memberId, placeholderId));
            await tx.update(paymentParticipants).set({ memberId: existing.id }).where(eq(paymentParticipants.memberId, placeholderId));
            await tx.delete(members).where(eq(members.id, placeholderId));
          } else if (!existing) {
            // Claim placeholder
            await tx.update(members).set({ userId, updatedAt: new Date() }).where(eq(members.id, placeholderId));
          }
        } else {
          // No placeholder: check if already a member
          const [existing] = await tx
            .select({ id: members.id })
            .from(members)
            .where(and(eq(members.tripId, inv.tripId), eq(members.userId, userId)))
            .limit(1);
          if (!existing) {
            await tx.insert(members).values({
              tripId: inv.tripId,
              userId,
              status: "no_response" as const,
              isOrganizer: false,
            });
          }
        }

        await tx
          .update(invitations)
          .set({
            status: "accepted",
            respondedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(invitations.id, inv.id));
      }
    });
  }

  /**
   * Gets a public preview of an invitation for the invite deep link page.
   * Returns preview data for pending invitations, a redirect hint for accepted
   * invitations, and null for declined/failed/not found.
   */
  async getInvitationPreview(invitationId: string): Promise<
    | {
        tripName: string;
        destination: string;
        startDate: string | null;
        endDate: string | null;
        inviterName: string;
        inviteePhone: string;
        tripId: string;
      }
    | { status: "accepted"; tripId: string }
    | null
  > {
    const [row] = await this.db
      .select({
        status: invitations.status,
        tripId: invitations.tripId,
        inviteePhone: invitations.inviteePhone,
        tripName: trips.name,
        destination: trips.destination,
        startDate: trips.startDate,
        endDate: trips.endDate,
        inviterName: users.displayName,
      })
      .from(invitations)
      .innerJoin(trips, eq(invitations.tripId, trips.id))
      .innerJoin(users, eq(invitations.inviterId, users.id))
      .where(eq(invitations.id, invitationId))
      .limit(1);

    if (!row) return null;

    if (row.status === "accepted") {
      return { status: "accepted", tripId: row.tripId };
    }

    if (row.status !== "pending") {
      return null;
    }

    // Mask phone: show last 4 digits only (e.g. "+1555****890")
    const phone = row.inviteePhone;
    const maskedPhone =
      phone.length > 4
        ? phone.slice(0, phone.length - 4).replace(/\d/g, "*") +
          phone.slice(-4)
        : phone;

    return {
      tripName: row.tripName,
      destination: row.destination,
      startDate: row.startDate,
      endDate: row.endDate,
      inviterName: row.inviterName,
      inviteePhone: maskedPhone,
      tripId: row.tripId,
    };
  }

  /**
   * Accepts a single invitation for an authenticated user.
   * Validates the invitation is pending and the user's phone matches inviteePhone.
   * Placeholder-aware: claims placeholder by memberId or phone fallback.
   */
  async acceptInvitation(
    invitationId: string,
    userId: string,
  ): Promise<{ tripId: string } | null> {
    // Look up the invitation (include memberId)
    const [invitation] = await this.db
      .select({
        id: invitations.id,
        tripId: invitations.tripId,
        inviteePhone: invitations.inviteePhone,
        status: invitations.status,
        memberId: invitations.memberId,
      })
      .from(invitations)
      .where(eq(invitations.id, invitationId))
      .limit(1);

    if (!invitation || invitation.status !== "pending") {
      return null;
    }

    // Look up the authenticated user's phone number
    const [user] = await this.db
      .select({ phoneNumber: users.phoneNumber })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.phoneNumber !== invitation.inviteePhone) {
      return null;
    }

    await this.db.transaction(async (tx) => {
      // Resolve placeholder: prefer invitation.memberId, fallback to phone match
      let placeholderId: string | null = invitation.memberId ?? null;
      if (!placeholderId) {
        const [placeholder] = await tx
          .select({ id: members.id })
          .from(members)
          .where(
            and(
              eq(members.tripId, invitation.tripId),
              eq(members.phoneNumber, invitation.inviteePhone),
              isNull(members.userId),
            ),
          )
          .limit(1);
        placeholderId = placeholder?.id ?? null;
      } else {
        const [ph] = await tx
          .select({ id: members.id, userId: members.userId })
          .from(members)
          .where(eq(members.id, placeholderId))
          .limit(1);
        if (!ph || ph.userId !== null) placeholderId = null;
      }

      if (placeholderId) {
        const [existing] = await tx
          .select({ id: members.id })
          .from(members)
          .where(and(eq(members.tripId, invitation.tripId), eq(members.userId, userId)))
          .limit(1);
        if (existing && existing.id !== placeholderId) {
          await tx.update(memberTravel).set({ memberId: existing.id }).where(eq(memberTravel.memberId, placeholderId));
          await tx.update(payments).set({ memberId: existing.id }).where(eq(payments.memberId, placeholderId));
          await tx.update(paymentParticipants).set({ memberId: existing.id }).where(eq(paymentParticipants.memberId, placeholderId));
          await tx.delete(members).where(eq(members.id, placeholderId));
        } else if (!existing) {
          await tx.update(members).set({ userId, updatedAt: new Date() }).where(eq(members.id, placeholderId));
        }
      } else {
        const existing = await tx
          .select({ id: members.id })
          .from(members)
          .where(
            and(
              eq(members.tripId, invitation.tripId),
              eq(members.userId, userId),
            ),
          )
          .limit(1);

        if (existing.length === 0) {
          await tx.insert(members).values({
            tripId: invitation.tripId,
            userId,
            status: "no_response",
            isOrganizer: false,
          });
        }
      }

      await tx
        .update(invitations)
        .set({
          status: "accepted",
          respondedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(invitations.id, invitationId));
    });

    return { tripId: invitation.tripId };
  }

  // === Placeholder member methods ===

  async createPlaceholder(
    userId: string,
    tripId: string,
    data: { name: string; phoneNumber?: string },
  ): Promise<MemberWithProfile> {
    const isOrg = await this.permissionsService.isOrganizer(userId, tripId);
    if (!isOrg) {
      const tripExists = await this.db.select({ id: trips.id }).from(trips).where(eq(trips.id, tripId)).limit(1);
      if (tripExists.length === 0) throw new TripNotFoundError();
      throw new PermissionDeniedError("Permission denied: only organizers can add placeholders");
    }

    const countResult = await this.db.select({ value: count() }).from(members).where(eq(members.tripId, tripId));
    if (countResult[0]!.value >= 25) {
      throw new MemberLimitExceededError("Member limit exceeded: trip already has 25 members");
    }

    const [inserted] = await this.db
      .insert(members)
      .values({
        tripId,
        userId: null,
        displayName: data.name,
        phoneNumber: data.phoneNumber ?? null,
        status: "no_response",
        isOrganizer: false,
      })
      .returning();
    if (!inserted) throw new Error("Failed to create placeholder");

    return {
      id: inserted.id,
      userId: null,
      displayName: inserted.displayName ?? "Unknown",
      profilePhotoUrl: null,
      handles: null,
      ...(inserted.phoneNumber ? { phoneNumber: inserted.phoneNumber } : {}),
      isPlaceholder: true,
      status: inserted.status,
      isOrganizer: inserted.isOrganizer,
      createdAt: inserted.createdAt.toISOString(),
    };
  }

  async updatePlaceholder(
    userId: string,
    memberId: string,
    data: { name?: string; phoneNumber?: string | null },
  ): Promise<MemberWithProfile> {
    const [member] = await this.db.select({ id: members.id, tripId: members.tripId, userId: members.userId }).from(members).where(eq(members.id, memberId)).limit(1);
    if (!member) throw new MemberNotFoundError();
    if (member.userId !== null) throw new MemberNotFoundError();
    const isOrg = await this.permissionsService.isOrganizer(userId, member.tripId);
    if (!isOrg) throw new PermissionDeniedError("Permission denied: only organizers can update placeholders");

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) updateData.displayName = data.name;
    if (data.phoneNumber !== undefined) updateData.phoneNumber = data.phoneNumber;

    const [updated] = await this.db.update(members).set(updateData).where(eq(members.id, memberId)).returning();
    if (!updated) throw new MemberNotFoundError();
    return {
      id: updated.id,
      userId: null,
      displayName: updated.displayName ?? "Unknown",
      profilePhotoUrl: null,
      handles: null,
      ...(updated.phoneNumber ? { phoneNumber: updated.phoneNumber } : {}),
      isPlaceholder: true,
      status: updated.status,
      isOrganizer: updated.isOrganizer,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async deletePlaceholder(userId: string, memberId: string): Promise<void> {
    const [member] = await this.db.select({ id: members.id, tripId: members.tripId, userId: members.userId, isOrganizer: members.isOrganizer }).from(members).where(eq(members.id, memberId)).limit(1);
    if (!member) throw new MemberNotFoundError();
    if (member.userId !== null) throw new MemberNotFoundError();
    const isOrg = await this.permissionsService.isOrganizer(userId, member.tripId);
    if (!isOrg) throw new PermissionDeniedError("Permission denied: only organizers can delete placeholders");

    if (member.isOrganizer) {
      const [organizerCount] = await this.db.select({ value: count() }).from(members).where(and(eq(members.tripId, member.tripId), eq(members.isOrganizer, true)));
      if (organizerCount!.value <= 1) throw new LastOrganizerError();
    }

    // Hard delete cascades payments/participants/travel/invitations
    await this.db.delete(members).where(eq(members.id, memberId));
  }

  async invitePlaceholder(userId: string, memberId: string): Promise<DBInvitation> {
    const [member] = await this.db.select({ id: members.id, tripId: members.tripId, phoneNumber: members.phoneNumber, userId: members.userId }).from(members).where(eq(members.id, memberId)).limit(1);
    if (!member || member.userId !== null) throw new MemberNotFoundError();
    if (!member.phoneNumber) throw new InvitationNotFoundError();
    const isOrg = await this.permissionsService.isOrganizer(userId, member.tripId);
    if (!isOrg) throw new PermissionDeniedError("Permission denied: only organizers can invite placeholders");

    // Check existing pending invitation for this placeholder
    const [existing] = await this.db.select({ id: invitations.id }).from(invitations).where(eq(invitations.memberId, memberId)).limit(1);
    if (existing) throw new MemberLimitExceededError("Placeholder already has a pending invitation");

    const [invitation] = await this.db.insert(invitations).values({
      tripId: member.tripId,
      inviterId: userId,
      inviteePhone: member.phoneNumber,
      memberId: member.id,
      status: "pending",
    }).returning();
    if (!invitation) throw new Error("Failed to create invitation");

    // Fetch inviter/trip for SMS
    const [inviterRow] = await this.db.select({ displayName: users.displayName }).from(users).where(eq(users.id, userId)).limit(1);
    const [tripRow] = await this.db.select({ name: trips.name }).from(trips).where(eq(trips.id, member.tripId)).limit(1);
    const safeName = (inviterRow?.displayName ?? "Someone").slice(0, 20);
    const safeTrip = (tripRow?.name ?? "a trip").slice(0, 30);
    const message = `${safeName} invited you to "${safeTrip}" on Journiful!\n${this.frontendUrl}/invite?id=${invitation.id}`;

    if (this.boss) {
      await this.boss.insert(QUEUE.INVITATION_SEND, [{ data: { phoneNumber: member.phoneNumber, message } as InvitationSendPayload }]);
    } else {
      await this.smsService.sendMessage(member.phoneNumber, message, "invite");
    }

    return invitation;
  }

  async linkPlaceholder(
    userId: string,
    memberId: string,
    targetUserId: string,
  ): Promise<MemberWithProfile> {
    const [member] = await this.db.select({ id: members.id, tripId: members.tripId, userId: members.userId }).from(members).where(eq(members.id, memberId)).limit(1);
    if (!member || member.userId !== null) throw new MemberNotFoundError();
    const isOrg = await this.permissionsService.isOrganizer(userId, member.tripId);
    if (!isOrg) throw new PermissionDeniedError("Permission denied: only organizers can link placeholders");

    // Verify target is mutual
    const mutualCheck = await this.db.execute<{ user_id: string }>(sql`
      SELECT m2.user_id
      FROM members m1
      JOIN members m2 ON m1.trip_id = m2.trip_id AND m1.user_id != m2.user_id
      WHERE m1.user_id = ${userId}
        AND m2.user_id = ${targetUserId}
      GROUP BY m2.user_id
    `);
    if (mutualCheck.rows.length === 0) throw new NotAMutualError(`User ${targetUserId} is not a mutual and cannot be linked directly`);

    const [existing] = await this.db.select({ id: members.id }).from(members).where(and(eq(members.tripId, member.tripId), eq(members.userId, targetUserId))).limit(1);

    if (existing) {
      // Merge placeholder into existing member
      await this.db.transaction(async (tx) => {
        await tx.update(memberTravel).set({ memberId: existing.id }).where(eq(memberTravel.memberId, memberId));
        await tx.update(payments).set({ memberId: existing.id }).where(eq(payments.memberId, memberId));
        await tx.update(paymentParticipants).set({ memberId: existing.id }).where(eq(paymentParticipants.memberId, memberId));
        await tx.delete(members).where(eq(members.id, memberId));
      });
      // Return existing member profile
      const [row] = await this.db.select({ id: members.id, userId: members.userId, memberDisplayName: members.displayName, userDisplayName: users.displayName, profilePhotoUrl: users.profilePhotoUrl, handles: users.handles, status: members.status, isOrganizer: members.isOrganizer, createdAt: members.createdAt }).from(members).leftJoin(users, eq(members.userId, users.id)).where(eq(members.id, existing.id)).limit(1);
      if (!row) throw new MemberNotFoundError();
      return {
        id: row.id,
        userId: row.userId,
        displayName: row.userDisplayName ?? row.memberDisplayName ?? "Unknown",
        profilePhotoUrl: row.profilePhotoUrl ?? null,
        handles: row.handles ?? null,
        isPlaceholder: row.userId === null,
        status: row.status,
        isOrganizer: row.isOrganizer,
        createdAt: row.createdAt.toISOString(),
      };
    } else {
      // Direct link: set userId on placeholder
      const [updated] = await this.db.update(members).set({ userId: targetUserId, updatedAt: new Date() }).where(eq(members.id, memberId)).returning();
      if (!updated) throw new MemberNotFoundError();
      const [user] = await this.db.select({ displayName: users.displayName, profilePhotoUrl: users.profilePhotoUrl, handles: users.handles }).from(users).where(eq(users.id, targetUserId)).limit(1);
      return {
        id: updated.id,
        userId: targetUserId,
        displayName: user?.displayName ?? updated.displayName ?? "Unknown",
        profilePhotoUrl: user?.profilePhotoUrl ?? null,
        handles: user?.handles ?? null,
        isPlaceholder: false,
        status: updated.status,
        isOrganizer: updated.isOrganizer,
        createdAt: updated.createdAt.toISOString(),
      };
    }
  }

  async attachPlaceholder(
    userId: string,
    memberId: string,
    data: { phoneNumber?: string; targetUserId?: string },
  ): Promise<MemberWithProfile> {
    const [member] = await this.db.select({ id: members.id, tripId: members.tripId, userId: members.userId }).from(members).where(eq(members.id, memberId)).limit(1);
    if (!member || member.userId !== null) throw new MemberNotFoundError();
    const isOrg = await this.permissionsService.isOrganizer(userId, member.tripId);
    if (!isOrg) throw new PermissionDeniedError("Permission denied: only organizers can attach placeholders");

    // Exclusive: exactly one of phoneNumber / targetUserId
    const hasPhone = !!data.phoneNumber;
    const hasTarget = !!data.targetUserId;
    if (hasPhone === hasTarget) throw new PhoneTakenError("Provide exactly one of phoneNumber or targetUserId");

    if (hasTarget) {
      // Reuse link logic (requires mutual)
      return this.linkPlaceholder(userId, memberId, data.targetUserId!);
    }

    // Phone path — relaxed: no mutual check, any registered user linkable
    const phone = data.phoneNumber!;
    // Try to find user by phone
    const [foundUser] = await this.db.select({ id: users.id }).from(users).where(eq(users.phoneNumber, phone)).limit(1);

    if (foundUser) {
      // Instant convert: if existing member in trip, merge; else claim
      const [existing] = await this.db.select({ id: members.id }).from(members).where(and(eq(members.tripId, member.tripId), eq(members.userId, foundUser.id))).limit(1);
      if (existing) {
        await this.db.transaction(async (tx) => {
          await tx.update(memberTravel).set({ memberId: existing.id }).where(eq(memberTravel.memberId, memberId));
          await tx.update(payments).set({ memberId: existing.id }).where(eq(payments.memberId, memberId));
          await tx.update(paymentParticipants).set({ memberId: existing.id }).where(eq(paymentParticipants.memberId, memberId));
          await tx.delete(members).where(eq(members.id, memberId));
        });
        const [row] = await this.db.select({ id: members.id, userId: members.userId, memberDisplayName: members.displayName, userDisplayName: users.displayName, profilePhotoUrl: users.profilePhotoUrl, handles: users.handles, status: members.status, isOrganizer: members.isOrganizer, createdAt: members.createdAt }).from(members).leftJoin(users, eq(members.userId, users.id)).where(eq(members.id, existing.id)).limit(1);
        if (!row) throw new MemberNotFoundError();
        return {
          id: row.id,
          userId: row.userId,
          displayName: row.userDisplayName ?? row.memberDisplayName ?? "Unknown",
          profilePhotoUrl: row.profilePhotoUrl ?? null,
          handles: row.handles ?? null,
          isPlaceholder: row.userId === null,
          status: row.status,
          isOrganizer: row.isOrganizer,
          createdAt: row.createdAt.toISOString(),
        };
      } else {
        // Direct claim
        try {
          const [updated] = await this.db.update(members).set({ userId: foundUser.id, phoneNumber: phone, updatedAt: new Date() }).where(eq(members.id, memberId)).returning();
          if (!updated) throw new MemberNotFoundError();
          const [user] = await this.db.select({ displayName: users.displayName, profilePhotoUrl: users.profilePhotoUrl, handles: users.handles }).from(users).where(eq(users.id, foundUser.id)).limit(1);
          return {
            id: updated.id,
            userId: foundUser.id,
            displayName: user?.displayName ?? updated.displayName ?? "Unknown",
            profilePhotoUrl: user?.profilePhotoUrl ?? null,
            handles: user?.handles ?? null,
            isPlaceholder: false,
            status: updated.status,
            isOrganizer: updated.isOrganizer,
            createdAt: updated.createdAt.toISOString(),
          };
        } catch (err: unknown) {
          const code = (err as { code?: string })?.code;
          // Unique violation on members_trip_phone_unique or members_trip_user_unique
          if (code === "23505") throw new PhoneTakenError("Phone number already in use in this trip");
          throw err;
        }
      }
    } else {
      // Unknown phone — stage phoneNumber without converting
      try {
        const [updated] = await this.db.update(members).set({ phoneNumber: phone, updatedAt: new Date() }).where(eq(members.id, memberId)).returning();
        if (!updated) throw new MemberNotFoundError();
        return {
          id: updated.id,
          userId: null,
          displayName: updated.displayName ?? "Unknown",
          profilePhotoUrl: null,
          handles: null,
          ...(updated.phoneNumber ? { phoneNumber: updated.phoneNumber } : {}),
          isPlaceholder: true,
          status: updated.status,
          isOrganizer: updated.isOrganizer,
          createdAt: updated.createdAt.toISOString(),
        };
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === "23505") throw new PhoneTakenError("Phone number already in use in this trip");
        throw err;
      }
    }
  }
}
