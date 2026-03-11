"use client";

import { Camera } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PhotoCard } from "./photo-card";
import type { Photo } from "@tripful/shared/types";

interface PhotoGridProps {
  photos: Photo[];
  onPhotoClick: (index: number) => void;
  canModify: (photo: Photo) => boolean;
  onDelete: (photoId: string) => void;
}

export function PhotoGrid({
  photos,
  onPhotoClick,
  canModify,
  onDelete,
}: PhotoGridProps) {
  if (photos.length === 0) {
    return (
      <EmptyState
        icon={Camera}
        title="No photos yet"
        description="Upload photos to share with the group"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {photos.map((photo, index) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          onClick={() => onPhotoClick(index)}
          canModify={canModify(photo)}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
