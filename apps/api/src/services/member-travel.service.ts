import {
  memberTravel,
  members,
  users,
  trips,
  type MemberTravel,
} from "@/db/schema/index.js";
import {
  eq,
  ne,
  and,
  isNull,
  getTableColumns,
  sql,
  desc,
} from "drizzle-orm";
import type {
  CreateMemberTravelInput,
  UpdateMemberTravelInput,
} from "@journiful/shared/schemas";
import {
  rankTravelLocations,
  MY_TRAVEL_LOCATIONS_LIMIT,
} from "@journiful/shared/utils";
import type { AppDatabase } from "@/types/index.js";
import type { IPermissionsService } from "./permissions.service.js";
import {
  MemberTravelNotFoundError,
  MemberTravelConflictError,
  MemberNotFoundError,
  PermissionDeniedError,
  TripNotFoundError,
} from "../errors.js";

/**
 * How many rows the locations read walks before ranking them.
 *
 * Not the answer's cap: `MY_TRAVEL_LOCATIONS_LIMIT` counts *locations*,
 * and a row whose ends are both blank contributes none, so the walk needs
 * slack over the cap — five times it. That keeps the answer identical for
 * every caller who filed a where on each row (the difference needs eighty
 * of the newest hundred rows to be blank-ended), and this list enriches a
 * field that already works without it, where a shorter list is a narrower
 * list rather than a wrong one.
 */
const LOCATION_SOURCE_ROWS = MY_TRAVEL_LOCATIONS_LIMIT * 5;

/** Postgres' class for a unique-constraint violation. */
const UNIQUE_VIOLATION = "23505";

/** The partial unique index that holds one live row per pair. */
const PAIR_LIVE_INDEX = "member_travel_pair_live_unique";

/**
 * A field of the Postgres error behind `error`, if there is one.
 *
 * `pg` puts `code` and `constraint` on the driver error; Drizzle wraps
 * that error in its own, so the fields can sit on the error itself or on
 * its `cause`. guest-member.service.ts unwraps the same two places for
 * the same reason.
 */
function pgErrorField(error: unknown, field: "code" | "constraint") {
  if (error === null || typeof error !== "object") return undefined;
  const own = (error as Record<string, unknown>)[field];
  if (own !== undefined) return own;
  const cause = (error as { cause?: unknown }).cause;
  if (cause === null || typeof cause !== "object") return undefined;
  return (cause as Record<string, unknown>)[field];
}

/**
 * Did this error come from the pair index refusing a write?
 *
 * A 23505 whose constraint name is present has to name this index. When
 * the name is absent — a driver that does not report it — a 23505 on this
 * table can only be this index anyway: the table's other unique key is
 * `id`, a random UUID, and a collision there is not a thing that happens.
 */
