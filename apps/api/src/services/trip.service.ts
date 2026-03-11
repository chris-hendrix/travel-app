import {
  trips,
  members,
  users,
  events,
  weatherCache,
  type Trip,
  type Member,
  type User,
} from "@/db/schema/index.js";
import {
  eq,
  inArray,
  and,
  asc,
  sql,
  count,
  isNull,
  getTableColumns,
  gt,
  isNotNull,
  or,
  min,
  max,
} from "drizzle-orm";
import type { CreateTripInput, UpdateTripInput } from "@tripful/shared/schemas";
import type { AppDatabase } from "@/types/index.js";
import type { IPermissionsService } from "./permissions.service.js";
import type { IGeocodingService } from "@/services/geocoding.service.js";
import {
  TripNotFoundError,
  PermissionDeniedError,
  MemberLimitExceededError,
  CoOrganizerNotFoundError,
  CannotRemoveCreatorError,
  CoOrganizerNotInTripError,
  DuplicateMemberError,
} from "../errors.js";
import { z } from "zod";
import { encodeCursor, decodeCursorAs } from "@/utils/pagination.js";

const tripCursorSchema = z.object({
  id: z.string(),
  startDate: z.string().nullable(),
});

/**
 * Trip Summary Type
 * Used for dashboard display of trips
 */
export type TripSummary = {
  id: string;
  name: string;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  coverImageUrl: string | null;
  themeId: string | null;
  themeFont: string | null;
  isOrganizer: boolean;
  rsvpStatus: "going" | "not_going" | "maybe" | "no_response";
  organizerInfo: Array<{
    id: string;
    displayName: string;
    profilePhotoUrl: string | null;
  }>;
  memberCount: number;
  eventCount: number;
};

