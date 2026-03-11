import {
  memberTravel,
  members,
  users,
  trips,
  type MemberTravel,
} from "@/db/schema/index.js";
import { eq, and, isNull, getTableColumns, count } from "drizzle-orm";
import type {
  CreateMemberTravelInput,
  UpdateMemberTravelInput,
} from "@tripful/shared/schemas";
import type { AppDatabase } from "@/types/index.js";
import type { IPermissionsService } from "./permissions.service.js";
import {
  MemberTravelNotFoundError,
  MemberTravelLimitExceededError,
  MemberNotFoundError,
  PermissionDeniedError,
  TripNotFoundError,
  TripLockedError,
} from "../errors.js";

/**
 * Member Travel Service Interface
 * Defines the contract for member travel management operations
 */
export interface IMemberTravelService {
  /**
   * Creates a new member travel record for a trip
   * @param userId - The ID of the user creating the member travel
   * @param tripId - The ID of the trip
   * @param data - The member travel creation data
   * @returns Promise that resolves to the created member travel
   * @throws TripNotFoundError if trip not found or user not a member
   * @throws PermissionDeniedError if user lacks permission
   */
  createMemberTravel(
    userId: string,
    tripId: string,
    data: CreateMemberTravelInput,
  ): Promise<MemberTravel>;

  /**
   * Gets a member travel record by ID
   * @param memberTravelId - The UUID of the member travel to retrieve
   * @returns Promise that resolves to the member travel, or null if not found or soft-deleted
   */
  getMemberTravel(memberTravelId: string): Promise<MemberTravel | null>;

  /**
   * Gets all member travel records for a trip
   * @param tripId - The UUID of the trip
   * @param includeDeleted - Whether to include soft-deleted records (default: false)
   * @returns Promise that resolves to array of member travel records
   */
  getMemberTravelByTrip(
    tripId: string,
    includeDeleted?: boolean,
  ): Promise<MemberTravel[]>;

  /**
   * Updates a member travel record
   * @param userId - The ID of the user updating the member travel
   * @param memberTravelId - The UUID of the member travel to update
   * @param data - The member travel update data
   * @returns Promise that resolves to the updated member travel
   * @throws MemberTravelNotFoundError if member travel not found
   * @throws PermissionDeniedError if user lacks permission
   */
  updateMemberTravel(
    userId: string,
    memberTravelId: string,
    data: UpdateMemberTravelInput,
  ): Promise<MemberTravel>;

  /**
   * Deletes a member travel record (soft delete)
   * @param userId - The ID of the user deleting the member travel
   * @param memberTravelId - The UUID of the member travel to delete
   * @returns Promise that resolves when the member travel is deleted
   * @throws MemberTravelNotFoundError if member travel not found
   * @throws PermissionDeniedError if user lacks permission
   */
  deleteMemberTravel(userId: string, memberTravelId: string): Promise<void>;

  /**
   * Restores a soft-deleted member travel record
   * @param userId - The ID of the user restoring the member travel
   * @param memberTravelId - The UUID of the member travel to restore
   * @returns Promise that resolves to the restored member travel
   * @throws MemberTravelNotFoundError if member travel not found
   * @throws PermissionDeniedError if user lacks permission (organizer only)
   */
  restoreMemberTravel(
    userId: string,
    memberTravelId: string,
  ): Promise<MemberTravel>;
}

/**
 * Member Travel Service Implementation
 * Handles member travel creation, management, and soft delete operations
 * Member travel is linked to a specific member (not directly to userId)
 */
export class MemberTravelService implements IMemberTravelService {
  constructor(
    private db: AppDatabase,
    private permissionsService: IPermissionsService,
  ) {}

  /**
   * Creates a new member travel record for a trip
   * Resolves the memberId from userId and tripId before creating
   * @param userId - The ID of the user creating the member travel
   * @param tripId - The ID of the trip
   * @param data - The member travel creation data
   * @returns The created member travel
   * @throws TripNotFoundError if trip not found or user not a member
   * @throws PermissionDeniedError if user lacks permission
   */
  async createMemberTravel(
    userId: string,
    tripId: string,
    data: CreateMemberTravelInput,
  ): Promise<MemberTravel> {
    // Check if trip is locked (past end date)
    const isLocked = await this.permissionsService.isTripLocked(tripId);
    if (isLocked) throw new TripLockedError();

    // Check if user can add member travel to this trip (any member can)
    const canAdd = await this.permissionsService.canAddMemberTravel(
      userId,
      tripId,
    );
    if (!canAdd) {
      // Check if trip exists for better error message - select only id column
      const tripExists = await this.db
        .select({ id: trips.id })
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);

      if (tripExists.length === 0) {
        throw new TripNotFoundError();
      }

      throw new PermissionDeniedError(
        "Permission denied: only members can add member travel",
      );
    }

