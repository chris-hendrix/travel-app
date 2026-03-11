import Fastify from "fastify";
import type { FastifyInstance, FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import helmet from "@fastify/helmet";
import underPressure from "@fastify/under-pressure";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { resolve } from "node:path";

// Plugins
import configPlugin from "./plugins/config.js";
import swaggerPlugin from "./plugins/swagger.js";
import databasePlugin from "./plugins/database.js";
import { createPgRateLimitStoreClass } from "./plugins/pg-rate-limit-store.js";
import queuePlugin from "./plugins/queue.js";
import authServicePlugin from "./plugins/auth-service.js";
import permissionsServicePlugin from "./plugins/permissions-service.js";
import tripServicePlugin from "./plugins/trip-service.js";
import eventServicePlugin from "./plugins/event-service.js";
import accommodationServicePlugin from "./plugins/accommodation-service.js";
import memberTravelServicePlugin from "./plugins/member-travel-service.js";
import uploadServicePlugin from "./plugins/upload-service.js";
import invitationServicePlugin from "./plugins/invitation-service.js";
import smsServicePlugin from "./plugins/sms-service.js";
import verificationServicePlugin from "./plugins/verification-service.js";
import healthServicePlugin from "./plugins/health-service.js";
import messageServicePlugin from "./plugins/message-service.js";
import notificationServicePlugin from "./plugins/notification-service.js";
import mutualsServicePlugin from "./plugins/mutuals-service.js";
import calendarServicePlugin from "./plugins/calendar-service.js";
import geocodingServicePlugin from "./plugins/geocoding-service.js";
import weatherServicePlugin from "./plugins/weather-service.js";
import imageProcessingServicePlugin from "./plugins/image-processing-service.js";
import photoServicePlugin from "./plugins/photo-service.js";
import queueWorkersPlugin from "./queues/index.js";

// Middleware
import { errorHandler } from "./middleware/error.middleware.js";

// Routes
import { healthRoutes } from "./routes/health.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { tripRoutes } from "./routes/trip.routes.js";
import { eventRoutes } from "./routes/event.routes.js";
import { accommodationRoutes } from "./routes/accommodation.routes.js";
import { memberTravelRoutes } from "./routes/member-travel.routes.js";
import { invitationRoutes } from "./routes/invitation.routes.js";
import { messageRoutes } from "./routes/message.routes.js";
import { notificationRoutes } from "./routes/notification.routes.js";
import { mutualsRoutes } from "./routes/mutuals.routes.js";
import { userRoutes } from "./routes/user.routes.js";
import { calendarRoutes } from "./routes/calendar.routes.js";
import { weatherRoutes } from "./routes/weather.routes.js";
import { photoRoutes } from "./routes/photo.routes.js";

// Config
import { env } from "./config/env.js";

// Import types to ensure module augmentations are loaded
import "./types/index.js";

export interface BuildAppOptions {
  /** Fastify server options (logger, etc.) */
  fastify?: FastifyServerOptions;
  /** Rate limit overrides */
  rateLimit?: {
    global?: boolean;
  };
  /** Disable @fastify/under-pressure health monitoring (useful in tests) */
  disableUnderPressure?: boolean;
}

/**
 * Build and configure a Fastify application instance
 * Used by both the production server and test helpers
 */
export async function buildApp(
  opts: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    ...opts.fastify,
    trustProxy: env.TRUST_PROXY ?? false,
    ajv: {
      customOptions: {
        useDefaults: true,
      },
    },
  });

  // Set Zod validator and serializer compilers
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Register config plugin (must be first - other plugins depend on it)
  await app.register(configPlugin);

  // Register database plugin
  await app.register(databasePlugin);

  // Register queue plugin (pg-boss)
  await app.register(queuePlugin);

  // Register CORS
  await app.register(cors, {
    origin: app.config.FRONTEND_URL.split(",").map((s) => s.trim()),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["X-Total-Count"],
    maxAge: 86400, // 24 hours
  });

  // Register helmet (security headers)
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    strictTransportSecurity: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hidePoweredBy: true,
  });

  // Register cookie plugin (must be before JWT)
  await app.register(cookie);

  // Register JWT plugin
  await app.register(jwt, {
    secret: app.config.JWT_SECRET,
    sign: {
      expiresIn: "7d",
      algorithm: "HS256",
    },
    verify: {
      algorithms: ["HS256"],
    },
    cookie: {
      cookieName: "auth_token",
      signed: false,
    },
  });

  // Register rate limit plugin with PostgreSQL-backed store
  const PgRateLimitStore = createPgRateLimitStoreClass(app.db);
  await app.register(rateLimit, {
    global: opts.rateLimit?.global ?? true,
    max: 100,
    timeWindow: "15 minutes",
    allowList: ["127.0.0.1"],
    skipOnError: false,
    store: PgRateLimitStore,
  });

  // Register multipart plugin (for file uploads)
  await app.register(multipart, {
    limits: {
      fileSize: app.config.MAX_FILE_SIZE,
      files: 5,
      fieldNameSize: 100,
      fields: 10,
      headerPairs: 2000,
    },
    throwFileSizeLimit: true,
  });

  // Register static file serving for local storage mode
  // S3 mode registers its own redirect route in the upload-service plugin
  if (env.STORAGE_PROVIDER !== "s3") {
    await app.register(fastifyStatic, {
      root: resolve(import.meta.dirname, "..", app.config.UPLOAD_DIR),
      prefix: "/uploads/",
      decorateReply: false,
    });
  }

  // Register under-pressure (health monitoring) — skip in test environments
  // to avoid spurious 503s from event loop delays during DB setup/teardown
  if (!opts.disableUnderPressure) {
    await app.register(underPressure, {
      maxEventLoopDelay: 1000,
      maxHeapUsedBytes: 1_000_000_000,
      maxRssBytes: 1_500_000_000,
      retryAfter: 50,
    });
  }

  // Register service plugins
  await app.register(smsServicePlugin);
  await app.register(geocodingServicePlugin);
  await app.register(verificationServicePlugin);
  await app.register(healthServicePlugin);
  await app.register(permissionsServicePlugin);
  await app.register(authServicePlugin);
  await app.register(tripServicePlugin);
  await app.register(eventServicePlugin);
  await app.register(accommodationServicePlugin);
  await app.register(memberTravelServicePlugin);
  await app.register(uploadServicePlugin);
  await app.register(notificationServicePlugin);
  await app.register(mutualsServicePlugin);
  await app.register(invitationServicePlugin);
  await app.register(messageServicePlugin);
  await app.register(calendarServicePlugin);
  await app.register(weatherServicePlugin);
  await app.register(imageProcessingServicePlugin);
  await app.register(photoServicePlugin);
  await app.register(queueWorkersPlugin);

  // Register Swagger/OpenAPI documentation (non-production only)
  if (app.config.NODE_ENV !== "production") {
    await app.register(swaggerPlugin);
  }

  // Register error handler
  app.setErrorHandler(errorHandler);

  // Register routes
  await app.register(healthRoutes, { prefix: "/api/health" });
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(tripRoutes, { prefix: "/api/trips" });
  await app.register(eventRoutes, { prefix: "/api" });
  await app.register(accommodationRoutes, { prefix: "/api" });
  await app.register(memberTravelRoutes, { prefix: "/api" });
  await app.register(invitationRoutes, { prefix: "/api" });
  await app.register(messageRoutes, { prefix: "/api" });
  await app.register(notificationRoutes, { prefix: "/api" });
  await app.register(mutualsRoutes, { prefix: "/api" });
  await app.register(userRoutes, { prefix: "/api/users" });
  await app.register(calendarRoutes, { prefix: "/api" });
  await app.register(weatherRoutes, { prefix: "/api" });
  await app.register(photoRoutes, { prefix: "/api/trips/:id/photos" });

  // Not-found handler for unmatched routes
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method} ${request.url} not found`,
      },
      requestId: request.id,
    });
  });

  return app;
}
