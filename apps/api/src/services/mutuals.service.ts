import { sql } from "drizzle-orm";
import type { AppDatabase } from "@/types/index.js";
import type { IPermissionsService } from "./permissions.service.js";
import type { Logger } from "@/types/logger.js";
import type { Mutual } from "@journiful/shared/types";
import { PermissionDeniedError } from "../errors.js";
import { z } from "zod";
import { encodeCursor, decodeCursorAs } from "@/utils/pagination.js";

const mutualsCursorSchema = z.object({
  count: z.number(),
  name: z.string(),
  id: z.string(),
});

/**
 * Mutuals Service Interface
 * Defines the contract for querying users who share trips with the current user
 */
export interface IMutualsService {
  /**
   * Gets all mutuals (users sharing trips) for the authenticated user
   * @param params.userId - The current user's ID
   * @param params.tripId - Optional filter to a specific trip
   * @param params.search - Optional prefix search on display name
   * @param params.cursor - Opaque pagination cursor
   * @param params.limit - Page size (default 20)
   * @returns Paginated list of mutuals with next cursor
   */
  getMutuals(params: {
    userId: string;
    tripId?: string;
    search?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ mutuals: Mutual[]; nextCursor: string | null }>;

  /**
   * Gets mutuals NOT already in a specific trip (for invite dialog)
   * Requires the requesting user to be an organizer of the target trip
   * @param params.userId - The current user's ID
   * @param params.tripId - The trip to exclude members from
   * @param params.search - Optional prefix search on display name
   * @param params.cursor - Opaque pagination cursor
   * @param params.limit - Page size (default 20)
   * @returns Paginated list of mutual suggestions with next cursor
   */
  getMutualSuggestions(params: {
    userId: string;
    tripId: string;
    search?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ mutuals: Mutual[]; nextCursor: string | null }>;
}

/**
 * Mutuals Service Implementation
 * Handles querying users who share trips with the current user
 */
export class MutualsService implements IMutualsService {
  constructor(
    private db: AppDatabase,
    private permissionsService: IPermissionsService,
    _logger?: Logger,
  ) {}

  async getMutuals(params: {
    userId: string;
    tripId?: string;
    search?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ mutuals: Mutual[]; nextCursor: string | null }> {
    const { userId, tripId, search, cursor, limit = 20 } = params;

    // Build WHERE conditions (non-aggregate only)
    const whereConditions: ReturnType<typeof sql>[] = [
      sql`m1.user_id = ${userId}`,
    ];

    if (tripId) {
      whereConditions.push(sql`m1.trip_id = ${tripId}`);
    }

    if (search) {
      whereConditions.push(
        sql`LOWER(u.display_name) LIKE LOWER(${search + "%"})`,
      );
    }

    const whereClause = sql.join(whereConditions, sql` AND `);

    // Build HAVING clause for cursor (since count is an aggregate)
    let havingClause = sql``;
    if (cursor) {
      const decoded = decodeCursorAs(cursor, mutualsCursorSchema);
      const cursorCount = decoded.count;
      const cursorName = decoded.name;
      const cursorId = decoded.id;
      havingClause = sql`HAVING (
        COUNT(DISTINCT m2.trip_id) < ${cursorCount}
        OR (COUNT(DISTINCT m2.trip_id) = ${cursorCount} AND u.display_name > ${cursorName})
        OR (COUNT(DISTINCT m2.trip_id) = ${cursorCount} AND u.display_name = ${cursorName} AND u.id > ${cursorId})
      )`;
    }

    // Fetch limit + 1 to detect if there's a next page
    const fetchLimit = limit + 1;

    const results = await this.db.execute<{
      id: string;
      display_name: string;
      profile_photo_url: string | null;
      shared_trip_count: string;
    }>(sql`
      SELECT u.id, u.display_name, u.profile_photo_url, COUNT(DISTINCT m2.trip_id) as shared_trip_count
      FROM members m1
      JOIN members m2 ON m1.trip_id = m2.trip_id AND m1.user_id != m2.user_id
      JOIN users u ON m2.user_id = u.id
      WHERE ${whereClause}
      GROUP BY u.id, u.display_name, u.profile_photo_url
      ${havingClause}
      ORDER BY shared_trip_count DESC, u.display_name ASC, u.id ASC
      LIMIT ${fetchLimit}
    `);

    const rows = results.rows;
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    // Build next cursor from the last item
    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const lastRow = pageRows[pageRows.length - 1]!;
      nextCursor = encodeCursor({
        count: Number(lastRow.shared_trip_count),
        name: lastRow.display_name,
        id: lastRow.id,
      });
    }

    // Batch load shared trips for the mutual user IDs
    const mutualUserIds = pageRows.map((r) => r.id);
    const mutualsWithTrips = await this.loadSharedTrips(
      userId,
      mutualUserIds,
      tripId,
    );

    // Assemble final result
    const mutuals: Mutual[] = pageRows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      profilePhotoUrl: row.profile_photo_url,
      sharedTripCount: Number(row.shared_trip_count),
      sharedTrips: mutualsWithTrips.get(row.id) ?? [],
    }));

