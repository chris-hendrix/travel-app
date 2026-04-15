import {
  tripGuests,
  payments,
  type TripGuest,
} from "@/db/schema/index.js";
import { eq, and, isNull, count } from "drizzle-orm";
import type { CreateGuestInput, UpdateGuestInput } from "@journiful/shared/schemas";
import type { AppDatabase } from "@/types/index.js";
import type { IPermissionsService } from "./permissions.service.js";
import {
  GuestNotFoundError,
  GuestHasPaymentsError,
  PermissionDeniedError,
  TripLockedError,
} from "../errors.js";

export interface IGuestService {
  createGuest(
    userId: string,
    tripId: string,
    data: CreateGuestInput,
  ): Promise<TripGuest>;

  getGuestsByTrip(tripId: string): Promise<TripGuest[]>;

  updateGuest(
    userId: string,
    guestId: string,
    data: UpdateGuestInput,
  ): Promise<TripGuest>;

  deleteGuest(userId: string, guestId: string): Promise<void>;
}

export class GuestService implements IGuestService {
  constructor(
    private db: AppDatabase,
    private permissionsService: IPermissionsService,
  ) {}

  async createGuest(
    userId: string,
    tripId: string,
    data: CreateGuestInput,
  ): Promise<TripGuest> {
    const isLocked = await this.permissionsService.isTripLocked(tripId);
    if (isLocked) throw new TripLockedError();

    const isMember = await this.permissionsService.isMember(userId, tripId);
    if (!isMember) {
      throw new PermissionDeniedError(
        "Permission denied: only trip members can add guests",
      );
    }

    const [guest] = await this.db
      .insert(tripGuests)
      .values({
        tripId,
        name: data.name,
        createdBy: userId,
      })
      .returning();

    if (!guest) {
      throw new Error("Failed to create guest");
    }

    return guest;
  }

  async getGuestsByTrip(tripId: string): Promise<TripGuest[]> {
    return this.db
      .select()
      .from(tripGuests)
      .where(eq(tripGuests.tripId, tripId));
  }

  async updateGuest(
    userId: string,
    guestId: string,
    data: UpdateGuestInput,
  ): Promise<TripGuest> {
    const [existing] = await this.db
      .select({
        id: tripGuests.id,
        tripId: tripGuests.tripId,
        createdBy: tripGuests.createdBy,
      })
      .from(tripGuests)
      .where(eq(tripGuests.id, guestId))
      .limit(1);

    if (!existing) {
      throw new GuestNotFoundError();
    }

    const isLocked = await this.permissionsService.isTripLocked(existing.tripId);
    if (isLocked) throw new TripLockedError();

    const canModify = await this.canModifyGuest(userId, existing);
    if (!canModify) {
      throw new PermissionDeniedError(
        "Permission denied: only guest creator or organizers can edit guests",
      );
    }

    const [updated] = await this.db
      .update(tripGuests)
      .set({
        name: data.name,
        updatedAt: new Date(),
      })
      .where(eq(tripGuests.id, guestId))
      .returning();

    if (!updated) {
      throw new GuestNotFoundError();
    }

    return updated;
  }

  async deleteGuest(userId: string, guestId: string): Promise<void> {
    const [existing] = await this.db
      .select({
        id: tripGuests.id,
        tripId: tripGuests.tripId,
        createdBy: tripGuests.createdBy,
      })
      .from(tripGuests)
      .where(eq(tripGuests.id, guestId))
      .limit(1);

    if (!existing) {
      throw new GuestNotFoundError();
    }

    const isLocked = await this.permissionsService.isTripLocked(existing.tripId);
    if (isLocked) throw new TripLockedError();

    const canModify = await this.canModifyGuest(userId, existing);
    if (!canModify) {
      throw new PermissionDeniedError(
        "Permission denied: only guest creator or organizers can delete guests",
      );
    }

    // Check if guest has non-deleted payments
    const [paymentCount] = await this.db
      .select({ value: count() })
      .from(payments)
      .where(
        and(eq(payments.guestId, guestId), isNull(payments.deletedAt)),
      );

    if ((paymentCount?.value ?? 0) > 0) {
      throw new GuestHasPaymentsError();
    }

    await this.db.delete(tripGuests).where(eq(tripGuests.id, guestId));
  }

  private async canModifyGuest(
    userId: string,
    guest: { tripId: string; createdBy: string },
  ): Promise<boolean> {
    if (guest.createdBy === userId) return true;
    return this.permissionsService.isOrganizer(userId, guest.tripId);
  }
}
