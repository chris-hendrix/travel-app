import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { ImageProcessingService } from "@/services/image-processing.service.js";

/**
 * Image processing service plugin
 * Creates an ImageProcessingService instance and decorates it on the Fastify instance
 */
export default fp(
  async function imageProcessingServicePlugin(fastify: FastifyInstance) {
    const imageProcessingService = new ImageProcessingService();
    fastify.decorate("imageProcessingService", imageProcessingService);
  },
  {
    name: "image-processing-service",
    fastify: "5.x",
  },
);
