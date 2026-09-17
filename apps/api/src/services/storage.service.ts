import {
  writeFileSync,
  readFileSync,
  unlinkSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
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

  /**
   * Stores a raw blob under a storage key (photo-cache contract).
   * Unlike `upload` (which returns a public URL), the key is used verbatim.
   */
  putObject(key: string, buffer: Buffer, contentType: string): Promise<void>;

  /**
   * Reads a raw blob. Returns `null` on NotFound/ENOENT instead of throwing.
   */
  getObjectBuffer(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null>;

  /**
   * Lists storage keys under a prefix (used by purge jobs).
   */
  listKeys(prefix: string): Promise<string[]>;

  /**
   * Returns last-modified metadata for a key, or `null` if missing.
   * Local backend: file mtime. S3 backend: HeadObject LastModified.
   */
  statObject(key: string): Promise<{ lastModified: Date } | null>;

  /**
   * Deletes a blob by key (idempotent).
   */
  deleteObject(key: string): Promise<void>;
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
    const filePath = resolve(this.uploadsDir, filename);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, file);
    return `/uploads/${filename}`;
  }

  async delete(url: string): Promise<void> {
    // Strip /uploads/ prefix if present, otherwise use as-is (bare key)
    const relativePath = url.startsWith("/uploads/")
      ? url.slice("/uploads/".length)
      : url;
    if (!relativePath) {
      return;
    }

    const filePath = resolve(this.uploadsDir, relativePath);

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

  private resolveKeyPath(key: string): string | null {
    if (!key) {
      return null;
    }
    const filePath = resolve(this.uploadsDir, key);
    // Security check: prevent path traversal attacks
    if (filePath !== this.uploadsDir && !filePath.startsWith(`${this.uploadsDir}/`)) {
      return null;
    }
    return filePath;
  }

  async putObject(key: string, buffer: Buffer, contentType: string): Promise<void> {
    const filePath = this.resolveKeyPath(key);
    if (!filePath) {
      throw new Error("Invalid storage key");
    }
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, buffer);
    writeFileSync(`${filePath}.meta`, JSON.stringify({ contentType }));
  }

  async getObjectBuffer(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const filePath = this.resolveKeyPath(key);
    if (!filePath) {
      return null;
    }
    try {
      const buffer = readFileSync(filePath);
      let contentType = "application/octet-stream";
      try {
        const raw = readFileSync(`${filePath}.meta`, "utf-8");
        const parsed = JSON.parse(raw) as { contentType?: unknown };
        if (typeof parsed.contentType === "string" && parsed.contentType) {
          contentType = parsed.contentType;
        }
      } catch {
        // Missing/corrupt sidecar: fall back to default content type.
      }
      return { buffer, contentType };
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    const walk = (dir: string): void => {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = resolve(dir, entry);
        let stat: ReturnType<typeof statSync>;
        try {
          stat = statSync(full);
        } catch {
          continue;
        }
        if (stat.isDirectory()) {
          walk(full);
        } else if (stat.isFile()) {
          if (full.endsWith(".meta")) {
            continue;
          }
          const rel = full.slice(this.uploadsDir.length + 1).replace(/\\/g, "/");
          if (rel.startsWith(prefix)) {
            keys.push(rel);
          }
        }
      }
    };
    walk(this.uploadsDir);
    return keys;
  }

  async deleteObject(key: string): Promise<void> {
    const filePath = this.resolveKeyPath(key);
    if (!filePath) {
      return;
    }
    for (const target of [filePath, `${filePath}.meta`]) {
      try {
        if (existsSync(target)) {
          unlinkSync(target);
        }
      } catch {
        // Idempotent deletion: ignore errors.
      }
    }
  }

  async statObject(key: string): Promise<{ lastModified: Date } | null> {
    const filePath = this.resolveKeyPath(key);
    if (!filePath) {
      return null;
    }
    try {
      const stat = statSync(filePath);
      return { lastModified: stat.mtime };
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }
}

/**
 * S3-compatible storage implementation
 * Works with AWS S3, Railway Storage Buckets, Cloudflare R2, etc.
 */
function isNotFoundError(err: unknown): boolean {
  const code = (err as { Code?: unknown; name?: unknown })?.Code
    ?? (err as { name?: unknown })?.name;
  return code === "NoSuchKey" || code === "NotFound" || code === "NoSuchBucket";
}
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

  async getObject(key: string): Promise<{
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

  async putObject(key: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
  }

  async getObjectBuffer(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    let response;
    try {
      response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (err) {
      if (isNotFoundError(err)) {
        return null;
      }
      throw err;
    }
    if (!response.Body) {
      return null;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return {
      buffer: Buffer.concat(chunks),
      contentType: response.ContentType ?? "application/octet-stream",
    };
  }

  async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const obj of response.Contents ?? []) {
        if (obj.Key !== undefined) {
          keys.push(obj.Key);
        }
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
    return keys;
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async statObject(key: string): Promise<{ lastModified: Date } | null> {
    let response;
    try {
      response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (err) {
      if (isNotFoundError(err)) {
        return null;
      }
      throw err;
    }
    if (!response.LastModified) {
      return null;
    }
    return { lastModified: response.LastModified };
  }
}
