import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  savedPlaces,
  placeCache,
} from "@/db/schema/index.js";
import { eq, or } from "drizzle-orm";
import { SavedPlaceService } from "@/services/saved-place.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import { PlaceCacheService } from "@/services/place-cache.service.js";
import { generateUniquePhone } from "../test-utils.js";
import {
  SavedPlaceNotFoundError,
  SavedPlaceDuplicateError,
  PermissionDeniedError,
  TripNotFoundError,
} from "@/errors.js";

// Create service instances with db for testing
const permissionsService = new PermissionsService(db);
const savedPlaceService = new SavedPlaceService(db, permissionsService);

const TEST_PLACE_ID = "ChIJ-saved-place-test-1";

describe("saved-place.service", () => {
  // Use unique test data for each test run to enable parallel execution
  let organizerPhone: string;
  let memberPhone: string;
  let otherMemberPhone: string;
  let nonMemberPhone: string;

  let organizerId: string;
  let memberId: string;
  let otherMemberId: string;
  let nonMemberId: string;

  let tripId: string;

  // Clean up test data (safe for parallel execution)
  const cleanup = async () => {
    if (tripId) {
      await db.delete(savedPlaces).where(eq(savedPlaces.tripId, tripId));
      await db.delete(members).where(eq(members.tripId, tripId));
      await db.delete(trips).where(eq(trips.id, tripId));
    }
    await db.delete(placeCache).where(eq(placeCache.placeId, TEST_PLACE_ID));

    const phoneNumbers = [
      organizerPhone,
      memberPhone,
      otherMemberPhone,
      nonMemberPhone,
    ].filter(Boolean);

    if (phoneNumbers.length > 0) {
      await db
        .delete(users)
        .where(or(...phoneNumbers.map((phone) => eq(users.phoneNumber, phone))));
    }
  };

  beforeEach(async () => {
    organizerPhone = generateUniquePhone();
    memberPhone = generateUniquePhone();
    otherMemberPhone = generateUniquePhone();
    nonMemberPhone = generateUniquePhone();

    await cleanup();

    const mkUser = async (phone: string, displayName: string) => {
      const [row] = await db
        .insert(users)
        .values({ phoneNumber: phone, displayName, timezone: "UTC" })
        .returning();
      return row!.id;
    };

    organizerId = await mkUser(organizerPhone, "Test Organizer");
    memberId = await mkUser(memberPhone, "Test Member");
    otherMemberId = await mkUser(otherMemberPhone, "Test Other Member");
    nonMemberId = await mkUser(nonMemberPhone, "Test Non-Member");

    const [trip] = await db
      .insert(trips)
      .values({
        name: "Test Trip",
        destination: "Test Destination",
        preferredTimezone: "UTC",
        createdBy: organizerId,
      })
      .returning();
    tripId = trip!.id;

    // Organizer is the trip creator and a going member (organizer flag).
    await db.insert(members).values({
      tripId,
      userId: organizerId,
      status: "going",
      isOrganizer: true,
    });
    await db.insert(members).values({
      tripId,
      userId: memberId,
      status: "going",
    });
    await db.insert(members).values({
      tripId,
      userId: otherMemberId,
      status: "going",
    });
  });

  afterEach(cleanup);

  describe("createSavedPlace", () => {
    it("lets a member save a typed place in their own trip", async () => {
      const place = await savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Sunset viewpoint",
      });

      expect(place).toBeDefined();
      expect(place.tripId).toBe(tripId);
      expect(place.createdBy).toBe(memberId);
      expect(place.name).toBe("Sunset viewpoint");
      expect(place.placeType).toBe("misc");
      expect(place.placeProvider).toBeNull();
      expect(place.placeId).toBeNull();
      expect(place.pinnedAt).toBeNull();
      expect(place.pinnedBy).toBeNull();
    });

    it("stores a Google provider pair when given", async () => {
      const place = await savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Café de Flore",
        address: "172 Bd Saint-Germain",
        placeProvider: "google",
        placeId: TEST_PLACE_ID,
        placeType: "food_and_drink",
      });

      expect(place.placeProvider).toBe("google");
      expect(place.placeId).toBe(TEST_PLACE_ID);
      expect(place.placeType).toBe("food_and_drink");
    });

    it("rejects a non-member with PermissionDeniedError", async () => {
      await expect(
        savedPlaceService.createSavedPlace(nonMemberId, tripId, {
          name: "Nowhere",
        }),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("rejects an unknown trip with TripNotFoundError", async () => {
      await expect(
        savedPlaceService.createSavedPlace(
          memberId,
          "00000000-0000-0000-0000-000000000000",
          { name: "Nowhere" },
        ),
      ).rejects.toThrow(TripNotFoundError);
    });

    it("rejects a duplicate save by the same member with a 409 SAVED_PLACE_DUPLICATE", async () => {
      await savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Café de Flore",
        placeProvider: "google",
        placeId: TEST_PLACE_ID,
      });

      const duplicate = savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Café de Flore (again)",
        placeProvider: "google",
        placeId: TEST_PLACE_ID,
      });
      await expect(duplicate).rejects.toThrow(SavedPlaceDuplicateError);

      try {
        await savedPlaceService.createSavedPlace(memberId, tripId, {
          name: "Café de Flore (third)",
          placeProvider: "google",
          placeId: TEST_PLACE_ID,
        });
        expect.unreachable("expected SAVED_PLACE_DUPLICATE");
      } catch (err) {
        const coded = err as { code?: string; statusCode?: number };
        expect(coded.code).toBe("SAVED_PLACE_DUPLICATE");
        expect(coded.statusCode).toBe(409);
      }
    });

    it("lets a different member save the same Google place", async () => {
      await savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Café de Flore",
        placeProvider: "google",
        placeId: TEST_PLACE_ID,
      });

      const other = await savedPlaceService.createSavedPlace(
        otherMemberId,
        tripId,
        {
          name: "Café de Flore",
          placeProvider: "google",
          placeId: TEST_PLACE_ID,
        },
      );

      expect(other.createdBy).toBe(otherMemberId);
    });

    it("never trips the unique index for typed places, even with the same name", async () => {
      const first = await savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Sunset viewpoint",
      });
      const second = await savedPlaceService.createSavedPlace(
        memberId,
        tripId,
        { name: "Sunset viewpoint" },
      );

      expect(first.id).not.toBe(second.id);
      expect(second.placeId).toBeNull();
    });
  });

  describe("updateSavedPlace", () => {
    it("lets the author edit their own saved place", async () => {
      const place = await savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Old name",
      });

      const updated = await savedPlaceService.updateSavedPlace(
        memberId,
        place.id,
        { name: "New name", description: "Worth the climb" },
      );

      expect(updated.name).toBe("New name");
      expect(updated.description).toBe("Worth the climb");
    });

    it("lets an organizer edit another member's saved place", async () => {
      const place = await savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Old name",
      });

      const updated = await savedPlaceService.updateSavedPlace(
        organizerId,
        place.id,
        { name: "Renamed by organizer" },
      );

      expect(updated.name).toBe("Renamed by organizer");
    });

    it("rejects a non-author non-organizer with PermissionDeniedError", async () => {
      const place = await savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Mine",
      });

      await expect(
        savedPlaceService.updateSavedPlace(otherMemberId, place.id, {
          name: "Theirs now",
        }),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("rejects an unknown id with SavedPlaceNotFoundError", async () => {
      await expect(
        savedPlaceService.updateSavedPlace(memberId, "00000000-0000-0000-0000-000000000000", {
          name: "Ghost",
        }),
      ).rejects.toThrow(SavedPlaceNotFoundError);
    });
  });

  describe("deleteSavedPlace", () => {
    it("lets the author delete their own saved place", async () => {
      const place = await savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Delete me",
      });

      await savedPlaceService.deleteSavedPlace(memberId, place.id);

      expect(await savedPlaceService.getSavedPlace(place.id)).toBeNull();
    });

    it("lets an organizer delete another member's saved place", async () => {
      const place = await savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Delete me",
      });

      await savedPlaceService.deleteSavedPlace(organizerId, place.id);

      expect(await savedPlaceService.getSavedPlace(place.id)).toBeNull();
    });

    it("rejects a non-author non-organizer with PermissionDeniedError", async () => {
      const place = await savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Not yours",
      });

      await expect(
        savedPlaceService.deleteSavedPlace(otherMemberId, place.id),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("rejects an unknown id with SavedPlaceNotFoundError", async () => {
      await expect(
        savedPlaceService.deleteSavedPlace(
          memberId,
          "00000000-0000-0000-0000-000000000000",
        ),
      ).rejects.toThrow(SavedPlaceNotFoundError);
    });
  });

  describe("setSavedPlacePinned", () => {
    it("lets an organizer pin and unpin a saved place", async () => {
      const place = await savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Pinnable",
      });

      const pinned = await savedPlaceService.setSavedPlacePinned(
        organizerId,
        place.id,
        true,
      );
      expect(pinned.pinnedAt).toBeInstanceOf(Date);
      expect(pinned.pinnedBy).toBe(organizerId);

      const unpinned = await savedPlaceService.setSavedPlacePinned(
        organizerId,
        place.id,
        false,
      );
      expect(unpinned.pinnedAt).toBeNull();
      expect(unpinned.pinnedBy).toBeNull();
    });

    it("rejects a non-organizer with PermissionDeniedError", async () => {
      const place = await savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Pinnable",
      });

      await expect(
        savedPlaceService.setSavedPlacePinned(memberId, place.id, true),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("rejects an unknown id with SavedPlaceNotFoundError", async () => {
      await expect(
        savedPlaceService.setSavedPlacePinned(
          organizerId,
          "00000000-0000-0000-0000-000000000000",
          true,
        ),
      ).rejects.toThrow(SavedPlaceNotFoundError);
    });
  });

  describe("getSavedPlacesByTrip", () => {
    it("orders pinned first then newest, and an unpinned row never leads a mixed list", async () => {
      const cache = new PlaceCacheService(db);
      const older = await savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Older pin",
      });
      const newer = await savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Newer pin",
      });
      const unpinned = await savedPlaceService.createSavedPlace(
        memberId,
        tripId,
        { name: "Unpinned but newest" },
      );

      // Fixed pins so the order is the clause's, not the clock's.
      await db
        .update(savedPlaces)
        .set({ pinnedAt: new Date("2026-01-01T00:00:00Z"), pinnedBy: organizerId })
        .where(eq(savedPlaces.id, older.id));
      await db
        .update(savedPlaces)
        .set({ pinnedAt: new Date("2026-06-01T00:00:00Z"), pinnedBy: organizerId })
        .where(eq(savedPlaces.id, newer.id));

      const list = await savedPlaceService.getSavedPlacesByTrip(tripId, cache);

      expect(list.map((row) => row.id)).toEqual([
        newer.id,
        older.id,
        unpinned.id,
      ]);
    });

    it("attaches place: null for a typed row without touching the provider", async () => {
      const cache = new PlaceCacheService(db);
      await savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Typed word",
      });

      const list = await savedPlaceService.getSavedPlacesByTrip(tripId, cache);

      expect(list).toHaveLength(1);
      expect(list[0]!.place).toBeNull();
    });

    it("attaches the cached place summary when a provider pair is stored", async () => {
      await db.insert(placeCache).values({
        provider: "google",
        placeId: TEST_PLACE_ID,
        schemaVersion: 1,
        details: {
          v: 1,
          name: "Café de Flore",
          address: "172 Bd Saint-Germain",
          shortAddress: "St-Germain",
          lat: 48.8546,
          lon: 2.3325,
          photos: [],
          country: "France",
          locality: "Paris",
        },
        fetchedAt: new Date(),
      });
      await savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Café de Flore",
        placeProvider: "google",
        placeId: TEST_PLACE_ID,
      });

      const cache = new PlaceCacheService(db);
      const list = await savedPlaceService.getSavedPlacesByTrip(tripId, cache);

      expect(list).toHaveLength(1);
      expect(list[0]!.place).toMatchObject({
        placeId: TEST_PLACE_ID,
        name: "Café de Flore",
        country: "France",
      });
    });

    it("attaches place: null when the pair has no cached row and never throws", async () => {
      // The default fetcher resolves misses to null without touching Google.
      await savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Uncached",
        placeProvider: "google",
        placeId: TEST_PLACE_ID,
      });

      const cache = new PlaceCacheService(db);
      const list = await savedPlaceService.getSavedPlacesByTrip(tripId, cache);

      expect(list).toHaveLength(1);
      expect(list[0]!.place).toBeNull();
    });
  });

  describe("trip deletion", () => {
    it("cascades: deleting the trip deletes its saved places", async () => {
      const place = await savedPlaceService.createSavedPlace(memberId, tripId, {
        name: "Doomed",
      });

      await db.delete(trips).where(eq(trips.id, tripId));

      expect(await savedPlaceService.getSavedPlace(place.id)).toBeNull();
      // The trip row is gone; keep the suite's cleanup from re-deleting it.
      tripId = "";
    });
  });
});
