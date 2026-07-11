import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 10000,
    hookTimeout: 10000,
    // Execution settings
    // Tests use unique phone numbers via generateUniquePhone() from test-utils.ts
    // Files run in parallel, but tests within a file run sequentially to prevent
    // database conflicts from shared state in beforeEach/afterEach hooks
    pool: "threads",
    isolate: false, // Share environment between tests for performance
    fileParallelism: true, // Enable parallel file execution
    sequence: {
      concurrent: false, // Run tests within each file sequentially
    },
    // Aliases checked by vitest during test module resolution
    alias: {
      "firebase-admin/messaging": path.resolve(__dirname, "./tests/mocks/firebase-admin.ts"),
    },
  },
  resolve: {
    alias: [
      {
        // Exact match to avoid prefix-matching firebase-admin/messaging
        find: /^firebase-admin$/,
        replacement: path.resolve(__dirname, "./tests/mocks/firebase-admin.ts"),
      },
      {
        find: "firebase-admin/messaging",
        replacement: path.resolve(__dirname, "./tests/mocks/firebase-admin.ts"),
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
      {
        find: "@shared/types",
        replacement: path.resolve(__dirname, "../../shared/types"),
      },
      {
        find: "@shared/schemas",
        replacement: path.resolve(__dirname, "../../shared/schemas"),
      },
      {
        find: "@shared/utils",
        replacement: path.resolve(__dirname, "../../shared/utils"),
      },
    ],
  },
  // Ensure firebase-admin is processed inline (not externalized) so resolve.alias
  // can intercept both the main package and subpath imports like firebase-admin/messaging.
  ssr: {
    noExternal: ["firebase-admin"],
  },
});
