import { connect } from "node:http2";
import type { ClientHttp2Session } from "node:http2";
import type { PushPayload } from "@journiful/shared/types";
import type { Logger } from "@/types/logger.js";
import {
  createApnsTokenProvider,
  type ApnsTokenProvider,
} from "@/lib/apns-token.js";

/**
 * APNs payload and request construction.
 *
 * Key parity with FCM: `push.service.ts` sends `data: { url, ... }` and
 * `apps/mobile/app/_layout.tsx` reads `content.data.url`. The APNs payload
 * keeps `url` as a top-level custom key next to `aps` so both providers route
 * identically.
 */

export interface ApnsAlertPayload {
  aps: {
    alert: { title: string; body: string };
    sound: string;
    "thread-id"?: string;
  };
  url?: string;
}

export function buildApnsPayload(payload: PushPayload): ApnsAlertPayload {
  const aps: ApnsAlertPayload["aps"] = {
    alert: { title: payload.title, body: payload.body },
    sound: "default",
  };
  // A missing tag must not produce `"thread-id": undefined` — that serializes
  // to nothing but leaves a key in the in-memory object that tests and any
  // future equality check would trip over.
  if (payload.tag) aps["thread-id"] = payload.tag;

  return { aps, url: payload.url ?? "/" };
}

export interface ApnsRequest {
  headers: Record<string, string>;
  body: string;
}

export function buildApnsRequest(
  payload: PushPayload,
  token: string,
  bundleId: string,
): ApnsRequest {
  return {
    headers: {
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      authorization: `bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(buildApnsPayload(payload)),
  };
}
/* ------------------------------------------------------------------ */
/* Delivery                                                            */
/* ------------------------------------------------------------------ */

export interface ApnsConfig {
  /** Contents of the `.p8`; empty/absent means APNs delivery is off. */
  keyP8?: string;
  keyId?: string;
  teamId?: string;
  bundleId: string;
  sandbox?: boolean;
}

export interface ApnsHttpResponse {
  status: number;
  body: string;
}

export interface ApnsHttpRequest {
  host: string;
  port: number;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** The injected seam — tests stub this so no socket is ever opened. */
export type ApnsRequestFn = (
  request: ApnsHttpRequest,
) => Promise<ApnsHttpResponse>;

/**
 * A connected-then-silent socket must not pin a delivery worker forever.
 *
 * `stream.setTimeout` rather than the `AbortController` shape in
 * `places.service.ts`: `fetch` takes a signal, an HTTP/2 stream does not, and
 * destroying the stream with an error is what rejects the promise below.
 */
const REQUEST_TIMEOUT_MS = 10_000;

export interface ApnsConnectionOptions {
  /** Test seam — point the session at a local server instead of Apple. */
  connectSession?: ((origin: string) => ClientHttp2Session) | undefined;
  /** Test seam — shorten the deadline so a test need not wait it out. */
  timeoutMs?: number | undefined;
}

/**
 * The HTTP/2 transport: one session per APNs host, opened on first send and
 * kept for the life of the process.
 *
 * A `connect()` per request meant a TCP + TLS handshake per notification and
 * one session per recipient on a trip-wide fan-out, which is the rapid
 * open/close Apple documents as abusive. The session is also where a connect
 * failure lands, and the promise below cannot see it — hence the `error`
 * listener, without which Node's default for an unlistened `'error'` is an
 * uncaught exception, which `close-with-grace` (server.ts) answers by shutting
 * the whole API down over one failed push.
 */
export class ApnsConnection {
  private readonly sessions = new Map<string, ClientHttp2Session>();
  private readonly connectSession: (origin: string) => ClientHttp2Session;
  private readonly timeoutMs: number;

  constructor(
    private readonly logger: Logger,
    options: ApnsConnectionOptions = {},
  ) {
    this.connectSession = options.connectSession ?? connect;
    this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  private sessionFor(host: string, port: number): ClientHttp2Session {
    const key = `${host}:${port}`;
    const open = this.sessions.get(key);
    if (open && !open.closed && !open.destroyed) return open;

    const session = this.connectSession(`https://${key}`);
    session.on("error", (err) => {
      // Logged rather than rethrown: the pending stream is cancelled with the
      // same failure and rejects its own promise, so the caller still learns.
      this.logger.error({ err, host }, "APNs session error");
      if (this.sessions.get(key) === session) this.sessions.delete(key);
    });
    session.on("close", () => {
      if (this.sessions.get(key) === session) this.sessions.delete(key);
    });
    this.sessions.set(key, session);
    return session;
  }

  request(request: ApnsHttpRequest): Promise<ApnsHttpResponse> {
    return new Promise((resolve, reject) => {
      let session: ClientHttp2Session;
      try {
        session = this.sessionFor(request.host, request.port);
      } catch (err) {
        reject(err);
        return;
      }

      const stream = session.request({
        ":method": request.method,
        ":path": request.path,
        ...request.headers,
      });

      let status = 0;
      let body = "";
      stream.on("response", (headers) => {
        status = Number(headers[":status"] ?? 0);
      });
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => {
        body += chunk;
      });
      stream.on("end", () => {
        resolve({ status, body });
      });
      stream.setTimeout(this.timeoutMs, () => {
        stream.destroy(
          new Error(`APNs request timed out after ${this.timeoutMs}ms`),
        );
      });
      stream.on("error", (err) => {
        reject(err);
      });
      stream.end(request.body);
    });
  }

  /** Close every session. The app's shutdown path calls this via `ApnsService`. */
  close(): void {
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
  }
}

