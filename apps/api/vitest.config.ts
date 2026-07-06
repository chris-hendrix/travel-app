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
  },
  resolve: {
    alias: {
      "firebase-admin": path.resolve(__dirname, "./tests/mocks/firebase-admin.ts"),
      "@": path.resolve(__dirname, "./src"),
      "@shared/types": path.resolve(__dirname, "../../shared/types"),
      "@shared/schemas": path.resolve(__dirname, "../../shared/schemas"),
      "@shared/utils": path.resolve(__dirname, "../../shared/utils"),
    },
  },
});
