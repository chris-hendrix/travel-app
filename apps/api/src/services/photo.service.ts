import { eq, desc, sql } from "drizzle-orm";
import { tripPhotos } from "@/db/schema/index.js";
import type { TripPhoto } from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";

/**
 * Photo Service Interface
 * Defines the contract for managing trip photo records.
 */
export interface IPhotoService {
  getPhotosByTripId(tripId: string): Promise<TripPhoto[]>;
  getPhotoById(photoId: string): Promise<TripPhoto | null>;
  getPhotoCount(tripId: string): Promise<number>;
  createPhotoRecord(tripId: string, uploadedBy: string): Promise<TripPhoto>;
  updatePhotoUrl(photoId: string, url: string): Promise<void>;
  updateCaption(photoId: string, caption: string): Promise<TripPhoto>;
  setPhotoFailed(photoId: string): Promise<void>;
  deletePhoto(photoId: string): Promise<{ url: string | null }>;
}

/**
 * Photo Service Implementation
 * Manages trip photo records in the database.
 */
export class PhotoService implements IPhotoService {
  constructor(private db: AppDatabase) {}

  async getPhotosByTripId(tripId: string): Promise<TripPhoto[]> {
    return this.db
      .select()
      .from(tripPhotos)
      .where(eq(tripPhotos.tripId, tripId))
      .orderBy(desc(tripPhotos.createdAt));
  }

  async getPhotoById(photoId: string): Promise<TripPhoto | null> {
    const [photo] = await this.db
      .select()
      .from(tripPhotos)
      .where(eq(tripPhotos.id, photoId))
      .limit(1);
    return photo ?? null;
  }

  async getPhotoCount(tripId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tripPhotos)
      .where(eq(tripPhotos.tripId, tripId));
    return result?.count ?? 0;
  }

  async createPhotoRecord(
    tripId: string,
    uploadedBy: string,
  ): Promise<TripPhoto> {
    const [photo] = await this.db
      .insert(tripPhotos)
      .values({ tripId, uploadedBy })
      .returning();
    return photo!;
  }

  async updatePhotoUrl(photoId: string, url: string): Promise<void> {
    await this.db
      .update(tripPhotos)
      .set({ url, status: "ready", updatedAt: new Date() })
      .where(eq(tripPhotos.id, photoId));
  }

  async updateCaption(photoId: string, caption: string): Promise<TripPhoto> {
    const [photo] = await this.db
      .update(tripPhotos)
      .set({ caption, updatedAt: new Date() })
      .where(eq(tripPhotos.id, photoId))
      .returning();
    return photo!;
  }

  async setPhotoFailed(photoId: string): Promise<void> {
    await this.db
      .update(tripPhotos)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(tripPhotos.id, photoId));
  }

  async deletePhoto(photoId: string): Promise<{ url: string | null }> {
    const [photo] = await this.db
      .delete(tripPhotos)
      .where(eq(tripPhotos.id, photoId))
      .returning({ url: tripPhotos.url });
    return { url: photo?.url ?? null };
  }
}
