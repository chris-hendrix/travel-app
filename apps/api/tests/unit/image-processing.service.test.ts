import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { ImageProcessingService } from "@/services/image-processing.service.js";

describe("ImageProcessingService", () => {
  const service = new ImageProcessingService();

  it("should convert a JPEG buffer to WebP", async () => {
    const jpegBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await service.processPhoto(jpegBuffer);

    const metadata = await sharp(result).metadata();
    expect(metadata.format).toBe("webp");
  });

  it("should convert a PNG buffer to WebP", async () => {
    const pngBuffer = await sharp({
      create: {
        width: 80,
        height: 60,
        channels: 4,
        background: { r: 0, g: 128, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const result = await service.processPhoto(pngBuffer);

    const metadata = await sharp(result).metadata();
    expect(metadata.format).toBe("webp");
  });

  it("should preserve image dimensions", async () => {
    const width = 200;
    const height = 150;
    const jpegBuffer = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 0, g: 255, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await service.processPhoto(jpegBuffer);

    const metadata = await sharp(result).metadata();
    expect(metadata.width).toBe(width);
    expect(metadata.height).toBe(height);
  });

  it("should produce a valid WebP buffer", async () => {
    const jpegBuffer = await sharp({
      create: {
        width: 50,
        height: 50,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await service.processPhoto(jpegBuffer);

    // WebP files start with RIFF header
    expect(result[0]).toBe(0x52); // R
    expect(result[1]).toBe(0x49); // I
    expect(result[2]).toBe(0x46); // F
    expect(result[3]).toBe(0x46); // F
  });

  it("should handle a WebP input (re-encode to WebP)", async () => {
    const webpBuffer = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 255, g: 255, b: 0 },
      },
    })
      .webp({ quality: 50 })
      .toBuffer();

    const result = await service.processPhoto(webpBuffer);

    const metadata = await sharp(result).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(64);
    expect(metadata.height).toBe(64);
  });

  it("should throw on invalid input buffer", async () => {
    const invalidBuffer = Buffer.from("not an image at all");

    await expect(service.processPhoto(invalidBuffer)).rejects.toThrow();
  });
});
