import type { FastifyRequest, FastifyReply } from "fastify";
import type { UpdateProfileInput } from "@tripful/shared/schemas";
import { InvalidFileTypeError, FileTooLargeError } from "../errors.js";

/**
 * User Controller
 * Handles user profile management HTTP requests
 */
export const userController = {
  /**
   * Update profile endpoint
   * Updates the authenticated user's profile information
   *
   * @route PUT /api/users/me
   * @middleware authenticate
   * @param request - Fastify request with profile data in body
   * @param reply - Fastify reply object
   * @returns Success response with updated user
   */
  async updateProfile(
    request: FastifyRequest<{ Body: UpdateProfileInput }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { authService } = request.server;
      const userId = request.user.sub;

      // Build update data from only defined fields
      const { displayName, timezone, handles, temperatureUnit } = request.body;
      const updateData: {
        displayName?: string;
        timezone?: string | null;
        handles?: Record<string, string> | null;
        temperatureUnit?: string;
      } = {};

      if (displayName !== undefined) {
        updateData.displayName = displayName;
      }
      if (timezone !== undefined) {
        updateData.timezone = timezone;
      }
      if (handles !== undefined) {
        updateData.handles = handles;
      }
      if (temperatureUnit !== undefined) {
        updateData.temperatureUnit = temperatureUnit;
      }

      // Update profile via service
      const updatedUser = await authService.updateProfile(userId, updateData);

      // If displayName changed, regenerate JWT token and set cookie
      if (displayName !== undefined) {
        const token = authService.generateToken(updatedUser);
        reply.setCookie("auth_token", token, {
          httpOnly: true,
          secure: request.server.config.COOKIE_SECURE,
          sameSite: "lax",
          path: "/",
          maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
        });
      }

      // Return success response
      return reply.status(200).send({
        success: true,
        user: updatedUser,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      // Log error for debugging
      request.log.error(
        { error, userId: request.user.sub },
        "Failed to update profile",
      );

      // Return generic error response
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update profile",
        },
      });
    }
  },

  /**
   * Upload profile photo endpoint
   * Uploads a new profile photo for the authenticated user
   *
   * @route POST /api/users/me/photo
   * @middleware authenticate
   * @param request - Fastify request with multipart file
   * @param reply - Fastify reply object
   * @returns Success response with updated user
   */
  async uploadProfilePhoto(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const userId = request.user.sub;
      const { authService, uploadService } = request.server;

      // Get file from request
      let data;
      try {
        data = await request.file();
      } catch (fileError) {
        // Handle multipart parsing errors
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

      if (!data) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "No file uploaded",
          },
        });
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

      // Get current user to check for existing photo
      const user = await authService.getUserById(userId);

      // Delete old profile photo if it exists
      if (user?.profilePhotoUrl) {
        await uploadService.deleteImage(user.profilePhotoUrl);
      }

      // Upload new image
      const imageUrl = await uploadService.uploadImage(
        fileBuffer,
        data.filename,
        data.mimetype,
      );

      // Update user with new profile photo URL
      const updatedUser = await authService.updateProfile(userId, {
        profilePhotoUrl: imageUrl,
      });

      // Return success response
      return reply.status(200).send({
        success: true,
        user: updatedUser,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (
        error instanceof InvalidFileTypeError ||
        error instanceof FileTooLargeError
      ) {
        throw error;
      }
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      // Log error for debugging
      request.log.error(
        { error, userId: request.user.sub },
        "Failed to upload profile photo",
      );

      // Return generic error response
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upload profile photo",
        },
      });
    }
  },

  /**
   * Remove profile photo endpoint
   * Removes the profile photo for the authenticated user
   *
   * @route DELETE /api/users/me/photo
   * @middleware authenticate
   * @param request - Fastify request
   * @param reply - Fastify reply object
   * @returns Success response with updated user
   */
  async removeProfilePhoto(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const userId = request.user.sub;
      const { authService, uploadService } = request.server;

      // Get current user to check for existing photo
      const user = await authService.getUserById(userId);

      // Delete profile photo file if it exists
      if (user?.profilePhotoUrl) {
        await uploadService.deleteImage(user.profilePhotoUrl);
      }

      // Update user to remove profile photo URL
      const updatedUser = await authService.updateProfile(userId, {
        profilePhotoUrl: null,
      });

      // Return success response
      return reply.status(200).send({
        success: true,
        user: updatedUser,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      // Log error for debugging
      request.log.error(
        { error, userId: request.user.sub },
        "Failed to remove profile photo",
      );

      // Return generic error response
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to remove profile photo",
        },
      });
    }
  },
};
