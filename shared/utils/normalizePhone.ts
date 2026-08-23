// Normalized phone helper — single source for hasPendingInvite + attach lookup
import { PHONE_REGEX } from "../schemas/phone";

/**
 * Normalize to E.164 if possible, else null.
 * Strips spaces/dashes/parens, preserves leading +.
 * Returns the canonical E.164 string when PHONE_REGEX passes.
 */
export function toE164(phone: string): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  // Simple fallback: strip spaces, dashes, parens, dots
  const cleaned = trimmed.replace(/[\s\-().]/g, "");
  if (PHONE_REGEX.test(cleaned)) return cleaned;
  return null;
}

/**
 * Normalize for set comparison: toE164 if valid else trimmed cleaned.
 */
export function normalizePhoneForCompare(phone: string): string {
  return toE164(phone) ?? phone.trim();
}
