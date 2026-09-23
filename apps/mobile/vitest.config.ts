import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

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
  test: {
    // Playwright specs live under tests/e2e and run via `pnpm test:e2e`;
    // without this, vitest collects them and fails on `test.describe`.
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
  },
});
