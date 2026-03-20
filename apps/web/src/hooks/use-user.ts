"use client";

import { useMutation } from "@tanstack/react-query";
import { apiRequest, API_URL, APIError } from "@/lib/api";
import { useAuth } from "@/app/providers/auth-provider";
import { toast } from "sonner";
import type { User } from "@journiful/shared/types";
import type { UpdateProfileInput } from "@journiful/shared/schemas";

/**
 * API response type for user profile endpoints
 */
interface UserProfileResponse {
  success: true;
  user: User;
}

/**
 * Hook for updating the current user's profile
 *
 * Updates display name, timezone, and/or social handles.
 * Automatically syncs the global auth state on success.
 *
 * @returns Mutation object with mutate function and state
 */
export function useUpdateProfile() {
  const { refetch } = useAuth();

  return useMutation<User, APIError, UpdateProfileInput>({
    mutationKey: ["updateProfile"],
    mutationFn: async (data) => {
      const response = await apiRequest<UserProfileResponse>("/users/me", {
        method: "PUT",
        body: JSON.stringify(data),
      });
      return response.user;
    },
    onSuccess: () => {
      toast.success("Profile updated successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(getProfileErrorMessage(error));
    },
  });
}

/**
 * Hook for uploading a profile photo
 *
 * Uses raw fetch (not apiRequest) because multipart/form-data
 * is incompatible with apiRequest's automatic Content-Type header.
 * Automatically syncs the global auth state on success.
 *
 * @returns Mutation object with mutate function and state
 */
export function useUploadProfilePhoto() {
  const { refetch } = useAuth();

  return useMutation<User, APIError, File>({
    mutationKey: ["uploadProfilePhoto"],
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_URL}/users/me/photo`, {
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

      const data: UserProfileResponse = await response.json();
      return data.user;
    },
    onSuccess: () => {
      toast.success("Profile photo updated");
      refetch();
    },
    onError: (error) => {
      toast.error(getProfileErrorMessage(error));
    },
  });
}

/**
 * Hook for removing the current user's profile photo
 *
 * Automatically syncs the global auth state on success.
 *
 * @returns Mutation object with mutate function and state
 */
export function useRemoveProfilePhoto() {
  const { refetch } = useAuth();

  return useMutation<User, APIError, void>({
    mutationKey: ["removeProfilePhoto"],
    mutationFn: async () => {
      const response = await apiRequest<UserProfileResponse>(
        "/users/me/photo",
        {
          method: "DELETE",
        },
      );
      return response.user;
    },
    onSuccess: () => {
      toast.success("Profile photo removed");
      refetch();
    },
    onError: (error) => {
      toast.error(getProfileErrorMessage(error));
    },
  });
}

/**
 * Get user-friendly error message from profile mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
function getProfileErrorMessage(error: Error): string {
  if (error instanceof APIError) {
    switch (error.code) {
      case "VALIDATION_ERROR":
        return error.message;
      case "UNAUTHORIZED":
        return "You must be logged in to update your profile.";
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
