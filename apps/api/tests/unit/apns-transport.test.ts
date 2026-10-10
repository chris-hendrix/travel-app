import { describe, it, expect, vi, afterEach } from "vitest";
import { connect, createServer } from "node:http2";
import type {
  ClientHttp2Session,
  Http2Server,
  ServerHttp2Stream,
} from "node:http2";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import fp from "fastify-plugin";
import { generateKeyPairSync } from "node:crypto";
import { ApnsConnection, ApnsService } from "../../src/services/apns.service";
import pushServicePlugin from "../../src/plugins/push-service.js";
import type { Logger } from "../../src/types/logger.js";

/**
 * The transport itself, which `tests/service/apns-delivery.test.ts` never
 * reaches because it injects `request`. Four things here are load-bearing:
 *
 *  - a connect failure is emitted on the *session*, not on the request stream,
 *    and an unlistened `'error'` is an uncaught exception — which
 *    close-with-grace turns into a shutdown of the whole API over one failed
 *    push, so the failure has to arrive as a rejected promise;
 *  - a socket that connects and then goes quiet has to hit a deadline instead
 *    of leaving `sendToToken` pending forever inside the delivery worker;
 *  - the session is opened once per host and reused, not rebuilt per push;
 *  - and it is released on `app.close()`, which is the only shutdown path the
 *    process has.
 *
 * The real `connect` is used for the failure cases (loopback port 1 refuses
 * immediately; an unresolvable host fails at DNS). Only the two silent-stream
 * cases inject the connector, because a stream that connects and then says
 * nothing needs a local h2c server: the origin is rewritten from `https://` to
 * `http://`, and `sendToToken` pins port 443, so its case discards the origin
 * outright.
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

/** A local HTTP/2 server; the handler decides what each stream answers. */
const servers: Http2Server[] = [];

