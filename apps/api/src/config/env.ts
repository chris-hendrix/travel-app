import { z } from "zod";
import { config } from "dotenv";

// Load environment variables (.env.local takes precedence over .env)
config({ path: [".env.local", ".env"], quiet: true });

const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z
    .string()
    .regex(/^\d+$/, "PORT must be a number")
    .transform(Number)
    .default(8000),
  HOST: z.string().default("0.0.0.0"),

  // Database
  DATABASE_URL: z
    .url({ error: "DATABASE_URL must be a valid PostgreSQL URL" })
    .refine(
      (url) => url.startsWith("postgresql://"),
      "DATABASE_URL must start with postgresql://",
    ),

  // Authentication
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters for security"),

  // Frontend
  FRONTEND_URL: z
    .url({ error: "FRONTEND_URL must be a valid URL" })
    .default("http://localhost:3000"),

  // Proxy
  TRUST_PROXY: z
    .enum(["true", "false", "1", "0", ""])
    .default("false")
    .transform((v) => v === "true" || v === "1"),

  // Security & Behavior Flags
  COOKIE_SECURE: z
    .enum(["true", "false", "1", "0", ""])
    .default(process.env.NODE_ENV === "production" ? "true" : "false")
    .transform((v) => v === "true" || v === "1"),
  COOKIE_DOMAIN: z.string().optional(),
  EXPOSE_ERROR_DETAILS: z
    .enum(["true", "false", "1", "0", ""])
    .default(process.env.NODE_ENV === "development" ? "true" : "false")
    .transform((v) => v === "true" || v === "1"),
  ENABLE_FIXED_VERIFICATION_CODE: z
    .enum(["true", "false", "1", "0", ""])
    .default(process.env.NODE_ENV !== "production" ? "true" : "false")
    .transform((v) => v === "true" || v === "1"),

  // Logging
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  // Twilio (required when ENABLE_FIXED_VERIFICATION_CODE is false)
  TWILIO_ACCOUNT_SID: z.string().default(""),
  TWILIO_AUTH_TOKEN: z.string().default(""),
  TWILIO_VERIFY_SERVICE_SID: z.string().default(""),

  // Storage Provider
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),

  // S3-compatible Storage (required when STORAGE_PROVIDER is "s3")
  // Names match Railway Storage Bucket's AWS SDK preset
  AWS_ENDPOINT_URL: z.string().default(""),
  AWS_S3_BUCKET_NAME: z.string().default(""),
  AWS_ACCESS_KEY_ID: z.string().default(""),
  AWS_SECRET_ACCESS_KEY: z.string().default(""),
  AWS_DEFAULT_REGION: z.string().default("us-east-1"),

  // File Upload Configuration
  UPLOAD_DIR: z.string().default("uploads"),
  MAX_FILE_SIZE: z
    .string()
    .regex(/^\d+$/, "MAX_FILE_SIZE must be a number")
    .transform(Number)
    .refine((n) => n > 0, "MAX_FILE_SIZE must be positive")
    .default(5242880),
  ALLOWED_MIME_TYPES: z
    .string()
    .transform((val) => val.split(",").map((type) => type.trim()))
    .refine(
      (types) => types.every((type) => type.startsWith("image/")),
      "All ALLOWED_MIME_TYPES must start with 'image/'",
    )
    .default(["image/jpeg", "image/png", "image/webp"]),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  try {
    const parsed = envSchema.parse(process.env);

    // SAFETY: Block mock/dev services in production
    if (
      parsed.NODE_ENV === "production" &&
      parsed.ENABLE_FIXED_VERIFICATION_CODE
    ) {
      console.error(
        "❌ FATAL: ENABLE_FIXED_VERIFICATION_CODE cannot be true in production. " +
          "This would allow anyone to authenticate with a hardcoded code.",
      );
      process.exit(1);
    }

    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Environment variable validation failed:");
      error.issues.forEach((issue) => {
        console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
      });
    }
    process.exit(1);
  }
}

export const env = validateEnv();
