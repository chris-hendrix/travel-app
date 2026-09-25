import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, Suspense } from "react";
import { createRequire } from "node:module";

// Same pattern as `notifications.test.ts`: stub the network at the
// `@/lib/api` module boundary, keep the real `ApiError`.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

// Same probe seam as `notifications.test.ts`: `react-dom` ships no
// server types in this workspace, so the renderer is loaded through
// `require` (typed as `any`).
const require = createRequire(import.meta.url);
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: unknown) => string;
};

import { QueryClientProvider } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { GetUnreadCountResponse } from "@journiful/shared/types";
import type { Notification } from "@/lib/notifications";
import {
  notificationKeys,
  notificationsListOptions,
  unreadCountOptions,
} from "@/lib/queries/notifications";
import { makeQueryClient } from "@/lib/queries/client";
import {
  NotificationsProvider,
  useNotifications,
} from "@/lib/notificationsStore";
import { setSignedIn } from "@/lib/sessionFlag";

// The store gates its reads on the session (`sessionFlag`), so these tests
// have to say there is one: signed out, the list and the count are not
// fetched at all — which is the behaviour `session-flag.test.ts` covers.
beforeEach(() => {
  setSignedIn(true);
});

const mockedApiFetch = vi.mocked(apiFetch);

function countBody(count: number): GetUnreadCountResponse {
  return { success: true, count };
}

function cached(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "notif-1",
    type: "trip_message",
    title: "New message",
    body: "Rafa: bringing the good sunscreen",
    tripId: "trip-1",
    data: { messageId: "message-1" },
    readAt: null,
    createdAt: "2026-06-04T10:00:00.000Z",
    ...overrides,
  };
}

describe("unreadCountOptions", () => {
  it("reads GET /notifications/unread-count and returns the count", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(countBody(3));

    const options = unreadCountOptions();
    expect(options.queryKey).toEqual(notificationKeys.unreadCount());

    const count = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    // `apiFetch` base already includes `/api`: the path is the
    // route path only
    // (`apps/api/src/routes/notification.routes.ts:88`,
    // `unreadCountResponseSchema` in
    // `shared/schemas/notification.ts:50` — the wire field is
    // `count`, not `unreadCount`).
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/notifications/unread-count",
    );
    expect(count).toBe(3);
  });

  it("returns zero when nothing is unread", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(countBody(0));

    const options = unreadCountOptions();
    const count = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(count).toBe(0);
  });
});

describe("read/read-all invalidate the unread-count key", () => {
  function captureNotifications() {
    const client = makeQueryClient();
    client.setQueryData<Notification[]>(notificationKeys.list(), [
      cached(),
      cached({
        id: "notif-2",
        createdAt: "2026-06-03T10:00:00.000Z",
        readAt: "2026-06-03T11:00:00.000Z",
      }),
    ]);
    // Seed the server-count cache so the invalidation flag has a
    // query state to land on.
    client.setQueryData<number>(notificationKeys.unreadCount(), 1);

    const seen: {
      actions: ReturnType<typeof useNotifications> | null;
    } = { actions: null };
    function Probe() {
      seen.actions = useNotifications();
      return null;
    }
    function Wrapper() {
      return createElement(
        QueryClientProvider,
        { client },
        createElement(
          NotificationsProvider,
          null,
          createElement(Suspense, { fallback: null }, createElement(Probe)),
        ),
      );
    }
    renderToString(createElement(Wrapper));
    if (!seen.actions) throw new Error("useNotifications was not captured");
    return { client, actions: seen.actions };
  }

  it("markRead invalidates the unread-count query", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true });

    const { client, actions } = captureNotifications();

    await actions.markRead("notif-1");

    expect(
      client.getQueryState(notificationKeys.unreadCount())?.isInvalidated,
    ).toBe(true);
    // The list still invalidates too — both keys refresh.
    expect(
      client.getQueryState(notificationKeys.list())?.isInvalidated,
    ).toBe(true);
  });

  it("markAllRead invalidates the unread-count query", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true });

    const { client, actions } = captureNotifications();

    await actions.markAllRead();

    expect(
      client.getQueryState(notificationKeys.unreadCount())?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(notificationKeys.list())?.isInvalidated,
    ).toBe(true);
  });

  it("the list query key is untouched by the unread-count key", () => {
    // Guard against key-shape drift: the unread-count key must nest
    // under the domain `all` key (so a domain-wide invalidate catches
    // it) without colliding with the list key.
    expect(notificationsListOptions().queryKey).toEqual(
      notificationKeys.list(),
    );
    expect(notificationKeys.unreadCount()).not.toEqual(
      notificationKeys.list(),
    );
    expect(notificationKeys.unreadCount()[0]).toBe(
      notificationKeys.all[0],
    );
  });
});
