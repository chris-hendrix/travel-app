"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/app/providers/auth-provider";
import { usePhotos, useDeletePhoto } from "@/hooks/use-photos";
import { PhotoUploadDropzone } from "./photo-upload-dropzone";
import { PhotoGrid } from "./photo-grid";
import { PhotoLightbox } from "./photo-lightbox";
import type { Photo } from "@journiful/shared/types";
import { MAX_PHOTOS_PER_TRIP } from "@journiful/shared/config";

interface PhotosSectionProps {
  tripId: string;
  isOrganizer: boolean;
  disabled?: boolean;
}

export function PhotosSection({
  tripId,
  isOrganizer,
  disabled,
}: PhotosSectionProps) {
  const { user } = useAuth();
  const { data: photos = [] } = usePhotos(tripId);
  const deletePhoto = useDeletePhoto(tripId);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(
    null,
  );

  const readyPhotos = photos.filter(
    (p): p is Photo & { url: string } => p.status === "ready" && p.url !== null,
  );

  const canModify = useCallback(
    (photo: Photo) => photo.uploadedBy === user?.id || isOrganizer,
    [user?.id, isOrganizer],
  );

  const handlePhotoClick = (index: number) => {
    // Map the grid index to the ready photos index
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

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold font-playfair">Photos</h2>
          <span className="text-sm text-muted-foreground">
            {photos.length}/{MAX_PHOTOS_PER_TRIP}
          </span>
        </div>
        {!disabled && (
          <PhotoUploadDropzone tripId={tripId} currentCount={photos.length} />
        )}
        <PhotoGrid
          photos={photos}
          onPhotoClick={handlePhotoClick}
          canModify={canModify}
          onDelete={handleDelete}
        />
      </div>
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
    </>
  );
}
