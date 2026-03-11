import type { JobWithMetadata } from "pg-boss";
import type { IImageProcessingService } from "@/services/image-processing.service.js";
import type { IPhotoService } from "@/services/photo.service.js";
import type { IStorageService } from "@/services/storage.service.js";
import type { Logger } from "@/types/logger.js";
import type { PhotoProcessingPayload } from "@/queues/types.js";

export interface PhotoProcessingDeps {
  imageProcessingService: IImageProcessingService;
  photoService: IPhotoService;
  storage: IStorageService;
  downloadBuffer: (key: string) => Promise<Buffer>;
  logger: Logger;
}

export async function handlePhotoProcessing(
  job: JobWithMetadata<PhotoProcessingPayload>,
  deps: PhotoProcessingDeps,
): Promise<void> {
  const { photoId, tripId, rawKey } = job.data;
  const {
    imageProcessingService,
    photoService,
    storage,
    downloadBuffer,
    logger,
  } = deps;

  logger.info({ photoId, tripId, rawKey }, "photo processing started");

  try {
    // 1. Download raw file from storage
    const rawBuffer = await downloadBuffer(rawKey);

    // 2. Process: re-encode to WebP at quality 85
    const webpBuffer = await imageProcessingService.processPhoto(rawBuffer);

    // 3. Upload processed WebP to storage
    const webpKey = `photos/${tripId}/${photoId}.webp`;
    const url = await storage.upload(webpBuffer, webpKey, "image/webp");

    // 4. Update DB record with the URL and mark as ready
    await photoService.updatePhotoUrl(photoId, url);

    // 5. Delete the raw file from storage
    await storage.delete(rawKey);

    logger.info({ photoId, tripId, webpKey }, "photo processing completed");
  } catch (error) {
    // Mark the photo as failed on the last retry attempt
    // pg-boss retrycount is 0-indexed: 0, 1, 2 for retryLimit=3
    if (job.retryCount >= 2) {
      logger.error(
        { photoId, tripId, error },
        "photo processing permanently failed",
      );
      await photoService.setPhotoFailed(photoId);
    } else {
      logger.error(
        { photoId, tripId, error, retryCount: job.retryCount },
        "photo processing failed, will retry",
      );
    }
    throw error;
  }
}
