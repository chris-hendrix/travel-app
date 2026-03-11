"use client";

import Image from "next/image";
import { Trash2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUploadUrl } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import type { Photo } from "@tripful/shared/types";

interface PhotoCardProps {
  photo: Photo;
  onClick: () => void;
  canModify: boolean;
  onDelete: (photoId: string) => void;
  className?: string;
}

export function PhotoCard({
  photo,
  onClick,
  canModify,
  onDelete,
  className,
}: PhotoCardProps) {
  if (photo.status === "processing") {
    return (
      <div
        className={cn(
          "relative aspect-[4/3] sm:aspect-square overflow-hidden rounded-lg",
          className,
        )}
      >
        <Skeleton className="absolute inset-0" />
      </div>
    );
  }

  if (photo.status === "failed") {
    return (
      <div
        className={cn(
          "relative aspect-[4/3] sm:aspect-square overflow-hidden rounded-lg bg-muted flex flex-col items-center justify-center gap-2",
          className,
        )}
      >
        <AlertCircle className="w-6 h-6 text-destructive" />
        <span className="text-xs text-muted-foreground">Processing failed</span>
      </div>
    );
  }

  const imageUrl = getUploadUrl(photo.url);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group relative aspect-[4/3] sm:aspect-square overflow-hidden rounded-lg cursor-pointer focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2",
        className,
      )}
    >
      {imageUrl && (
        <Image
          src={imageUrl}
          alt={photo.caption || "Trip photo"}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 100vw"
          className="object-cover"
        />
      )}
      {canModify && (
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-2">
          {photo.caption && (
            <span className="text-xs text-white truncate mr-2">
              {photo.caption}
            </span>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(photo.id);
            }}
            className="p-1.5 rounded-full bg-black/50 hover:bg-destructive transition-colors text-white shrink-0"
            aria-label="Delete photo"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
