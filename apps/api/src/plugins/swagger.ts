import fp from "fastify-plugin";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { jsonSchemaTransform } from "fastify-type-provider-zod";
import type { FastifyInstance } from "fastify";

/**
 * Swagger/OpenAPI plugin
 * Registers @fastify/swagger and @fastify/swagger-ui for API documentation
 * Serves interactive docs at /docs and OpenAPI JSON at /docs/json
 */
export default fp(
  async function swaggerPlugin(fastify: FastifyInstance) {
    await fastify.register(swagger, {
      openapi: {
        info: {
          title: "Journiful API",
          version: "1.0.0",
          description: "Collaborative trip planning API",
        },
        servers: [{ url: `http://localhost:${fastify.config.PORT}` }],
        components: {
          securitySchemes: {
            cookieAuth: {
              type: "apiKey",
              in: "cookie",
              name: "auth_token",
            },
          },
        },
      },
      transform: jsonSchemaTransform,
    });

    await fastify.register(swaggerUi, {
      routePrefix: "/docs",
      staticCSP: true,
      transformStaticCSP: () =>
        [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "font-src 'self' data:",
        ].join("; "),
    });
  },
  {
    name: "swagger",
    dependencies: ["config"],
    fastify: "5.x",
  },
);
