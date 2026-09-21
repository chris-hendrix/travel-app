import { describe, expect, it, vi } from "vitest";
import { createElement, Suspense } from "react";
import { createRequire } from "node:module";

// Same pattern as `travel.test.ts` / `stays.test.ts`: stub the network
// at the `@/lib/api` module boundary, keep the real `ApiError`
// (rollback tests assert `instanceof`).
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

// Same probe seam as `travel.test.ts`: `react-dom` ships no server
// types in this workspace, so the renderer is loaded through `require`
// (typed as `any`).
const require = createRequire(import.meta.url);
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: unknown) => string;
};

import { QueryClientProvider } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import { newestFirst, type Notification } from "@/lib/notifications";
import type {
  GetNotificationsResponse,
  Notification as ApiNotification,
} from "@journiful/shared/types";
import {
  markAllNotificationsRead,
  markAllNotificationsReadOptions,
  markNotificationRead,
  markNotificationReadOptions,
  notificationKeys,
  notificationsListOptions,
} from "@/lib/queries/notifications";
import { makeQueryClient } from "@/lib/queries/client";
import {
  NotificationsProvider,
  useNotifications,
} from "@/lib/notificationsStore";

const mockedApiFetch = vi.mocked(apiFetch);

/**
 * A full notification entity as `GET /notifications` returns it
 * (`notificationEntitySchema` in `shared/schemas/notification.ts`,
 * served by `GET /notifications` in
 * `apps/api/src/routes/notification.routes.ts:71`). Times are ISO
 * strings on the wire (Fastify serializes the `z.date()` columns);
 * `userId` is the caller-owned column `toNotification` drops.
 */
function row(overrides: Record<string, unknown> = {}): ApiNotification {
  return {
    id: "notif-1",
    userId: "user-1",
    tripId: "trip-1",
    type: "trip_message",
    title: "New message",
    body: "Rafa: bringing the good sunscreen",
    data: { messageId: "message-1" },
    readAt: null,
    createdAt: "2026-06-04T10:00:00.000Z",
    ...overrides,
  } as ApiNotification;
}

function listBody(rows: ApiNotification[]): GetNotificationsResponse {
  return {
    success: true,
    notifications: rows,
    meta: {
      total: rows.length,
      limit: 20,
      hasMore: false,
      nextCursor: null,
    },
    unreadCount: rows.filter((row) => row.readAt === null).length,
  };
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

describe("notificationsListOptions", () => {
  it("maps GET /notifications 1:1 to the mobile Notification", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(listBody([row()]));

    const options = notificationsListOptions();
    expect(options.queryKey).toEqual(notificationKeys.list());

    const notifications = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/notifications");
    expect(notifications).toHaveLength(1);
    // 1:1 through `toNotification` (Phase 1 Task 4): every column
    // survives except the caller-owned `userId`, which is dropped.
    expect(notifications[0]).toEqual({
      id: "notif-1",
      type: "trip_message",
      title: "New message",
      body: "Rafa: bringing the good sunscreen",
      tripId: "trip-1",
      data: { messageId: "message-1" },
      readAt: null,
      createdAt: "2026-06-04T10:00:00.000Z",
    });
    expect(notifications[0]).not.toHaveProperty("userId");
  });

  it("preserves server order (sorting stays with newestFirst)", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(
      listBody([
        row({ id: "notif-late", createdAt: "2026-06-05T10:00:00.000Z" }),
        row({ id: "notif-early", createdAt: "2026-06-04T10:00:00.000Z" }),
      ]),
    );

    const options = notificationsListOptions();
    const notifications = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    // The query maps; the screen sorts. Server order passes through
    // untouched.
    expect(notifications.map((notification) => notification.id)).toEqual([
      "notif-late",
      "notif-early",
    ]);
  });
});