function isPairLiveConflict(error: unknown): boolean {
  if (pgErrorField(error, "code") !== UNIQUE_VIOLATION) return false;
  const constraint = pgErrorField(error, "constraint");
  return constraint === undefined || constraint === PAIR_LIVE_INDEX;
}

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

    // One live row per member and direction: this is the row the pair's
    // next write edits in place, so that a save edits what is filed
    // rather than adding a second row beside it — two live rows is what
    // draws a member twice on the board. The race this read cannot close
    // on its own (two POSTs on a free pair both missing it) is settled by
    // the partial unique index on the insert below.
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
    //
    // The mode is the one exception, and the exception is load-bearing.
    // `values` is not only the insert's: the pair-update branch below
    // `.set()`s the same object over the live row, so an unconditional
    // entry — `transportMode: rest.transportMode ?? "flight"` — would
    // answer a mode-less POST by resetting a filed rental back to a
    // flight. Joined only when the body carried one, the insert takes the
    // column's own default and the pair update leaves the row's mode
    // alone, which is what a caller that said nothing about the mode
    // meant either way.
    const values = {
      departureTime: rest.departureTime ? new Date(rest.departureTime) : null,
      departureLocation: rest.departureLocation || null,
      arrivalTime: rest.arrivalTime ? new Date(rest.arrivalTime) : null,
      arrivalLocation: rest.arrivalLocation || null,
      flightNumber: rest.flightNumber || null,
      details: rest.details || null,
      ...(rest.transportMode !== undefined
        ? { transportMode: rest.transportMode }
        : null),
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

    // No per-member row count here: the pair rule is the ceiling now — one
    // live row per member and direction, held by
    // `member_travel_pair_live_unique` — so there are no rows past the two
    // (arrival, departure) for a count to bound.

    // Create the member travel.
    //
    // This is the one write that can still race the lookup above: two
    // POSTs on a free pair both miss it and both try to insert. A
    // `SELECT ... FOR UPDATE` is not the guard here — it locks rows that
    // exist, and the row this call would need to lock is the one it is
    // about to create, so there is nothing to lock. The partial unique
    // index is the guard: the loser's INSERT is refused by the database
    // (23505 on `member_travel_pair_live_unique`), which is exactly the
    // signal that the pair was taken between the lookup and the write.
    // Catch it, take the same update-in-place path against whatever row
    // the winner left behind, and answer as if it had been found there:
    // the pair holds one live row and this call is the one that did not
    // insert it.
    let travel: MemberTravel | undefined;
    try {
      [travel] = await this.db
        .insert(memberTravel)
        .values({
          tripId,
          memberId: resolvedMemberId,
          travelType,
          ...values,
        })
        .returning();
    } catch (error) {
      if (!isPairLiveConflict(error)) throw error;

      // The winner's row is committed (an INSERT only reports the
      // conflict once the row it collided with is), so this statement
      // sees it. `deletedAt IS NULL` keeps the write on the live row: if
      // the winner has already soft-deleted it, there is no live pair
      // left to fold into and the original error is the honest answer.
      const [raced] = await this.db
        .update(memberTravel)
        .set({ ...values, updatedAt: new Date() })
        .where(
          and(
            eq(memberTravel.tripId, tripId),
            eq(memberTravel.memberId, resolvedMemberId),
            eq(memberTravel.travelType, travelType),
            isNull(memberTravel.deletedAt),
          ),
        )
        .returning();

      if (!raced) throw error;

      return { memberTravel: raced, created: false };
    }

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
      // The order is what makes the bound a *cut* rather than an arbitrary
      // sample: `LIMIT` without it would drop whichever rows the planner
      // happened to reach. For that it has to be a *total* order, so it
      // walks the same three keys the migration's reconciliation does —
      // `updated_at`, then `created_at`, then `id` — because a tie at the
      // hundredth row is otherwise a row that is inside the cut on one run
      // and outside it on the next. `rankTravelLocations` re-sorts (and
      // owns the rule), so the SQL order exists for this bound alone.
      .orderBy(
        desc(memberTravel.updatedAt),
        desc(memberTravel.createdAt),
        desc(memberTravel.id),
      )
      .limit(LOCATION_SOURCE_ROWS);

    return rankTravelLocations(rows, MY_TRAVEL_LOCATIONS_LIMIT);
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

    // `travelType` is create-only — `updateMemberTravelSchema` omits it and
    // the route's body validation strips it before this runs, so a typed
    // caller cannot carry one. Delete it anyway: the pair is the row's
    // identity, and a PUT that flipped the direction would leave the new
    // direction's pair free for the *next* write while the old row still
    // claims the old one, which is the second-live-row state the index
    // exists to prevent. Deleting the key here keeps the guard true even
    // for a caller that never went through the schema.
    delete updateData.travelType;

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

    // The pair must not already hold a *different* live row. What actually
    // enforces one live row per pair is the partial unique index
    // (`member_travel_pair_live_unique`): the create path leans on it to
    // settle its insert race, and the restore below is no exception — its
    // own UPDATE re-enters the index, which is why the 23505 it can raise
    // is mapped to the same conflict. This check exists to answer 409 with
    // a message rather than let that constraint error out raw.
    //
    // The row being restored is excluded from the check (`ne`): it is the
    // row this call is about, so matching it would make restoring an
    // already-live row — the idempotent no-op this endpoint has always
    // been — answer 409 instead. A row that was deleted and then replaced
    // has a live twin under a *different* id, and that one still conflicts.
    const [twin] = await this.db
      .select({ id: memberTravel.id })
      .from(memberTravel)
      .where(
        and(
          eq(memberTravel.tripId, travel.tripId),
          eq(memberTravel.memberId, travel.memberId),
          eq(memberTravel.travelType, travel.travelType),
          ne(memberTravel.id, memberTravelId),
          isNull(memberTravel.deletedAt),
        ),
      )
      .limit(1);

    if (twin) {
      throw new MemberTravelConflictError();
    }

    // No cap check here either: the pair rule is the ceiling (see
    // createMemberTravel), so a restore adds no row beyond the two a member
    // can hold for the trip.

    // Restore member travel.
    //
    // A create can commit between the twin check above and this statement,
    // and then this UPDATE is the loser: the index refuses to make a
    // second live row on the pair (23505). That is the same conflict the
    // check reports, so it answers the same way instead of surfacing as a
    // 500.
    let result: MemberTravel[];
    try {
      result = await this.db
        .update(memberTravel)
        .set({
          deletedAt: null,
          deletedBy: null,
          updatedAt: new Date(),
        })
        .where(eq(memberTravel.id, memberTravelId))
        .returning();
    } catch (error) {
      if (isPairLiveConflict(error)) {
        throw new MemberTravelConflictError();
      }
      throw error;
    }

    if (!result[0]) {
      throw new MemberTravelNotFoundError();
    }

    return result[0];
  }
}
