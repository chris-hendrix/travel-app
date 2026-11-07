import {
  savedPlaces,
  trips,
  type SavedPlace,
} from "@/db/schema/index.js";
import { eq, sql, desc } from "drizzle-orm";
import type {
  CreateSavedPlaceInput,
  UpdateSavedPlaceInput,
} from "@journiful/shared/schemas";
import type { PlaceSummary } from "@journiful/shared/types";
import type { AppDatabase } from "@/types/index.js";
import type { IPermissionsService } from "./permissions.service.js";
import type {
  PlaceCacheService,
  PlaceResolveMode,
} from "./place-cache.service.js";
import { attachPlaces } from "./place-attach.service.js";
import {
  SavedPlaceNotFoundError,
  SavedPlaceDuplicateError,
  PermissionDeniedError,
  TripNotFoundError,
} from "../errors.js";

/** Postgres' class for a unique-constraint violation. */
const UNIQUE_VIOLATION = "23505";

/** The partial unique index that holds one save per member and place. */
const MEMBER_PLACE_INDEX = "saved_places_member_place_unique";

/**
 * A field of the Postgres error behind `error`, if there is one.
 *
 * `pg` puts `code` and `constraint` on the driver error; Drizzle wraps
 * that error in its own, so the fields can sit on the error itself or on
 * its `cause`. member-travel.service.ts unwraps the same two places for
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
 * Did this error come from the member-place index refusing a write?
 *
 * A 23505 whose constraint name is present has to name this index. When
 * the name is absent — a driver that does not report it — a 23505 on this
 * table can only be this index anyway: the table's other unique key is
 * `id`, a random UUID, and a collision there is not a thing that happens.
 * Typed rows (`place_id` NULL) never reach the index at all — the partial
 * predicate excludes them — so a repeated typed save is not a conflict.
 */
function isMemberPlaceConflict(error: unknown): boolean {
  if (pgErrorField(error, "code") !== UNIQUE_VIOLATION) return false;
  const constraint = pgErrorField(error, "constraint");
  return constraint === undefined || constraint === MEMBER_PLACE_INDEX;
}

/** A saved place row with its resolved `place` summary attached. */
export type SavedPlaceWithPlace = SavedPlace & {
  place: PlaceSummary | null;
};

/**
 * Saved Place Service Interface
 * Defines the contract for saved-place management operations
 */
export interface ISavedPlaceService {
  /**
   * Saves a place to a trip (typed word or Google provider pair)
   * @param userId - The ID of the user saving the place
   * @param tripId - The ID of the trip
   * @param data - The saved-place creation data
   * @returns Promise that resolves to the created saved place
   * @throws TripNotFoundError if trip not found
   * @throws PermissionDeniedError if user is not a member
   * @throws SavedPlaceDuplicateError if the member already saved this place
   */
  createSavedPlace(
    userId: string,
    tripId: string,
    data: CreateSavedPlaceInput,
  ): Promise<SavedPlace>;

  /**
   * Gets a saved place by ID
   * @param savedPlaceId - The UUID of the saved place to retrieve
   * @returns Promise that resolves to the saved place, or null if not found
   */
  getSavedPlace(savedPlaceId: string): Promise<SavedPlace | null>;

  /**
   * Gets all saved places for a trip, pinned first then newest, with the
   * cached `place` summary attached per row (null for typed rows)
   * @param tripId - The UUID of the trip
   * @param placeCache - The place-cache service the attach reads through
   * @param mode - The place-resolve mode (default: "list")
   * @returns Promise that resolves to array of saved places with `place`
   */
  getSavedPlacesByTrip(
    tripId: string,
    placeCache: PlaceCacheService,
    mode?: PlaceResolveMode,
  ): Promise<SavedPlaceWithPlace[]>;

  /**
   * Updates a saved place
   * @param userId - The ID of the user updating the saved place
   * @param savedPlaceId - The UUID of the saved place to update
   * @param data - The saved-place update data
   * @returns Promise that resolves to the updated saved place
   * @throws SavedPlaceNotFoundError if saved place not found
   * @throws PermissionDeniedError if user is neither author nor organizer
   * @throws SavedPlaceDuplicateError if the update points the row at a
   *   Google place the member already saved in another trip row
   */
  updateSavedPlace(
    userId: string,
    savedPlaceId: string,
    data: UpdateSavedPlaceInput,
  ): Promise<SavedPlace>;

  /**
   * Deletes a saved place (hard delete — the table carries no deletedAt)
   * @param userId - The ID of the user deleting the saved place
   * @param savedPlaceId - The UUID of the saved place to delete
   * @returns Promise that resolves when the saved place is deleted
   * @throws SavedPlaceNotFoundError if saved place not found
   * @throws PermissionDeniedError if user is neither author nor organizer
   */
  deleteSavedPlace(userId: string, savedPlaceId: string): Promise<void>;