    // Resolve memberId: either from delegation (data.memberId) or from authenticated user
    let resolvedMemberId: string;

    if (data.memberId) {
      // Delegation: organizer creating travel for another member
      const isOrganizer = await this.permissionsService.isOrganizer(
        userId,
        tripId,
      );
      if (!isOrganizer) {
        throw new PermissionDeniedError(
          "Permission denied: only organizers can add travel for other members",
        );
      }

      // Verify target member belongs to this trip
      const [targetMember] = await this.db
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.id, data.memberId), eq(members.tripId, tripId)))
        .limit(1);

      if (!targetMember) {
        throw new MemberNotFoundError();
      }

      resolvedMemberId = data.memberId;
    } else {
      // Self: existing logic to resolve memberId from userId
      const [member] = await this.db
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.tripId, tripId), eq(members.userId, userId)))
        .limit(1);

      if (!member) {
        throw new TripNotFoundError();
      }

      resolvedMemberId = member.id;
    }

    // Check member travel count limit
    const [travelCount] = await this.db
      .select({ value: count() })
      .from(memberTravel)
      .where(
        and(
          eq(memberTravel.memberId, resolvedMemberId),
          isNull(memberTravel.deletedAt),
        ),
      );
    if ((travelCount?.value ?? 0) >= 20) {
      throw new MemberTravelLimitExceededError(
        "Maximum 20 travel entries per member reached.",
      );
    }

    // Destructure to exclude memberId from data before insert
    const { memberId: _memberId, ...insertData } = data;

    // Create the member travel
    const [travel] = await this.db
      .insert(memberTravel)
      .values({
        tripId,
        memberId: resolvedMemberId,
        travelType: insertData.travelType,
        time: new Date(insertData.time),
        location: insertData.location || null,
        details: insertData.details || null,
      })
      .returning();

    if (!travel) {
      throw new Error("Failed to create member travel");
    }

    return travel;
  }

  /**
   * Gets a member travel record by ID
   * Returns null if member travel is soft-deleted
   * @param memberTravelId - The UUID of the member travel to retrieve
   * @returns The member travel, or null if not found or soft-deleted
   */
  async getMemberTravel(memberTravelId: string): Promise<MemberTravel | null> {
    const result = await this.db
      .select(getTableColumns(memberTravel))
      .from(memberTravel)
      .where(
        and(
          eq(memberTravel.id, memberTravelId),
          isNull(memberTravel.deletedAt),
        ),
      )
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Gets all member travel records for a trip
   * Excludes soft-deleted records by default
   * @param tripId - The UUID of the trip
   * @param includeDeleted - Whether to include soft-deleted records (default: false)
   * @returns Array of member travel records
   */
  async getMemberTravelByTrip(
    tripId: string,
    includeDeleted = false,
  ): Promise<(MemberTravel & { memberName: string; userId: string })[]> {
    const conditions = [eq(memberTravel.tripId, tripId)];

    if (!includeDeleted) {
      conditions.push(isNull(memberTravel.deletedAt));
    }

    return this.db
      .select({
        ...getTableColumns(memberTravel),
        memberName: users.displayName,
        userId: members.userId,
      })
      .from(memberTravel)
      .innerJoin(members, eq(memberTravel.memberId, members.id))
      .innerJoin(users, eq(members.userId, users.id))
      .where(and(...conditions));
  }

  /**
   * Updates a member travel record
   * User can update if they own the record or are an organizer
   * @param userId - The ID of the user updating the member travel
   * @param memberTravelId - The UUID of the member travel to update
   * @param data - The member travel update data
   * @returns The updated member travel
   * @throws MemberTravelNotFoundError if member travel not found
   * @throws PermissionDeniedError if user lacks permission
   */
  async updateMemberTravel(
    userId: string,
    memberTravelId: string,
    data: UpdateMemberTravelInput,
  ): Promise<MemberTravel> {
    // Load member travel to get tripId and memberId for lock check and permission check
    const [travelRecord] = await this.db
      .select({
        id: memberTravel.id,
        tripId: memberTravel.tripId,
        memberId: memberTravel.memberId,
      })
      .from(memberTravel)
      .where(
        and(
          eq(memberTravel.id, memberTravelId),
          isNull(memberTravel.deletedAt),
        ),
      )
      .limit(1);

    if (!travelRecord) {
      throw new MemberTravelNotFoundError();
    }

    // Check if trip is locked and permissions in parallel
    const [isLocked, canEdit] = await Promise.all([
      this.permissionsService.isTripLocked(travelRecord.tripId),
      this.permissionsService.canEditMemberTravelWithData(userId, {
        tripId: travelRecord.tripId,
        memberId: travelRecord.memberId,
      }),
    ]);
    if (isLocked) throw new TripLockedError();
    if (!canEdit) {
      throw new PermissionDeniedError(
        "Permission denied: only the owner or trip organizers can edit member travel",
      );
    }

    // Build update data (Record<string, unknown> needed due to exactOptionalPropertyTypes)
    const updateData: Record<string, unknown> = {
      ...data,
      updatedAt: new Date(),
    };

    // Convert time string to Date object if provided
    if (data.time) {
      updateData.time = new Date(data.time);
    }

    // Perform update
    const result = await this.db
      .update(memberTravel)
      .set(updateData)
      .where(eq(memberTravel.id, memberTravelId))
      .returning();

    const updatedTravel = result[0];
    if (!updatedTravel) {
      throw new MemberTravelNotFoundError();
    }

    return updatedTravel;
  }

  /**
   * Deletes a member travel record (soft delete - sets deletedAt and deletedBy)
   * User can delete if they own the record or are an organizer
   * @param userId - The ID of the user deleting the member travel
   * @param memberTravelId - The UUID of the member travel to delete
   * @returns Promise that resolves when the member travel is deleted
   * @throws MemberTravelNotFoundError if member travel not found
   * @throws PermissionDeniedError if user lacks permission
   */
  async deleteMemberTravel(
    userId: string,
    memberTravelId: string,
  ): Promise<void> {
    // Load member travel to get tripId and memberId for lock check and permission check
    const [travelRecord] = await this.db
      .select({
        id: memberTravel.id,
        tripId: memberTravel.tripId,
        memberId: memberTravel.memberId,
      })
      .from(memberTravel)
      .where(
        and(
          eq(memberTravel.id, memberTravelId),
          isNull(memberTravel.deletedAt),
        ),
      )
      .limit(1);

    if (!travelRecord) {
      throw new MemberTravelNotFoundError();
    }

    // Check if trip is locked and permissions in parallel
    const [isLocked, canDelete] = await Promise.all([
      this.permissionsService.isTripLocked(travelRecord.tripId),
      this.permissionsService.canDeleteMemberTravelWithData(userId, {
        tripId: travelRecord.tripId,
        memberId: travelRecord.memberId,
      }),
    ]);
    if (isLocked) throw new TripLockedError();
    if (!canDelete) {
      throw new PermissionDeniedError(
        "Permission denied: only the owner or trip organizers can delete member travel",
      );
    }

    // Perform soft delete
    const result = await this.db
      .update(memberTravel)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(memberTravel.id, memberTravelId))
      .returning();

    if (!result[0]) {
      throw new MemberTravelNotFoundError();
    }
  }

  /**
   * Restores a soft-deleted member travel record
   * Only organizers can restore member travel records
   * @param userId - The ID of the user restoring the member travel
   * @param memberTravelId - The UUID of the member travel to restore
   * @returns The restored member travel
   * @throws MemberTravelNotFoundError if member travel not found
   * @throws PermissionDeniedError if user lacks permission (organizer only)
   */
  async restoreMemberTravel(
    userId: string,
    memberTravelId: string,
  ): Promise<MemberTravel> {
    // Load member travel to get tripId
    const [travel] = await this.db
      .select({
        id: memberTravel.id,
        tripId: memberTravel.tripId,
        memberId: memberTravel.memberId,
      })
      .from(memberTravel)
      .where(eq(memberTravel.id, memberTravelId))
      .limit(1);

    if (!travel) {
      throw new MemberTravelNotFoundError();
    }

    // Check if user is organizer of the trip
    const isOrganizer = await this.permissionsService.isOrganizer(
      userId,
      travel.tripId,
    );
    if (!isOrganizer) {
      throw new PermissionDeniedError(
        "Permission denied: only organizers can restore member travel",
      );
    }

    // Check member travel count limit before restoring
    const [travelCount] = await this.db
      .select({ value: count() })
      .from(memberTravel)
      .where(
        and(
          eq(memberTravel.memberId, travel.memberId),
          isNull(memberTravel.deletedAt),
        ),
      );
    if ((travelCount?.value ?? 0) >= 20) {
      throw new MemberTravelLimitExceededError(
        "Maximum 20 travel entries per member reached.",
      );
    }

    // Restore member travel
    const result = await this.db
      .update(memberTravel)
      .set({
        deletedAt: null,
        deletedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(memberTravel.id, memberTravelId))
      .returning();

    if (!result[0]) {
      throw new MemberTravelNotFoundError();
    }

    return result[0];
  }
}
