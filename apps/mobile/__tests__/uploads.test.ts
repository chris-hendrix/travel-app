import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiBase, resolveUploadUrl } from "@/lib/uploads";

/**
 * The regression this file exists for: the API stores uploads as
 * relative paths (`/uploads/<uuid>.jpg`) and serves them from its own
 * origin. Rendered as-is, Expo web resolved them against the Metro
 * origin (`localhost:8081/uploads/...` → 404) and the avatar came back
 * blank. See `lib/uploads.ts`.
 */
beforeEach(() => {
  delete process.env.EXPO_PUBLIC_API_URL;
});

afterEach(() => {
  delete (globalThis as { __DEV__?: boolean }).__DEV__;
  delete process.env.EXPO_PUBLIC_API_URL;
});

describe("apiBase", () => {
  it("strips trailing slashes from the configured origin", () => {
    process.env.EXPO_PUBLIC_API_URL = "https://api.journiful.app/api/";
    expect(apiBase()).toBe("https://api.journiful.app/api");
  });

  it("throws loudly with no base URL outside development", () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    expect(() => apiBase()).toThrow(/EXPO_PUBLIC_API_URL/);
  });
});

describe("resolveUploadUrl", () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = "http://localhost:8000/api";
  });

  it("prefixes a relative upload path with the API origin, minus /api", () => {
    expect(resolveUploadUrl("/uploads/abc.jpg")).toBe(
      "http://localhost:8000/uploads/abc.jpg",
    );
  });

  it("tolerates a path with no leading slash rather than producing //uploads", () => {
    expect(resolveUploadUrl("uploads/abc.jpg")).toBe(
      "http://localhost:8000/uploads/abc.jpg",
    );
  });

  it("passes absolute URLs through untouched", () => {
    expect(resolveUploadUrl("https://cdn.example/a.jpg")).toBe(
      "https://cdn.example/a.jpg",
    );
  });

  it("passes an optimistic picker URI through untouched", () => {
    // The store paints the local URI while the upload flies; rewriting
    // it would break the optimistic image.
    expect(resolveUploadUrl("blob:http://localhost:8081/uuid")).toBe(
      "blob:http://localhost:8081/uuid",
    );
    expect(resolveUploadUrl("file:///tmp/photo.jpg")).toBe(
      "file:///tmp/photo.jpg",
    );
    expect(resolveUploadUrl("data:image/png;base64,AAAA")).toBe(
      "data:image/png;base64,AAAA",
    );
  });

  it("maps absent values to null, never a broken image", () => {
    expect(resolveUploadUrl(null)).toBeNull();
    expect(resolveUploadUrl(undefined)).toBeNull();
    expect(resolveUploadUrl("")).toBeNull();
  });

  it("returns the path as-is when the API origin is unconfigured", () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    expect(resolveUploadUrl("/uploads/abc.jpg")).toBe("/uploads/abc.jpg");
  });
});
