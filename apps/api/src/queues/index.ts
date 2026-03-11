import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import {
  QUEUE,
  type WorkerDeps,
  type NotificationDeliverPayload,
  type InvitationSendPayload,
  type NotificationBatchPayload,
  type PhotoProcessingPayload,
} from "./types.js";
import { handleNotificationDeliver } from "./workers/notification-deliver.worker.js";
import { handleInvitationSend } from "./workers/invitation-send.worker.js";
import { handleNotificationBatch } from "./workers/notification-batch.worker.js";
import { handleDailyItineraries } from "./workers/daily-itineraries.worker.js";
import type { JobWithMetadata } from "pg-boss";
import {
  handlePhotoProcessing,
  type PhotoProcessingDeps,
} from "./workers/photo-processing.worker.js";
import { handleDlq } from "./workers/dlq.worker.js";
import { S3StorageService } from "@/services/storage.service.js";

/**
 * Queue workers plugin
 * Creates queues, registers workers, and sets up cron schedules for pg-boss.
 * Skipped in test environment to avoid interference with test execution.
 * Set ENABLE_QUEUE_WORKERS=true to override this (e.g. for E2E tests).
 *
 * @depends queue - pg-boss instance
 * @depends database - Drizzle ORM instance
 * @depends sms-service - SMS delivery service
 */