  /**
   * Pins or unpins a saved place (organizer only)
   * @param userId - The ID of the user pinning the saved place
   * @param savedPlaceId - The UUID of the saved place to pin
   * @param pinned - True to pin (sets pinnedAt/pinnedBy), false to unpin
   * @returns Promise that resolves to the updated saved place
   * @throws SavedPlaceNotFoundError if saved place not found
   * @throws PermissionDeniedError if user is not an organizer
   */
  setSavedPlacePinned(
    userId: string,
    savedPlaceId: string,
    pinned: boolean,
  ): Promise<SavedPlace>;
}

/**
 * Saved Place Service Implementation
 * Handles member-saved spots per trip: typed words or Google place pairs,
 * pinnable by organizers. Any member can save; author or organizer edits.
 */
export class SavedPlaceService implements ISavedPlaceService {
  constructor(
    private db: AppDatabase,
    private permissionsService: IPermissionsService,
  ) {}

  /**
   * Saves a place to a trip
   * Any member (with any status) can save a place
   * @param userId - The ID of the user saving the place
   * @param tripId - The ID of the trip
   * @param data - The saved-place creation data
   * @returns The created saved place
   * @throws TripNotFoundError if trip not found
   * @throws PermissionDeniedError if user is not a member
   * @throws SavedPlaceDuplicateError if the member already saved this place
   */
  async createSavedPlace(
    userId: string,
    tripId: string,
    data: CreateSavedPlaceInput,
  ): Promise<SavedPlace> {
    // Check if user can add saved places to this trip (any member can)
    const canAdd = await this.permissionsService.canAddSavedPlace(
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
        "Permission denied: only members can save places",
      );
    }

    // The pair is both-or-neither (the schema enforces it at the route);
    // store it only when both halves arrived, so a half pair can never
    // land in the columns the attach reads.
    const hasPair = data.placeProvider != null && data.placeId != null;

    // The same member saving the same Google place twice is refused by
    // `saved_places_member_place_unique` — the read-then-write no amount
    // of checking can order, so the index is the guard and this catch is
    // what turns its 23505 into the 409 the routes surface.
    let savedPlace: SavedPlace | undefined;
    try {
      [savedPlace] = await this.db
        .insert(savedPlaces)
        .values({
          tripId,
          createdBy: userId,
          name: data.name,
          address: data.address ?? null,
          placeProvider: hasPair ? data.placeProvider! : null,
          placeId: hasPair ? data.placeId! : null,
          placeType: data.placeType ?? "misc",
          description: data.description ?? null,
        })
        .returning();
    } catch (error) {
      if (isMemberPlaceConflict(error)) {
        throw new SavedPlaceDuplicateError(
          "You have already saved this place to this trip",
        );
      }
      throw error;
    }

    if (!savedPlace) {
      throw new Error("Failed to create saved place");
    }

