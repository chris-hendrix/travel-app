import {
  accommodations,
  trips,
  type Accommodation,
} from "@/db/schema/index.js";
import { eq, and, isNull, count, getTableColumns } from "drizzle-orm";
import type {
  CreateAccommodationInput,
  UpdateAccommodationInput,
} from "@journiful/shared/schemas";
import type { AppDatabase } from "@/types/index.js";
import type { IPermissionsService } from "./permissions.service.js";
import {
  AccommodationNotFoundError,
  AccommodationLimitExceededError,
  PermissionDeniedError,
  TripNotFoundError,
  InvalidDateRangeError,
  TripLockedError,
} from "../errors.js";

/**
 * Accommodation Service Interface
 * Defines the contract for accommodation management operations
 */
export interface IAccommodationService {
  /**
   * Creates a new accommodation for a trip
   * @param userId - The ID of the user creating the accommodation
   * @param tripId - The ID of the trip
   * @param data - The accommodation creation data
   * @returns Promise that resolves to the created accommodation
   * @throws TripNotFoundError if trip not found
   * @throws PermissionDeniedError if user lacks permission (organizer only)
   * @throws InvalidDateRangeError if checkOut is before checkIn
   */
  createAccommodation(
    userId: string,
    tripId: string,
    data: CreateAccommodationInput,
  ): Promise<Accommodation>;

  /**
   * Gets an accommodation by ID
   * @param accommodationId - The UUID of the accommodation to retrieve
   * @returns Promise that resolves to the accommodation, or null if not found or soft-deleted
   */
  getAccommodation(accommodationId: string): Promise<Accommodation | null>;

  /**
   * Gets all accommodations for a trip
   * @param tripId - The UUID of the trip
   * @param includeDeleted - Whether to include soft-deleted accommodations (default: false)
   * @returns Promise that resolves to array of accommodations
   */
  getAccommodationsByTrip(
    tripId: string,
    includeDeleted?: boolean,
  ): Promise<Accommodation[]>;

  /**
   * Updates an accommodation
   * @param userId - The ID of the user updating the accommodation
   * @param accommodationId - The UUID of the accommodation to update
   * @param data - The accommodation update data
   * @returns Promise that resolves to the updated accommodation
   * @throws AccommodationNotFoundError if accommodation not found
   * @throws PermissionDeniedError if user lacks permission (organizer only)
   * @throws InvalidDateRangeError if checkOut is before checkIn
   */
  updateAccommodation(
    userId: string,
    accommodationId: string,
    data: UpdateAccommodationInput,
  ): Promise<Accommodation>;

  /**
   * Deletes an accommodation (soft delete)
   * @param userId - The ID of the user deleting the accommodation
   * @param accommodationId - The UUID of the accommodation to delete
   * @returns Promise that resolves when the accommodation is deleted
   * @throws AccommodationNotFoundError if accommodation not found
   * @throws PermissionDeniedError if user lacks permission (organizer only)
   */
  deleteAccommodation(userId: string, accommodationId: string): Promise<void>;

  /**
   * Restores a soft-deleted accommodation
   * @param userId - The ID of the user restoring the accommodation
   * @param accommodationId - The UUID of the accommodation to restore
   * @returns Promise that resolves to the restored accommodation
   * @throws AccommodationNotFoundError if accommodation not found
   * @throws PermissionDeniedError if user lacks permission (organizer only)
   */
  restoreAccommodation(
    userId: string,
    accommodationId: string,
  ): Promise<Accommodation>;
}

/**
 * Accommodation Service Implementation
 * Handles accommodation creation, management, and soft delete operations
 * All operations require organizer permissions
 */
export class AccommodationService implements IAccommodationService {
  constructor(
    private db: AppDatabase,
    private permissionsService: IPermissionsService,
  ) {}

  /**
   * Creates a new accommodation for a trip
   * Only organizers can add accommodations
   * @param userId - The ID of the user creating the accommodation
   * @param tripId - The ID of the trip
   * @param data - The accommodation creation data
   * @returns The created accommodation
   * @throws TripNotFoundError if trip not found
   * @throws PermissionDeniedError if user lacks permission (organizer only)
   * @throws InvalidDateRangeError if checkOut is before checkIn
   */
  async createAccommodation(
    userId: string,
    tripId: string,
    data: CreateAccommodationInput,
  ): Promise<Accommodation> {
    // Check if trip is locked (past end date)
    const isLocked = await this.permissionsService.isTripLocked(tripId);
    if (isLocked) throw new TripLockedError();

    // Check if user can add accommodations to this trip (organizer only)
    const canAdd = await this.permissionsService.canAddAccommodation(
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
        "Permission denied: only organizers can add accommodations",
      );
    }

