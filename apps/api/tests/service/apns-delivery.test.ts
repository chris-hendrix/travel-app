import { describe, it, expect, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  ApnsService,
  type ApnsRequestFn,
} from "../../src/services/apns.service";
import type { Logger } from "../../src/types/logger.js";

/**
 * Delivery semantics, which are the mirror image of the FCM branch in
 * push.service.ts: a dead token (410, or 400 BadDeviceToken) gets its
 * `push_subscriptions` row pruned, a transient failure (500) does not — a
 * flaky network must not log everyone out of push.
 *
 * The HTTP/2 request is injected, so no socket is ever opened.
 */

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

function makeLogger(): Logger & { error: ReturnType<typeof vi.fn> } {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger & { error: ReturnType<typeof vi.fn> };
}

function makeService(
  request: ApnsRequestFn,
  opts: { removeSubscription?: ReturnType<typeof vi.fn>; p8?: string } = {},
) {
  const logger = makeLogger();
  const removeSubscription = opts.removeSubscription ?? vi.fn();
  const service = new ApnsService(
    {
      keyP8: opts.p8 ?? PEM,
      keyId: "ABC123DEFG",
      teamId: "JOURNIFUL1",
      bundleId: "com.journiful.app",
      sandbox: false,
    },
    { logger, removeSubscription, request },
  );
  return { service, logger, removeSubscription };
}

const payload = { title: "Hi", body: "there", url: "/trips", tag: "t1" };

describe("ApnsService.sendToToken", () => {
  it("resolves on 200 and issues no delete", async () => {
    const request = vi.fn(async () => ({ status: 200, body: "" }));
    const { service, removeSubscription } = makeService(request);

    await expect(service.sendToToken("token-good", payload)).resolves.toBe(
      undefined,
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(removeSubscription).not.toHaveBeenCalled();
  });

  it("deletes the subscription row on 410 Unregistered", async () => {
    const request = vi.fn(async () => ({ status: 410, body: "" }));
    const { service, removeSubscription, logger } = makeService(request);

    await service.sendToToken("token-gone", payload);
    expect(removeSubscription).toHaveBeenCalledWith("apns:token-gone");
    expect(logger.info).toHaveBeenCalled();
  });

  it("deletes the subscription row on 400 BadDeviceToken", async () => {
    const request = vi.fn(async () => ({
      status: 400,
      body: JSON.stringify({ reason: "BadDeviceToken" }),
    }));
    const { service, removeSubscription } = makeService(request);

    await service.sendToToken("token-bad", payload);
    expect(removeSubscription).toHaveBeenCalledWith("apns:token-bad");
  });

  it("logs and keeps the row on a 500 — a transient failure is not a dead token", async () => {
    const request = vi.fn(async () => ({ status: 500, body: "boom" }));
    const { service, removeSubscription, logger } = makeService(request);

    await service.sendToToken("token-ok", payload);
    expect(removeSubscription).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it("disables itself with a log line when the .p8 is invalid, and never throws", async () => {
    const request = vi.fn(async () => ({ status: 200, body: "" }));
    const { service, logger } = makeService(request, {
      p8: "-----BEGIN PRIVATE KEY-----\nnot-a-key\n-----END PRIVATE KEY-----\n",
    });

    await expect(service.sendToToken("token-x", payload)).resolves.toBe(
      undefined,
    );
    expect(request).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it("is inert when no key is configured at all", async () => {
    const request = vi.fn(async () => ({ status: 200, body: "" }));
    const logger = makeLogger();
    const removeSubscription = vi.fn();
    const service = new ApnsService(
      { keyId: "", teamId: "", bundleId: "com.journiful.app" },
      { logger, removeSubscription, request },
    );

    await expect(service.sendToToken("token-x", payload)).resolves.toBe(
      undefined,
    );
    expect(request).not.toHaveBeenCalled();
    expect(removeSubscription).not.toHaveBeenCalled();
  });
});
