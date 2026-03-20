"use client";

import type {
  KeyboardEvent as ReactKeyboardEvent,
  TouchEvent as ReactTouchEvent,
} from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { getUploadUrl } from "@/lib/api";
import { useUpdatePhotoCaption, useDeletePhoto } from "@/hooks/use-photos";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Photo } from "@journiful/shared/types";

interface PhotoLightboxProps {
  photos: Photo[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  canModify: (photo: Photo) => boolean;
  tripId: string;
}

export function PhotoLightbox({
  photos,
  currentIndex,
  onClose,
  onNavigate,
  canModify,
  tripId,
}: PhotoLightboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState("");
  const captionInputRef = useRef<HTMLInputElement>(null);

  const updateCaption = useUpdatePhotoCaption(tripId);
  const deletePhoto = useDeletePhoto(tripId);

  const currentPhoto = photos[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  // Focus container on mount for keyboard events
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!currentPhoto || isEditingCaption) return;
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          if (hasPrev) onNavigate(currentIndex - 1);
          break;
        case "ArrowRight":
          if (hasNext) onNavigate(currentIndex + 1);
          break;
      }
    },
    [
      currentPhoto,
      onClose,
      onNavigate,
      currentIndex,
      hasPrev,
      hasNext,
      isEditingCaption,
    ],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Early return if photo doesn't exist at this index
  if (!currentPhoto) return null;

  const handleStartEditCaption = () => {
    setCaptionDraft(currentPhoto.caption || "");
    setIsEditingCaption(true);
    setTimeout(() => captionInputRef.current?.focus(), 0);
  };

  const handleSaveCaption = () => {
    updateCaption.mutate({
      photoId: currentPhoto.id,
      data: { caption: captionDraft },
    });
    setIsEditingCaption(false);
  };

  const handleCancelEditCaption = () => {
    setIsEditingCaption(false);
  };

  const handleCaptionKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveCaption();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelEditCaption();
    }
  };

  const handleDelete = () => {
    const isLastPhoto = photos.length === 1;
    const shouldGoBack = currentIndex >= photos.length - 2;
    deletePhoto.mutate(currentPhoto.id, {
      onSuccess: () => {
        if (isLastPhoto) {
          onClose();
        } else if (shouldGoBack) {
          onNavigate(currentIndex - 1);
        }
      },
    });
  };

  const handleTouchStart = (e: ReactTouchEvent) => {
    const touch = e.touches[0];
    if (touch) touchStartX.current = touch.clientX;
  };

  const handleTouchEnd = (e: ReactTouchEvent) => {
    if (touchStartX.current === null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - touchStartX.current;
    touchStartX.current = null;

    if (Math.abs(deltaX) > 50) {
      if (deltaX > 0 && hasPrev) {
        onNavigate(currentIndex - 1);
      } else if (deltaX < 0 && hasNext) {
        onNavigate(currentIndex + 1);
      }
    }
  };

  const imageUrl = getUploadUrl(currentPhoto.url);
  const isModifiable = canModify(currentPhoto);

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Photo lightbox"
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center outline-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10">
        <span className="text-white text-sm" aria-live="polite">
          {currentIndex + 1} / {photos.length}
        </span>
        <div className="flex items-center gap-2">
          {isModifiable && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="p-2 rounded-full bg-black/50 hover:bg-destructive transition-colors text-white cursor-pointer"
                  aria-label="Delete photo"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete photo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors text-white cursor-pointer"
            aria-label="Close lightbox"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Navigation arrows */}
      {hasPrev && (
        <button
          type="button"
          onClick={() => onNavigate(currentIndex - 1)}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors text-white z-10"
          aria-label="Previous photo"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          onClick={() => onNavigate(currentIndex + 1)}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors text-white z-10"
          aria-label="Next photo"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Main image */}
      <div className="relative w-full h-full p-16">
        {imageUrl && (
          <Image
            src={imageUrl}
            alt={currentPhoto.caption || "Trip photo"}
            fill
            sizes="100vw"
            className="object-contain"
          />
        )}
      </div>

      {/* Bottom caption area */}
      <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
        {isEditingCaption ? (
          <input
            ref={captionInputRef}
            type="text"
            value={captionDraft}
            onChange={(e) => setCaptionDraft(e.target.value)}
            onKeyDown={handleCaptionKeyDown}
            onBlur={handleSaveCaption}
            className="w-full bg-black/50 text-white text-sm px-3 py-2 rounded-md border border-white/30 outline-none focus:border-white/60"
            placeholder="Add a caption..."
            maxLength={200}
          />
        ) : isModifiable ? (
          <button
            type="button"
            onClick={handleStartEditCaption}
            className="text-white/80 hover:text-white text-sm transition-colors cursor-pointer"
          >
            {currentPhoto.caption || "Add a caption..."}
          </button>
        ) : currentPhoto.caption ? (
          <p className="text-white/80 text-sm">{currentPhoto.caption}</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
