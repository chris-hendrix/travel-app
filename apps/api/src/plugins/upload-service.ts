import { resolve } from "node:path";
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { UploadService } from "@/services/upload.service.js";
import {
  isNotFoundError,
  LocalStorageService,
  S3StorageService,
} from "@/services/storage.service.js";
import type { IStorageService } from "@/services/storage.service.js";

/**
 * Upload service plugin
 * Selects storage backend based on STORAGE_PROVIDER env var:
 * - "local" (default): LocalStorageService for dev
 * - "s3": S3StorageService for production (Railway Storage Bucket, AWS S3, etc.)
 */
export default fp(
  async function uploadServicePlugin(fastify: FastifyInstance) {
    let storage: IStorageService;

    if (fastify.config.STORAGE_PROVIDER === "s3") {
      const {
        AWS_ENDPOINT_URL,
        AWS_S3_BUCKET_NAME,
        AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY,
        AWS_DEFAULT_REGION,
      } = fastify.config;

      if (
        !AWS_ENDPOINT_URL ||
        !AWS_S3_BUCKET_NAME ||
        !AWS_ACCESS_KEY_ID ||
        !AWS_SECRET_ACCESS_KEY
      ) {
        throw new Error(
          "S3 storage requires AWS_ENDPOINT_URL, AWS_S3_BUCKET_NAME, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY",
        );
      }

      const s3Storage = new S3StorageService({
        endpoint: AWS_ENDPOINT_URL,
        bucket: AWS_S3_BUCKET_NAME,
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
        region: AWS_DEFAULT_REGION,
      });
      storage = s3Storage;

      // Proxy S3 objects through /uploads/:key so Next.js image optimizer
      // can fetch them directly (it can't follow 302 redirects to signed URLs)
      fastify.get<{ Params: { "*": string } }>(
        "/uploads/*",
        async (request, reply) => {
          const key = request.params["*"];
          try {
            const { body, contentType } = await s3Storage.getObject(key);
            return reply
              .header("Content-Type", contentType ?? "application/octet-stream")
              .header("Cache-Control", "public, max-age=31536000, immutable")
              .send(body);
          } catch (error) {
            // A revoked key, a wrong endpoint or a signature mismatch used to land
            // here and answer 404 like a missing file, which is how a bucket
            // credential reset looked like deleted photos for a day (2026-10-22).
            // Only a genuine miss is a 404; everything else is an upstream failure
            // and is logged, because an unreadable bucket is an incident, not a 404.
            if (isNotFoundError(error)) {
              return reply.code(404).send({ error: "Not found" });
            }
            request.log.error(
              { err: error, key, bucket: AWS_S3_BUCKET_NAME },
              "storage read failed — the bucket rejected the request",
            );
            return reply.code(502).send({ error: "Storage unavailable" });
          }
        },
      );

      fastify.log.info("Using S3 storage backend");
    } else {
      const uploadsDir = resolve(
        import.meta.dirname,
        "..",
        "..",
        fastify.config.UPLOAD_DIR,
      );
      storage = new LocalStorageService(uploadsDir);
      fastify.log.info("Using local storage backend");
    }

    const uploadService = new UploadService(storage);
    fastify.decorate("storage", storage);
    fastify.decorate("uploadService", uploadService);
  },
  {
    name: "upload-service",
    fastify: "5.x",
    dependencies: ["config"],
  },
);