describe("newestFirst (lib/notifications.ts, unchanged)", () => {
  it("still sorts newest first, whatever the read state", () => {
    const rows = [
      cached({ id: "old", createdAt: "2026-06-01T10:00:00.000Z" }),
      cached({
        id: "new",
        createdAt: "2026-06-05T10:00:00.000Z",
        readAt: "2026-06-05T11:00:00.000Z",
      }),
      cached({ id: "mid", createdAt: "2026-06-03T10:00:00.000Z" }),
    ];
    expect(newestFirst(rows).map((row) => row.id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
    // Pure: the input order is untouched.
    expect(rows.map((row) => row.id)).toEqual(["old", "new", "mid"]);
  });
});

describe("markNotificationRead", () => {
  it("PATCHes /notifications/:id/read and resolves void", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true });

    const options = markNotificationReadOptions();
    expect(options.mutationKey).toEqual(["notifications", "markRead"]);

    await expect(markNotificationRead("notif-1")).resolves.toBeUndefined();

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/notifications/notif-1/read",
      { method: "PATCH" },
    );
  });
});

describe("markAllNotificationsRead", () => {
  it("PATCHes /notifications/read-all and resolves void", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true });

    const options = markAllNotificationsReadOptions();
    expect(options.mutationKey).toEqual(["notifications", "markAllRead"]);

    await expect(markAllNotificationsRead()).resolves.toBeUndefined();

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/notifications/read-all", {
      method: "PATCH",
    });
  });
});

describe("useNotifications() writes (notificationsStore)", () => {
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

  it("reads the list query's cache, with the unread count", () => {
    const { actions } = captureNotifications();
    expect(actions.notifications.map((row) => row.id)).toEqual([
      "notif-1",
      "notif-2",
    ]);
    expect(actions.unreadCount).toBe(1);
  });

  it("markRead paints readAt optimistically and invalidates", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true });

    const { client, actions } = captureNotifications();

    await actions.markRead("notif-1");

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/notifications/notif-1/read",
      { method: "PATCH" },
    );
    const rows = client.getQueryData<Notification[]>(notificationKeys.list());
    // The already-read row keeps its own stamp; the marked row gains one.
    expect(rows?.find((row) => row.id === "notif-1")?.readAt).not.toBeNull();
    expect(rows?.find((row) => row.id === "notif-2")?.readAt).toBe(
      "2026-06-03T11:00:00.000Z",
    );
    // The list invalidates, so the next mount reads server truth.
    expect(
      client.getQueryState(notificationKeys.list())?.isInvalidated,
    ).toBe(true);
  });

  it("markRead rolls the row back when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(500, "Failed to mark notification as read"),
    );

    const { client, actions } = captureNotifications();

    await expect(actions.markRead("notif-1")).rejects.toBeInstanceOf(ApiError);
    expect(
      client.getQueryData<Notification[]>(notificationKeys.list())?.find(
        (row) => row.id === "notif-1",
      )?.readAt,
    ).toBeNull();
  });

  it("markAllRead paints every unread row and invalidates", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true });

    const { client, actions } = captureNotifications();

    await actions.markAllRead();

    expect(mockedApiFetch).toHaveBeenCalledWith("/notifications/read-all", {
      method: "PATCH",
    });
    const rows = client.getQueryData<Notification[]>(notificationKeys.list());
    expect(rows?.every((row) => row.readAt !== null)).toBe(true);
    expect(
      client.getQueryState(notificationKeys.list())?.isInvalidated,
    ).toBe(true);
  });

  it("markAllRead rolls every row back when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(500, "Failed to mark all notifications as read"),
    );

    const { client, actions } = captureNotifications();

    await expect(actions.markAllRead()).rejects.toBeInstanceOf(ApiError);
    const rows = client.getQueryData<Notification[]>(notificationKeys.list());
    expect(
      rows?.find((row) => row.id === "notif-1")?.readAt,
    ).toBeNull();
    expect(rows?.find((row) => row.id === "notif-2")?.readAt).toBe(
      "2026-06-03T11:00:00.000Z",
    );
  });
});
