import { describe, it, expect, vi } from "vitest";
import type { FastifyRequest, FastifyReply } from "fastify";
import { healthController } from "@/controllers/health.controller.js";
import type { HealthCheckResponse } from "@/types/index.js";

/**
 * The readiness decision, at the level a live database cannot reach.
 *
 * The integration test can only ever see `current` — it runs against the
 * database the suite migrates — so the branch that answers 503 is held here,
 * with the service stubbed. It is also the only coverage of the failure body:
 * `readyResponseSchema` declares 200 alone, so a 503 ships through Fastify's
 * default serializer, and a field dropped there would fail no other test.
 */
function statusOf(
  database: HealthCheckResponse["database"],
  migrations: HealthCheckResponse["migrations"],
): HealthCheckResponse {
  return {
    status: "ok",
    timestamp: "2026-10-10T00:00:00.000Z",
    database,
    migrations,
  };
}

function mockRequest(health: HealthCheckResponse) {
  return {
    server: {
      healthService: { getStatus: vi.fn().mockResolvedValue(health) },
    },
  } as unknown as FastifyRequest;
}

function mockReply() {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply;
}

describe("readiness", () => {
  it("is ready when the database answers and the schema is current", async () => {
    const reply = mockReply();
    const request = mockRequest(statusOf("connected", "current"));

    await healthController.ready(request, reply);

    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({
      status: "ok",
      timestamp: "2026-10-10T00:00:00.000Z",
      database: "connected",
      migrations: "current",
    });
  });

  it("is not ready when the database is behind this build", async () => {
    // The case the probe exists for.
    const reply = mockReply();
    const request = mockRequest(statusOf("connected", "behind"));

    await healthController.ready(request, reply);

    expect(reply.status).toHaveBeenCalledWith(503);
    expect(reply.send).toHaveBeenCalledWith({
      status: "error",
      timestamp: "2026-10-10T00:00:00.000Z",
      database: "connected",
      migrations: "behind",
    });
  });

  it("is not ready when the database is unreachable", async () => {
    const reply = mockReply();
    const request = mockRequest(statusOf("disconnected", "unknown"));

    await healthController.ready(request, reply);

    expect(reply.status).toHaveBeenCalledWith(503);
  });

  it("is ready when the schema state cannot be established", async () => {
    // `unknown` is not evidence of being behind. A probe that fails a deploy
    // because it cannot answer is worse than the bug it exists to catch, so
    // this must not quietly tighten into a third way to be unready.
    const reply = mockReply();
    const request = mockRequest(statusOf("connected", "unknown"));

    await healthController.ready(request, reply);

    expect(reply.status).toHaveBeenCalledWith(200);
  });
});
