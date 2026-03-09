import { randomUUID } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { UpdatePhotoCaptionInput } from "@tripful/shared/schemas";
import {
  PermissionDeniedError,
  PhotoNotFoundError,
} from "../errors.js";
import { QUEUE } from "@/queues/types.js";
import type { PhotoProcessingPayload } from "@/queues/types.js";

const MAX_PHOTOS_PER_TRIP = 20;

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
  permissionsService: { isOrganizer(userId: string, tripId: string): Promise<boolean> },
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
      const { photoService, uploadService, permissionsService, storage } =
        request.server;

      // Check membership
      const isMember = await permissionsService.isMember(userId, tripId);
      if (!isMember) {
        throw new PermissionDeniedError(
          "Permission denied: You must be a trip member to upload photos",
        );
      }

      // Check photo limit
      const currentCount = await photoService.getPhotoCount(tripId);
      if (currentCount >= MAX_PHOTOS_PER_TRIP) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "PHOTO_LIMIT_EXCEEDED",
            message: `Maximum ${MAX_PHOTOS_PER_TRIP} photos per trip reached`,
          },
        });
      }

      // Get files from request
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

      const photos = [];
      let filesProcessed = 0;

      for await (const data of files) {
        // Enforce per-trip photo limit including files in this batch
        if (currentCount + filesProcessed >= MAX_PHOTOS_PER_TRIP) {
          break;
        }

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

        // Create DB record
        const photo = await photoService.createPhotoRecord(tripId, userId);

        // Upload raw file to storage
        const ext = MIME_TO_EXT[data.mimetype] ?? "jpg";
        const rawKey = `photos/${tripId}/${randomUUID()}_raw.${ext}`;
        await storage.upload(fileBuffer, rawKey, data.mimetype);

        // Enqueue processing job
        if (request.server.boss) {
          await request.server.boss.send(
            QUEUE.PHOTO_PROCESSING,
            {
              photoId: photo.id,
              tripId,
              rawKey,
            } satisfies PhotoProcessingPayload,
          );
        }

        photos.push(photo);
        filesProcessed++;
      }

      if (photos.length === 0) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "No file uploaded",
          },
        });
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
      await assertUploaderOrOrganizer(userId, tripId, photo.uploadedBy, permissionsService, "update");

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
      await assertUploaderOrOrganizer(userId, tripId, photo.uploadedBy, permissionsService, "delete");

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
