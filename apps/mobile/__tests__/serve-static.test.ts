import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cacheControlFor, contentTypeFor, resolveFile } from "../scripts/serve-static.mjs";

/** What the export's own hashed filenames carry, in both of its forms. */
const HASH = "3ff1a2b4c5d6e7f8091a2b3c4d5e6f70";
const IMMUTABLE = "public, max-age=31536000, immutable";

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
  // The rest of the export's shape: hashed assets under `assets/`, the
  // manifest, and App Links — the three header outcomes.
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "assets", `BungeeShade_400Regular.${HASH}.ttf`),
    "x",
  );
  // react-navigation's own assets put the pixel scale *between* the
  // content hash and the extension, so this is the second form the
  // immutable rule has to match.
  fs.writeFileSync(path.join(dir, "assets", `close-icon.${HASH}@3x.png`), "x");
  fs.writeFileSync(path.join(dir, "assets", "splash.png"), "x");
  fs.mkdirSync(path.join(dir, "_expo", "static", "js", "web"), { recursive: true });
  fs.writeFileSync(path.join(dir, "_expo", "static", "js", "web", `entry-${HASH}.js`), "x");
  fs.writeFileSync(path.join(dir, "manifest.json"), "{}");
  fs.writeFileSync(path.join(dir, ".well-known", "assetlinks.json"), "[]");
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

/**
 * The export's own cache policy. This server is the deployed production
 * origin — nothing in front of it sets headers — so the difference between
 * "cached forever" and "no header at all" is decided here and nowhere
 * else. Only the basename matters to the rule, so the fixture files sit
 * at the paths the real export nests them under.
 */
describe("cacheControlFor", () => {
  it.each([
    // Metro's own asset naming: the content hash sits before the extension.
    [`assets/BungeeShade_400Regular.${HASH}.ttf`, IMMUTABLE],
    // react-navigation's, where the scale sits between hash and extension.
    // This is why the rule is not `/\.<hex>\.<ext>$/`.
    [`assets/close-icon.${HASH}@3x.png`, IMMUTABLE],
    [`_expo/static/js/web/entry-${HASH}.js`, IMMUTABLE],
    // The document must be revalidated or a deploy is invisible.
    ["index.html", "no-cache"],
    // Unhashed, so no freshness claim can be made about it: a header here
    // would either be immediately stale or would pin it against the very
    // deploys the app needs.
    ["manifest.json", null],
    [".well-known/assetlinks.json", null],
    ["assets/splash.png", null],
  ])("%s → %s", (rel, expected) => {
    expect(cacheControlFor(path.join(dir, rel), dir)).toBe(expected);
  });
});

describe("contentTypeFor", () => {
  it("serves sitemap.xml as XML", () => {
    expect(contentTypeFor("sitemap.xml")).toBe("application/xml; charset=utf-8");
  });
});