async function startServer(handler: (stream: ServerHttp2Stream) => void) {
  const server = createServer();
  server.on("stream", (stream) => {
    // A client that hits its deadline destroys its stream, which lands here as
    // a stream error; unlistened that is an uncaught exception in the worker.
    stream.on("error", () => {});
    handler(stream);
  });
  server.on("error", () => {});
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  servers.push(server);
  return { port: (server.address() as AddressInfo).port };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

function post(host: string, port: number) {
  return {
    host,
    port,
    path: "/3/device/test-token",
    method: "POST",
    headers: { "apns-topic": "com.journiful.app" },
    body: "{}",
  };
}

describe("ApnsConnection", () => {
  it("rejects a failed connect instead of emitting an uncaught session 'error'", async () => {
    const logger = makeLogger();
    const connection = new ApnsConnection(logger);

    // Port 1 on loopback refuses instantly, with no network involved.
    const err = await connection
      .request(post("127.0.0.1", 1))
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    // The listener on the session is what turns Node's default (an uncaught
    // exception) into a log line; the pending stream is cancelled with the
    // same failure and rejects the promise above.
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "127.0.0.1",
        err: expect.objectContaining({ code: "ECONNREFUSED" }),
      }),
      "APNs session error",
    );
    connection.close();
  });

  it("surfaces an unresolvable host as a rejection, not a process-level error", async () => {
    const logger = makeLogger();
    const connection = new ApnsConnection(logger, { timeoutMs: 2000 });

    // `.invalid` is reserved as never-resolvable, so DNS answers ENOTFOUND:
    // the session emits the failure and cancels the pending stream with it.
    // The deadline is a backstop for an environment where that never lands.
    const err = await connection
      .request(post("apns-does-not-exist.invalid", 443))
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect(logger.error).toHaveBeenCalledWith(
      expect.anything(),
      "APNs session error",
    );
    connection.close();
  });

  it("evicts a failed session, so the next send dials again instead of reusing a corpse", async () => {
    let connects = 0;
    const logger = makeLogger();
    const connection = new ApnsConnection(logger, {
      connectSession: (origin: string) => {
        connects += 1;
        return connect(origin);
      },
    });

    await expect(connection.request(post("127.0.0.1", 1))).rejects.toThrow();
    await expect(connection.request(post("127.0.0.1", 1))).rejects.toThrow();

    expect(connects).toBe(2);
    connection.close();
  });

  it("times out a stream that connects and then goes quiet", async () => {
    const logger = makeLogger();
    // Never responds, never ends: the socket stays open and silent.
    const { port } = await startServer(() => {});
    const connection = new ApnsConnection(logger, {
      connectSession: (origin: string) =>
        connect(origin.replace("https://", "http://")),
      timeoutMs: 250,
    });

    const started = Date.now();
    const err = await connection
      .request(post("127.0.0.1", port))
      .catch((e) => e);
    const elapsed = Date.now() - started;

    expect((err as Error).message).toBe("APNs request timed out after 250ms");
    // The deadline fired, rather than the promise settling for some other
    // reason — and it fired near the deadline, not after the test's own.
    expect(elapsed).toBeGreaterThanOrEqual(200);
    expect(elapsed).toBeLessThan(5000);
    connection.close();
  });

  it("opens one session per host:port and reuses it across requests", async () => {
    const logger = makeLogger();
    const answer = (stream: ServerHttp2Stream) => {
      stream.respond({ ":status": 200 });
      stream.end();
    };
    const first = await startServer(answer);
    const second = await startServer(answer);

    const sessions: ClientHttp2Session[] = [];
    const connection = new ApnsConnection(logger, {
      connectSession: (origin: string) => {
        const session = connect(origin.replace("https://", "http://"));
        sessions.push(session);
        return session;
      },
    });

    await expect(
      connection.request(post("127.0.0.1", first.port)),
    ).resolves.toEqual({ status: 200, body: "" });
    await expect(
      connection.request(post("127.0.0.1", first.port)),
    ).resolves.toEqual({ status: 200, body: "" });
    expect(sessions).toHaveLength(1);

    // A second host is a second session — sandbox and production never share.
    await expect(
      connection.request(post("127.0.0.1", second.port)),
    ).resolves.toEqual({ status: 200, body: "" });
    expect(sessions).toHaveLength(2);

    const closed = sessions.map((session) => vi.spyOn(session, "close"));
    connection.close();
    for (const spy of closed) expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("ApnsService over the real transport", () => {
  it("gives up on a silent APNs rather than leaving the delivery worker pending", async () => {
    const logger = makeLogger();
    const removeSubscription = vi.fn();
    const { port } = await startServer(() => {});
    const service = new ApnsService(
      {
        keyP8: PEM,
        keyId: "ABC123DEFG",
        teamId: "JOURNIFUL1",
        bundleId: "com.journiful.app",
        sandbox: false,
      },
      {
        logger,
        removeSubscription,
        // `sendToToken` pins port 443 for Apple, so the origin is discarded
        // here to reach the local server; the socket and the stream are real.
        connectSession: () => connect(`http://127.0.0.1:${port}`),
        timeoutMs: 250,
      },
    );

    const payload = { title: "Hi", body: "there", url: "/trips", tag: "t1" };
    // `sendToToken` must settle: a rejected transport is a log line, not a
    // stuck job, and definitely not a dead token.
    await expect(service.sendToToken("token-silent", payload)).resolves.toBe(
      undefined,
    );
    expect(removeSubscription).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.objectContaining({
          message: "APNs request timed out after 250ms",
        }),
      }),
      "APNs delivery failed",
    );

    service.close();
  });

  it("is closed by app.close(), which is the shutdown path close-with-grace uses", async () => {
    const closed = vi.spyOn(ApnsService.prototype, "close");
    const app = Fastify();

    // The plugin declares `database` and `config` as dependencies, so both
    // have to exist; neither is reached at construction time.
    const stub = (
      name: string,
      decorate: (instance: FastifyInstance) => void,
    ) =>
      fp(
        async (instance) => {
          decorate(instance);
        },
        { name },
      );
    await app.register(
      stub("database", (instance) => instance.decorate("db", {} as never)),
    );
    await app.register(
      stub("config", (instance) =>
        instance.decorate("config", {
          // No .p8: delivery is off, which is the point — the sessions still
          // have to be released when the app goes down.
          APNS_BUNDLE_ID: "com.journiful.app",
          APNS_USE_SANDBOX: false,
          VAPID_PUBLIC_KEY: "",
          VAPID_PRIVATE_KEY: "",
          VAPID_SUBJECT: "",
          FIREBASE_SERVICE_ACCOUNT: "",
        } as never),
      ),
    );
    await app.register(pushServicePlugin);

    await app.close();

    expect(closed).toHaveBeenCalledTimes(1);
  });
});
