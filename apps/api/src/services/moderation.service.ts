import { and, eq, or } from "drizzle-orm";
import { userBlocks, userReports } from "@/db/schema/index.js";
import type { UserReport } from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";
import { CannotModerateSelfError } from "@/errors.js";

/**
 * Moderation: one user stops seeing another.
 *
 * A block is stored as a directed row but means a symmetric thing — whoever
 * wrote it, the two do not see each other. That symmetry is why the relation
 * has exactly one definition, in the two helpers below, and every consumer
 * (the roster, the push fan-out, the invitation check) goes through them
 * rather than asking the question its own way.
 */

/** Every user id in a block either way with `userId`. */
export async function blockedCounterpartIds(
  db: AppDatabase,
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

export class ModerationService {
  constructor(private db: AppDatabase) {}

  /**
   * Blocks `blockedId` from `blockerId`. Idempotent: the ordered pair is
   * unique and the insert is `ON CONFLICT DO NOTHING`, so a repeat writes
   * nothing rather than failing or stacking a second row.
   */
  async blockUser(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) {
      throw new CannotModerateSelfError("You cannot block yourself");
    }

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
}