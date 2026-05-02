// Ensure JWT secret exists BEFORE loading env (which validates it)
import { ensureJWTSecret } from "./config/jwt.js";
ensureJWTSecret();

import closeWithGrace from "close-with-grace";
import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { closeDatabase, testConnection } from "./config/database.js";

const app = await buildApp({
  fastify: {
    logger: {
      level: env.NODE_ENV === "development" ? "debug" : env.LOG_LEVEL,
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body.phoneNumber",
      ],
      ...(env.NODE_ENV === "development" && {
        transport: { target: "pino-pretty" },
      }),
    },
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "reqId",
    connectionTimeout: 30000,
    keepAliveTimeout: 5000,
    bodyLimit: 10 * 1024 * 1024, // 10MB (allows for 5MB file + multipart overhead)
  },
});

// Graceful shutdown with close-with-grace
closeWithGrace({ delay: 5000 }, async ({ signal, err }) => {
  if (err) {
    app.log.error({ err }, "Shutting down due to error");
  }
  if (signal) {
    app.log.info(`Received ${signal}, closing server...`);
  }
  await app.close();
  await closeDatabase(app.log);
});

// Start server
try {
  // Test database connection before starting
  const dbConnected = await testConnection(app.log);
  if (!dbConnected) {
    app.log.error("Failed to connect to database");
    process.exit(1);
  }

  await app.listen({
    port: env.PORT,
    host: env.HOST,
  });

  app.log.info(`Server running at http://${env.HOST}:${env.PORT}`);
  app.log.info(`Environment: ${env.NODE_ENV}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
