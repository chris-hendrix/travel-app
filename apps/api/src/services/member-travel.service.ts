import {
  memberTravel,
  members,
  users,
  trips,
  type MemberTravel,
} from "@/db/schema/index.js";
import { eq, and, isNull, getTableColumns, count, sql, desc } from "drizzle-orm";
import type {
  CreateMemberTravelInput,
  UpdateMemberTravelInput,
} from "@journiful/shared/schemas";
import type { AppDatabase } from "@/types/index.js";
import type { IPermissionsService } from "./permissions.service.js";
import {
  MemberTravelNotFoundError,
  MemberTravelLimitExceededError,
  MemberTravelConflictError,
  MemberNotFoundError,
  PermissionDeniedError,
  TripNotFoundError,
} from "../errors.js";

/**
 * Member Travel Service Interface
 * Defines the contract for member travel management operations
 */
export interface IMemberTravelService {
  /**
   * Creates a new member travel record for a trip, or updates the one
   * already filed for the same member and direction
   * @param userId - The ID of the user creating the member travel
   * @param tripId - The ID of the trip
   * @param data - The member travel creation data
   * @returns Promise that resolves to the row and whether it was inserted
   * @throws TripNotFoundError if trip not found or user not a member
   * @throws PermissionDeniedError if user lacks permission
   */
  createMemberTravel(
    userId: string,
    tripId: string,
    data: CreateMemberTravelInput,
  ): Promise<CreateMemberTravelResult>;

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
   * Gets the travel locations the caller's own records already hold,
   * across trips.
   * @param userId - The ID of the signed-in user
   * @returns The caller's own distinct non-blank locations, most
   *   recently updated first, at most 20 — never another member's
   */
  getMyLocations(userId: string): Promise<string[]>;

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
 * What a create did. The pair of member and direction is the identity
 * the feature assumes, so a POST on a pair that already holds a live row
 * updates that row rather than putting a second one beside it — and the
 * caller needs to know which happened in order to answer 201 or 200.
 */
export interface CreateMemberTravelResult {
  memberTravel: MemberTravel;
  /** False when the pair already held a live row and it was updated. */
  created: boolean;
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
   * Creates a member travel record for a trip, or updates the live one
   * already filed for the same member and direction.
   *
   * Resolves the memberId from userId and tripId before writing.
   * @param userId - The ID of the user creating the member travel
   * @param tripId - The ID of the trip
   * @param data - The member travel creation data
   * @returns The row, and whether this call inserted it
   * @throws TripNotFoundError if trip not found or user not a member
   * @throws PermissionDeniedError if user lacks permission
   */
  async createMemberTravel(
    userId: string,
    tripId: string,
    data: CreateMemberTravelInput,
  ): Promise<CreateMemberTravelResult> {
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

    // One live row per member and direction. This lookup runs *before*
    // the cap on purpose: an update adds no row, so a cap on how many
    // rows a member holds does not apply to it. Running the cap first
    // would refuse an edit at the limit while the very pair being edited
    // is one of the rows the check is complaining about.
    const [existing] = await this.db
      .select({ id: memberTravel.id })
      .from(memberTravel)
      .where(
        and(
          eq(memberTravel.tripId, tripId),
          eq(memberTravel.memberId, resolvedMemberId),
          eq(memberTravel.travelType, data.travelType),
          isNull(memberTravel.deletedAt),
        ),
      )
      .limit(1);

    // Destructure to exclude memberId from data before writing
    const { memberId: _memberId, travelType, ...rest } = data;

    // The create body is a full statement of the leg, so an absent field
    // is a cleared one: the form sends what the member answered, and a
    // value it no longer carries is one they took back. On the update
    // branch an explicit null says the same thing.
    const values = {
      departureTime: rest.departureTime ? new Date(rest.departureTime) : null,
      departureLocation: rest.departureLocation || null,
      arrivalTime: rest.arrivalTime ? new Date(rest.arrivalTime) : null,
      arrivalLocation: rest.arrivalLocation || null,
      flightNumber: rest.flightNumber || null,
      details: rest.details || null,
    };

    // The pair is taken: update it in place, which is what keeps the
    // client's save from filing a second row and drawing the member
    // twice on the board.
    if (existing) {
      const [updated] = await this.db
        .update(memberTravel)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(memberTravel.id, existing.id))
        .returning();

      if (!updated) {
        throw new Error("Failed to update member travel");
      }

      return { memberTravel: updated, created: false };
    }

    // Check member travel count limit — inserts only.
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

    // Create the member travel
    const [travel] = await this.db
      .insert(memberTravel)
      .values({
        tripId,
        memberId: resolvedMemberId,
        travelType,
        ...values,
      })
      .returning();

