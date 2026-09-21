/**
 * Shared API shapes for mobile E2E helpers. Types only — no runtime code,
 * no fetch. The request bodies mirror the shared Zod schemas
 * (`requestCodeSchema`, `verifyCodeSchema`, `completeProfileSchema`):
 * `smsConsent: true` is required on both auth calls, and verify-code
 * needs the six-digit code.
 */

/** `POST /api/auth/request-code` body. */
export type RequestCodeBody = {
  phoneNumber: string;
  smsConsent: true;
};

/** `POST /api/auth/verify-code` body. */
export type VerifyCodeBody = {
  phoneNumber: string;
  code: string;
  smsConsent: true;
};

/** `POST /api/auth/complete-profile` body. */
export type CompleteProfileBody = {
  displayName: string;
  timezone?: string;
};

/** The fields the seed helper reads back from `/verify-code`. */
export type VerifyCodeSeedResponse = {
  success: true;
  user: { id: string; phoneNumber: string };
  token: string;
  requiresProfile: boolean;
};

/** The fields the seed helper reads back from `/complete-profile`. */
export type CompleteProfileSeedResponse = {
  success: true;
  token: string;
};

/** What a seeded user looks like to a spec: the number and its token. */
export type SeededAuth = {
  phone: string;
  token: string;
};
