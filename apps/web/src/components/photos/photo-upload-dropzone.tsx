"use client";

import {
  useState,
  useEffect,
  useRef,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { Upload, AlertCircle, Loader2, X, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUploadPhotos } from "@/hooks/use-photos";
import { MAX_PHOTOS_PER_TRIP } from "@journiful/shared/config";

interface PhotoUploadDropzoneProps {
  tripId: string;
  currentCount: number;
  maxCount?: number; // defaults to MAX_PHOTOS_PER_TRIP
  className?: string;
}

interface FileEntry {
  id: string;
  file: File;
  previewUrl: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES_PER_BATCH = 5;

function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "Invalid file type. Only JPG, PNG, and WEBP are allowed";
  }
  if (file.size > MAX_SIZE) {
    return "Image must be under 5MB. Please choose a smaller file";
  }
  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PhotoUploadDropzone({
  tripId,
  currentCount,
  maxCount = MAX_PHOTOS_PER_TRIP,
  className,
}: PhotoUploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadPhotos(tripId);

  const remaining = maxCount - currentCount;
  const isDisabled = remaining <= 0;

  // Keep a ref to fileEntries so the unmount cleanup always sees the latest value
  const fileEntriesRef = useRef<FileEntry[]>([]);
  fileEntriesRef.current = fileEntries;

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      for (const entry of fileEntriesRef.current) {
        URL.revokeObjectURL(entry.previewUrl);
      }
    };
  }, []);

  const handleFiles = async (files: FileList | File[]) => {
    setValidationError(null);

    const fileArray = Array.from(files);

    // Check batch size limit
    if (fileArray.length > MAX_FILES_PER_BATCH) {
      setValidationError(
        `You can upload up to ${MAX_FILES_PER_BATCH} files at a time`,
      );
      return;
    }

    // Check remaining capacity
    if (fileArray.length > remaining) {
      setValidationError(
        `You can only upload ${remaining} more photo${remaining === 1 ? "" : "s"}`,
      );
      return;
    }

    // Validate each file
    const validFiles: File[] = [];
    for (const file of fileArray) {
      const error = validateFile(file);
      if (error) {
        setValidationError(error);
        return;
      }
      validFiles.push(file);
    }

    // Create file entries with previews
    const newEntries: FileEntry[] = validFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: "uploading" as const,
    }));

    setFileEntries((prev) => [...prev, ...newEntries]);

    // Upload all files
    uploadMutation.mutate(validFiles, {
      onSuccess: () => {
        // Mark all as done and clean up after a short delay
        setFileEntries((prev) => {
          const updatedEntries = prev.map((entry) =>
            newEntries.some((ne) => ne.id === entry.id)
              ? { ...entry, status: "done" as const }
              : entry,
          );
          return updatedEntries;
        });

        // Remove completed entries and revoke URLs after brief display
        setTimeout(() => {
          setFileEntries((prev) => {
            const remaining = prev.filter(
              (entry) => !newEntries.some((ne) => ne.id === entry.id),
            );
            for (const entry of newEntries) {
              URL.revokeObjectURL(entry.previewUrl);
            }
            return remaining;
          });
        }, 1500);
      },
      onError: (error) => {
        // Mark entries as errored
        setFileEntries((prev) =>
          prev.map((entry) =>
            newEntries.some((ne) => ne.id === entry.id)
              ? { ...entry, status: "error" as const, error: error.message }
              : entry,
          ),
        );
      },
    });
  };

  const removeEntry = (entryId: string) => {
    setFileEntries((prev) => {
      const entry = prev.find((e) => e.id === entryId);
      if (entry) {
        URL.revokeObjectURL(entry.previewUrl);
      }
      return prev.filter((e) => e.id !== entryId);
    });
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!isDisabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (isDisabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClick = () => {
    if (!isDisabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const isUploading = fileEntries.some((e) => e.status === "uploading");

  return (
    <div className={cn("space-y-3", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        multiple
        onChange={handleFileInputChange}
        disabled={isDisabled}
        className="hidden"
        aria-label="Upload photo files"
      />

      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        aria-label="Upload photos"
        className={cn(
          "relative rounded-md border-2 border-dashed transition-all duration-200",
          "flex flex-col items-center justify-center gap-3 p-6",
          "bg-gradient-to-br from-muted to-primary/10",
          isDragging && !isDisabled
            ? "border-primary bg-primary/10"
            : "border-input",
          !isDisabled &&
            "cursor-pointer hover:border-primary/70 hover:shadow-md",
          isDisabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <div className="flex flex-col items-center gap-2">
          <div className="p-3 rounded-full bg-card shadow-sm">
            {isUploading ? (
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            ) : (
              <Upload className="w-6 h-6 text-muted-foreground" />
            )}
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              {isDisabled
                ? "Photo limit reached"
                : isDragging
                  ? "Drop photos here"
                  : "Click to upload or drag and drop"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              JPG, PNG, or WEBP (max 5MB each)
            </p>
            {!isDisabled && (
              <p className="text-xs text-muted-foreground mt-1">
                {remaining} photo{remaining === 1 ? "" : "s"} remaining
              </p>
            )}
          </div>
        </div>
      </div>

      {validationError && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive flex-1">{validationError}</p>
          </div>
        </div>
      )}

      {fileEntries.length > 0 && (
        <div className="space-y-2">
          {fileEntries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 p-2 rounded-md border border-border bg-card"
            >
              <div className="relative w-10 h-10 rounded overflow-hidden shrink-0 bg-muted">
                {entry.previewUrl ? (
                  <img
                    src={entry.previewUrl}
                    alt={entry.file.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {entry.file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(entry.file.size)}
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                {entry.status === "uploading" && (
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                )}
                {entry.status === "error" && (
                  <>
                    <span className="text-xs text-destructive">
                      {entry.error || "Upload failed"}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeEntry(entry.id)}
                      className="p-1 rounded-full hover:bg-muted"
                      aria-label={`Remove ${entry.file.name}`}
                    >
                      <X className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </>
                )}
                {entry.status === "done" && (
                  <span className="text-xs text-green-600">Done</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
