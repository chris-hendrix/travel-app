import { beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { config } from "dotenv";

// Load test environment variables
// Vitest automatically sets NODE_ENV='test'
config({ path: ".env", quiet: true });

// Use main database for tests
// Tests use unique phone numbers (generateUniquePhone) to prevent conflicts
// This allows parallel test execution without interference
const testPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

beforeAll(async () => {
  // Test database connection
  try {
    await testPool.query("SELECT 1");
    console.log("✓ Test database connected");
  } catch (error) {
    console.error("✗ Test database connection failed:", error);
    throw error;
  }

  // NOTE: No blanket DELETE statements here.
  // With pool: "threads" and fileParallelism: true, Vitest creates multiple
  // worker threads, each running setup.ts independently. Blanket DELETEs
  // would race with tests in other threads, wiping auth_attempts and
  // rate_limit_entries mid-test. Instead, each test file handles its own
  // cleanup via scoped afterEach hooks using unique phone numbers.
});

afterAll(async () => {
  // Clean up connections
  await testPool.end();
  console.log("✓ Test database connection closed");
});

// Export for use in tests
export { testPool };
