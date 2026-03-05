import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ quiet: true });

// Use TEST_DATABASE_URL if set, otherwise fall back to DATABASE_URL
const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL!;

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
});
