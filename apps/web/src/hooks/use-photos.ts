"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, API_URL, APIError } from "@/lib/api";
import type { UpdatePhotoCaptionInput } from "@journiful/shared/schemas";
import type {
  Photo,
  UploadPhotosResponse,
  UpdatePhotoResponse,
} from "@journiful/shared/types";

// Import query keys and options from server-safe module for use in hooks
import { photoKeys, photosQueryOptions } from "./photo-queries";

// Re-export for backward compatibility
export { photoKeys, photosQueryOptions };

// Re-export types for backward compatibility with existing imports
export type { Photo };

/**
 * Hook for fetching all photos for a trip
 *
 * @param tripId - The ID of the trip to fetch photos for
 * @returns Query object with data, loading, and error state
 */
export function usePhotos(tripId: string) {
  return useQuery({
    ...photosQueryOptions(tripId),
    enabled: !!tripId,
    // Poll every 2s while any photos are still processing
    refetchInterval: (query) => {
      const photos = query.state.data;
      if (photos?.some((p) => p.status === "processing")) return 2000;
      return false;
    },
  });
}

/**
 * Hook for uploading photos to a trip
 *
 * Uses raw fetch (not apiRequest) because multipart/form-data
 * is incompatible with apiRequest's automatic Content-Type header.
 *
 * @param tripId - The ID of the trip to upload photos to
 * @returns Mutation object with mutate function and state
 */
export function useUploadPhotos(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<Photo[], APIError, File[]>({
    mutationKey: photoKeys.upload(tripId),
    mutationFn: async (files) => {
      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }

      const response = await fetch(`${API_URL}/trips/${tripId}/photos`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        const code = errorData?.error?.code || "UNKNOWN_ERROR";
        const message = errorData?.error?.message || "Upload failed";
        throw new APIError(code, message);
      }

      const data: UploadPhotosResponse = await response.json();
      return data.photos;
    },

    // No optimistic update for upload — photos start as "processing"
    // Just invalidate on settle to refresh the list
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: photoKeys.all(tripId) });
    },
  });
}

/**
 * Get user-friendly error message from upload mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getUploadPhotosErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to upload photos to this trip.";
      case "NOT_FOUND":
        return "Trip not found.";
      case "VALIDATION_ERROR":
        return error.message;
      case "UNAUTHORIZED":
        return "You must be logged in to upload photos.";
      default:
        return error.message;
    }
  }

  if (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return "Network error: Please check your connection and try again.";
  }

  return "An unexpected error occurred. Please try again.";
}

/**
 * Context type for update caption mutation callbacks
 * Contains previous state for rollback on error
 */
interface UpdateCaptionContext {
  previousPhotos: Photo[] | undefined;
}

/**
 * Hook for updating a photo's caption with optimistic updates
 *
 * @param tripId - The ID of the trip the photo belongs to
 * @returns Mutation object with mutate function and state
 */
export function useUpdatePhotoCaption(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    Photo,
    APIError,
    { photoId: string; data: UpdatePhotoCaptionInput },
    UpdateCaptionContext
  >({
    mutationKey: photoKeys.update(tripId),
    mutationFn: async ({ photoId, data }) => {
      const response = await apiRequest<UpdatePhotoResponse>(
        `/trips/${tripId}/photos/${photoId}`,
        {
          method: "PATCH",
          body: JSON.stringify(data),
        },
      );
      return response.photo;
    },

    // Optimistic update: Update caption in cache immediately
    onMutate: async ({ photoId, data }) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: photoKeys.all(tripId) });

      // Snapshot the previous value for rollback
      const previousPhotos = queryClient.getQueryData<Photo[]>(
        photoKeys.all(tripId),
      );

      // Optimistically update the caption in the cache
      if (previousPhotos) {
        queryClient.setQueryData<Photo[]>(
          photoKeys.all(tripId),
          previousPhotos.map((photo) =>
            photo.id === photoId
              ? { ...photo, caption: data.caption, updatedAt: new Date() }
              : photo,
          ),
        );
      }

      // Return context with previous data for rollback
      return { previousPhotos };
    },

    // On error: Rollback optimistic update
    onError: (_error, _variables, context) => {
      if (context?.previousPhotos) {
        queryClient.setQueryData(photoKeys.all(tripId), context.previousPhotos);
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    // This ensures the cache stays in sync with the server
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: photoKeys.all(tripId) });
    },
  });
}

/**
 * Get user-friendly error message from update caption mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getUpdatePhotoCaptionErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to edit this photo's caption.";
      case "NOT_FOUND":
        return "Photo not found.";
      case "VALIDATION_ERROR":
        return "Please check your input and try again.";
      case "UNAUTHORIZED":
        return "You must be logged in to edit a photo caption.";
      default:
        return error.message;
    }
  }

  if (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return "Network error: Please check your connection and try again.";
  }

  return "An unexpected error occurred. Please try again.";
}

/**
 * Context type for delete mutation callbacks
 * Contains previous state for rollback on error
 */
interface DeletePhotoContext {
  previousPhotos: Photo[] | undefined;
}

/**
 * Hook for deleting a photo with optimistic removal
 *
 * @param tripId - The ID of the trip the photo belongs to
 * @returns Mutation object with mutate function and state
 */
export function useDeletePhoto(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, APIError, string, DeletePhotoContext>({
    mutationKey: photoKeys.delete(tripId),
    mutationFn: async (photoId: string) => {
      await apiRequest(`/trips/${tripId}/photos/${photoId}`, {
        method: "DELETE",
      });
    },

    // Optimistic update: Remove photo from cache immediately
    onMutate: async (photoId) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: photoKeys.all(tripId) });

      // Snapshot the previous value for rollback
      const previousPhotos = queryClient.getQueryData<Photo[]>(
        photoKeys.all(tripId),
      );

      // Optimistically remove the photo from the cache
      if (previousPhotos) {
        queryClient.setQueryData<Photo[]>(
          photoKeys.all(tripId),
          previousPhotos.filter((photo) => photo.id !== photoId),
        );
      }

      // Return context with previous data for rollback
      return { previousPhotos };
    },

    // On error: Rollback optimistic update
    onError: (_error, _photoId, context) => {
      if (context?.previousPhotos) {
        queryClient.setQueryData(photoKeys.all(tripId), context.previousPhotos);
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    // This ensures the cache stays in sync with the server
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: photoKeys.all(tripId) });
    },
  });
}

/**
 * Get user-friendly error message from delete mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getDeletePhotoErrorMessage(error: Error | null): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to delete this photo.";
      case "NOT_FOUND":
        return "Photo not found.";
      case "UNAUTHORIZED":
        return "You must be logged in to delete a photo.";
      default:
        return error.message;
    }
  }

  if (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return "Network error: Please check your connection and try again.";
  }

  return "An unexpected error occurred. Please try again.";
}
