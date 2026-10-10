import { describe, it, expect } from "vitest";
import type { PushPayload } from "@journiful/shared/types";
import {
  buildApnsPayload,
  buildApnsRequest,
} from "../../src/services/apns.service";

/**
 * FCM/APNs key parity: `apps/mobile/app/_layout.tsx` reads `content.data.url`
 * (lines ~303 and ~308) and `lib/pushRoutes.ts` maps it. The FCM payload in
 * push.service.ts puts the same key at the top level of `data`. The APNs
 * payload must keep them identical — a change to one is a change to the other,
 * or iOS notification taps stop routing.
 */
describe("buildApnsPayload", () => {
  const base: PushPayload = {
    title: "New message",
    body: "Ana: are we still on for 6?",
    url: "/trips?id=abc&tab=messages#discussion",
    tag: "msg-abc",
  };

  it("maps a PushPayload onto the aps alert shape, keeping url at the top level", () => {
    expect(buildApnsPayload(base)).toEqual({
      aps: {
        alert: { title: "New message", body: "Ana: are we still on for 6?" },
        sound: "default",
        "thread-id": "msg-abc",
      },
      url: "/trips?id=abc&tab=messages#discussion",
    });
  });

  it("omits thread-id entirely when there is no tag", () => {
    const payload = buildApnsPayload({ ...base, tag: undefined });
    expect("thread-id" in payload.aps).toBe(false);
    expect(Object.keys(payload.aps)).not.toContain("thread-id");
  });

  it("serializes to JSON with no undefined values", () => {
    const json = JSON.stringify(buildApnsPayload({ ...base, tag: undefined }));
    expect(json).not.toContain("undefined");
    expect(JSON.parse(json)).toEqual({
      aps: {
        alert: { title: "New message", body: "Ana: are we still on for 6?" },
        sound: "default",
      },
      url: "/trips?id=abc&tab=messages#discussion",
    });
  });
});

describe("buildApnsRequest", () => {
  const payload: PushPayload = {
    title: "Trip updated",
    body: "A trip has been updated",
    url: "/trips?id=abc",
    tag: "update-abc",
  };

  it("sets the topic, push type, priority and bearer authorization", () => {
    const req = buildApnsRequest(payload, "jwt-token", "com.journiful.app");
    expect(req.headers).toEqual({
      "apns-topic": "com.journiful.app",
      "apns-push-type": "alert",
      "apns-priority": "10",
      authorization: "bearer jwt-token",
      "content-type": "application/json",
    });
    expect(JSON.parse(req.body).aps.alert.title).toBe("Trip updated");
  });
});