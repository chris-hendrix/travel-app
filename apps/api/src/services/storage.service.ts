import { writeFileSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Storage Service Interface
 * Abstracts file storage operations to allow swapping between
 * local filesystem, S3, R2, or other storage backends.
 */
export interface IStorageService {
  /**
   * Uploads a file to storage
   * @param file - The file buffer
   * @param filename - The generated filename (e.g., UUID-based)
   * @param mimetype - The MIME type (used for Content-Type in cloud storage)
   * @returns The URL or path to access the uploaded file
   */
  upload(file: Buffer, filename: string, mimetype: string): Promise<string>;

  /**
   * Deletes a file from storage
   * @param url - The URL or path of the file to delete
   */
  delete(url: string): Promise<void>;

  /**
   * Generates a signed URL for temporary access (optional, cloud storage only)
   * @param key - The storage key or path
   * @param expiresIn - Expiration time in seconds
   * @returns A signed URL with temporary access
   */
  getSignedUrl?(key: string, expiresIn: number): Promise<string>;
}

/**
 * Local filesystem storage implementation
 * Stores files in a local directory and serves them via static file routes.
 */
export class LocalStorageService implements IStorageService {
  private readonly uploadsDir: string;

  constructor(uploadsDir: string) {
    this.uploadsDir = uploadsDir;
    this.ensureUploadsDirExists();
  }

  private ensureUploadsDirExists(): void {
    if (!existsSync(this.uploadsDir)) {
      mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async upload(
    file: Buffer,
    filename: string,
    _mimetype: string,
  ): Promise<string> {
    this.ensureUploadsDirExists();
    const filePath = resolve(this.uploadsDir, filename);
    writeFileSync(filePath, file);
    return `/uploads/${filename}`;
  }

  async delete(url: string): Promise<void> {
    const filename = url.split("/").pop();
    if (!filename) {
      return;
    }

    const filePath = resolve(this.uploadsDir, filename);

    // Security check: prevent path traversal attacks
    if (!filePath.startsWith(this.uploadsDir)) {
      return;
    }

    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch {
      // Silently handle errors (idempotent deletion)
    }
  }
}

/**
 * S3-compatible storage implementation
 * Works with AWS S3, Railway Storage Buckets, Cloudflare R2, etc.
 */
export interface S3StorageConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export class S3StorageService implements IStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  async upload(
    file: Buffer,
    filename: string,
    mimetype: string,
  ): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: filename,
        Body: file,
        ContentType: mimetype,
      }),
    );
    return `/uploads/${filename}`;
  }

  async delete(key: string): Promise<void> {
    // Strip /uploads/ prefix if present (for backward compatibility with local paths)
    const cleanKey = key.replace(/^\/uploads\//, "");
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      }),
    );
  }

  async getSignedUrl(key: string, expiresIn: number): Promise<string> {
    return awsGetSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn },
    );
  }

  async getObject(
    key: string,
  ): Promise<{
    body: NonNullable<GetObjectCommandOutput["Body"]>;
    contentType: string | undefined;
  }> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    if (!response.Body) {
      throw new Error("Empty response body");
    }
    return {
      body: response.Body,
      contentType: response.ContentType,
    };
  }
}