export interface ApnsServiceDeps {
  logger: Logger;
  /** Mirrors FCM's cleanup: prune the row keyed `apns:<token>`. */
  removeSubscription: (endpoint: string) => Promise<void>;
  request?: ApnsRequestFn;
  /** Test seams for the transport — see `ApnsConnection`. */
  connectSession?: ((origin: string) => ClientHttp2Session) | undefined;
  timeoutMs?: number | undefined;
}

/** APNs reasons that mean the token will never work again. */
const DEAD_TOKEN_REASONS = new Set(["BadDeviceToken", "Unregistered"]);

export class ApnsService {
  private tokens: ApnsTokenProvider | null = null;
  private enabled = false;
  private readonly connection: ApnsConnection;

  constructor(
    private config: ApnsConfig,
    private deps: ApnsServiceDeps,
  ) {
    this.connection = new ApnsConnection(deps.logger, {
      connectSession: deps.connectSession,
      timeoutMs: deps.timeoutMs,
    });
    const { keyP8, keyId, teamId } = config;
    if (!keyP8 || !keyId || !teamId) {
      deps.logger.info(
        "APNs credentials not configured — iOS push delivery disabled",
      );
      return;
    }
    try {
      this.tokens = createApnsTokenProvider({ p8: keyP8, keyId, teamId });
      this.enabled = true;
    } catch (err) {
      // A malformed .p8 must disable delivery, never throw into the caller.
      deps.logger.error(
        { err },
        "Invalid APNs .p8 key — iOS push delivery disabled",
      );
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Close the HTTP/2 sessions; registered as an `onClose` hook by the plugin. */
  close(): void {
    this.connection.close();
  }

  async sendToToken(token: string, payload: PushPayload): Promise<void> {
    if (!this.enabled || !this.tokens) return;

    const host = this.config.sandbox
      ? "api.sandbox.push.apple.com"
      : "api.push.apple.com";
    const path = `/3/device/${token}`;

    try {
      const jwt = await this.tokens.getToken();
      const { headers, body } = buildApnsRequest(
        payload,
        jwt,
        this.config.bundleId,
      );
      const request = this.deps.request ?? ((r) => this.connection.request(r));
      const res = await request({
        host,
        port: 443,
        path,
        method: "POST",
        headers,
        body,
      });

      if (res.status === 200) return;

      let reason = "";
      try {
        reason =
          (JSON.parse(res.body || "{}") as { reason?: string }).reason ?? "";
      } catch {
        reason = "";
      }

      const dead =
        res.status === 410 ||
        (res.status === 400 && DEAD_TOKEN_REASONS.has(reason));

      if (dead) {
        // Same shape as the FCM `registration-token-not-registered` branch.
        await this.deps.removeSubscription(`apns:${token}`);
        this.deps.logger.info(
          { token, status: res.status, reason },
          "removed invalid APNs token",
        );
        return;
      }

      // Anything else is transient: keep the row, log loudly.
      this.deps.logger.error(
        { status: res.status, reason, token },
        "APNs delivery failed",
      );
    } catch (err) {
      this.deps.logger.error({ err, token }, "APNs delivery failed");
    }
  }
}
