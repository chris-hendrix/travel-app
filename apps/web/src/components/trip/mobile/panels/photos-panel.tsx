"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/app/providers/auth-provider";
import { usePhotos, useDeletePhoto } from "@/hooks/use-photos";
import {
  PhotoUploadDropzone,
  PhotoGrid,
  PhotoLightbox,
} from "@/components/photos";
import type { Photo } from "@journiful/shared/types";

interface PhotosPanelProps {
  tripId: string;
  isOrganizer: boolean;
  disabled?: boolean;
}

export function PhotosPanel({
  tripId,
  isOrganizer,
  disabled,
}: PhotosPanelProps) {
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
    <div className="space-y-4 px-4 pt-4 pb-safe">
      {!disabled && (
        <PhotoUploadDropzone tripId={tripId} currentCount={photos.length} />
      )}
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
    </div>
  );
}
