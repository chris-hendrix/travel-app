import { describe, expect, it, vi, afterEach } from "vitest";
import { createElement, Suspense } from "react";
import { createRequire } from "node:module";

// `lib/session.ts` (via `lib/queries/auth.ts`) imports `Platform` from
// `react-native`: stub it like the auth tests do, or the real
// Flow-typed entrypoint breaks the node transform.
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

// Same probe seam as `trip-cover.test.ts`: `react-dom` ships no
// server types in this workspace, so the renderer is loaded through
// `require` (typed as `any`).
const require = createRequire(import.meta.url);
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: unknown) => string;
};

// Keep the real `ApiError` (the rollback test asserts `instanceof`)
// and stub only the network at the module boundary.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { QueryClientProvider } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import { authKeys } from "@/lib/queries/auth";
import {
  removePhoto,
  removePhotoOptions,
  uploadPhoto,
  uploadPhotoOptions,
} from "@/lib/queries/profile";
import { makeQueryClient } from "@/lib/queries/client";
import { ProfileProvider, useProfile } from "@/lib/profileStore";
import { initials, type Profile } from "@/lib/profile";

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The user row the photo endpoints return (`{success, user}`). */
function photoUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    phoneNumber: "+15551234567",
    displayName: "Ada Lovelace",
    profilePhotoUrl: "https://cdn.example/photos/user-1.jpg",
    handles: null,
    timezone: "Europe/Rome",
    temperatureUnit: "celsius",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function cachedProfile(): Profile {
  return {
    id: "user-1",
    displayName: "Ada Lovelace",
    phoneNumber: "+15551234567",
    profilePhotoUrl: null,
    handles: { venmo: "ada-lovelace", instagram: "ada.lovelace" },
    timezone: "Europe/Rome",
    temperatureUnit: "celsius",
  };
}

/**
 * `uploadPhoto` reads the picker URI into a blob via the global
 * `fetch`, so stub it: the blob bytes never touch the network in
 * unit tests (`apiFetch` is already mocked above).
 */
function stubUriFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(["bytes"], { type: "image/jpeg" })),
    }),
  );
}

describe("uploadPhoto", () => {
  it("POSTs FormData to /users/me/photo and returns the mapped profile", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, user: photoUser() });
    stubUriFetch();

    const options = uploadPhotoOptions();
    expect(options.mutationKey).toEqual(["profile", "uploadPhoto"]);

    const profile = await uploadPhoto("file:///cache/avatar.jpg");

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = mockedApiFetch.mock.calls[0] as [
      string,
      NonNullable<Parameters<typeof fetch>[1]>,
    ];
    expect(path).toBe("/users/me/photo");
    expect(init.method).toBe("POST");
    // Multipart: a FormData body, never JSON — `apiFetch` must not
    // set a Content-Type (the boundary is generated at send time).
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toBeUndefined();
    expect((init.body as FormData).get("file")).toBeInstanceOf(Blob);
    expect(profile.profilePhotoUrl).toBe(
      "https://cdn.example/photos/user-1.jpg",
    );
  });
});

describe("removePhoto", () => {
  it("DELETEs /users/me/photo and clears profilePhotoUrl", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      user: photoUser({ profilePhotoUrl: null }),
    });

    const options = removePhotoOptions();
    expect(options.mutationKey).toEqual(["profile", "removePhoto"]);

    const profile = await removePhoto();

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/users/me/photo",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(profile.profilePhotoUrl).toBeNull();
  });
});

describe("null photo mapping", () => {
  it("a null photo maps to initials, never a broken image", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      user: photoUser({ profilePhotoUrl: null }),
    });

    const profile = await removePhoto();
    expect(profile.profilePhotoUrl).toBeNull();
    // The screen renders `initials(displayName)` when the URL is
    // null — the tile always has content.
    expect(initials(profile.displayName)).toBe("AL");
  });
});

describe("useProfile() photo mutations", () => {
  function capturePhotoActions() {
    const client = makeQueryClient();
    client.setQueryData<Profile>(authKeys.me(), cachedProfile());

    const seen: {
      savePhoto: ((uri: string | null) => Promise<void>) | null;
    } = { savePhoto: null };
    function Probe() {
      const { savePhoto } = useProfile();
      seen.savePhoto = savePhoto;
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
    if (!seen.savePhoto) {
      throw new Error("photo actions were not captured");
    }
    return { client, savePhoto: seen.savePhoto };
  }

  it("writes the uploaded profilePhotoUrl into the me cache", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, user: photoUser() });
    stubUriFetch();

    const { client, savePhoto } = capturePhotoActions();

    await savePhoto("file:///cache/avatar.jpg");
    expect(client.getQueryData<Profile>(authKeys.me())).toMatchObject({
      id: "user-1",
      profilePhotoUrl: "https://cdn.example/photos/user-1.jpg",
    });

    // The me cache invalidates, so the next mount reads server truth.
    expect(client.getQueryState(authKeys.me())?.isInvalidated).toBe(true);
  });

  it("rolls back the me cache when the upload rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(new ApiError(500, "Upload failed"));
    stubUriFetch();

    const { client, savePhoto } = capturePhotoActions();
    client.setQueryData<Profile>(authKeys.me(), cachedProfile());

    await expect(savePhoto("file:///cache/avatar.jpg")).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(client.getQueryData<Profile>(authKeys.me())).toEqual(
      cachedProfile(),
    );
  });

  it("clears profilePhotoUrl in the me cache on remove", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      user: photoUser({ profilePhotoUrl: null }),
    });

    const { client, savePhoto } = capturePhotoActions();
    client.setQueryData<Profile>(authKeys.me(), {
      ...cachedProfile(),
      profilePhotoUrl: "https://cdn.example/old.jpg",
    });

    await savePhoto(null);
    expect(
      client.getQueryData<Profile>(authKeys.me())?.profilePhotoUrl,
    ).toBeNull();
  });
});
