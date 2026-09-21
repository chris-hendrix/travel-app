import { describe, expect, it, vi } from "vitest";
import { createElement, Suspense } from "react";
import { createRequire } from "node:module";

// `lib/session.ts` (via `lib/queries/auth.ts`) imports `Platform` from
// `react-native`: stub it like the auth tests do, or the real
// Flow-typed entrypoint breaks the node transform.
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

// Same pattern as `notifications.test.ts`: stub the network at the
// `@/lib/api` module boundary, keep the real `ApiError` (rollback
// tests assert `instanceof`).
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
import { ApiError, apiFetch } from "@/lib/api";
import type { User } from "@journiful/shared/types";
import { meOptions, authKeys } from "@/lib/queries/auth";
import {
  updateProfile,
  updateProfileOptions,
} from "@/lib/queries/profile";
import { makeQueryClient } from "@/lib/queries/client";
import {
  draftFromProfile,
  type Profile,
  type ProfileDraft,
} from "@/lib/profile";
import { ProfileProvider, useProfile } from "@/lib/profileStore";

const mockedApiFetch = vi.mocked(apiFetch);

/**
 * A full user row as `GET /auth/me` and `PUT /users/me` return it
 * (`userResponseSchema` in `shared/schemas/auth.ts:73`). Times are ISO
 * strings on the wire (Fastify serializes the `z.date()` columns);
 * `handles` is the nested record the schema validates — flat
 * `venmo`/`instagram` keys never appear on the wire.
 */
function userRow(overrides: Record<string, unknown> = {}): User {
  return {
    id: "user-1",
    phoneNumber: "+15550000001",
    displayName: "Ada Lovelace",
    profilePhotoUrl: null,
    timezone: "America/New_York",
    handles: { venmo: "ada-lovelace", instagram: "ada.lovelace" },
    temperatureUnit: "fahrenheit",
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-04T10:00:00.000Z",
    ...overrides,
  } as unknown as User;
}

function meBody(user: User) {
  return { success: true as const, user };
}

function draft(overrides: Partial<ProfileDraft> = {}): ProfileDraft {
  return {
    displayName: "Ada Lovelace",
    venmo: "ada-lovelace",
    instagram: "ada.lovelace",
    temperatureUnit: "fahrenheit",
    ...overrides,
  };
}

function cachedProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "user-1",
    displayName: "Ada Lovelace",
    phoneNumber: "+15550000001",
    profilePhotoUrl: null,
    handles: { venmo: "ada-lovelace", instagram: "ada.lovelace" },
    timezone: "America/New_York",
    temperatureUnit: "fahrenheit",
    ...overrides,
  };
}

describe("profile read (meOptions, reused — no second me query)", () => {
  it("reads GET /auth/me (there is no GET /users/me) mapped to Profile", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(meBody(userRow()));

    // `meOptions` lives in `lib/queries/auth.ts` (Phase 2 Task 3) and
    // is reused here as-is: the profile read owns no query key of its
    // own, so `authKeys.me()` stays the one source of truth.
    const options = meOptions();
    expect(options.queryKey).toEqual(authKeys.me());

    const profile = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/auth/me");
    // Through `toProfile` (Phase 1 Task 4): nested `handles` pass
    // through onto the mobile `Profile`.
    expect(profile).toEqual({
      id: "user-1",
      displayName: "Ada Lovelace",
      phoneNumber: "+15550000001",
      profilePhotoUrl: null,
      handles: { venmo: "ada-lovelace", instagram: "ada.lovelace" },
      timezone: "America/New_York",
      temperatureUnit: "fahrenheit",
    });
  });
});

