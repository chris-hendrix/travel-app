import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";

describe("CORS Configuration", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("Allowed Origins", () => {
    const preflightHeaders = {
      origin: "capacitor://localhost",
      "access-control-request-method": "GET",
    };

    it("should allow capacitor://localhost origin in preflight", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "OPTIONS",
        url: "/api/health",
        headers: preflightHeaders,
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe(
        "capacitor://localhost",
      );
      expect(response.headers["access-control-allow-credentials"]).toBe(
        "true",
      );
    });

    it("should allow http://localhost origin in preflight", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "OPTIONS",
        url: "/api/health",
        headers: {
          origin: "http://localhost",
          "access-control-request-method": "GET",
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe(
        "http://localhost",
      );
      expect(response.headers["access-control-allow-credentials"]).toBe(
        "true",
      );
    });

    it("should allow http://10.0.2.2:3000 origin in preflight", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "OPTIONS",
        url: "/api/health",
        headers: {
          origin: "http://10.0.2.2:3000",
          "access-control-request-method": "GET",
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe(
        "http://10.0.2.2:3000",
      );
      expect(response.headers["access-control-allow-credentials"]).toBe(
        "true",
      );
    });

    it("should allow existing FRONTEND_URL origin (http://localhost:3000) in preflight", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "OPTIONS",
        url: "/api/health",
        headers: {
          origin: "http://localhost:3000",
          "access-control-request-method": "GET",
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe(
        "http://localhost:3000",
      );
      expect(response.headers["access-control-allow-credentials"]).toBe(
        "true",
      );
    });

    it("should return CORS headers on non-preflight requests from allowed origins", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/health",
        headers: {
          origin: "capacitor://localhost",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBe(
        "capacitor://localhost",
      );
      expect(response.headers["access-control-allow-credentials"]).toBe(
        "true",
      );
    });
  });
});