export default fp(
  async function queueWorkersPlugin(fastify: FastifyInstance) {
    if (
      fastify.config.NODE_ENV === "test" &&
      !process.env.ENABLE_QUEUE_WORKERS
    ) {
      fastify.log.debug("queue workers skipped in test environment");
      return;
    }

    const { boss } = fastify;

    // Boss is guaranteed non-null in non-test environments (queue plugin starts it)
    if (!boss) {
      throw new Error("pg-boss instance is not available");
    }

    // --- Create queues (DLQs first) ---

    await boss.createQueue(QUEUE.NOTIFICATION_DELIVER_DLQ);
    await boss.createQueue(QUEUE.NOTIFICATION_DELIVER, {
      retryLimit: 3,
      retryDelay: 10,
      retryBackoff: true,
      expireInSeconds: 300,
      deadLetter: QUEUE.NOTIFICATION_DELIVER_DLQ,
      deleteAfterSeconds: 604800,
    });

    await boss.createQueue(QUEUE.INVITATION_SEND_DLQ);
    await boss.createQueue(QUEUE.INVITATION_SEND, {
      retryLimit: 3,
      retryDelay: 10,
      retryBackoff: true,
      expireInSeconds: 300,
      deadLetter: QUEUE.INVITATION_SEND_DLQ,
      deleteAfterSeconds: 604800,
    });

    await boss.createQueue(QUEUE.NOTIFICATION_BATCH_DLQ);
    await boss.createQueue(QUEUE.NOTIFICATION_BATCH, {
      retryLimit: 3,
      retryDelay: 10,
      retryBackoff: true,
      expireInSeconds: 300,
      deadLetter: QUEUE.NOTIFICATION_BATCH_DLQ,
      deleteAfterSeconds: 3600,
    });

    await boss.createQueue(QUEUE.DAILY_ITINERARIES_DLQ);
    await boss.createQueue(QUEUE.DAILY_ITINERARIES, {
      retryLimit: 2,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 600,
      deadLetter: QUEUE.DAILY_ITINERARIES_DLQ,
      deleteAfterSeconds: 3600,
    });

    await boss.createQueue(QUEUE.PHOTO_PROCESSING_DLQ);
    await boss.createQueue(QUEUE.PHOTO_PROCESSING, {
      retryLimit: 3,
      retryDelay: 10,
      retryBackoff: true,
      expireInSeconds: 300,
      deadLetter: QUEUE.PHOTO_PROCESSING_DLQ,
      deleteAfterSeconds: 604800,
    });

    // --- Cron schedules ---

    await boss.schedule(QUEUE.DAILY_ITINERARIES, "*/15 * * * *");

    // --- Build worker dependencies ---

    const deps: WorkerDeps = {
      db: fastify.db,
      boss,
      smsService: fastify.smsService,
      logger: fastify.log,
    };

    // --- Register workers (pg-boss v12 handlers receive Job[] arrays) ---

    await boss.work<NotificationDeliverPayload>(
      QUEUE.NOTIFICATION_DELIVER,
      { localConcurrency: 3 },
      async (jobs) => {
        await handleNotificationDeliver(jobs[0]!, deps);
      },
    );

    await boss.work<InvitationSendPayload>(
      QUEUE.INVITATION_SEND,
      { localConcurrency: 3 },
      async (jobs) => {
        await handleInvitationSend(jobs[0]!, deps);
      },
    );

    await boss.work<NotificationBatchPayload>(
      QUEUE.NOTIFICATION_BATCH,
      async (jobs) => {
        await handleNotificationBatch(jobs[0]!, deps);
      },
    );

    await boss.work<object>(
      QUEUE.DAILY_ITINERARIES,
      { pollingIntervalSeconds: 60 },
      async (jobs) => {
        await handleDailyItineraries(jobs[0]!, deps);
      },
    );

    // --- Photo processing worker ---

    const downloadBuffer = async (key: string): Promise<Buffer> => {
      const cleanKey = key.replace(/^\/uploads\//, "");
      if (fastify.storage instanceof S3StorageService) {
        const { body } = await fastify.storage.getObject(cleanKey);
        const chunks: Buffer[] = [];
        for await (const chunk of body as AsyncIterable<Buffer>) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
      }
      // Local storage: read file from disk
      const filePath = resolve(
        import.meta.dirname,
        "..",
        "..",
        fastify.config.UPLOAD_DIR,
        cleanKey,
      );
      return readFile(filePath);
    };

    const photoDeps: PhotoProcessingDeps = {
      imageProcessingService: fastify.imageProcessingService,
      photoService: fastify.photoService,
      storage: fastify.storage,
      downloadBuffer,
      logger: fastify.log,
    };

    await boss.work<PhotoProcessingPayload>(
      QUEUE.PHOTO_PROCESSING,
      async (jobs) => {
        // pg-boss provides full metadata at runtime; cast from Job to JobWithMetadata
        await handlePhotoProcessing(
          jobs[0]! as unknown as JobWithMetadata<PhotoProcessingPayload>,
          photoDeps,
        );
      },
    );

    // --- DLQ workers ---

    await boss.work<unknown>(QUEUE.NOTIFICATION_DELIVER_DLQ, async (jobs) => {
      await handleDlq(jobs[0]!, deps);
    });

    await boss.work<unknown>(QUEUE.INVITATION_SEND_DLQ, async (jobs) => {
      await handleDlq(jobs[0]!, deps);
    });

    await boss.work<unknown>(QUEUE.NOTIFICATION_BATCH_DLQ, async (jobs) => {
      await handleDlq(jobs[0]!, deps);
    });

    await boss.work<unknown>(QUEUE.DAILY_ITINERARIES_DLQ, async (jobs) => {
      await handleDlq(jobs[0]!, deps);
    });

    await boss.work<unknown>(QUEUE.PHOTO_PROCESSING_DLQ, async (jobs) => {
      await handleDlq(jobs[0]!, deps);
    });

    // --- Cleanup queues ---

    // Rate limit cleanup (hourly)
    await boss.createQueue(QUEUE.RATE_LIMIT_CLEANUP);
    await boss.schedule(QUEUE.RATE_LIMIT_CLEANUP, "0 * * * *");
    await boss.work(QUEUE.RATE_LIMIT_CLEANUP, async () => {
      const result = await fastify.db.execute(sql`
        DELETE FROM rate_limit_entries WHERE expires_at < now()
      `);
      fastify.log.info(
        { deleted: result.rowCount },
        "rate-limit cleanup completed",
      );
    });

    // Auth attempts cleanup (hourly)
    await boss.createQueue(QUEUE.AUTH_ATTEMPTS_CLEANUP);
    await boss.schedule(QUEUE.AUTH_ATTEMPTS_CLEANUP, "0 * * * *");
    await boss.work(QUEUE.AUTH_ATTEMPTS_CLEANUP, async () => {
      const result = await fastify.db.execute(sql`
        DELETE FROM auth_attempts WHERE last_failed_at < now() - interval '24 hours'
      `);
      fastify.log.info(
        { deleted: result.rowCount },
        "auth-attempts cleanup completed",
      );
    });

    // Token blacklist cleanup (daily at 3am)
    await boss.createQueue(QUEUE.TOKEN_BLACKLIST_CLEANUP);
    await boss.schedule(QUEUE.TOKEN_BLACKLIST_CLEANUP, "0 3 * * *");
    await boss.work(QUEUE.TOKEN_BLACKLIST_CLEANUP, async () => {
      const result = await fastify.db.execute(sql`
        DELETE FROM blacklisted_tokens WHERE expires_at < now()
      `);
      fastify.log.info(
        { deleted: result.rowCount },
        "token-blacklist cleanup completed",
      );
    });

    fastify.log.info("queue workers registered");
  },
  {
    name: "queue-workers",
    fastify: "5.x",
    dependencies: [
      "queue",
      "database",
      "sms-service",
      "upload-service",
      "image-processing-service",
      "photo-service",
    ],
  },
);
