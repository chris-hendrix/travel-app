import type { PgBoss } from "pg-boss";
import type { AppDatabase } from "@/types/index.js";
import type { ISMSService } from "@/services/sms.service.js";
import type { Logger } from "@/types/logger.js";

export const QUEUE = {
  NOTIFICATION_BATCH: "notification/batch",
  NOTIFICATION_BATCH_DLQ: "notification/batch/dlq",
  NOTIFICATION_DELIVER: "notification/deliver",
  NOTIFICATION_DELIVER_DLQ: "notification/deliver/dlq",
  INVITATION_SEND: "invitation/send",
  INVITATION_SEND_DLQ: "invitation/send/dlq",
  DAILY_ITINERARIES: "daily-itineraries",
  DAILY_ITINERARIES_DLQ: "daily-itineraries/dlq",
  PHOTO_PROCESSING: "photo/process",
  PHOTO_PROCESSING_DLQ: "photo/process/dlq",
  RATE_LIMIT_CLEANUP: "rate-limit/cleanup",
  AUTH_ATTEMPTS_CLEANUP: "auth-attempts/cleanup",
  TOKEN_BLACKLIST_CLEANUP: "token-blacklist/cleanup",
} as const;

export interface NotificationBatchPayload {
  tripId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  excludeUserId?: string;
}

export interface NotificationDeliverPayload {
  phoneNumber: string;
  message: string;
}

export interface InvitationSendPayload {
  phoneNumber: string;
  message: string;
}

export interface PhotoProcessingPayload {
  photoId: string;
  tripId: string;
  rawKey: string;
}

export interface WorkerDeps {
  db: AppDatabase;
  boss: PgBoss;
  smsService: ISMSService;
  logger: Logger;
}
