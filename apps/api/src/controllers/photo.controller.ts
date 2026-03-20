import { randomUUID } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { UpdatePhotoCaptionInput } from "@journiful/shared/schemas";
import { MAX_PHOTOS_PER_TRIP } from "@journiful/shared/config";
import { eq, sql } from "drizzle-orm";
import { tripPhotos } from "@/db/schema/index.js";
import {
  PermissionDeniedError,
  PhotoNotFoundError,
  PhotoLimitExceededError,
} from "../errors.js";
import { QUEUE } from "@/queues/types.js";
import type { PhotoProcessingPayload } from "@/queues/types.js";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Check that the user is the photo uploader or a trip organizer. */
async function assertUploaderOrOrganizer(
  userId: string,
  tripId: string,
  uploadedBy: string,
  permissionsService: {
    isOrganizer(userId: string, tripId: string): Promise<boolean>;
  },
  action: string,
): Promise<void> {
  if (uploadedBy !== userId) {
    const isOrganizer = await permissionsService.isOrganizer(userId, tripId);
    if (!isOrganizer) {
      throw new PermissionDeniedError(
        `Permission denied: Only the uploader or an organizer can ${action} this photo`,
      );
    }
  }
}

/**
 * Photo Controller
 * Handles trip photo HTTP requests
 */
