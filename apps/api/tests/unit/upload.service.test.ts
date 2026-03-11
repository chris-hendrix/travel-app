import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  readdirSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { UploadService } from "@/services/upload.service.js";
import { LocalStorageService } from "@/services/storage.service.js";

// Minimal valid image buffers for magic byte detection
// 1x1 PNG (smallest valid PNG)
const VALID_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

// Minimal valid JPEG (SOI + APP0/JFIF + minimal data + EOI)
const VALID_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYI4Q/SFhSRFJiY0SFJkdEVVhXbGFJR3N0Fm7CoaOys8TV5fYXJ0gZajw+b2RldYWGlpeoqaq5ur3Dxsa/ysfM09bX+Nna5+jp7fL19vj5+v/aAAwDAQACEQMRAD8AQAAA/9k=",
  "base64",
);

// Minimal valid WebP (1x1 lossless)
const VALID_WEBP = Buffer.from(
  "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AA/v8dAAA=",
  "base64",
);

// Create service instance with local storage for testing
const testUploadsDir = resolve(process.cwd(), "uploads");
const storage = new LocalStorageService(testUploadsDir);
const uploadService = new UploadService(storage);

describe("upload.service", () => {
  // Clean up test uploads directory after each test
  const cleanup = () => {
    if (existsSync(testUploadsDir)) {
      const files = readdirSync(testUploadsDir);
      files.forEach((file) => {
        rmSync(resolve(testUploadsDir, file), { recursive: true, force: true });
      });
    }
  };

  beforeEach(cleanup);
  afterEach(cleanup);

  describe("validateImage", () => {
    it("should accept valid MIME type: image/jpeg", async () => {
      await expect(
        uploadService.validateImage(VALID_JPEG, "image/jpeg"),
      ).resolves.not.toThrow();
    });

    it("should accept valid MIME type: image/png", async () => {
      await expect(
        uploadService.validateImage(VALID_PNG, "image/png"),
      ).resolves.not.toThrow();
    });

    it("should accept valid MIME type: image/webp", async () => {
      await expect(
        uploadService.validateImage(VALID_WEBP, "image/webp"),
      ).resolves.not.toThrow();
    });

    it("should reject invalid MIME type", async () => {
      await expect(
        uploadService.validateImage(VALID_PNG, "image/gif"),
      ).rejects.toThrow(
        "Invalid file type. Only JPG, PNG, and WEBP are allowed",
      );
    });

    it("should reject invalid MIME type: text/plain", async () => {
      const buffer = Buffer.from("fake text data");
      await expect(
        uploadService.validateImage(buffer, "text/plain"),
      ).rejects.toThrow(
        "Invalid file type. Only JPG, PNG, and WEBP are allowed",
      );
    });

    it("should reject file larger than 5MB", async () => {
      // Create a large buffer with valid JPEG header
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024);
      VALID_JPEG.copy(largeBuffer);
      await expect(
        uploadService.validateImage(largeBuffer, "image/jpeg"),
      ).rejects.toThrow(
        "Image must be under 5MB. Please choose a smaller file",
      );
    });

    it("should accept file exactly at 5MB", async () => {
      const buffer = Buffer.alloc(5 * 1024 * 1024);
      VALID_JPEG.copy(buffer);
      await expect(
        uploadService.validateImage(buffer, "image/jpeg"),
      ).resolves.not.toThrow();
    });

    it("should accept file smaller than 5MB", async () => {
      await expect(
        uploadService.validateImage(VALID_PNG, "image/png"),
      ).resolves.not.toThrow();
    });

    it("should reject file just over 5MB", async () => {
      const buffer = Buffer.alloc(5 * 1024 * 1024 + 1);
      VALID_WEBP.copy(buffer);
      await expect(
        uploadService.validateImage(buffer, "image/webp"),
      ).rejects.toThrow(
        "Image must be under 5MB. Please choose a smaller file",
      );
    });
  });

  describe("validateImage - magic byte detection", () => {
    it("should reject a text file with image/jpeg MIME type", async () => {
      const textBuffer = Buffer.from("This is plain text, not a JPEG");
      await expect(
        uploadService.validateImage(textBuffer, "image/jpeg"),
      ).rejects.toThrow("File content does not match declared type");
    });

    it("should reject a text file with image/png MIME type", async () => {
      const textBuffer = Buffer.from("This is plain text, not a PNG");
      await expect(
        uploadService.validateImage(textBuffer, "image/png"),
      ).rejects.toThrow("File content does not match declared type");
    });

    it("should reject an empty buffer", async () => {
      const emptyBuffer = Buffer.alloc(0);
      await expect(
        uploadService.validateImage(emptyBuffer, "image/jpeg"),
      ).rejects.toThrow("File content does not match declared type");
    });

    it("should reject a PNG declared as JPEG", async () => {
      await expect(
        uploadService.validateImage(VALID_PNG, "image/jpeg"),
      ).rejects.toThrow("File content does not match declared type");
    });

    it("should reject a JPEG declared as PNG", async () => {
      await expect(
        uploadService.validateImage(VALID_JPEG, "image/png"),
      ).rejects.toThrow("File content does not match declared type");
    });

    it("should reject a JPEG declared as WebP", async () => {
      await expect(
        uploadService.validateImage(VALID_JPEG, "image/webp"),
      ).rejects.toThrow("File content does not match declared type");
    });
  });

  describe("uploadImage", () => {
    it("should create uploads directory if it does not exist", async () => {
      // Remove uploads directory if it exists
      if (existsSync(testUploadsDir)) {
        rmSync(testUploadsDir, { recursive: true });
      }

      const url = await uploadService.uploadImage(
        VALID_JPEG,
        "test.jpg",
        "image/jpeg",
      );

      expect(existsSync(testUploadsDir)).toBe(true);
      expect(url).toMatch(/^\/uploads\/[a-f0-9-]{36}\.jpg$/);
    });

    it("should save file with UUID filename for JPEG", async () => {
      const url = await uploadService.uploadImage(
        VALID_JPEG,
        "photo.jpg",
        "image/jpeg",
      );

      expect(url).toMatch(/^\/uploads\/[a-f0-9-]{36}\.jpg$/);
      const filename = url.split("/").pop();
      const filepath = resolve(testUploadsDir, filename!);
      expect(existsSync(filepath)).toBe(true);
    });

    it("should save file with UUID filename for PNG", async () => {
      const url = await uploadService.uploadImage(
        VALID_PNG,
        "photo.png",
        "image/png",
      );

      expect(url).toMatch(/^\/uploads\/[a-f0-9-]{36}\.png$/);
      const filename = url.split("/").pop();
      const filepath = resolve(testUploadsDir, filename!);
      expect(existsSync(filepath)).toBe(true);
    });

    it("should save file with UUID filename for WEBP", async () => {
      const url = await uploadService.uploadImage(
        VALID_WEBP,
        "photo.webp",
        "image/webp",
      );

      expect(url).toMatch(/^\/uploads\/[a-f0-9-]{36}\.webp$/);
      const filename = url.split("/").pop();
      const filepath = resolve(testUploadsDir, filename!);
      expect(existsSync(filepath)).toBe(true);
    });

    it("should return correct URL path format", async () => {
      const url = await uploadService.uploadImage(
        VALID_JPEG,
        "test.jpg",
        "image/jpeg",
      );

      expect(url).toMatch(/^\/uploads\/[a-f0-9-]{36}\.jpg$/);
      expect(url.startsWith("/uploads/")).toBe(true);
    });

    it("should generate unique filenames for multiple uploads", async () => {
      const url1 = await uploadService.uploadImage(
        VALID_JPEG,
        "test1.jpg",
        "image/jpeg",
      );
      const url2 = await uploadService.uploadImage(
        VALID_JPEG,
        "test2.jpg",
        "image/jpeg",
      );
      const url3 = await uploadService.uploadImage(
        VALID_JPEG,
        "test3.jpg",
        "image/jpeg",
      );

      expect(url1).not.toBe(url2);
      expect(url2).not.toBe(url3);
      expect(url1).not.toBe(url3);
    });

    it("should save file contents correctly", async () => {
      const url = await uploadService.uploadImage(
        VALID_PNG,
        "test.png",
        "image/png",
      );

      const filename = url.split("/").pop();
      const filepath = resolve(testUploadsDir, filename!);
      const savedContent = readFileSync(filepath);
      expect(savedContent.equals(VALID_PNG)).toBe(true);
    });

    it("should validate image before uploading", async () => {
      const buffer = Buffer.from("test image data");
      await expect(
        uploadService.uploadImage(buffer, "test.txt", "text/plain"),
      ).rejects.toThrow(
        "Invalid file type. Only JPG, PNG, and WEBP are allowed",
      );
    });

    it("should not save file if validation fails", async () => {
      const buffer = Buffer.from("test image data");
      const beforeFiles = existsSync(testUploadsDir)
        ? readdirSync(testUploadsDir)
        : [];

      await expect(
        uploadService.uploadImage(buffer, "test.gif", "image/gif"),
      ).rejects.toThrow();

      const afterFiles = existsSync(testUploadsDir)
        ? readdirSync(testUploadsDir)
        : [];
      expect(afterFiles.length).toBe(beforeFiles.length);
    });
  });

  describe("deleteImage", () => {
    it("should delete existing file", async () => {
      const url = await uploadService.uploadImage(
        VALID_JPEG,
        "test.jpg",
        "image/jpeg",
      );

      const filename = url.split("/").pop();
      const filepath = resolve(testUploadsDir, filename!);
      expect(existsSync(filepath)).toBe(true);

      await uploadService.deleteImage(url);
      expect(existsSync(filepath)).toBe(false);
    });

    it("should handle non-existent file gracefully", async () => {
      const nonExistentUrl = "/uploads/non-existent-file.jpg";
      await expect(
        uploadService.deleteImage(nonExistentUrl),
      ).resolves.not.toThrow();
    });

    it("should extract filename from URL path correctly", async () => {
      const url = await uploadService.uploadImage(
        VALID_PNG,
        "test.png",
        "image/png",
      );

      await uploadService.deleteImage(url);

      const filename = url.split("/").pop();
      const filepath = resolve(testUploadsDir, filename!);
      expect(existsSync(filepath)).toBe(false);
    });

    it("should only delete the specified file", async () => {
      const url1 = await uploadService.uploadImage(
        VALID_JPEG,
        "test1.jpg",
        "image/jpeg",
      );
      const url2 = await uploadService.uploadImage(
        VALID_JPEG,
        "test2.jpg",
        "image/jpeg",
      );

      await uploadService.deleteImage(url1);

      const filename1 = url1.split("/").pop();
      const filename2 = url2.split("/").pop();
      const filepath1 = resolve(testUploadsDir, filename1!);
      const filepath2 = resolve(testUploadsDir, filename2!);

      expect(existsSync(filepath1)).toBe(false);
      expect(existsSync(filepath2)).toBe(true);
    });

    it("should safely handle path traversal attempts in deleteImage", async () => {
      // Create a test file first
      const url = await uploadService.uploadImage(
        VALID_JPEG,
        "test.jpg",
        "image/jpeg",
      );

      // Attempt various path traversal patterns - should not throw
      const maliciousUrls = [
        "/uploads/../../../etc/passwd",
        "/uploads/..%2F..%2F..%2Fetc%2Fpasswd",
        "/uploads/....//....//etc/passwd",
        "/../../../etc/passwd",
        "/uploads/../uploads/../../../etc/passwd",
      ];

      for (const maliciousUrl of maliciousUrls) {
        await expect(
          uploadService.deleteImage(maliciousUrl),
        ).resolves.not.toThrow();
      }

      // Verify the real file still exists (wasn't deleted by traversal)
      const filename = url.split("/").pop()!;
      const filePath = resolve(process.cwd(), "uploads", filename);
      expect(existsSync(filePath)).toBe(true);

      // Clean up
      await uploadService.deleteImage(url);
    });
  });

  describe("integration: complete upload lifecycle", () => {
    it("should handle full upload-delete cycle", async () => {
      // Upload
      const url = await uploadService.uploadImage(
        VALID_JPEG,
        "lifecycle.jpg",
        "image/jpeg",
      );
      expect(url).toMatch(/^\/uploads\/[a-f0-9-]{36}\.jpg$/);

      const filename = url.split("/").pop();
      const filepath = resolve(testUploadsDir, filename!);

      // Verify file exists
      expect(existsSync(filepath)).toBe(true);

      // Delete
      await uploadService.deleteImage(url);

      // Verify file deleted
      expect(existsSync(filepath)).toBe(false);
    });

    it("should handle multiple uploads and selective deletion", async () => {
      // Upload multiple files
      const url1 = await uploadService.uploadImage(
        VALID_JPEG,
        "file1.jpg",
        "image/jpeg",
      );
      const url2 = await uploadService.uploadImage(
        VALID_PNG,
        "file2.png",
        "image/png",
      );
      const url3 = await uploadService.uploadImage(
        VALID_WEBP,
        "file3.webp",
        "image/webp",
      );

      // Verify all exist
      const allFiles = readdirSync(testUploadsDir);
      expect(allFiles.length).toBe(3);

      // Delete middle file
      await uploadService.deleteImage(url2);

      // Verify selective deletion
      const filename1 = url1.split("/").pop();
      const filename2 = url2.split("/").pop();
      const filename3 = url3.split("/").pop();

      expect(existsSync(resolve(testUploadsDir, filename1!))).toBe(true);
      expect(existsSync(resolve(testUploadsDir, filename2!))).toBe(false);
      expect(existsSync(resolve(testUploadsDir, filename3!))).toBe(true);

      const remainingFiles = readdirSync(testUploadsDir);
      expect(remainingFiles.length).toBe(2);
    });
  });
});