describe("updateProfile", () => {
  it("PUTs /users/me with the draft flattened into nested handles", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(meBody(userRow()));

    const options = updateProfileOptions();
    expect(options.mutationKey).toEqual(["profile", "update"]);

    await updateProfile(draft());

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    // `PUT /users/me` (`apps/api/src/routes/user.routes.ts:31`,
    // body `updateProfileSchema` in `shared/schemas/user.ts:33`):
    // the schema takes nested `handles`, so the draft's flat
    // venmo/instagram fold into `handles` here, in the client.
    expect(mockedApiFetch).toHaveBeenCalledWith("/users/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "Ada Lovelace",
        handles: { venmo: "ada-lovelace", instagram: "ada.lovelace" },
        temperatureUnit: "fahrenheit",
      }),
    });
  });

  it("sends handles: null when both draft handles are empty", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(
      meBody(userRow({ handles: null })),
    );

    await updateProfile(draft({ venmo: "  ", instagram: "" }));

    const [, init] = mockedApiFetch.mock.calls[0] as [
      string,
      { body: string },
    ];
    // Same rule as `applyDraft`: an empty handle is absent, and no
    // handles at all clears the row — never an empty string.
    expect(JSON.parse(init.body).handles).toBeNull();
  });

  it("maps the response user back through toProfile (handles and back)", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(
      meBody(
        userRow({
          displayName: "Augusta King",
          handles: { venmo: "augusta" },
        }),
      ),
    );

    const profile = await updateProfile(
      draft({ displayName: "Augusta King", instagram: "" }),
    );

    expect(profile.displayName).toBe("Augusta King");
    expect(profile.handles).toEqual({ venmo: "augusta" });
    // And back: the updated profile flattens into a draft again.
    expect(draftFromProfile(profile)).toEqual({
      displayName: "Augusta King",
      venmo: "augusta",
      instagram: "",
      temperatureUnit: "fahrenheit",
    });
  });

  it("never sends timezone (display-only on the profile screen)", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(meBody(userRow()));

    await updateProfile(draft());

    const [, init] = mockedApiFetch.mock.calls[0] as [
      string,
      { body: string },
    ];
    expect(JSON.parse(init.body)).not.toHaveProperty("timezone");
  });
});

describe("useProfile() write (profileStore)", () => {
  function captureProfile() {
    const client = makeQueryClient();
    client.setQueryData<Profile>(authKeys.me(), cachedProfile());

    const seen: {
      actions: ReturnType<typeof useProfile> | null;
    } = { actions: null };
    function Probe() {
      seen.actions = useProfile();
      return null;
    }
    function Wrapper() {
      return createElement(
        QueryClientProvider,
        { client },
        createElement(
          ProfileProvider,
          null,
          createElement(Suspense, { fallback: null }, createElement(Probe)),
        ),
      );
    }
    renderToString(createElement(Wrapper));
    if (!seen.actions) throw new Error("useProfile was not captured");
    return { client, actions: seen.actions };
  }

  it("reads the me query's cache", () => {
    const { actions } = captureProfile();
    expect(actions.profile?.displayName).toBe("Ada Lovelace");
    expect(actions.status).toBe("success");
  });

  it("saveProfile paints the draft optimistically and invalidates the me key", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue(
      meBody(userRow({ displayName: "Augusta King" })),
    );

    const { client, actions } = captureProfile();

    await actions.saveProfile(draft({ displayName: "Augusta King" }));

    expect(mockedApiFetch).toHaveBeenCalledWith("/users/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "Augusta King",
        handles: { venmo: "ada-lovelace", instagram: "ada.lovelace" },
        temperatureUnit: "fahrenheit",
      }),
    });
    // The server truth lands in the me cache; the key invalidates so
    // the next mount reads back from `GET /auth/me`.
    expect(client.getQueryData<Profile>(authKeys.me())?.displayName).toBe(
      "Augusta King",
    );
    expect(
      client.getQueryState(authKeys.me())?.isInvalidated,
    ).toBe(true);
  });

  it("saveProfile rolls the me cache back when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(
      new ApiError(500, "Failed to update profile"),
    );

    const { client, actions } = captureProfile();

    await expect(
      actions.saveProfile(draft({ displayName: "Augusta King" })),
    ).rejects.toBeInstanceOf(ApiError);
    expect(client.getQueryData<Profile>(authKeys.me())?.displayName).toBe(
      "Ada Lovelace",
    );
  });

  it("savePhoto uploads/removes through the photo endpoints (Task 4)", async () => {
    mockedApiFetch.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        blob: () =>
          Promise.resolve(new Blob(["bytes"], { type: "image/jpeg" })),
      }),
    );
    mockedApiFetch.mockResolvedValue({
      success: true,
      user: userRow({ profilePhotoUrl: "https://cdn.example/avatar.jpg" }),
    });

    const { client, actions } = captureProfile();

    await actions.savePhoto("file:///avatar.jpg");

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/users/me/photo",
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      client.getQueryData<Profile>(authKeys.me())?.profilePhotoUrl,
    ).toBe("https://cdn.example/avatar.jpg");

    mockedApiFetch.mockResolvedValue({
      success: true,
      user: userRow({ profilePhotoUrl: null }),
    });
    await actions.savePhoto(null);

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/users/me/photo",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(
      client.getQueryData<Profile>(authKeys.me())?.profilePhotoUrl,
    ).toBeNull();
    vi.unstubAllGlobals();
  });
});
