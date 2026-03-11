import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { PhotoService } from "@/services/photo.service.js";

/**
 * Photo service plugin
 * Creates a PhotoService instance and decorates it on the Fastify instance
 */
export default fp(
  async function photoServicePlugin(fastify: FastifyInstance) {
    const photoService = new PhotoService(fastify.db);
    fastify.decorate("photoService", photoService);
  },
  {
    name: "photo-service",
    fastify: "5.x",
    dependencies: ["database"],
  },
);
