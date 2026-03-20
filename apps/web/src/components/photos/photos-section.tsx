"use client";

import { useState, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
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
      <Collapsible defaultOpen className="mb-2">
        <CollapsibleTrigger className="flex items-center gap-2 px-0 text-sm font-semibold text-foreground hover:text-foreground/80 min-h-[44px] cursor-pointer">
          <ChevronDown
            className="w-4 h-4 transition-transform duration-200 [[data-state=closed]_&]:-rotate-90"
            aria-hidden="true"
          />
          Photos ({photos.length}/{MAX_PHOTOS_PER_TRIP})
        </CollapsibleTrigger>
        <CollapsibleContent
          forceMount
          className="overflow-hidden data-[state=open]:animate-[collapsible-down_200ms_ease-out] data-[state=closed]:animate-[collapsible-up_200ms_ease-out] data-[state=closed]:h-0"
        >
          <div className="space-y-4 pt-2">
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
        </CollapsibleContent>
      </Collapsible>
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
