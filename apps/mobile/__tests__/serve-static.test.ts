import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveFile } from "../scripts/serve-static.mjs";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "serve-static-"));
  // Fixture export shape: root doc, clean-URL page, nested index route,
  // nested clean-URL page, and a dot-directory asset.
  fs.writeFileSync(path.join(dir, "index.html"), "<h1>home</h1>");
  fs.writeFileSync(path.join(dir, "login.html"), "<h1>login</h1>");
  fs.mkdirSync(path.join(dir, "trips"), { recursive: true });
  fs.writeFileSync(path.join(dir, "trips", "index.html"), "<h1>trips</h1>");
  fs.mkdirSync(path.join(dir, "legal"), { recursive: true });
  fs.writeFileSync(path.join(dir, "legal", "privacy.html"), "<h1>privacy</h1>");
  fs.mkdirSync(path.join(dir, ".well-known"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".well-known", "probe.json"), "{}");
  fs.mkdirSync(path.join(dir, "_expo", "static", "js"), { recursive: true });
  fs.writeFileSync(path.join(dir, "_expo", "static", "js", "bundle-abc123.js"), "x");
});

describe("resolveFile", () => {
  it("resolves the root to index.html", () => {
    expect(resolveFile("/", dir)).toBe(path.join(dir, "index.html"));
  });

  it("resolves a clean URL to its .html file", () => {
    expect(resolveFile("/login", dir)).toBe(path.join(dir, "login.html"));
  });

  it("resolves a clean URL to a nested index", () => {
    expect(resolveFile("/trips", dir)).toBe(path.join(dir, "trips", "index.html"));
  });

  it("resolves a trailing slash to the nested index", () => {
    expect(resolveFile("/trips/", dir)).toBe(path.join(dir, "trips", "index.html"));
  });

  it("resolves a nested clean URL", () => {
    expect(resolveFile("/legal/privacy", dir)).toBe(
      path.join(dir, "legal", "privacy.html"),
    );
  });

  it("ignores query strings and hashes", () => {
    expect(resolveFile("/invite?id=x", dir)).toBeNull();
    expect(resolveFile("/login?next=/trips#top", dir)).toBe(
      path.join(dir, "login.html"),
    );
  });

  it("serves dot-directory files", () => {
    expect(resolveFile("/.well-known/probe.json", dir)).toBe(
      path.join(dir, ".well-known", "probe.json"),
    );
  });

  it("serves hashed static assets by exact path", () => {
    expect(resolveFile("/_expo/static/js/bundle-abc123.js", dir)).toBe(
      path.join(dir, "_expo", "static", "js", "bundle-abc123.js"),
    );
  });

  it("rejects .. traversal", () => {
    expect(resolveFile("/../../etc/passwd", dir)).toBeNull();
    expect(resolveFile("/%2e%2e/etc/passwd", dir)).toBeNull();
    expect(resolveFile("/trips/../../etc/passwd", dir)).toBeNull();
  });

  it("returns null for unknown paths", () => {
    expect(resolveFile("/privacy", dir)).toBeNull();
    expect(resolveFile("/nonexistent-xyz", dir)).toBeNull();
  });
});