    // Validate date range
    const checkIn = new Date(data.checkIn);
    const checkOut = new Date(data.checkOut);
    if (checkOut <= checkIn) {
      throw new InvalidDateRangeError(
        "Check-out date must be after check-in date",
      );
    }

    // Check accommodation count limit
    const [accCount] = await this.db
      .select({ value: count() })
      .from(accommodations)
      .where(
        and(
          eq(accommodations.tripId, tripId),
          isNull(accommodations.deletedAt),
        ),
      );
    if ((accCount?.value ?? 0) >= 10) {
      throw new AccommodationLimitExceededError(
        "Maximum 10 accommodations per trip reached.",
      );
    }

    // Create the accommodation
    const [accommodation] = await this.db
      .insert(accommodations)
      .values({
        tripId,
        createdBy: userId,
        name: data.name,
        address: data.address || null,
        description: data.description || null,
        checkIn: new Date(data.checkIn),
        checkOut: new Date(data.checkOut),
        links: data.links || null,
      })
      .returning();

    if (!accommodation) {
      throw new Error("Failed to create accommodation");
    }

    return accommodation;
  }

  /**
   * Gets an accommodation by ID
   * Returns null if accommodation is soft-deleted
   * @param accommodationId - The UUID of the accommodation to retrieve
   * @returns The accommodation, or null if not found or soft-deleted
   */
  async getAccommodation(
    accommodationId: string,
  ): Promise<Accommodation | null> {
    const result = await this.db
      .select(getTableColumns(accommodations))
      .from(accommodations)
      .where(
        and(
          eq(accommodations.id, accommodationId),
          isNull(accommodations.deletedAt),
        ),
      )
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Gets all accommodations for a trip
   * Excludes soft-deleted accommodations by default
   * @param tripId - The UUID of the trip
   * @param includeDeleted - Whether to include soft-deleted accommodations (default: false)
   * @returns Array of accommodations
   */
  async getAccommodationsByTrip(
    tripId: string,
    includeDeleted = false,
  ): Promise<Accommodation[]> {
    const conditions = [eq(accommodations.tripId, tripId)];

    if (!includeDeleted) {
      conditions.push(isNull(accommodations.deletedAt));
    }

    return this.db
      .select({
        id: accommodations.id,
        tripId: accommodations.tripId,
        createdBy: accommodations.createdBy,
        name: accommodations.name,
        address: accommodations.address,
        description: accommodations.description,
        checkIn: accommodations.checkIn,
        checkOut: accommodations.checkOut,
        links: accommodations.links,
        deletedAt: accommodations.deletedAt,
        deletedBy: accommodations.deletedBy,
        createdAt: accommodations.createdAt,
        updatedAt: accommodations.updatedAt,
      })
      .from(accommodations)
      .where(and(...conditions));
  }

  /**
   * Updates an accommodation
   * Only organizers can update accommodations
   * @param userId - The ID of the user updating the accommodation
   * @param accommodationId - The UUID of the accommodation to update
   * @param data - The accommodation update data
   * @returns The updated accommodation
   * @throws AccommodationNotFoundError if accommodation not found
   * @throws PermissionDeniedError if user lacks permission (organizer only)
   * @throws InvalidDateRangeError if checkOut is before checkIn
   */
  async updateAccommodation(
    userId: string,
    accommodationId: string,
    data: UpdateAccommodationInput,
  ): Promise<Accommodation> {
    // Load existing accommodation first (need tripId for lock check and data for validation)
    const [existingAccommodation] = await this.db
      .select({
        id: accommodations.id,
        tripId: accommodations.tripId,
        checkIn: accommodations.checkIn,
        checkOut: accommodations.checkOut,
      })
      .from(accommodations)
      .where(
        and(
          eq(accommodations.id, accommodationId),
          isNull(accommodations.deletedAt),
        ),
      )
      .limit(1);

    if (!existingAccommodation) {
      throw new AccommodationNotFoundError();
    }

    // Check if trip is locked and permissions in parallel (both use tripId which we already have)
    const [isLocked, canEdit] = await Promise.all([
      this.permissionsService.isTripLocked(existingAccommodation.tripId),
      this.permissionsService.canEditAccommodationWithData(
        userId,
        existingAccommodation.tripId,
      ),
    ]);
    if (isLocked) throw new TripLockedError();
    if (!canEdit) {
      throw new PermissionDeniedError(
        "Permission denied: only organizers can edit accommodations",
      );
    }

    // Validate date range if both dates will be set after update
    const finalCheckIn = data.checkIn
      ? new Date(data.checkIn)
      : new Date(existingAccommodation.checkIn);
    const finalCheckOut = data.checkOut
      ? new Date(data.checkOut)
      : new Date(existingAccommodation.checkOut);

    if (finalCheckOut <= finalCheckIn) {
      throw new InvalidDateRangeError(
        "Check-out date must be after check-in date",
      );
    }

    // Build update data (Record<string, unknown> needed due to exactOptionalPropertyTypes)
    const updateData: Record<string, unknown> = {
      ...data,
      ...(data.checkIn && { checkIn: new Date(data.checkIn) }),
      ...(data.checkOut && { checkOut: new Date(data.checkOut) }),
      updatedAt: new Date(),
    };

    // Perform update
    const result = await this.db
      .update(accommodations)
      .set(updateData)
      .where(eq(accommodations.id, accommodationId))
      .returning();

    const updatedAccommodation = result[0];
    if (!updatedAccommodation) {
      throw new AccommodationNotFoundError();
    }

    return updatedAccommodation;
  }

  /**
   * Deletes an accommodation (soft delete - sets deletedAt and deletedBy)
   * Only organizers can delete accommodations
   * @param userId - The ID of the user deleting the accommodation
   * @param accommodationId - The UUID of the accommodation to delete
   * @returns Promise that resolves when the accommodation is deleted
   * @throws AccommodationNotFoundError if accommodation not found
   * @throws PermissionDeniedError if user lacks permission (organizer only)
   */
  async deleteAccommodation(
    userId: string,
    accommodationId: string,
  ): Promise<void> {
    // Load accommodation to get tripId for lock check
    const [accRecord] = await this.db
      .select({ id: accommodations.id, tripId: accommodations.tripId })
      .from(accommodations)
      .where(
        and(
          eq(accommodations.id, accommodationId),
          isNull(accommodations.deletedAt),
        ),
      )
      .limit(1);

    if (!accRecord) {
      throw new AccommodationNotFoundError();
    }

    // Check if trip is locked and permissions in parallel
    const [isLocked, canDelete] = await Promise.all([
      this.permissionsService.isTripLocked(accRecord.tripId),
      this.permissionsService.canDeleteAccommodationWithData(
        userId,
        accRecord.tripId,
      ),
    ]);
    if (isLocked) throw new TripLockedError();
    if (!canDelete) {
      throw new PermissionDeniedError(
        "Permission denied: only organizers can delete accommodations",
      );
    }

    // Perform soft delete
    const result = await this.db
      .update(accommodations)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(accommodations.id, accommodationId))
      .returning();

    if (!result[0]) {
      throw new AccommodationNotFoundError();
    }
  }

  /**
   * Restores a soft-deleted accommodation
   * Only organizers can restore accommodations
   * @param userId - The ID of the user restoring the accommodation
   * @param accommodationId - The UUID of the accommodation to restore
   * @returns The restored accommodation
   * @throws AccommodationNotFoundError if accommodation not found
   * @throws PermissionDeniedError if user lacks permission (organizer only)
   */
  async restoreAccommodation(
    userId: string,
    accommodationId: string,
  ): Promise<Accommodation> {
    // Load accommodation to get tripId
    const [accommodation] = await this.db
      .select({ id: accommodations.id, tripId: accommodations.tripId })
      .from(accommodations)
      .where(eq(accommodations.id, accommodationId))
      .limit(1);

    if (!accommodation) {
      throw new AccommodationNotFoundError();
    }

    // Check if user is organizer of the trip
    const isOrganizer = await this.permissionsService.isOrganizer(
      userId,
      accommodation.tripId,
    );
    if (!isOrganizer) {
      throw new PermissionDeniedError(
        "Permission denied: only organizers can restore accommodations",
      );
    }

    // Check accommodation count limit before restoring
    const [accCount] = await this.db
      .select({ value: count() })
      .from(accommodations)
      .where(
        and(
          eq(accommodations.tripId, accommodation.tripId),
          isNull(accommodations.deletedAt),
        ),
      );
    if ((accCount?.value ?? 0) >= 10) {
      throw new AccommodationLimitExceededError(
        "Maximum 10 accommodations per trip reached.",
      );
    }

    // Restore accommodation
    const result = await this.db
      .update(accommodations)
      .set({
        deletedAt: null,
        deletedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(accommodations.id, accommodationId))
      .returning();

    if (!result[0]) {
      throw new AccommodationNotFoundError();
    }

    return result[0];
  }
}