    if (!travel) {
      throw new Error("Failed to create member travel");
    }

    return { memberTravel: travel, created: true };
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
  ): Promise<(MemberTravel & { memberName: string; userId: string | null })[]> {
    const conditions = [eq(memberTravel.tripId, tripId)];

    if (!includeDeleted) {
      conditions.push(isNull(memberTravel.deletedAt));
    }

    // leftJoin(users) + COALESCE with a 'Guest' fallback: guest travel
    // resolves the guest display name with a null userId instead of being
    // dropped (Task 5.1). The literal fallback keeps the sql<string> type
    // honest — COALESCE of two nullable columns alone could be NULL.
    return this.db
      .select({
        ...getTableColumns(memberTravel),
        memberName: sql<string>`COALESCE(${users.displayName}, ${members.guestDisplayName}, 'Guest')`,
        userId: members.userId,
      })
      .from(memberTravel)
      .innerJoin(members, eq(memberTravel.memberId, members.id))
      .leftJoin(users, eq(members.userId, users.id))
      .where(and(...conditions));
  }

  /**
   * The wheres the caller's own travel already holds, across trips.
   *
   * The `Where` field autocompletes from strings we already have (D6),
   * and a member's own past wheres are the most useful source there is:
   * the airport they flew into for the last trip is the one they are
   * flying into for this one. Strings only — no coordinates, no place
   * ids — which is why this read needs no attribution and no provider.
   *
   * Deduped case-insensitively ("BCN T2" and "bcn t2" are one airport),
   * ordered by the record's own `updated_at` descending, capped at 20.
   * Both ends of a leg count: a record holds the whole leg, and the
   * counterpart end is a real where even when it came from a lookup
   * rather than a field.
   *
   * Only the caller's rows: the join is on `members.user_id`, so a row
   * filed for another member never leaks into your suggestions.
   */
  async getMyLocations(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({
        travelType: memberTravel.travelType,
        arrivalLocation: memberTravel.arrivalLocation,
        departureLocation: memberTravel.departureLocation,
        updatedAt: memberTravel.updatedAt,
      })
      .from(memberTravel)
      .innerJoin(members, eq(memberTravel.memberId, members.id))
      .where(and(eq(members.userId, userId), isNull(memberTravel.deletedAt)))
      .orderBy(desc(memberTravel.updatedAt));

    const seen = new Set<string>();
    const locations: string[] = [];
    // Most recently updated first: the row order is the answer's order,
    // so the first spelling of a location is the one the member wrote
    // most recently, and it is the one that survives the dedupe.
    for (const row of rows) {
      // The record's own end leads its counterpart — the end the member
      // filed, before the one a lookup filled in silently.
      const ends =
        row.travelType === "arrival"
          ? [row.arrivalLocation, row.departureLocation]
          : [row.departureLocation, row.arrivalLocation];
      for (const end of ends) {
        const location = end?.trim();
        if (!location) continue;
        const key = location.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        locations.push(location);
        if (locations.length >= 20) return locations;
      }
    }
    return locations;
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

    const canEdit = await this.permissionsService.canEditMemberTravelWithData(userId, {
      tripId: travelRecord.tripId,
      memberId: travelRecord.memberId,
    });
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

    // Convert time strings to Date objects if provided
    if (data.arrivalTime) {
      updateData.arrivalTime = new Date(data.arrivalTime);
    }
    if (data.departureTime) {
      updateData.departureTime = new Date(data.departureTime);
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

    const canDelete = await this.permissionsService.canDeleteMemberTravelWithData(userId, {
      tripId: travelRecord.tripId,
      memberId: travelRecord.memberId,
    });
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
    // Load member travel to get tripId, memberId and direction
    const [travel] = await this.db
      .select({
        id: memberTravel.id,
        tripId: memberTravel.tripId,
        memberId: memberTravel.memberId,
        travelType: memberTravel.travelType,
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

    // The pair must not already hold a live row. A soft-deleted row can
    // sit beside a live one — the create path only looks for a live row,
    // so "delete, then file it again" inserts a new one and leaves this
    // one behind. Restoring it is the only other way a row becomes live,
    // and therefore the only other place the one-per-pair invariant
    // could break: two live rows would draw the member twice on the
    // board, which is the state this whole change exists to prevent.
    const [twin] = await this.db
      .select({ id: memberTravel.id })
      .from(memberTravel)
      .where(
        and(
          eq(memberTravel.tripId, travel.tripId),
          eq(memberTravel.memberId, travel.memberId),
          eq(memberTravel.travelType, travel.travelType),
          isNull(memberTravel.deletedAt),
        ),
      )
      .limit(1);

    if (twin) {
      throw new MemberTravelConflictError();
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