    return savedPlace;
  }

  /**
   * Gets a saved place by ID
   * @param savedPlaceId - The UUID of the saved place to retrieve
   * @returns The saved place, or null if not found
   */
  async getSavedPlace(savedPlaceId: string): Promise<SavedPlace | null> {
    const result = await this.db
      .select()
      .from(savedPlaces)
      .where(eq(savedPlaces.id, savedPlaceId))
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Gets all saved places for a trip, pinned first then newest, with the
   * cached `place` summary attached per row.
   *
   * The order is the clause the feature promises: `pinned_at DESC NULLS
   * LAST` (newer pins lead, unpinned rows never lead a mixed list), then
   * `created_at DESC` among equals. The attach degrades per row — a pair
   * with no cached details, or an unreachable provider, resolves to null
   * and never throws — while a typed row (`place_id` NULL) resolves to
   * null without touching the cache at all.
   * @param tripId - The UUID of the trip
   * @param placeCache - The place-cache service the attach reads through
   * @param mode - The place-resolve mode (default: "list")
   * @returns Array of saved places with `place`
   */
  async getSavedPlacesByTrip(
    tripId: string,
    placeCache: PlaceCacheService,
    mode: PlaceResolveMode = "list",
  ): Promise<SavedPlaceWithPlace[]> {
    const rows = await this.db
      .select()
      .from(savedPlaces)
      .where(eq(savedPlaces.tripId, tripId))
      .orderBy(
        sql`${savedPlaces.pinnedAt} DESC NULLS LAST`,
        desc(savedPlaces.createdAt),
      );

    return attachPlaces(rows, placeCache, mode);
  }

  /**
   * Updates a saved place
   * The author can edit their own; organizers can edit anyone's
   * @param userId - The ID of the user updating the saved place
   * @param savedPlaceId - The UUID of the saved place to update
   * @param data - The saved-place update data
   * @returns The updated saved place
   * @throws SavedPlaceNotFoundError if saved place not found
   * @throws PermissionDeniedError if user is neither author nor organizer
   */
  async updateSavedPlace(
    userId: string,
    savedPlaceId: string,
    data: UpdateSavedPlaceInput,
  ): Promise<SavedPlace> {
    const [existing] = await this.db
      .select({ id: savedPlaces.id })
      .from(savedPlaces)
      .where(eq(savedPlaces.id, savedPlaceId))
      .limit(1);

    if (!existing) {
      throw new SavedPlaceNotFoundError();
    }

    const canEdit = await this.permissionsService.canEditSavedPlace(
      userId,
      savedPlaceId,
    );
    if (!canEdit) {
      throw new PermissionDeniedError(
        "Permission denied: only the author or trip organizers can edit saved places",
      );
    }

    // Build update data (Record<string, unknown> needed due to exactOptionalPropertyTypes)
    const updateData: Record<string, unknown> = {
      ...(data.name !== undefined ? { name: data.name } : null),
      ...(data.address !== undefined ? { address: data.address ?? null } : null),
      ...(data.description !== undefined
        ? { description: data.description ?? null }
        : null),
      ...(data.placeType !== undefined ? { placeType: data.placeType } : null),
      updatedAt: new Date(),
    };

    // The pair patches three ways, decided by key presence (the schema
    // enforces both-or-neither, so a lone half never reaches here):
    //   - neither key present → the stored pair is untouched;
    //   - both keys with values → the pair is replaced;
    //   - both keys explicitly null → the link is cleared (the edit
    //     form's unlink), which typed-word rows carry.
    // Nulls land in the columns only when the key arrived, so an absent
    // key can never erase a stored pair.
    if (data.placeProvider !== undefined) {
      updateData.placeProvider = data.placeProvider ?? null;
    }
    if (data.placeId !== undefined) {
      updateData.placeId = data.placeId ?? null;
    }

    // The same member pointing this row at the Google place already
    // saved to another row of the trip is refused by
    // `saved_places_member_place_unique` — the create path's catch is
    // the guard here too, and turns its 23505 into the 409 the routes
    // surface.
    const [updated] = await this.db
      .update(savedPlaces)
      .set(updateData)
      .where(eq(savedPlaces.id, savedPlaceId))
      .returning()
      .catch((error: unknown) => {
        if (isMemberPlaceConflict(error)) {
          throw new SavedPlaceDuplicateError(
            "You have already saved this place to this trip",
          );
        }
        throw error;
      });

    if (!updated) {
      throw new SavedPlaceNotFoundError();
    }

    return updated;
  }

  /**
   * Deletes a saved place (hard delete — the table carries no deletedAt)
   * The author can delete their own; organizers can delete anyone's
   * @param userId - The ID of the user deleting the saved place
   * @param savedPlaceId - The UUID of the saved place to delete
   * @throws SavedPlaceNotFoundError if saved place not found
   * @throws PermissionDeniedError if user is neither author nor organizer
   */
  async deleteSavedPlace(userId: string, savedPlaceId: string): Promise<void> {
    const [existing] = await this.db
      .select({ id: savedPlaces.id })
      .from(savedPlaces)
      .where(eq(savedPlaces.id, savedPlaceId))
      .limit(1);

    if (!existing) {
      throw new SavedPlaceNotFoundError();
    }

    const canDelete = await this.permissionsService.canDeleteSavedPlace(
      userId,
      savedPlaceId,
    );
    if (!canDelete) {
      throw new PermissionDeniedError(
        "Permission denied: only the author or trip organizers can delete saved places",
      );
    }

    const result = await this.db
      .delete(savedPlaces)
      .where(eq(savedPlaces.id, savedPlaceId))
      .returning({ id: savedPlaces.id });

    if (!result[0]) {
      throw new SavedPlaceNotFoundError();
    }
  }

  /**
   * Pins or unpins a saved place
   * Only organizers can pin — the pin is the trip's endorsement, not the
   * saver's, so authorship grants nothing here
   * @param userId - The ID of the user pinning the saved place
   * @param savedPlaceId - The UUID of the saved place to pin
   * @param pinned - True to pin (sets pinnedAt/pinnedBy), false to unpin
   * @returns The updated saved place
   * @throws SavedPlaceNotFoundError if saved place not found
   * @throws PermissionDeniedError if user is not an organizer
   */
  async setSavedPlacePinned(
    userId: string,
    savedPlaceId: string,
    pinned: boolean,
  ): Promise<SavedPlace> {
    const [existing] = await this.db
      .select({ id: savedPlaces.id, tripId: savedPlaces.tripId })
      .from(savedPlaces)
      .where(eq(savedPlaces.id, savedPlaceId))
      .limit(1);

    if (!existing) {
      throw new SavedPlaceNotFoundError();
    }

    const canPin = await this.permissionsService.canPinSavedPlace(
      userId,
      existing.tripId,
    );
    if (!canPin) {
      throw new PermissionDeniedError(
        "Permission denied: only organizers can pin saved places",
      );
    }

    const [updated] = await this.db
      .update(savedPlaces)
      .set(
        pinned
          ? { pinnedAt: new Date(), pinnedBy: userId, updatedAt: new Date() }
          : { pinnedAt: null, pinnedBy: null, updatedAt: new Date() },
      )
      .where(eq(savedPlaces.id, savedPlaceId))
      .returning();

    if (!updated) {
      throw new SavedPlaceNotFoundError();
    }

    return updated;
  }
}