export const photoController = {
  /**
   * Upload photos endpoint
   * Uploads up to 5 photos for a trip
   *
   * @route POST /api/trips/:id/photos
   * @middleware authenticate, requireCompleteProfile
   */
  async uploadPhotos(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { id: tripId } = request.params;
      const userId = request.user.sub;
      const { uploadService, permissionsService, storage } = request.server;

      // Check membership
      const isMember = await permissionsService.isMember(userId, tripId);
      if (!isMember) {
        throw new PermissionDeniedError(
          "Permission denied: You must be a trip member to upload photos",
        );
      }

      // --- Phase 1: Collect and validate files OUTSIDE the transaction ---
      // This avoids holding a DB lock during file I/O.
      let files;
      try {
        files = request.files();
      } catch (fileError) {
        if (fileError instanceof Error) {
          const errorMsg = fileError.message.toLowerCase();

          if (
            errorMsg.includes("file too large") ||
            errorMsg.includes("request body is too large") ||
            errorMsg.includes("exceeds the maximum") ||
            errorMsg.includes("limit")
          ) {
            return reply.status(400).send({
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message:
                  "Image must be under 5MB. Please choose a smaller file",
              },
            });
          }
          if (
            errorMsg.includes("the request is not multipart") ||
            errorMsg.includes("missing content-type header")
          ) {
            return reply.status(400).send({
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "No file uploaded",
              },
            });
          }
        }
        throw fileError;
      }

      const validatedFiles: Array<{
        buffer: Buffer;
        mimetype: string;
      }> = [];

      for await (const data of files) {
        // Convert file stream to buffer
        let fileBuffer;
        try {
          fileBuffer = await data.toBuffer();
        } catch (bufferError) {
          if (bufferError instanceof Error) {
            const errorMsg = bufferError.message.toLowerCase();
            if (
              errorMsg.includes("file too large") ||
              errorMsg.includes("limit") ||
              errorMsg.includes("exceeded") ||
              errorMsg.includes("maximum")
            ) {
              return reply.status(400).send({
                success: false,
                error: {
                  code: "VALIDATION_ERROR",
                  message:
                    "Image must be under 5MB. Please choose a smaller file",
                },
              });
            }
          }
          throw bufferError;
        }

        // Validate image (type, size, magic bytes)
        await uploadService.validateImage(fileBuffer, data.mimetype);

        validatedFiles.push({ buffer: fileBuffer, mimetype: data.mimetype });
      }

      if (validatedFiles.length === 0) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "No file uploaded",
          },
        });
      }

      // --- Phase 2: Count check + record creation INSIDE a transaction ---
      // Advisory lock + count check serializes concurrent uploads per trip.
      const { db } = request.server;
      const createdPhotos = await db.transaction(async (tx) => {
        // Acquire an advisory lock scoped to this trip to serialize concurrent uploads.
        // hashtext() returns a stable int4 from the tripId string.
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${tripId}))`,
        );

        const rows = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(tripPhotos)
          .where(eq(tripPhotos.tripId, tripId));
        const count = rows[0]?.count ?? 0;

        if (count >= MAX_PHOTOS_PER_TRIP) {
          throw new PhotoLimitExceededError(
            `Maximum ${MAX_PHOTOS_PER_TRIP} photos per trip reached`,
          );
        }

        const created: Array<{
          photo: typeof tripPhotos.$inferSelect;
          fileData: { buffer: Buffer; mimetype: string };
        }> = [];

        for (const fileData of validatedFiles) {
          if (count + created.length >= MAX_PHOTOS_PER_TRIP) break;
          const [photo] = await tx
            .insert(tripPhotos)
            .values({ tripId, uploadedBy: userId })
            .returning();
          created.push({ photo: photo!, fileData });
        }

        return created;
      });

      // --- Phase 3: Upload to storage and enqueue jobs AFTER transaction commits ---
      const photos = [];
      for (const { photo, fileData } of createdPhotos) {
        const ext = MIME_TO_EXT[fileData.mimetype] ?? "jpg";
        const rawKey = `photos/${tripId}/${randomUUID()}_raw.${ext}`;
        await storage.upload(fileData.buffer, rawKey, fileData.mimetype);

        if (request.server.boss) {
          await request.server.boss.send(QUEUE.PHOTO_PROCESSING, {
            photoId: photo.id,
            tripId,
            rawKey,
          } satisfies PhotoProcessingPayload);
        }

        photos.push(photo);
      }

      return reply.status(201).send({
        success: true,
        photos,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      // Log error and return 500
      request.log.error(
        {
          error,
          userId: request.user.sub,
          tripId: request.params.id,
        },
        "Failed to upload photos",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upload photos",
        },
      });
    }
  },

  /**
   * Get photos endpoint
   * Lists all photos for a trip
   *
   * @route GET /api/trips/:id/photos
   * @middleware authenticate
   */
  async getPhotos(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { id: tripId } = request.params;
      const userId = request.user.sub;
      const { photoService, permissionsService } = request.server;

      // Check membership
      const isMember = await permissionsService.isMember(userId, tripId);
      if (!isMember) {
        throw new PermissionDeniedError(
          "Permission denied: You must be a trip member to view photos",
        );
      }

      const photos = await photoService.getPhotosByTripId(tripId);

      return reply.status(200).send({
        success: true,
        photos,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        {
          error,
          userId: request.user.sub,
          tripId: request.params.id,
        },
        "Failed to get photos",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get photos",
        },
      });
    }
  },

  /**
   * Update caption endpoint
   * Updates the caption of a photo
   *
   * @route PATCH /api/trips/:id/photos/:photoId
   * @middleware authenticate, requireCompleteProfile
   */
  async updateCaption(
    request: FastifyRequest<{
      Params: { id: string; photoId: string };
      Body: UpdatePhotoCaptionInput;
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { id: tripId, photoId } = request.params;
      const userId = request.user.sub;
      const { caption } = request.body;
      const { photoService, permissionsService } = request.server;

      // Check membership
      const isMember = await permissionsService.isMember(userId, tripId);
      if (!isMember) {
        throw new PermissionDeniedError(
          "Permission denied: You must be a trip member to update photos",
        );
      }

      // Get photo
      const photo = await photoService.getPhotoById(photoId);
      if (!photo || photo.tripId !== tripId) {
        throw new PhotoNotFoundError();
      }

      // Check permission: uploader or organizer
      await assertUploaderOrOrganizer(
        userId,
        tripId,
        photo.uploadedBy,
        permissionsService,
        "update",
      );

      const updatedPhoto = await photoService.updateCaption(photoId, caption);

      return reply.status(200).send({
        success: true,
        photo: updatedPhoto,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        {
          error,
          userId: request.user.sub,
          tripId: request.params.id,
          photoId: request.params.photoId,
        },
        "Failed to update photo caption",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update photo caption",
        },
      });
    }
  },

  /**
   * Delete photo endpoint
   * Deletes a photo from the trip
   *
   * @route DELETE /api/trips/:id/photos/:photoId
   * @middleware authenticate, requireCompleteProfile
   */
  async deletePhoto(
    request: FastifyRequest<{
      Params: { id: string; photoId: string };
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { id: tripId, photoId } = request.params;
      const userId = request.user.sub;
      const { photoService, permissionsService, storage } = request.server;

      // Check membership
      const isMember = await permissionsService.isMember(userId, tripId);
      if (!isMember) {
        throw new PermissionDeniedError(
          "Permission denied: You must be a trip member to delete photos",
        );
      }

      // Get photo
      const photo = await photoService.getPhotoById(photoId);
      if (!photo || photo.tripId !== tripId) {
        throw new PhotoNotFoundError();
      }

      // Check permission: uploader or organizer
      await assertUploaderOrOrganizer(
        userId,
        tripId,
        photo.uploadedBy,
        permissionsService,
        "delete",
      );

      // Delete processed image from storage if URL exists.
      // Note: The raw file is not cleaned up here because the raw key is not
      // stored on the photo record. The photo-processing worker deletes the
      // raw file after processing. If a photo is deleted while still processing,
      // the raw file will be orphaned -- an acceptable edge case.
      if (photo.url) {
        await storage.delete(photo.url);
      }

      // Delete from DB
      await photoService.deletePhoto(photoId);

      return reply.status(200).send({
        success: true,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        {
          error,
          userId: request.user.sub,
          tripId: request.params.id,
          photoId: request.params.photoId,
        },
        "Failed to delete photo",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete photo",
        },
      });
    }
  },
};
