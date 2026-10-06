import { connect } from "node:http2";
import type { PushPayload } from "@journiful/shared/types";
import type { Logger } from "@/types/logger.js";
import { createApnsTokenProvider, type ApnsTokenProvider } from "@/lib/apns-token.js";

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

export interface ApnsServiceDeps {
  logger: Logger;
  /** Mirrors FCM's cleanup: prune the row keyed `apns:<token>`. */
  removeSubscription: (endpoint: string) => Promise<void>;
  request?: ApnsRequestFn;
}

function defaultRequest(request: ApnsHttpRequest): Promise<ApnsHttpResponse> {
  return new Promise((resolve, reject) => {
    const client = connect(`https://${request.host}:${request.port}`);
    const stream = client.request({
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
      client.close();
      resolve({ status, body });
    });
    stream.on("error", (err) => {
      client.close();
      reject(err);
    });
    stream.end(request.body);
  });
}

/** APNs reasons that mean the token will never work again. */
const DEAD_TOKEN_REASONS = new Set(["BadDeviceToken", "Unregistered"]);

export class ApnsService {
  private tokens: ApnsTokenProvider | null = null;
  private enabled = false;

  constructor(
    private config: ApnsConfig,
    private deps: ApnsServiceDeps,
  ) {
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
      deps.logger.error({ err }, "Invalid APNs .p8 key — iOS push delivery disabled");
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
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
      const request = this.deps.request ?? defaultRequest;
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
        reason = (JSON.parse(res.body || "{}") as { reason?: string }).reason ?? "";
      } catch {
        reason = "";
      }

      const dead =
        res.status === 410 || (res.status === 400 && DEAD_TOKEN_REASONS.has(reason));

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
