// Phone number validation utilities

import {
  parsePhoneNumberWithError,
  isValidPhoneNumber,
} from "libphonenumber-js";
import { env, normaliseReviewPhone } from "@/config/env.js";

/**
 * Validates a phone number and returns it in E.164 format
 * @param phone The phone number to validate
 * @returns Object containing validation result, E.164 format if valid, or error message
 * @example
 * // Validate a US phone number
 * validatePhoneNumber('+14155552671')
 * // Returns: { isValid: true, e164: '+14155552671' }
 *
 * // Invalid phone number
 * validatePhoneNumber('invalid')
 * // Returns: { isValid: false, error: 'Invalid phone number format' }
 */
export function validatePhoneNumber(phone: string): {
  isValid: boolean;
  e164?: string;
  error?: string;
} {
  try {
    // The App Review allowlist is part of this decision, not a second gate
    // behind it. Nothing else stands between a request-code body and the
    // verification service, and the numbers App Review signs in with are
    // usually synthetic — `+15550000099` has no assigned area code, so
    // libphonenumber is right to call it invalid — which means a validator
    // that only knows libphonenumber answers 400 before
    // `ReviewAllowlistVerificationService` is ever consulted. A number named in
    // REVIEW_PHONES is accepted here on its shape alone; the wrapper is what
    // makes it sign in with the fixed code and reach Twilio for nobody else.
    // Both sides normalise through the same function, so the E.164 returned
    // here is the string the wrapper's allowlist holds.
    const reviewPhone = normaliseReviewPhone(phone);
    if (reviewPhone && env.REVIEW_PHONES.includes(reviewPhone)) {
      return {
        isValid: true,
        e164: reviewPhone,
      };
    }

    // When fixed verification codes are enabled, accept 555 numbers for testing
    // This is typically enabled in development and test environments
    // But still require proper format - reject clearly invalid formats
    if (
      env.ENABLE_FIXED_VERIFICATION_CODE &&
      phone.startsWith("+") &&
      phone.includes("555")
    ) {
      // Check for invalid characters (letters, multiple +, etc)
      // Allow: digits, spaces, hyphens, parentheses, plus at start
      if (!/^\+[\d\s\-()]+$/.test(phone)) {
        return {
          isValid: false,
          error: "Invalid phone number format",
        };
      }

      // Parse to E.164 format even if not technically valid
      try {
        const parsed = parsePhoneNumberWithError(phone);
        return {
          isValid: true,
          e164: parsed.number,
        };
      } catch {
        // If parsing fails but format looks correct, accept it
        // Remove formatting and check if it's valid E.164-like
        const digitsOnly = phone.replace(/[\s\-()]/g, "");
        if (/^\+[1-9]\d{7,14}$/.test(digitsOnly)) {
          return {
            isValid: true,
            e164: digitsOnly,
          };
        }
        return {
          isValid: false,
          error: "Invalid phone number format",
        };
      }
    }

    // First check if the phone number is valid
    if (!isValidPhoneNumber(phone)) {
      return {
        isValid: false,
        error: "Invalid phone number format",
      };
    }

    // Parse the phone number to get E.164 format
    const parsed = parsePhoneNumberWithError(phone);

    return {
      isValid: true,
      e164: parsed.number,
    };
  } catch {
    return {
      isValid: false,
      error: "Invalid phone number format",
    };
  }
}
