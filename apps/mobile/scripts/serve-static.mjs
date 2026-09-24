/**
 * Minimal static file server for the Expo web export in `dist/`.
 *
 * Dependency-free (only `node:` builtins). Serves one HTML file per route
 * with clean URLs and returns a real 404 for anything without a file —
 * deliberately no SPA fallback, so routing on the deployed service is
 * verifiable by status code.
 *
 * Usage: `node scripts/serve-static.mjs` (or `pnpm serve:web`).
 * Listens on `process.env.PORT ?? 8081`, host `0.0.0.0`.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".eot": "application/vnd.ms-fontobject",
};

/**
 * Resolve a request path to an absolute file under `distDir`.
 *
 * - `/` → `<dist>/index.html`
 * - `/login` → `<dist>/login.html`
 * - `/trips` and `/trips/` → `<dist>/trips/index.html`
 * - `/legal/privacy` → `<dist>/legal/privacy.html` (or nested index)
 * - Paths with an extension or dot-segments (e.g.
 *   `/.well-known/assetlinks.json`, `/_expo/static/js/web/bundle.js`)
 *   resolve to the exact file.
 * - Anything else (unknown path, `..` traversal, escaping `distDir`)
 *   returns `null`.
 *
 * Pure apart from the filesystem-existence check, so it is unit-testable
 * without opening a socket.
 *
 * @param {string} urlPath request path, may include query string or hash
 * @param {string} distDir absolute path of the export directory
 * @returns {string|null} absolute file path, or null when not servable
 */
export function resolveFile(urlPath, distDir) {
  const distRoot = path.resolve(distDir);
  // Strip query string and hash; only the path decides the file.
  let pathname = String(urlPath).split("?", 1)[0].split("#", 1)[0];
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;

  const segments = pathname.split("/");
  // Reject traversal and null bytes before touching the filesystem.
  // Empty segments (leading/trailing/double slashes) are fine.
  for (const segment of segments) {
    if (segment === ".." || segment.includes("\0")) return null;
  }
  const parts = segments.filter((s) => s.length > 0);

  /** @param {...string} rel */
  const candidate = (...rel) => {
    const abs = path.resolve(distRoot, ...rel);
    if (abs !== distRoot && !abs.startsWith(distRoot + path.sep)) return null;
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
    } catch {
      return null;
    }
    return null;
  };

  if (parts.length === 0) {
    return candidate("index.html");
  }

  // Exact file first (static assets, dotfiles like .well-known/*.json).
  const exact = candidate(...parts);
  if (exact) return exact;

  // Clean URLs: `<path>.html`, then `<path>/index.html` (nested index).
  const asHtml = candidate(`${parts.join("/")}.html`);
  if (asHtml) return asHtml;
  return candidate(...parts, "index.html");
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

function cacheControlFor(filePath, distRoot) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "no-cache";
  const rel = path.relative(distRoot, filePath);
  if (rel.startsWith(`_expo${path.sep}static${path.sep}`)) {
    return "public, max-age=31536000, immutable";
  }
  return null;
}

// This script serves the deployed production origin, not just a local E2E
// harness, so these headers are the app's — there is no proxy setting them.
const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

export function createServer(distDir) {
  const distRoot = path.resolve(distDir);
  return http.createServer((req, res) => {
    const method = req.method ?? "GET";
    const rawPath = (req.url ?? "/").split("?", 1)[0].split("#", 1)[0];
    let status = 200;

    const send = (code, body, headers = {}) => {
      status = code;
      const bodyText = body ?? "";
      const finalHeaders = {
        ...SECURITY_HEADERS,
        "content-length": Buffer.byteLength(bodyText),
        ...headers,
      };
      if (method === "HEAD") {
        res.writeHead(code, finalHeaders);
        res.end();
      } else {
        res.writeHead(code, finalHeaders);
        res.end(bodyText);
      }
      console.log(`${method} ${rawPath} ${status}`);
    };

    if (method !== "GET" && method !== "HEAD") {
      send(405, "method not allowed\n", { "content-type": "text/plain; charset=utf-8" });
      return;
    }

    const file = resolveFile(req.url ?? "/", distRoot);
    if (!file) {
      send(404, "not found\n", { "content-type": "text/plain; charset=utf-8" });
      return;
    }

    let data;
    try {
      data = fs.readFileSync(file);
    } catch {
      send(404, "not found\n", { "content-type": "text/plain; charset=utf-8" });
      return;
    }

    status = 200;
    const headers = {
      ...SECURITY_HEADERS,
      "content-type": contentTypeFor(file),
      "content-length": data.length,
    };
    const cache = cacheControlFor(file, distRoot);
    if (cache) headers["cache-control"] = cache;
    res.writeHead(200, headers);
    if (method === "HEAD") {
      res.end();
    } else {
      res.end(data);
    }
    console.log(`${method} ${rawPath} ${status}`);
  });
}

// Resolve `dist/` relative to this script, not the cwd.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(scriptDir, "..", "dist");

// Only listen when executed directly (`node scripts/serve-static.mjs`);
// importing the module (e.g. unit tests for `resolveFile`) must not open
// a socket as a side effect.
const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedAs === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8081);
  const server = createServer(distDir);
  server.listen(port, "0.0.0.0", () => {
    console.log(`serving ${distDir} on http://0.0.0.0:${port}`);
  });
}
