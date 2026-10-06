import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  UpdateProfileInput,
  DeleteAccountInput,
} from "@journiful/shared/schemas";
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
   * Delete account endpoint
   * Anonymizes the authenticated user's account
   *
   * Deliberately reachable without `checkBanned` (see the sibling scope in
   * user.routes.ts): App Store Review Guideline 5.1.1(v) requires account
   * deletion to be available to every account holder, including a suspended
   * one. The row is anonymized rather than dropped, so a ban outlives the
   * deletion in the audit trail.
   *
   * One caller is refused: an admin impersonating a user. Their token carries
   * `impersonating: true` and `sub` is the *impersonated* user, so the
   * deletion would land on somebody who never asked for it, filed under the
   * impersonation. The account holder's own door is untouched.
   *
   * The caller's own token is blacklisted on the way out, so the deletion is
   * not merely a row change the JWT can walk past.
   *
   * @route DELETE /api/users/me
   * @middleware authenticate
   * @param request - Fastify request
   * @param reply - Fastify reply object
   * @returns Success response with no user payload
   */
  async deleteAccount(
    request: FastifyRequest<{ Body: DeleteAccountInput }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Same flag and same envelope as `stopImpersonation`
      // (admin.controller.ts). Under impersonation `sub` is the impersonated
      // user, so this is not the admin's account to delete.
      if (request.user.impersonating) {
        return reply.status(403).send({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Stop impersonating to delete an account",
          },
        });
      }

      const { userService } = request.server;
      const userId = request.user.sub;

      await userService.deleteAccount(userId);

      // Kill the token that walked through this door, or it outlives the
      // account: `authenticate` checks a signature and a blacklist row, never
      // a live user, so without this the JWT keeps working on every surface
      // that runs only `authenticate` until it expires — seven days — after
      // the row it names is a tombstone.
      //
      // Best-effort on purpose, and after the deletion on purpose. The account
      // is already anonymized (its own transaction, already committed) and the
      // requirement is that deletion succeeds; a blacklist write that fails
      // would otherwise turn a completed deletion into a 500 the caller reads
      // as "not deleted" — and prompt a retry that has nothing left to delete.
      // The failure is logged, not swallowed silently. The blacklist is a
      // capability, not a guarantee: the row is gone either way, and the
      // tombstone is what closes the other surfaces (see `checkBanned`).
      if (request.user?.jti) {
        try {
          await request.server.authService.blacklistToken(
            request.user.jti,
            request.user.sub,
            new Date(request.user.exp * 1000),
          );
        } catch (error) {
          request.log.error(
            { error, userId },
            "Failed to blacklist token after account deletion",
          );
        }
      }

      return reply.status(200).send({ success: true });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      // Log error for debugging
      request.log.error(
        { error, userId: request.user.sub },
        "Failed to delete account",
      );

      // Return generic error response
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete account",
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
