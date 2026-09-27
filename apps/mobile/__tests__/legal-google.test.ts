import { describe, expect, it } from "vitest";
import {
  GOOGLE_PRIVACY_URL,
  GOOGLE_TERMS_URL,
  googleAttributionFor,
} from "@/lib/legal";

/**
 * Phase 15: the Places API requires the app to reference Google's Terms
 * of Service and Privacy Policy. Terms and Privacy incorporate them; the
 * SMS program document stands alone.
 */
describe("google attribution on the legal documents", () => {
  it("points at Google's own documents, not at copies", () => {
    expect(GOOGLE_TERMS_URL).toBe("https://policies.google.com/terms");
    expect(GOOGLE_PRIVACY_URL).toBe("https://policies.google.com/privacy");
  });

  it("is present on Terms and Privacy", () => {
    for (const id of ["terms", "privacy"] as const) {
      const attribution = googleAttributionFor(id);
      expect(attribution?.termsUrl).toBe(GOOGLE_TERMS_URL);
      expect(attribution?.privacyUrl).toBe(GOOGLE_PRIVACY_URL);
    }
  });

  it("is absent on the SMS program document", () => {
    expect(googleAttributionFor("sms-terms")).toBeNull();
  });
});