    return { mutuals, nextCursor };
  }

  async getMutualSuggestions(params: {
    userId: string;
    tripId: string;
    search?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ mutuals: Mutual[]; nextCursor: string | null }> {
    const { userId, tripId, search, cursor, limit = 20 } = params;

    // Check organizer permission
    const isOrg = await this.permissionsService.isOrganizer(userId, tripId);
    if (!isOrg) {
      throw new PermissionDeniedError(
        "Permission denied: only organizers can view mutual suggestions",
      );
    }

    // Build WHERE conditions
    const whereConditions: ReturnType<typeof sql>[] = [
      sql`m1.user_id = ${userId}`,
      // Exclude users already in the target trip
      sql`u.id NOT IN (SELECT user_id FROM members WHERE trip_id = ${tripId})`,
    ];

    if (search) {
      whereConditions.push(
        sql`LOWER(u.display_name) LIKE LOWER(${search + "%"})`,
      );
    }

    const whereClause = sql.join(whereConditions, sql` AND `);

    // Build HAVING clause for cursor
    let havingClause = sql``;
    if (cursor) {
      const decoded = decodeCursorAs(cursor, mutualsCursorSchema);
      const cursorCount = decoded.count;
      const cursorName = decoded.name;
      const cursorId = decoded.id;
      havingClause = sql`HAVING (
        COUNT(DISTINCT m2.trip_id) < ${cursorCount}
        OR (COUNT(DISTINCT m2.trip_id) = ${cursorCount} AND u.display_name > ${cursorName})
        OR (COUNT(DISTINCT m2.trip_id) = ${cursorCount} AND u.display_name = ${cursorName} AND u.id > ${cursorId})
      )`;
    }

    const fetchLimit = limit + 1;

    const results = await this.db.execute<{
      id: string;
      display_name: string;
      profile_photo_url: string | null;
      shared_trip_count: string;
    }>(sql`
      SELECT u.id, u.display_name, u.profile_photo_url, COUNT(DISTINCT m2.trip_id) as shared_trip_count
      FROM members m1
      JOIN members m2 ON m1.trip_id = m2.trip_id AND m1.user_id != m2.user_id
      JOIN users u ON m2.user_id = u.id
      WHERE ${whereClause}
      GROUP BY u.id, u.display_name, u.profile_photo_url
      ${havingClause}
      ORDER BY shared_trip_count DESC, u.display_name ASC, u.id ASC
      LIMIT ${fetchLimit}
    `);

    const rows = results.rows;
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const lastRow = pageRows[pageRows.length - 1]!;
      nextCursor = encodeCursor({
        count: Number(lastRow.shared_trip_count),
        name: lastRow.display_name,
        id: lastRow.id,
      });
    }

    // Batch load shared trips
    const mutualUserIds = pageRows.map((r) => r.id);
    const mutualsWithTrips = await this.loadSharedTrips(userId, mutualUserIds);

    const mutuals: Mutual[] = pageRows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      profilePhotoUrl: row.profile_photo_url,
      sharedTripCount: Number(row.shared_trip_count),
      sharedTrips: mutualsWithTrips.get(row.id) ?? [],
    }));

    return { mutuals, nextCursor };
  }

  /**
   * Loads shared trip details (id + name) for a set of mutual user IDs
   * Uses a self-join on members to find trips shared between the current user and each mutual
   */
  private async loadSharedTrips(
    userId: string,
    mutualUserIds: string[],
    tripId?: string,
  ): Promise<Map<string, { id: string; name: string }[]>> {
    const result = new Map<string, { id: string; name: string }[]>();

    if (mutualUserIds.length === 0) {
      return result;
    }

    // Build WHERE conditions
    const whereConditions: ReturnType<typeof sql>[] = [
      sql`m1.user_id = ${userId}`,
      sql`m2.user_id IN (${sql.join(
        mutualUserIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    ];

    if (tripId) {
      whereConditions.push(sql`m1.trip_id = ${tripId}`);
    }

    const whereClause = sql.join(whereConditions, sql` AND `);

    const rows = await this.db.execute<{
      mutual_user_id: string;
      trip_id: string;
      trip_name: string;
    }>(sql`
      SELECT m2.user_id as mutual_user_id, t.id as trip_id, t.name as trip_name
      FROM members m1
      JOIN members m2 ON m1.trip_id = m2.trip_id AND m1.user_id != m2.user_id
      JOIN trips t ON m1.trip_id = t.id
      WHERE ${whereClause}
      ORDER BY t.name ASC
    `);

    for (const row of rows.rows) {
      const existing = result.get(row.mutual_user_id) ?? [];
      // Deduplicate trips (in case of multiple joins)
      if (!existing.some((t) => t.id === row.trip_id)) {
        existing.push({ id: row.trip_id, name: row.trip_name });
      }
      result.set(row.mutual_user_id, existing);
    }

    return result;
  }
}
