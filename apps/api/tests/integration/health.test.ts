import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";

describe("Health Check Endpoint", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it("should return 200 status code", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
  });

  it("should return correct response structure", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    const body = JSON.parse(response.body);

    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("database");
  });

  it("should return status as ok", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    const body = JSON.parse(response.body);

    expect(body.status).toBe("ok");
  });

  it("should return valid ISO-8601 timestamp", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    const body = JSON.parse(response.body);

    expect(body.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it("should return database status as connected or disconnected", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    const body = JSON.parse(response.body);

    expect(["connected", "disconnected"]).toContain(body.database);
  });

  it("should return database as connected when database is available", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    const body = JSON.parse(response.body);

    // In test environment with proper setup, database should be connected
    expect(body.database).toBe("connected");
  });

  it("reports the schema state the database carries", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/health/ready",
    });

    const body = JSON.parse(response.body);

    // The suite's database is migrated from the same journal this build ships,
    // so "current" is the only honest answer here. The "behind" path — the one
    // that makes this probe worth having — is held by the unit test, which can
    // inject a database that is behind; a live one cannot be.
    expect(response.statusCode).toBe(200);
    expect(body.migrations).toBe("current");
  });

  it("says the same thing on the general health report", async () => {
    app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/api/health" });

    // Both endpoints read the one service, and the field is named in both
    // schemas: Fastify's serializer drops what a schema does not list, so a
    // missing entry would make the signal vanish on the wire rather than fail
    // a test.
    expect(JSON.parse(response.body).migrations).toBe("current");
  });
});
