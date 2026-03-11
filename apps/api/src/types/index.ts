// API-specific types

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgBoss } from "pg-boss";
import type * as schema from "@/db/schema/index.js";
import type * as relations from "@/db/schema/relations.js";
import type { Env } from "@/config/env.js";
import type { IAuthService } from "@/services/auth.service.js";
import type { ITripService } from "@/services/trip.service.js";
import type { IPermissionsService } from "@/services/permissions.service.js";
import type { IEventService } from "@/services/event.service.js";
import type { IAccommodationService } from "@/services/accommodation.service.js";
import type { IMemberTravelService } from "@/services/member-travel.service.js";
import type { IUploadService } from "@/services/upload.service.js";
import type { ISMSService } from "@/services/sms.service.js";
import type { IVerificationService } from "@/services/verification.service.js";
import type { IInvitationService } from "@/services/invitation.service.js";
import type { IMessageService } from "@/services/message.service.js";
import type { INotificationService } from "@/services/notification.service.js";
import type { IMutualsService } from "@/services/mutuals.service.js";
import type { ICalendarService } from "@/services/calendar.service.js";
import type { IGeocodingService } from "@/services/geocoding.service.js";
import type { IWeatherService } from "@/services/weather.service.js";
import type { IPhotoService } from "@/services/photo.service.js";
import type { IImageProcessingService } from "@/services/image-processing.service.js";
import type { IStorageService } from "@/services/storage.service.js";

export type FullSchema = typeof schema & typeof relations;
export type AppDatabase = NodePgDatabase<FullSchema>;

export interface HealthCheckResponse {
  status: "ok" | "error";
  timestamp: string;
  database: "connected" | "disconnected";
  environment?: string;
}

// JWT Payload types
export interface JWTPayload {
  sub: string; // User ID
  name?: string; // Display name (optional)
  jti?: string; // JWT ID for token blacklisting (optional for backward compat)
  iat: number; // Issued at
  exp: number; // Expires at
}

// Module augmentation for @fastify/jwt
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JWTPayload;
    user: JWTPayload;
  }
}

// Module augmentation for Fastify instance decorators
declare module "fastify" {
  interface FastifyInstance {
    config: Env;
    db: NodePgDatabase<FullSchema>;
    boss: PgBoss | null;
    authService: IAuthService;
    tripService: ITripService;
    permissionsService: IPermissionsService;
    eventService: IEventService;
    accommodationService: IAccommodationService;
    memberTravelService: IMemberTravelService;
    uploadService: IUploadService;
    smsService: ISMSService;
    verificationService: IVerificationService;
    invitationService: IInvitationService;
    messageService: IMessageService;
    notificationService: INotificationService;
    mutualsService: IMutualsService;
    calendarService: ICalendarService;
    geocodingService: IGeocodingService;
    weatherService: IWeatherService;
    photoService: IPhotoService;
    imageProcessingService: IImageProcessingService;
    storage: IStorageService;
    healthService: { getStatus(): Promise<HealthCheckResponse> };
  }
}
