// Phase 2 Task 6 RED: daily purge wiring + fastify decoration.
import { describe, it, expect, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { QUEUE } from "@/queues/types.js";
import { PlaceCacheService } from "@/services/place-cache.service.js";

let app: FastifyInstance | null = null;

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

describe("place-cache wiring", () => {
  it("buildApp() decorates a PlaceCacheService instance", async () => {
    app = await buildApp();
    expect(app.placeCache).toBeInstanceOf(PlaceCacheService);
  });

  it("registers PLACE_CACHE_PURGE with a daily 4am schedule and a worker", async () => {
    expect(QUEUE.PLACE_CACHE_PURGE).toBe("place-cache/cleanup");
    const queuesIndex = await readFile(
      resolve(import.meta.dirname, "../../src/queues/index.ts"),
      "utf8",
    );
    expect(queuesIndex).toContain(
      "boss.schedule(QUEUE.PLACE_CACHE_PURGE, \"0 4 * * *\")",
    );
    expect(queuesIndex).toContain("boss.work(QUEUE.PLACE_CACHE_PURGE");
  });
});
