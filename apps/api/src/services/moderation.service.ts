import { and, desc, eq, or } from "drizzle-orm";
import { trips, userBlocks, userReports, users } from "@/db/schema/index.js";
import type { UserReport } from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";
import {
  CannotModerateSelfError,
  TripNotFoundError,
  UserNotFoundError,
} from "@/errors.js";

/**
 * Moderation: one user stops seeing another.
 *
 * A block is stored as a directed row but means a symmetric thing — whoever
 * wrote it, the two do not see each other. That symmetry is why the relation
 * has exactly one definition, in the two helpers below, and every consumer
 * (the roster, the push fan-out, the invitation check) goes through them
 * rather than asking the question its own way.
 */

/**
 * Every user id in a block either way with `userId`.
 *
 * The executor is the database or a caller's transaction: the guest phone
 * guard reads the block inside the transaction that writes the guest row.
 */
export async function blockedCounterpartIds(
  db: Pick<AppDatabase, "select">,
  userId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ blockerId: userBlocks.blockerId, blockedId: userBlocks.blockedId })
    .from(userBlocks)
    .where(
      or(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, userId)),
    );

  return new Set(
    rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)),
  );
}

/** Drops recipients whose userId is in `blocked`. Guests (null userId) pass. */
export function withoutBlocked<T extends { userId: string | null }>(
  recipients: T[],
  blocked: Set<string>,
): T[] {
  if (blocked.size === 0) return recipients;
  return recipients.filter((r) => r.userId === null || !blocked.has(r.userId));
}

export interface IModerationService {
  blockUser(blockerId: string, blockedId: string): Promise<void>;

  unblockUser(blockerId: string, blockedId: string): Promise<void>;

  reportUser(input: {
    reporterId: string;
    reportedId: string;
    tripId?: string | null;
    reason: "spam" | "harassment" | "impersonation" | "other";
    note?: string | null;
  }): Promise<UserReport>;

  isBlocked(aId: string, bId: string): Promise<boolean>;

  listBlockedBy(userId: string): Promise<string[]>;

  listBlockedWithProfiles(userId: string): Promise<
    {
      userId: string;
      displayName: string;
      profilePhotoUrl: string | null;
    }[]
  >;
}

export class ModerationService implements IModerationService {
  constructor(private db: AppDatabase) {}

  /**
   * Blocks `blockedId` from `blockerId`. Idempotent: the ordered pair is
   * unique and the insert is `ON CONFLICT DO NOTHING`, so a repeat writes
   * nothing rather than failing or stacking a second row.
   *
   * The target has to be a user: the column is FK-constrained, so an id that
   * names nobody used to reach the database and come back as the route's
   * catch-all 500 — which made the call an existence oracle too, since 201
   * then meant the id was real and 500 meant it was not.
   */
  async blockUser(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) {
      throw new CannotModerateSelfError("You cannot block yourself");
    }

    await this.requireTargetUser(blockedId);

    await this.db
      .insert(userBlocks)
      .values({ blockerId, blockedId })
      .onConflictDoNothing();
  }

  /**
   * Lifts the block `blockerId` placed on `blockedId`. Only the row's own
   * direction is removed — a block the other way round, if any, still stands.
   */
  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) {
      throw new CannotModerateSelfError("You cannot unblock yourself");
    }

    await this.db
      .delete(userBlocks)
      .where(
        and(
          eq(userBlocks.blockerId, blockerId),
          eq(userBlocks.blockedId, blockedId),
        ),
      );
  }

  /**
   * Records a report. The trip is optional because a report has to outlive
   * the trip it was made in: deleting the trip clears `trip_id`, not the row.
   *
   * The reported user has to exist, for the same reason the block above
   * checks its target: `reported_id` is FK-constrained and the insert would
   * otherwise answer 500 for an id that names nobody.
   */
  async reportUser(input: {
    reporterId: string;
    reportedId: string;
    tripId?: string | null;
    reason: "spam" | "harassment" | "impersonation" | "other";
    note?: string | null;
  }): Promise<UserReport> {
    const { reporterId, reportedId, tripId, reason, note } = input;

    if (reporterId === reportedId) {
      throw new CannotModerateSelfError("You cannot report yourself");
    }

    await this.requireTargetUser(reportedId);

    // The trip is optional, but a trip that does not exist is not a report to
    // file: the insert below would hit the foreign key and answer 500, which is
    // the same bad-input-is-a-server-error shape `requireTargetUser` above
    // exists to avoid. Whether a report may name a trip the reporter is not on
    // is a separate question and is deliberately not decided here.
    if (tripId) {
      await this.requireTrip(tripId);
    }

    const [report] = await this.db
      .insert(userReports)
      .values({
        reporterId,
        reportedId,
        tripId: tripId ?? null,
        reason,
        note: note ?? null,
      })
      .returning();

    if (!report) {
      throw new Error("Failed to create report");
    }

    return report;
  }

  /** True if a block is stored between the pair, in either direction. */
  async isBlocked(aId: string, bId: string): Promise<boolean> {
    if (aId === bId) return false;

    const rows = await this.db
      .select({ id: userBlocks.id })
      .from(userBlocks)
      .where(
        or(
          and(eq(userBlocks.blockerId, aId), eq(userBlocks.blockedId, bId)),
          and(eq(userBlocks.blockerId, bId), eq(userBlocks.blockedId, aId)),
        ),
      )
      .limit(1);

    return rows.length > 0;
  }

  /** The ids `userId` has blocked (the rows they wrote). */
  async listBlockedBy(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ blockedId: userBlocks.blockedId })
      .from(userBlocks)
      .where(eq(userBlocks.blockerId, userId));

    return rows.map((r) => r.blockedId);
  }

  /**
   * The people `userId` has blocked, with enough profile to render a row.
   * `listBlockedBy` answers the id question; a screen needs the name.
   */
  async listBlockedWithProfiles(userId: string): Promise<
    {
      userId: string;
      displayName: string;
      profilePhotoUrl: string | null;
    }[]
  > {
    const rows = await this.db
      .select({
        userId: userBlocks.blockedId,
        displayName: users.displayName,
        profilePhotoUrl: users.profilePhotoUrl,
      })
      .from(userBlocks)
      .innerJoin(users, eq(userBlocks.blockedId, users.id))
      .where(eq(userBlocks.blockerId, userId))
      .orderBy(desc(userBlocks.createdAt));

    return rows;
  }

  /**
   * Refuses a moderation target that names no user.
   *
   * `blocked_id` and `reported_id` are FK-constrained, and both writes are
   * reached through a controller whose catch-all answers 500 for anything
   * without a `statusCode` — so an unknown id was a 500, and the status said
   * whether the id existed. The answer is the repo's own not-found envelope
   * (`UserNotFoundError`): the request is well-formed and the target is what
   * is missing, which makes this a 404 rather than a 400.
   */
  private async requireTargetUser(userId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!row) {
      throw new UserNotFoundError();
    }
  }

  /** The report's optional trip, when one was named. */
  private async requireTrip(tripId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: trips.id })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    if (!row) {
      throw new TripNotFoundError();
    }
  }
}
