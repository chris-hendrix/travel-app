"use client";

import { useState, useCallback, useRef, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/app/providers/auth-provider";
import { usePhotos, useDeletePhoto, useUploadPhotos } from "@/hooks/use-photos";
import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";
import {
  PhotoGrid,
  PhotoLightbox,
} from "@/components/photos";
import type { Photo } from "@journiful/shared/types";
import { MAX_PHOTOS_PER_TRIP } from "@journiful/shared/config";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES_PER_BATCH = 5;

interface PhotosPanelProps {
  tripId: string;
  isOrganizer: boolean;
  disabled?: boolean;
  hideFab?: boolean;
}

export function PhotosPanel({
  tripId,
  isOrganizer,
  disabled,
  hideFab,
}: PhotosPanelProps) {
  const { user } = useAuth();
  const { data: photos = [] } = usePhotos(tripId);
  const deletePhoto = useDeletePhoto(tripId);
  const uploadMutation = useUploadPhotos(tripId);
  const mounted = useMounted();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(
    null,
  );

  const readyPhotos = photos.filter(
    (p): p is Photo & { url: string } => p.status === "ready" && p.url !== null,
  );

  const remaining = MAX_PHOTOS_PER_TRIP - photos.length;
  const isUploadDisabled = disabled || remaining <= 0;

  const canModify = useCallback(
    (photo: Photo) => photo.uploadedBy === user?.id || isOrganizer,
    [user?.id, isOrganizer],
  );

  const handlePhotoClick = (index: number) => {
    const photo = photos[index];
    if (!photo || photo.status !== "ready" || !photo.url) return;
    const readyIndex = readyPhotos.findIndex((p) => p.id === photo.id);
    if (readyIndex >= 0) {
      setSelectedPhotoIndex(readyIndex);
    }
  };

  const handleDelete = (photoId: string) => {
    deletePhoto.mutate(photoId);
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);

    if (fileArray.length > MAX_FILES_PER_BATCH) {
      toast.error(`You can upload up to ${MAX_FILES_PER_BATCH} files at a time`);
      return;
    }

    if (fileArray.length > remaining) {
      toast.error(
        `You can only upload ${remaining} more photo${remaining === 1 ? "" : "s"}`,
      );
      return;
    }

    for (const file of fileArray) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast.error("Invalid file type. Only JPG, PNG, and WEBP are allowed");
        return;
      }
      if (file.size > MAX_SIZE) {
        toast.error("Image must be under 5MB. Please choose a smaller file");
        return;
      }
    }

    uploadMutation.mutate(fileArray, {
      onError: (error) => {
        toast.error(error.message || "Upload failed");
      },
    });

    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4 px-4 pt-4 pb-safe">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        multiple
        onChange={handleFileInputChange}
        disabled={isUploadDisabled}
        className="hidden"
        aria-label="Upload photo files"
      />

      <PhotoGrid
        photos={photos}
        onPhotoClick={handlePhotoClick}
        canModify={canModify}
        onDelete={handleDelete}
      />

      {selectedPhotoIndex !== null && readyPhotos.length > 0 && (
        <PhotoLightbox
          photos={readyPhotos}
          currentIndex={selectedPhotoIndex}
          onClose={() => setSelectedPhotoIndex(null)}
          onNavigate={setSelectedPhotoIndex}
          canModify={canModify}
          tripId={tripId}
        />
      )}

      {/* FAB — portaled to body like itinerary FAB */}
      {mounted &&
        !isUploadDisabled &&
        createPortal(
          <Button
            variant="gradient"
            className={`fixed bottom-20 right-6 z-50 rounded-full w-14 h-14 shadow-lg transition-all duration-300 ease-out ${
              hideFab
                ? "opacity-0 scale-75 pointer-events-none"
                : "opacity-100 scale-100"
            }`}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Add photos"
            tabIndex={hideFab ? -1 : undefined}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Camera className="w-6 h-6" />
            )}
          </Button>,
          document.body,
        )}
    </div>
  );
}
