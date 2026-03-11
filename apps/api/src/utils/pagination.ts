import type { z } from "zod";
import { InvalidCursorError } from "@/errors.js";

/**
 * Encodes a cursor object as a URL-safe base64 string.
 * Uses base64url encoding for safe inclusion in query parameters.
 *
 * @param data - The cursor data to encode
 * @returns A base64url-encoded string
 */
export function encodeCursor(data: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

/**
 * Decodes a base64url cursor string back into its original object.
 * Throws InvalidCursorError for any malformed input.
 *
 * @param cursor - The base64url-encoded cursor string
 * @returns The decoded cursor object
 * @throws InvalidCursorError if the cursor is malformed, not valid JSON, or not an object
 */
export function decodeCursor(cursor: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new InvalidCursorError("Invalid cursor format");
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    if (e instanceof InvalidCursorError) throw e;
    throw new InvalidCursorError("Invalid cursor format");
  }
}

/**
 * Decodes a cursor and validates it against a Zod schema.
 * Combines base64url decode + JSON parse + runtime type validation.
 *
 * @param cursor - The base64url-encoded cursor string
 * @param schema - Zod schema describing the expected cursor shape
 * @returns The decoded and validated cursor data
 * @throws InvalidCursorError if the cursor is malformed or doesn't match the schema
 */
export function decodeCursorAs<T extends z.ZodType>(
  cursor: string,
  schema: T,
): z.infer<T> {
  const raw = decodeCursor(cursor);
  const result = schema.safeParse(raw);
  if (!result.success) throw new InvalidCursorError("Invalid cursor format");
  return result.data;
}
