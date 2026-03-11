import sharp from "sharp";

/**
 * Image Processing Service Interface
 * Pure image transformation service - no DB or storage access.
 */
export interface IImageProcessingService {
  processPhoto(rawBuffer: Buffer): Promise<Buffer>;
}

/**
 * Image Processing Service Implementation
 * Re-encodes images to WebP format at quality 85.
 */
export class ImageProcessingService implements IImageProcessingService {
  async processPhoto(rawBuffer: Buffer): Promise<Buffer> {
    return sharp(rawBuffer).webp({ quality: 85 }).toBuffer();
  }
}
