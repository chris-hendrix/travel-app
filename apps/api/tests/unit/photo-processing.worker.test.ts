import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JobWithMetadata } from "pg-boss";
import {
  handlePhotoProcessing,
  type PhotoProcessingDeps,
} from "@/queues/workers/photo-processing.worker.js";
import type { PhotoProcessingPayload } from "@/queues/types.js";

function createMockDeps(): PhotoProcessingDeps {
  return {
    imageProcessingService: {
      processPhoto: vi.fn().mockResolvedValue(Buffer.from("webp-data")),
    },
    photoService: {
      getPhotosByTripId: vi.fn(),
      getPhotoById: vi.fn(),
      getPhotoCount: vi.fn(),
      createPhotoRecord: vi.fn(),
      updatePhotoUrl: vi.fn().mockResolvedValue(undefined),
      updateCaption: vi.fn(),
      setPhotoFailed: vi.fn().mockResolvedValue(undefined),
      deletePhoto: vi.fn(),
    },
    storage: {
      upload: vi.fn().mockResolvedValue("/uploads/photos/trip1/photo1.webp"),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    downloadBuffer: vi.fn().mockResolvedValue(Buffer.from("raw-image-data")),
    logger: {
      info: vi.fn(),
      error: vi.fn(),
    },
  };
}

function createMockJob(
  overrides: Partial<JobWithMetadata<PhotoProcessingPayload>> = {},
): JobWithMetadata<PhotoProcessingPayload> {
  return {
    id: "job-1",
    name: "photo/process",
    data: {
      photoId: "photo-1",
      tripId: "trip-1",
      rawKey: "photos/trip-1/photo-1_raw.jpg",
    },
    retryCount: 0,
    ...overrides,
  } as JobWithMetadata<PhotoProcessingPayload>;
}

describe("handlePhotoProcessing", () => {
  let deps: PhotoProcessingDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it("should download, process, upload, update DB, and delete raw file", async () => {
    const job = createMockJob();

    await handlePhotoProcessing(job, deps);

    // 1. Downloaded raw file
    expect(deps.downloadBuffer).toHaveBeenCalledWith(
      "photos/trip-1/photo-1_raw.jpg",
    );

    // 2. Processed the raw buffer
    expect(deps.imageProcessingService.processPhoto).toHaveBeenCalledWith(
      Buffer.from("raw-image-data"),
    );

    // 3. Uploaded the WebP buffer
    expect(deps.storage.upload).toHaveBeenCalledWith(
      Buffer.from("webp-data"),
      "photos/trip-1/photo-1.webp",
      "image/webp",
    );

    // 4. Updated DB with URL
    expect(deps.photoService.updatePhotoUrl).toHaveBeenCalledWith(
      "photo-1",
      "/uploads/photos/trip1/photo1.webp",
    );

    // 5. Deleted raw file
    expect(deps.storage.delete).toHaveBeenCalledWith(
      "photos/trip-1/photo-1_raw.jpg",
    );
  });

  it("should log start and completion", async () => {
    const job = createMockJob();

    await handlePhotoProcessing(job, deps);

    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ photoId: "photo-1", tripId: "trip-1" }),
      "photo processing started",
    );
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ photoId: "photo-1", tripId: "trip-1" }),
      "photo processing completed",
    );
  });

  it("should throw and not mark as failed on early retry attempts", async () => {
    const job = createMockJob({ retryCount: 0 });
    (deps.downloadBuffer as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("download failed"),
    );

    await expect(handlePhotoProcessing(job, deps)).rejects.toThrow(
      "download failed",
    );

    expect(deps.photoService.setPhotoFailed).not.toHaveBeenCalled();
  });

  it("should mark as failed on the last retry attempt (retryCount >= 2)", async () => {
    const job = createMockJob({ retryCount: 2 });
    (deps.downloadBuffer as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("download failed"),
    );

    await expect(handlePhotoProcessing(job, deps)).rejects.toThrow(
      "download failed",
    );

    expect(deps.photoService.setPhotoFailed).toHaveBeenCalledWith("photo-1");
  });

  it("should mark as failed on retryCount > 2", async () => {
    const job = createMockJob({ retryCount: 5 });
    (
      deps.imageProcessingService.processPhoto as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error("processing error"));

    await expect(handlePhotoProcessing(job, deps)).rejects.toThrow(
      "processing error",
    );

    expect(deps.photoService.setPhotoFailed).toHaveBeenCalledWith("photo-1");
  });

  it("should handle upload failure on non-last retry without marking failed", async () => {
    const job = createMockJob({ retryCount: 1 });
    (deps.storage.upload as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("upload failed"),
    );

    await expect(handlePhotoProcessing(job, deps)).rejects.toThrow(
      "upload failed",
    );

    expect(deps.photoService.setPhotoFailed).not.toHaveBeenCalled();
  });
});
