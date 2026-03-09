import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { LocalStorageService } from "@/services/storage.service.js";

const TEST_UPLOADS_DIR = resolve(
  process.cwd(),
  ".test-uploads-storage-service",
);

describe("LocalStorageService", () => {
  let service: LocalStorageService;

  function cleanup() {
    if (existsSync(TEST_UPLOADS_DIR)) {
      rmSync(TEST_UPLOADS_DIR, { recursive: true, force: true });
    }
  }

  beforeEach(() => {
    cleanup();
    service = new LocalStorageService(TEST_UPLOADS_DIR);
  });

  afterEach(() => {
    cleanup();
  });

  describe("upload", () => {
    it("should upload a flat file", async () => {
      const buffer = Buffer.from("test-content");
      const url = await service.upload(buffer, "test.webp", "image/webp");

      expect(url).toBe("/uploads/test.webp");
      const filePath = resolve(TEST_UPLOADS_DIR, "test.webp");
      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath)).toEqual(buffer);
    });

    it("should upload to nested path creating intermediate directories", async () => {
      const buffer = Buffer.from("nested-content");
      const url = await service.upload(
        buffer,
        "photos/trip-123/photo-456.webp",
        "image/webp",
      );

      expect(url).toBe("/uploads/photos/trip-123/photo-456.webp");
      const filePath = resolve(
        TEST_UPLOADS_DIR,
        "photos/trip-123/photo-456.webp",
      );
      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath)).toEqual(buffer);
    });

    it("should upload to deeply nested path", async () => {
      const buffer = Buffer.from("deep-content");
      const url = await service.upload(
        buffer,
        "a/b/c/d/file.webp",
        "image/webp",
      );

      expect(url).toBe("/uploads/a/b/c/d/file.webp");
      expect(
        existsSync(resolve(TEST_UPLOADS_DIR, "a/b/c/d/file.webp")),
      ).toBe(true);
    });
  });

  describe("delete", () => {
    it("should delete a flat file by URL", async () => {
      const buffer = Buffer.from("delete-me");
      await service.upload(buffer, "flat-file.webp", "image/webp");
      const filePath = resolve(TEST_UPLOADS_DIR, "flat-file.webp");
      expect(existsSync(filePath)).toBe(true);

      await service.delete("/uploads/flat-file.webp");
      expect(existsSync(filePath)).toBe(false);
    });

    it("should delete a nested file by URL", async () => {
      const buffer = Buffer.from("nested-delete");
      await service.upload(
        buffer,
        "photos/trip-abc/photo-xyz.webp",
        "image/webp",
      );
      const filePath = resolve(
        TEST_UPLOADS_DIR,
        "photos/trip-abc/photo-xyz.webp",
      );
      expect(existsSync(filePath)).toBe(true);

      await service.delete("/uploads/photos/trip-abc/photo-xyz.webp");
      expect(existsSync(filePath)).toBe(false);
    });

    it("should delete a file by bare key (no /uploads/ prefix)", async () => {
      const buffer = Buffer.from("bare-key-delete");
      await service.upload(buffer, "photos/trip-1/raw_file.jpg", "image/webp");
      const filePath = resolve(
        TEST_UPLOADS_DIR,
        "photos/trip-1/raw_file.jpg",
      );
      expect(existsSync(filePath)).toBe(true);

      await service.delete("photos/trip-1/raw_file.jpg");
      expect(existsSync(filePath)).toBe(false);
    });

    it("should not throw when deleting a non-existent file", async () => {
      await expect(
        service.delete("/uploads/nonexistent.webp"),
      ).resolves.not.toThrow();
    });

    it("should handle empty URL gracefully", async () => {
      await expect(service.delete("")).resolves.not.toThrow();
    });

    it("should handle /uploads/ only URL gracefully", async () => {
      await expect(service.delete("/uploads/")).resolves.not.toThrow();
    });

    it("should not delete files outside uploads directory (path traversal)", async () => {
      const buffer = Buffer.from("safe-file");
      await service.upload(buffer, "safe.webp", "image/webp");
      const filePath = resolve(TEST_UPLOADS_DIR, "safe.webp");
      expect(existsSync(filePath)).toBe(true);

      // Attempt path traversal
      await service.delete("/uploads/../../../etc/passwd");

      // Original file should still exist
      expect(existsSync(filePath)).toBe(true);
    });
  });
});
