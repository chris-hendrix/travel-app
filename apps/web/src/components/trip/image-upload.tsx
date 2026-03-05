"use client";

import {
  useState,
  useEffect,
  useRef,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import Image from "next/image";
import { Upload, AlertCircle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_URL, getUploadUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface ImageUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  tripId?: string;
  disabled?: boolean;
  className?: string;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImageUpload({
  value,
  onChange,
  tripId,
  disabled = false,
  className,
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    getUploadUrl(value) ?? null,
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [lastFailedFile, setLastFailedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup blob URLs on unmount or when previewUrl changes
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return "Invalid file type. Only JPG, PNG, and WEBP are allowed";
    }
    if (file.size > MAX_SIZE) {
      return "Image must be under 5MB. Please choose a smaller file";
    }
    return null;
  };

  const handleFile = async (file: File) => {
    setError(null);

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // If tripId is provided, upload immediately
    if (tripId) {
      await uploadImage(file);
    } else {
      // For form usage without immediate upload
      onChange(objectUrl);
    }
  };

  const uploadImage = async (file: File) => {
    if (!tripId) return;

    setIsUploading(true);
    setError(null);
    setLastFailedFile(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_URL}/trips/${tripId}/cover-image`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Upload failed");
      }

      const data = await response.json();
      const uploadedUrl = data.trip.coverImageUrl;

      onChange(uploadedUrl);
      setPreviewUrl(getUploadUrl(uploadedUrl) ?? null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      const isNetworkError =
        errorMessage.includes("fetch") || errorMessage.includes("network");

      setError(
        isNetworkError
          ? "Network error: Please check your connection and try again."
          : errorMessage,
      );
      // Store the file for retry
      setLastFailedFile(file);
      // Revert preview on error
      setPreviewUrl(getUploadUrl(value) ?? null);
      setSelectedFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetry = () => {
    if (lastFailedFile) {
      uploadImage(lastFailedFile);
    }
  };

  const handleRemove = () => {
    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setSelectedFile(null);
    setError(null);
    setLastFailedFile(null);
    onChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!disabled) {
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

    if (disabled) return;

    const files = e.dataTransfer.files;
    const file = files[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const file = files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className={cn("relative", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        onChange={handleFileInputChange}
        disabled={disabled}
        className="hidden"
        aria-label="Upload image file"
      />

      {previewUrl ? (
        <div className="relative group">
          <div className="relative h-48 rounded-md overflow-hidden border-2 border-border">
            <Image
              src={previewUrl}
              alt="Preview"
              fill
              unoptimized // Required: previewUrl may be a blob URL from file selection
              className="object-cover"
            />
            {isUploading && (
              <div className="absolute inset-0 bg-card/95 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}
          </div>

          {!disabled && !isUploading && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleRemove}
              className="absolute top-2 right-2 min-w-[44px] min-h-[44px] bg-card hover:bg-card rounded-full shadow-md"
              aria-label="Remove image"
            >
              <X className="w-4 h-4 text-foreground" />
            </Button>
          )}

          {selectedFile && (
            <div className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium">{selectedFile.name}</span>
              <span className="ml-2 text-muted-foreground">
                ({formatFileSize(selectedFile.size)})
              </span>
            </div>
          )}
        </div>
      ) : (
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
          tabIndex={disabled ? -1 : 0}
          aria-label="Upload image"
          className={cn(
            "relative h-48 rounded-md border-2 border-dashed transition-all duration-200",
            "flex flex-col items-center justify-center gap-3",
            "bg-gradient-to-br from-muted to-primary/10",
            isDragging && !disabled
              ? "border-primary bg-primary/10"
              : "border-input",
            !disabled &&
              "cursor-pointer hover:border-primary/70 hover:shadow-md",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          <div className="flex flex-col items-center gap-2">
            <div className="p-3 rounded-full bg-card shadow-sm">
              <Upload className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                {isDragging
                  ? "Drop image here"
                  : "Click to upload or drag and drop"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                JPG, PNG, or WEBP (max 5MB)
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
          <div className="flex items-start gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive flex-1">{error}</p>
          </div>
          {lastFailedFile && tripId && (
            <Button
              type="button"
              variant="link"
              onClick={handleRetry}
              disabled={isUploading}
              className="text-sm font-medium text-destructive hover:text-destructive/80 p-0 h-auto min-w-[44px] min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? "Retrying..." : "Try again"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
