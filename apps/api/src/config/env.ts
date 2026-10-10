import { z } from "zod";
import { config } from "dotenv";

// Load environment variables (.env.local takes precedence over .env)
config({ path: [".env.local", ".env"], quiet: true });

/**
 * Restore literal newlines in a PEM that was stored `\n`-escaped. An already
 * literal PEM is returned unchanged; an unset value stays an empty string.
 */
export function unescapePem(value: string): string {
  if (!value) return "";
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

/**
 * The E.164 form of an App Review allowlist entry, or `null` when the entry
 * cannot be one. The allowlist is compared as an exact string by the validator
 * (`utils/phone.ts`) and by the verification wrapper
 * (`services/verification.service.ts`), and a human copies the same value into
 * the review notes — so every entry is normalised once, here at boot. `+1 (415)
 * 555-2671` pasted into a Railway variable would otherwise be a list that logs
 * itself as active and matches nothing.
 */
export function normaliseReviewPhone(entry: string): string | null {
  const stripped = entry.replace(/[\s\-().]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(stripped) ? stripped : null;
}

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
    .string()
    .url("DATABASE_URL must be a valid PostgreSQL URL")
    .refine(
      (url) => url.startsWith("postgresql://"),
      "DATABASE_URL must start with postgresql://",
    ),

  // Authentication
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters for security"),

  // Frontend (supports comma-separated list for CORS multiple origins)
  FRONTEND_URL: z
    .string()
    .min(1, "FRONTEND_URL is required")
    .refine(
      (val) =>
        val
          .split(",")
          .map((s) => s.trim())
          .every((url) => {
            try {
              new URL(url);
              return true;
            } catch {
              return false;
            }
          }),
      "FRONTEND_URL must be a valid URL (comma-separated list allowed)",
    )
    .default("http://localhost:8081"),

  // Public origin used for absolute URLs handed to external clients
  // (calendar webcal links). Must be a valid http(s) URL when set.
  PUBLIC_API_ORIGIN: z
    .string()
    .default("")
    .refine(
      (val) => {
        if (!val) return true;
        try {
          const url = new URL(val);
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      },
      "PUBLIC_API_ORIGIN must be a valid http(s) URL",
    ),

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

  // App Review sign-in allowlist: comma-separated phone numbers that can
  // complete sign-in with the fixed code and no Twilio call. Unlike
  // ENABLE_FIXED_VERIFICATION_CODE this is safe in production — it only
  // affects the numbers named here. Entries are normalised to E.164, and an
  // entry that is not one refuses the process rather than sitting in the list
  // unmatched: a formatted number is an allowlist that is silently inert, and
  // the operator only finds out when App Review cannot sign in.
  REVIEW_PHONES: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
    )
    .refine(
      (phones) => phones.every((p) => normaliseReviewPhone(p) !== null),
      "REVIEW_PHONES entries must be E.164 numbers (e.g. +14155552671)",
    )
    .transform((phones) => phones.map((p) => normaliseReviewPhone(p) ?? p)),

  // Logging
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  // Twilio (required when ENABLE_FIXED_VERIFICATION_CODE is false)
  TWILIO_ACCOUNT_SID: z.string().default(""),
  TWILIO_AUTH_TOKEN: z.string().default(""),
  TWILIO_VERIFY_SERVICE_SID: z.string().default(""),
  TWILIO_INVITE_MESSAGING_SERVICE_SID: z.string().default(""),

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
  // VAPID Keys for Web Push Notifications (optional — push disabled if not set)
  VAPID_PUBLIC_KEY: z.string().default(""),
  VAPID_PRIVATE_KEY: z.string().default(""),
  VAPID_SUBJECT: z.string().default("mailto:hello@journiful.app"),

  // Firebase Admin SDK for FCM push delivery (optional — JSON service account)
  FIREBASE_SERVICE_ACCOUNT: z.string().default(""),

  // Apple Push Notification service (optional — iOS delivery disabled if unset).
  // APNS_KEY_P8 may arrive with `\n`-escaped newlines (dashes/variables are
  // single-line), so it is unescaped on read.
  APNS_KEY_P8: z.string().default("").transform(unescapePem),
  APNS_KEY_ID: z.string().default(""),
  APNS_TEAM_ID: z.string().default(""),
  APNS_BUNDLE_ID: z.string().default("com.journiful.app"),
  APNS_USE_SANDBOX: z
    .enum(["true", "false", "1", "0", ""])
    .default(process.env.NODE_ENV === "production" ? "false" : "true")
    .transform((v) => v === "true" || v === "1"),

  // AeroDataBox Flight Lookup (optional)
  AERODATABOX_API_KEY: z.string().default(""),

  // Google Maps Platform (optional — discover/autocomplete returns empty if not set)
  // Sign up at https://console.cloud.google.com (free tier available)
  GOOGLE_MAPS_API_KEY: z.string().default(""),

  ADMIN_PHONE_NUMBERS: z
    .string()
    .default("")
    .transform((val) =>
      val
        ? val
            .split(",")
            .map((num) => num.trim())
            .filter(Boolean)
        : [],
    ),

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

/**
 * Default frontend origin used when FRONTEND_URL carries no usable entry
 * and as the InvitationService constructor default. The two must agree so
 * invite SMS deep links point at the same origin the API validates.
 */
export const DEFAULT_FRONTEND_ORIGIN = "https://journiful.app";

/**
 * Collapse a possibly comma-separated FRONTEND_URL (used as-is for CORS)
 * to the single origin used in user-facing URLs such as invite SMS bodies.
 */
export function primaryOrigin(value: string): string {
  const first = value
    .split(",")
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  return first ?? DEFAULT_FRONTEND_ORIGIN;
}

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
