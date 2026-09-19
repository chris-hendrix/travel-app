import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest only needs one thing here: the `@/*` path alias from
 * tsconfig.json. Without it, unit tests cannot import app modules —
 * Metro resolves those aliases, Node does not.
 */
export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
});