export type PaginatedTripsResult = {
  data: TripSummary[];
  meta: {
    total: number;
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

/**
 * Organizer info returned with trip detail responses
 */
type OrganizerInfo = {
  id: string;
  displayName: string;
  phoneNumber?: string;
  profilePhotoUrl: string | null;
  timezone: string | null;
};

/**
 * Membership metadata returned alongside trip detail responses
 */
type TripMembershipMeta = {
  organizers: OrganizerInfo[];
  memberCount: number;
  isPreview: boolean;
  userRsvpStatus: "going" | "not_going" | "maybe" | "no_response";
  isOrganizer: boolean;
};

/**
 * Preview trip fields - limited subset visible to non-Going, non-organizer members
 */
type TripPreview = Pick<
  Trip,
  | "id"
  | "name"
  | "destination"
  | "destinationLat"
  | "destinationLon"
  | "startDate"
  | "endDate"
  | "preferredTimezone"
  | "description"
  | "coverImageUrl"
  | "themeId"
  | "themeFont"
>;

/**
 * Full trip detail result: either all Trip fields (full) or preview-only fields,
 * combined with organizer/membership metadata.
 */
export type TripDetailResult = (Trip | TripPreview) & TripMembershipMeta;

/**
 * Trip Service Interface
 * Defines the contract for trip management operations
 */
export interface ITripService {
  /**
   * Creates a new trip with the creator as the first member
   * @param userId - The ID of the user creating the trip
   * @param data - The trip creation data
   * @returns Promise that resolves to the created trip
   * @throws MemberLimitExceededError if co-organizer count exceeds limit
   * @throws CoOrganizerNotFoundError if co-organizer phone not found
   */
  createTrip(userId: string, data: CreateTripInput): Promise<Trip>;

  /**
   * Gets a trip by ID with organizer and member information
   * Returns preview for non-Going members and full data for Going members/organizers
   * @param tripId - The UUID of the trip to retrieve
   * @param userId - The UUID of the user requesting the trip
   * @returns Promise that resolves to the trip with organizers, memberCount, and membership info, or null if not found or not authorized
   */
  getTripById(tripId: string, userId: string): Promise<TripDetailResult | null>;

  /**
   * Gets all trips for a user with summary information (cursor-based pagination)
   * @param userId - The UUID of the user
   * @param cursor - Opaque pagination cursor (omit for first page)
   * @param limit - Number of items per page (default 20)
   * @returns Promise that resolves to array of trip summaries with cursor metadata
   */
  getUserTrips(
    userId: string,
    cursor?: string,
    limit?: number,
  ): Promise<PaginatedTripsResult>;

  /**
   * Updates a trip (to be implemented)
   * @param tripId - The UUID of the trip to update
   * @param userId - The UUID of the user requesting the update
   * @param data - The trip update data
   * @returns Promise that resolves to the updated trip
   */
  updateTrip(
    tripId: string,
    userId: string,
    data: UpdateTripInput,
  ): Promise<Trip>;

  /**
   * Cancels a trip (soft delete)
   * @param tripId - The UUID of the trip to cancel
   * @param userId - The ID of the user attempting to cancel
   * @returns Promise that resolves when the trip is cancelled
   */
  cancelTrip(tripId: string, userId: string): Promise<void>;

  /**
   * Adds co-organizers to a trip (to be implemented)
   * @param tripId - The UUID of the trip
   * @param userId - The UUID of the user adding co-organizers
   * @param phoneNumbers - Array of phone numbers to add as co-organizers
   * @returns Promise that resolves when co-organizers are added
   */
  addCoOrganizers(
    tripId: string,
    userId: string,
    phoneNumbers: string[],
  ): Promise<void>;

  /**
   * Removes a co-organizer from a trip (to be implemented)
   * @param tripId - The UUID of the trip
   * @param userId - The UUID of the user requesting removal
   * @param coOrgUserId - The UUID of the co-organizer to remove
   * @returns Promise that resolves when the co-organizer is removed
   */
  removeCoOrganizer(
    tripId: string,
    userId: string,
    coOrgUserId: string,
  ): Promise<void>;

  /**
   * Gets all co-organizers for a trip (to be implemented)
   * @param tripId - The UUID of the trip
   * @returns Promise that resolves to array of User objects
   */
  getCoOrganizers(tripId: string): Promise<User[]>;

  /**
   * Gets all members of a trip (to be implemented)
   * @param tripId - The UUID of the trip
   * @returns Promise that resolves to array of members
   */
  getTripMembers(tripId: string): Promise<Member[]>;

  /**
   * Gets the count of members for a trip (to be implemented)
   * @param tripId - The UUID of the trip
   * @returns Promise that resolves to the member count
   */
  getMemberCount(tripId: string): Promise<number>;

  /**
   * Gets the effective date range for a trip by combining trip dates and event times
   * @param tripId - The UUID of the trip
   * @returns Promise that resolves to the earliest start and latest end across trip dates and events
   */
  getEffectiveDateRange(
    tripId: string,
  ): Promise<{ start: Date | null; end: Date | null }>;
}

/**
 * Trip Service Implementation
 * Handles trip creation, management, and member operations
 */
export class TripService implements ITripService {
  constructor(
    private db: AppDatabase,
    private permissionsService: IPermissionsService,
    private geocodingService: IGeocodingService,
  ) {}

  /**
   * Creates a new trip with the creator as the first member
   * Validates co-organizers and checks member limits before creating
   * @param userId - The ID of the user creating the trip
   * @param data - The trip creation data
   * @returns The created trip
   * @throws MemberLimitExceededError if member limit exceeded
   * @throws CoOrganizerNotFoundError if co-organizer not found
   */
  async createTrip(userId: string, data: CreateTripInput): Promise<Trip> {
    // Validate co-organizers and check member limit
    let coOrganizerUserIds: string[] = [];

    if (data.coOrganizerPhones && data.coOrganizerPhones.length > 0) {
      // Check member limit: creator (1) + co-organizers must be <= 25
      if (1 + data.coOrganizerPhones.length > 25) {
        throw new MemberLimitExceededError(
          "Member limit exceeded: maximum 25 members allowed (including creator)",
        );
      }

      // Lookup users by phone number
      const coOrganizerUsers = await this.db
        .select({ id: users.id, phoneNumber: users.phoneNumber })
        .from(users)
        .where(inArray(users.phoneNumber, data.coOrganizerPhones));

      // Verify all phone numbers were found
      if (coOrganizerUsers.length !== data.coOrganizerPhones.length) {
        const foundPhones = coOrganizerUsers.map((u) => u.phoneNumber);
        const missingPhones = data.coOrganizerPhones.filter(
          (phone: string) => !foundPhones.includes(phone),
        );
        throw new CoOrganizerNotFoundError(
          `Co-organizer not found: ${missingPhones[0]}`,
        );
      }

      coOrganizerUserIds = coOrganizerUsers.map((u) => u.id);
    }

    // Geocode destination if provided (best-effort, failure does not block creation)
    let destinationLat: number | null = null;
    let destinationLon: number | null = null;
    let destinationDisplayName: string | null = null;
    if (data.destination) {
      try {
        const coords = await this.geocodingService.geocode(data.destination);
        if (coords) {
          destinationLat = coords.lat;
          destinationLon = coords.lon;
          destinationDisplayName = coords.displayName;
        }
      } catch {
        // Geocoding failure is non-blocking
      }
    }

    // Wrap all inserts in a transaction for atomicity
    const trip = await this.db.transaction(async (tx) => {
      // Insert trip record
      const [newTrip] = await tx
        .insert(trips)
        .values({
          name: data.name,
          destination: data.destination,
          destinationLat,
          destinationLon,
          destinationDisplayName,
          startDate: data.startDate || null,
          endDate: data.endDate || null,
          preferredTimezone: data.timezone,
          description: data.description || null,
          coverImageUrl:
            data.coverImageUrl === null ? null : data.coverImageUrl || null,
          themeId: data.themeId ?? null,
          themeFont: data.themeFont ?? null,
          createdBy: userId,
          allowMembersToAddEvents: data.allowMembersToAddEvents,
        })
        .returning();

      if (!newTrip) {
        throw new Error("Failed to create trip");
      }

      // Insert creator as member with status='going' and isOrganizer=true
      await tx.insert(members).values({
        tripId: newTrip.id,
        userId: userId,
        status: "going",
        isOrganizer: true,
      });

      // Insert co-organizers as members with status='going' and isOrganizer=true
      if (coOrganizerUserIds.length > 0) {
        await tx.insert(members).values(
          coOrganizerUserIds.map((coOrgUserId) => ({
            tripId: newTrip.id,
            userId: coOrgUserId,
            status: "going" as const,
            isOrganizer: true,
          })),
        );
      }

      return newTrip;
    });

    return trip;
  }

  /**
   * Gets a trip by ID with organizer and member information
   * Returns null if trip not found or user is not a member (security best practice)
   * Returns preview for non-Going members and full data for Going members/organizers
   * @param tripId - The UUID of the trip to retrieve
   * @param userId - The UUID of the user requesting the trip
   * @returns Promise that resolves to the trip with organizers, memberCount, and membership info, or null if not found or not authorized
   */
  async getTripById(
    tripId: string,
    userId: string,
  ): Promise<TripDetailResult | null> {
    // Check if user is a member of the trip (select only needed columns)
    const membershipCheck = await this.db
      .select({ status: members.status, isOrganizer: members.isOrganizer })
      .from(members)
      .where(and(eq(members.tripId, tripId), eq(members.userId, userId)))
      .limit(1);

    // Return null if user is not a member (security best practice: same response as "not found")
    if (membershipCheck.length === 0) {
      return null;
    }

    const memberRecord = membershipCheck[0]!;
    const userRsvpStatus = memberRecord.status;
    const userIsOrganizer = memberRecord.isOrganizer;

    // Determine if this is a preview: non-Going members who are not organizers see preview
    const isPreview = userRsvpStatus !== "going" && !userIsOrganizer;

    // Load the trip
    const tripResult = await this.db
      .select(getTableColumns(trips))
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    // Return null if trip doesn't exist
    if (tripResult.length === 0) {
      return null;
    }

    const trip = tripResult[0]!;

    // Load organizers with user info in a single JOIN query
    const organizerUsers = await this.db
      .select({
        id: users.id,
        displayName: users.displayName,
        phoneNumber: users.phoneNumber,
        profilePhotoUrl: users.profilePhotoUrl,
        timezone: users.timezone,
      })
      .from(members)
      .innerJoin(users, eq(members.userId, users.id))
      .where(and(eq(members.tripId, tripId), eq(members.isOrganizer, true)));

    // Load member count
    const memberCount = await this.getMemberCount(tripId);

    const meta: TripMembershipMeta = {
      organizers: organizerUsers.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        ...(userIsOrganizer ? { phoneNumber: u.phoneNumber } : {}),
        profilePhotoUrl: u.profilePhotoUrl,
        timezone: u.timezone,
      })),
      memberCount,
      isPreview,
      userRsvpStatus,
      isOrganizer: userIsOrganizer,
    };

    // For preview mode, return only the allowed subset of trip fields
    // Preview excludes sensitive/internal fields like createdBy, allowMembersToAddEvents, cancelled, etc.
    if (isPreview) {
      return {
        id: trip.id,
        name: trip.name,
        destination: trip.destination,
        destinationLat: trip.destinationLat,
        destinationLon: trip.destinationLon,
        startDate: trip.startDate,
        endDate: trip.endDate,
        preferredTimezone: trip.preferredTimezone,
        description: trip.description,
        coverImageUrl: trip.coverImageUrl,
        themeId: trip.themeId,
        themeFont: trip.themeFont,
        ...meta,
      };
    }

    // Return full trip data with membership info
    return {
      ...trip,
      ...meta,
    };
  }

  /**
   * Gets all trips for a user with summary information (cursor-based pagination)
   * Returns trip summaries for dashboard display
   * Sort order: startDate ASC NULLS LAST, id ASC
   *
   * @param userId - The UUID of the user
   * @param cursor - Opaque pagination cursor (omit for first page)
   * @param limit - Number of items per page (default 20)
   * @returns Promise that resolves to array of trip summaries ordered by start date
   */
  async getUserTrips(
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<PaginatedTripsResult> {
    // Get all trip memberships for user
    const userMemberships = await this.db
      .select({
        tripId: members.tripId,
        status: members.status,
        isOrganizer: members.isOrganizer,
      })
      .from(members)
      .where(eq(members.userId, userId));

    // Return empty result if user has no trips
    if (userMemberships.length === 0) {
      return {
        data: [],
        meta: { total: 0, limit, hasMore: false, nextCursor: null },
      };
    }

    const tripIds = userMemberships.map((m) => m.tripId);

    // Count total non-cancelled trips for pagination meta
    const [totalResult] = await this.db
      .select({ value: count() })
      .from(trips)
      .where(and(inArray(trips.id, tripIds), eq(trips.cancelled, false)));
    const total = totalResult?.value ?? 0;

    // Build cursor WHERE conditions for keyset pagination
    // Sort order: startDate ASC NULLS LAST, id ASC
    const baseConditions = [
      inArray(trips.id, tripIds),
      eq(trips.cancelled, false),
    ];

    if (cursor) {
      const decoded = decodeCursorAs(cursor, tripCursorSchema);
      const cursorStartDate = decoded.startDate;
      const cursorId = decoded.id;

      if (cursorStartDate !== null) {
        // Cursor has a non-null startDate:
        // Next rows are those with (startDate > cursorStartDate)
        // OR (startDate == cursorStartDate AND id > cursorId)
        // OR (startDate IS NULL) -- nulls come last
        baseConditions.push(
          or(
            and(
              isNotNull(trips.startDate),
              gt(trips.startDate, cursorStartDate),
            ),
            and(
              isNotNull(trips.startDate),
              eq(trips.startDate, cursorStartDate),
              gt(trips.id, cursorId),
            ),
            isNull(trips.startDate),
          )!,
        );
      } else {
        // Cursor has a null startDate (we're in the NULLS LAST section):
        // Next rows are those with (startDate IS NULL AND id > cursorId)
        baseConditions.push(
          and(isNull(trips.startDate), gt(trips.id, cursorId))!,
        );
      }
    }

    // Load paginated trips (fetch limit+1)
    const userTrips = await this.db
      .select({
        id: trips.id,
        name: trips.name,
        destination: trips.destination,
        startDate: trips.startDate,
        endDate: trips.endDate,
        coverImageUrl: trips.coverImageUrl,
        themeId: trips.themeId,
        themeFont: trips.themeFont,
      })
      .from(trips)
      .where(and(...baseConditions))
      .orderBy(
        sql`CASE WHEN ${trips.startDate} IS NULL THEN 1 ELSE 0 END`,
        asc(trips.startDate),
        asc(trips.id),
      )
      .limit(limit + 1);

    const hasMore = userTrips.length > limit;
    const pageTrips = hasMore ? userTrips.slice(0, limit) : userTrips;

    // If no trips on this page, return empty
    if (pageTrips.length === 0) {
      return {
        data: [],
        meta: { total, limit, hasMore: false, nextCursor: null },
      };
    }

    // Build next cursor from the last row
    let nextCursor: string | null = null;
    if (hasMore) {
      const lastTrip = pageTrips[pageTrips.length - 1]!;
      nextCursor = encodeCursor({
        startDate: lastTrip.startDate,
        id: lastTrip.id,
      });
    }

    // Batch: get all members for all trips on this page (fix N+1)
    const pageTripIds = pageTrips.map((t) => t.id);

    const allMembers = await this.db
      .select({
        tripId: members.tripId,
        userId: members.userId,
        isOrganizer: members.isOrganizer,
      })
      .from(members)
      .where(inArray(members.tripId, pageTripIds));

    // Batch: get organizer user IDs (members with isOrganizer=true)
    const organizerMembersByTrip = new Map<string, string[]>();
    const memberCountByTrip = new Map<string, number>();

    for (const m of allMembers) {
      // Count all members per trip
      memberCountByTrip.set(
        m.tripId,
        (memberCountByTrip.get(m.tripId) ?? 0) + 1,
      );

      // Track organizer userIds (isOrganizer=true)
      if (m.isOrganizer) {
        if (!organizerMembersByTrip.has(m.tripId)) {
          organizerMembersByTrip.set(m.tripId, []);
        }
        organizerMembersByTrip.get(m.tripId)!.push(m.userId);
      }
    }

    // Batch: get event counts (non-deleted only)
    const eventCounts = await this.db
      .select({ tripId: events.tripId, value: count() })
      .from(events)
      .where(and(inArray(events.tripId, pageTripIds), isNull(events.deletedAt)))
      .groupBy(events.tripId);

    const eventCountByTrip = new Map<string, number>(
      eventCounts.map((e) => [e.tripId, e.value]),
    );

    // Batch: get all organizer user info
    const allOrganizerUserIds = new Set<string>();
    for (const ids of organizerMembersByTrip.values()) {
      for (const id of ids) {
        allOrganizerUserIds.add(id);
      }
    }

    const organizerUsers =
      allOrganizerUserIds.size > 0
        ? await this.db
            .select({
              id: users.id,
              displayName: users.displayName,
              profilePhotoUrl: users.profilePhotoUrl,
            })
            .from(users)
            .where(inArray(users.id, [...allOrganizerUserIds]))
        : [];

    const organizerUserMap = new Map(organizerUsers.map((u) => [u.id, u]));

    // Build trip summaries
    const membershipMap = new Map(
      userMemberships.map((m) => [
        m.tripId,
        { status: m.status, isOrganizer: m.isOrganizer },
      ]),
    );

    const summaries: TripSummary[] = pageTrips.map((trip) => {
      const membership = membershipMap.get(trip.id);
      const rsvpStatus = membership?.status ?? "no_response";
      const isOrganizer = membership?.isOrganizer ?? false;

      const tripOrganizerIds = organizerMembersByTrip.get(trip.id) ?? [];
      const organizerInfo = tripOrganizerIds
        .map((id) => organizerUserMap.get(id))
        .filter((u): u is NonNullable<typeof u> => u != null);

      return {
        id: trip.id,
        name: trip.name,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        coverImageUrl: trip.coverImageUrl,
        themeId: trip.themeId,
        themeFont: trip.themeFont,
        isOrganizer,
        rsvpStatus,
        organizerInfo,
        memberCount: memberCountByTrip.get(trip.id) ?? 0,
        eventCount: eventCountByTrip.get(trip.id) ?? 0,
      };
    });

    return {
      data: summaries,
      meta: { total, limit, hasMore, nextCursor },
    };
  }

  /**
   * Updates a trip
   * Only organizers (creator or co-organizers) can update trips
   * @param tripId - The UUID of the trip to update
   * @param userId - The UUID of the user requesting the update
   * @param data - The trip update data
   * @returns Promise that resolves to the updated trip
   * @throws TripNotFoundError if trip not found
   * @throws PermissionDeniedError if user lacks permission
   */
  async updateTrip(
    tripId: string,
    userId: string,
    data: UpdateTripInput,
  ): Promise<Trip> {
    // Check permissions
    const canEdit = await this.permissionsService.canEditTrip(userId, tripId);
    if (!canEdit) {
      // Check if trip exists to provide better error message
      const tripExists = await this.db
        .select({ id: trips.id })
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);

      if (tripExists.length === 0) {
        throw new TripNotFoundError();
      }

      throw new PermissionDeniedError(
        "Permission denied: only organizers can update trips",
      );
    }

    // Build update data with field mapping
    const updateData: Record<string, unknown> = {
      ...data,
      updatedAt: new Date(),
    };

    // Map timezone to preferredTimezone if provided
    if (data.timezone !== undefined) {
      updateData.preferredTimezone = data.timezone;
      delete updateData.timezone;
    }

    // If destination changed, geocode and update coordinates + delete weather cache
    // Only re-geocode if the destination value actually differs from the current one
    if (data.destination !== undefined) {
      // Fetch current trip to compare destination
      const [currentTrip] = await this.db
        .select({ destination: trips.destination })
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);

      if (data.destination !== currentTrip?.destination) {
        let newLat: number | null = null;
        let newLon: number | null = null;
        let newDisplayName: string | null = null;
        try {
          const coords = await this.geocodingService.geocode(data.destination);
          if (coords) {
            newLat = coords.lat;
            newLon = coords.lon;
            newDisplayName = coords.displayName;
          }
        } catch {
          // Geocoding failure is non-blocking
        }
        updateData.destinationLat = newLat;
        updateData.destinationLon = newLon;
        updateData.destinationDisplayName = newDisplayName;

        // Delete weather cache when destination changes (regardless of geocoding result)
        await this.db
          .delete(weatherCache)
          .where(eq(weatherCache.tripId, tripId));
      }
    }

    // Clear weather cache if trip dates changed (cached forecast may not cover new range)
    if (data.startDate !== undefined || data.endDate !== undefined) {
      await this.db.delete(weatherCache).where(eq(weatherCache.tripId, tripId));
    }

    // Perform update
    const result = await this.db
      .update(trips)
      .set(updateData)
      .where(eq(trips.id, tripId))
      .returning();

    if (!result[0]) {
      throw new TripNotFoundError();
    }

    return result[0];
  }

  /**
   * Cancels a trip (soft delete - sets cancelled=true)
   * @param tripId - The UUID of the trip to cancel
   * @param userId - The ID of the user attempting to cancel
   * @returns Promise that resolves when the trip is cancelled
   */
  async cancelTrip(tripId: string, userId: string): Promise<void> {
    // 1. Check permissions - only organizers can cancel trips
    const canDelete = await this.permissionsService.canDeleteTrip(
      userId,
      tripId,
    );
    if (!canDelete) {
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
        "Permission denied: only organizers can cancel trips",
      );
    }

    // 2. Perform soft delete in a transaction for consistency
    await this.db.transaction(async (tx) => {
      const result = await tx
        .update(trips)
        .set({
          cancelled: true,
          updatedAt: new Date(),
        })
        .where(eq(trips.id, tripId))
        .returning();

      if (!result[0]) {
        throw new TripNotFoundError();
      }
    });
  }

  /**
   * Adds co-organizers to a trip
   * Only organizers can add co-organizers
   * @param tripId - The UUID of the trip
   * @param userId - The UUID of the user adding co-organizers
   * @param phoneNumbers - Array of phone numbers to add as co-organizers
   * @returns Promise that resolves when co-organizers are added
   * @throws PermissionDeniedError if permission denied
   * @throws CoOrganizerNotFoundError if phone not found
   * @throws MemberLimitExceededError if member limit exceeded
   */
  async addCoOrganizers(
    tripId: string,
    userId: string,
    phoneNumbers: string[],
  ): Promise<void> {
    // 1. Check permissions - only organizers can manage co-organizers
    const canManage = await this.permissionsService.canManageCoOrganizers(
      userId,
      tripId,
    );
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
        "Permission denied: only organizers can manage co-organizers",
      );
    }

    // 2. Lookup users by phone numbers
    const newCoOrganizerUsers = await this.db
      .select({ id: users.id, phoneNumber: users.phoneNumber })
      .from(users)
      .where(inArray(users.phoneNumber, phoneNumbers));

    // Verify all phone numbers were found
    if (newCoOrganizerUsers.length !== phoneNumbers.length) {
      const foundPhones = newCoOrganizerUsers.map((u) => u.phoneNumber);
      const missingPhones = phoneNumbers.filter(
        (phone: string) => !foundPhones.includes(phone),
      );
      throw new CoOrganizerNotFoundError(
        `Co-organizer not found: ${missingPhones[0]}`,
      );
    }

    // 3-6. Wrap count check + insert in transaction to prevent race conditions
    await this.db.transaction(async (tx) => {
      // 3-4. Get existing members (derive count from result length)
      const existingMembers = await tx
        .select({ userId: members.userId })
        .from(members)
        .where(eq(members.tripId, tripId));

      const currentMemberCount = existingMembers.length;

      const existingMemberUserIds = new Set(
        existingMembers.map((m) => m.userId),
      );

      // Filter out users who are already members
      const newCoOrganizerUserIds = newCoOrganizerUsers
        .filter((u) => !existingMemberUserIds.has(u.id))
        .map((u) => u.id);

      // 5. Check member limit: current + new members must be <= 25
      if (currentMemberCount + newCoOrganizerUserIds.length > 25) {
        throw new MemberLimitExceededError(
          "Member limit exceeded: maximum 25 members allowed (including creator)",
        );
      }

      // 6. Insert new co-organizers as members with status='going' and isOrganizer=true
      if (newCoOrganizerUserIds.length > 0) {
        try {
          await tx.insert(members).values(
            newCoOrganizerUserIds.map((coOrgUserId) => ({
              tripId: tripId,
              userId: coOrgUserId,
              status: "going" as const,
              isOrganizer: true,
            })),
          );
        } catch (error) {
          if (
            error instanceof Error &&
            "code" in error &&
            (error as Error & { code: string }).code === "23505"
          ) {
            throw new DuplicateMemberError(
              "User is already a member of this trip",
            );
          }
          throw error;
        }
      }
    });
  }

  /**
   * Removes a co-organizer from a trip
   * Only organizers can remove co-organizers
   * Cannot remove the trip creator
   * @param tripId - The UUID of the trip
   * @param userId - The UUID of the user requesting removal
   * @param coOrgUserId - The UUID of the co-organizer to remove
   * @returns Promise that resolves when the co-organizer is removed
   * @throws PermissionDeniedError if permission denied
   * @throws TripNotFoundError if trip not found
   * @throws CannotRemoveCreatorError if trying to remove creator
   * @throws CoOrganizerNotInTripError if co-organizer not in trip
   */
  async removeCoOrganizer(
    tripId: string,
    userId: string,
    coOrgUserId: string,
  ): Promise<void> {
    // 1. Check permissions - only organizers can manage co-organizers
    const canManage = await this.permissionsService.canManageCoOrganizers(
      userId,
      tripId,
    );
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
        "Permission denied: only organizers can manage co-organizers",
      );
    }

    // 2. Load trip to check creator
    const [trip] = await this.db
      .select({ id: trips.id, createdBy: trips.createdBy })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    if (!trip) {
      throw new TripNotFoundError();
    }

    // 3. Prevent removing trip creator
    if (trip.createdBy === coOrgUserId) {
      throw new CannotRemoveCreatorError();
    }

    // 4. Verify co-organizer is a member of the trip
    const [memberRecord] = await this.db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.tripId, tripId), eq(members.userId, coOrgUserId)))
      .limit(1);

    if (!memberRecord) {
      throw new CoOrganizerNotInTripError();
    }

    // 5. Delete member record
    await this.db
      .delete(members)
      .where(and(eq(members.tripId, tripId), eq(members.userId, coOrgUserId)));
  }

  /**
   * Gets all co-organizers for a trip
   * Returns all members with isOrganizer=true (includes creator and co-organizers)
   * @param tripId - The UUID of the trip
   * @returns Promise that resolves to array of User objects
   */
  async getCoOrganizers(tripId: string): Promise<User[]> {
    // Single JOIN query: get members with isOrganizer=true and their user info
    const results = await this.db
      .select(getTableColumns(users))
      .from(members)
      .innerJoin(users, eq(members.userId, users.id))
      .where(and(eq(members.tripId, tripId), eq(members.isOrganizer, true)));

    return results;
  }

  /**
   * Gets all members of a trip (placeholder implementation)
   * @param _tripId - The UUID of the trip
   * @returns Promise that resolves to array of members
   */
  async getTripMembers(_tripId: string): Promise<Member[]> {
    return [];
  }

  /**
   * Gets the count of members for a trip
   * @param tripId - The UUID of the trip
   * @returns Promise that resolves to the member count
   */
  async getMemberCount(tripId: string): Promise<number> {
    const [result] = await this.db
      .select({ value: count() })
      .from(members)
      .where(eq(members.tripId, tripId));
    return result?.value ?? 0;
  }

  /**
   * Gets the effective date range for a trip by combining trip dates and event times.
   * Returns the earliest of (trip.startDate, min event startTime) and
   * the latest of (trip.endDate, max event endTime or startTime).
   * @param tripId - The UUID of the trip
   * @returns The effective start and end dates, or nulls if no dates/events exist
   */
  async getEffectiveDateRange(
    tripId: string,
  ): Promise<{ start: Date | null; end: Date | null }> {
    // Query trip for startDate/endDate
    const [trip] = await this.db
      .select({ startDate: trips.startDate, endDate: trips.endDate })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    if (!trip) {
      return { start: null, end: null };
    }

    // Query events for min(startTime) and max(coalesce(endTime, startTime))
    const [eventRange] = await this.db
      .select({
        minStart: min(events.startTime),
        maxEnd: max(
          sql<Date>`COALESCE(${events.endTime}, ${events.startTime})`,
        ),
      })
      .from(events)
      .where(and(eq(events.tripId, tripId), isNull(events.deletedAt)));

    const tripStart = trip.startDate ? new Date(trip.startDate) : null;
    const tripEnd = trip.endDate ? new Date(trip.endDate) : null;
    const eventStart = eventRange?.minStart
      ? new Date(eventRange.minStart)
      : null;
    const eventEnd = eventRange?.maxEnd ? new Date(eventRange.maxEnd) : null;

    // Determine effective start: earliest of trip start and event start
    const effectiveStart =
      tripStart && eventStart
        ? tripStart < eventStart
          ? tripStart
          : eventStart
        : (tripStart ?? eventStart);

    // Determine effective end: latest of trip end and event end
    const effectiveEnd =
      tripEnd && eventEnd
        ? tripEnd > eventEnd
          ? tripEnd
          : eventEnd
        : (tripEnd ?? eventEnd);

    return { start: effectiveStart, end: effectiveEnd };
  }
}
