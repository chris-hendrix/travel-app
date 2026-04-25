// Link validation schemas for events and accommodations

import { z } from "zod";
import { stripControlChars } from "../utils/sanitize";

/**
 * Validates a single link entry: URL is required, optional display name (max 100 chars).
 */
export const linkItemSchema = z.object({
  url: z.string().url("Link must be a valid URL"),
  name: z
    .string()
    .max(100, { error: "Link name must not exceed 100 characters" })
    .transform(stripControlChars)
    .optional(),
});

/**
 * Validates an array of link items. Maximum 10 items.
 */
export const linksArraySchema = z.array(linkItemSchema).max(10, {
  error: "Links must not exceed 10 items",
});

export type LinkItemInput = z.infer<typeof linkItemSchema>;
