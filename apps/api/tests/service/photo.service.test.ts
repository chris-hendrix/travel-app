import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/config/database.js";
import { users, trips, members, tripPhotos } from "@/db/schema/index.js";
import { PhotoService } from "@/services/photo.service.js";
import { generateUniquePhone } from "../test-utils.js";

describe("PhotoService", () => {
  let service: PhotoService;
  let testUserId: string;
  let testTripId: string;
  let testPhone: string;

  const cleanup = async () => {
    if (testTripId) {
      await db.delete(tripPhotos).where(eq(tripPhotos.tripId, testTripId));
    }
    if (testUserId) {
      await db.delete(members).where(eq(members.userId, testUserId));
      await db.delete(trips).where(eq(trips.createdBy, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
  };

  beforeEach(async () => {
    testPhone = generateUniquePhone();
    service = new PhotoService(db);

    await cleanup();

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        phoneNumber: testPhone,
        displayName: "Photo Test User",
        timezone: "UTC",
      })
      .returning();
    testUserId = user.id;

    // Create test trip
    const [trip] = await db
      .insert(trips)
      .values({
        name: "Photo Test Trip",
        destination: "Test City",
        preferredTimezone: "UTC",
        createdBy: testUserId,
      })
      .returning();
    testTripId = trip.id;
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("createPhotoRecord", () => {
    it("should create a photo record with processing status", async () => {
      const photo = await service.createPhotoRecord(testTripId, testUserId);

      expect(photo).toBeDefined();
      expect(photo.id).toBeDefined();
      expect(photo.tripId).toBe(testTripId);
      expect(photo.uploadedBy).toBe(testUserId);
      expect(photo.status).toBe("processing");
      expect(photo.url).toBeNull();
      expect(photo.caption).toBeNull();
    });
  });

  describe("getPhotoById", () => {
    it("should return a photo by its ID", async () => {
      const created = await service.createPhotoRecord(testTripId, testUserId);

      const photo = await service.getPhotoById(created.id);

      expect(photo).toBeDefined();
      expect(photo!.id).toBe(created.id);
      expect(photo!.tripId).toBe(testTripId);
    });

    it("should return null for non-existent photo ID", async () => {
      const photo = await service.getPhotoById(
        "00000000-0000-0000-0000-000000000000",
      );
      expect(photo).toBeNull();
    });
  });

  describe("getPhotosByTripId", () => {
    it("should return all photos for a trip ordered by createdAt desc", async () => {
      await service.createPhotoRecord(testTripId, testUserId);
      await service.createPhotoRecord(testTripId, testUserId);
      await service.createPhotoRecord(testTripId, testUserId);

      const photos = await service.getPhotosByTripId(testTripId);

      expect(photos).toHaveLength(3);
      // Verify descending order by createdAt
      for (let i = 0; i < photos.length - 1; i++) {
        expect(photos[i]!.createdAt.getTime()).toBeGreaterThanOrEqual(
          photos[i + 1]!.createdAt.getTime(),
        );
      }
    });

    it("should return empty array for trip with no photos", async () => {
      const photos = await service.getPhotosByTripId(testTripId);
      expect(photos).toHaveLength(0);
    });
  });

  describe("getPhotoCount", () => {
    it("should return the correct count", async () => {
      await service.createPhotoRecord(testTripId, testUserId);
      await service.createPhotoRecord(testTripId, testUserId);

      const count = await service.getPhotoCount(testTripId);
      expect(count).toBe(2);
    });

    it("should return 0 for trip with no photos", async () => {
      const count = await service.getPhotoCount(testTripId);
      expect(count).toBe(0);
    });
  });

  describe("updatePhotoUrl", () => {
    it("should update the URL and set status to ready", async () => {
      const created = await service.createPhotoRecord(testTripId, testUserId);
      expect(created.status).toBe("processing");

      await service.updatePhotoUrl(created.id, "/uploads/photos/test.webp");

      const updated = await service.getPhotoById(created.id);
      expect(updated!.url).toBe("/uploads/photos/test.webp");
      expect(updated!.status).toBe("ready");
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(
        created.updatedAt.getTime(),
      );
    });
  });

  describe("updateCaption", () => {
    it("should update the caption and return the updated photo", async () => {
      const created = await service.createPhotoRecord(testTripId, testUserId);

      const updated = await service.updateCaption(
        created.id,
        "Beautiful sunset",
      );

      expect(updated.caption).toBe("Beautiful sunset");
      expect(updated.id).toBe(created.id);
    });
  });

  describe("setPhotoFailed", () => {
    it("should set the photo status to failed", async () => {
      const created = await service.createPhotoRecord(testTripId, testUserId);

      await service.setPhotoFailed(created.id);

      const photo = await service.getPhotoById(created.id);
      expect(photo!.status).toBe("failed");
    });
  });

  describe("deletePhoto", () => {
    it("should delete the photo and return its URL", async () => {
      const created = await service.createPhotoRecord(testTripId, testUserId);
      await service.updatePhotoUrl(created.id, "/uploads/photos/test.webp");

      const result = await service.deletePhoto(created.id);

      expect(result.url).toBe("/uploads/photos/test.webp");

      const photo = await service.getPhotoById(created.id);
      expect(photo).toBeNull();
    });

    it("should return null URL when deleting a photo with no URL", async () => {
      const created = await service.createPhotoRecord(testTripId, testUserId);

      const result = await service.deletePhoto(created.id);

      expect(result.url).toBeNull();
    });

    it("should return null URL for non-existent photo", async () => {
      const result = await service.deletePhoto(
        "00000000-0000-0000-0000-000000000000",
      );
      expect(result.url).toBeNull();
    });
  });
});
