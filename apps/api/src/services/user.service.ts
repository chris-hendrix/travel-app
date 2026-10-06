import {
  users,
  pushSubscriptions,
  type User,
} from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";
import { eq } from "drizzle-orm";
import { UserNotFoundError } from "../errors.js";

/**
 * What a deleted account is called in a trip roster. `display_name` is NOT NULL
 * and the `members` row survives the account (it is a record of the trip), so
 * the name cannot simply go — the seat stays under a nameless number instead.
 */
export const DELETED_DISPLAY_NAME = "Deleted user";

/**
 * User Service Interface
 * Account-level operations that outlive a request. Profile updates live on
 * AuthService (they are part of authentication); deletion lives here because
 * it is its own contract.
 */
export interface IUserService {
  /**
   * Deletes an account: anonymizes the row, tombstones the phone number so it
   * can be signed up again, and drops the push subscriptions. The row itself
   * stays, because `members.user_id`, `payments.created_by` and
   * `push_subscriptions.user_id` reference it and the trip's records of the
   * person must outlive the person.
   * @param userId - The UUID of the user to delete
   * @throws UserNotFoundError if no such user exists
   */
  deleteAccount(userId: string): Promise<void>;
}

/**
 * User Service Implementation
 */
export class UserService implements IUserService {
  constructor(private db: AppDatabase) {}

  /**
   * Soft-deletes an account by anonymizing the row rather than dropping it.
   *
   * Hard-deleting is not an option: `members.user_id` and
   * `push_subscriptions.user_id` cascade, so `DELETE FROM users` would take the
   * trip rosters with it — and the payments rows those rosters carry are the
   * record of who paid for what, which the trip keeps (D3).
   *
   * The phone number is unique and *is* the account, so it cannot be blanked
   * without losing the row: it becomes a `deleted:<uuid>` tombstone, which
   * releases the number for a new signup while keeping every row that points
   * at this user intact.
   */
  async deleteAccount(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!existing[0]) {
        throw new UserNotFoundError();
      }

      // A push subscription is personal data pointing at a device; drop it
      // before the row is anonymized rather than relying on a cascade that
      // only a hard delete would trigger.
      await tx
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));

      const updated: User[] = await tx
        .update(users)
        .set({
          displayName: DELETED_DISPLAY_NAME,
          profilePhotoUrl: null,
          handles: null,
          // A unique, unauthenticated capability: leaving it alive would keep
          // a public calendar feed serving a deleted account.
          calendarToken: null,
          phoneNumber: `deleted:${userId}`,
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      if (!updated[0]) {
        throw new UserNotFoundError();
      }
    });
  }
}
