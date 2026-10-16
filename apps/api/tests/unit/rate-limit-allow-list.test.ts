/**
 * The rate limiters' exemption list, as a rule rather than an expression.
 *
 * Two kinds of entry, and the whole point of testing them here is that they
 * are unlocked by different things: loopback by *not* trusting a proxy, phone
 * numbers by the fixed dev code being on. `app.ts` only wires the result, so
 * a regression in either condition would otherwise be caught by nothing but a
 * flaking E2E suite.
 */

import { describe, expect, it } from "vitest";
import { rateLimitAllowList } from "@/middleware/rate-limit.middleware.js";

/** The loopback addresses a locally-run client connects from. */
const LOOPBACK = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

/** What a deployment looks like: behind a proxy, fixed code refused. */
const PRODUCTION = {
  TRUST_PROXY: true,
  ENABLE_FIXED_VERIFICATION_CODE: false,
  RATE_LIMIT_EXEMPT_PHONES: [] as readonly string[],
};

describe("rateLimitAllowList", () => {
  it("exempts nothing in a deployment that enforces the limits", () => {
    // The property that matters most: whatever else drifts, the list a
    // production process builds is empty. `TRUST_PROXY` drops loopback
    // because the caller's own `X-Forwarded-For` decides `request.ip`
    // there, and the phone numbers are only ever unlocked by a flag the
    // process refuses to boot with.
    expect(rateLimitAllowList(PRODUCTION)).toEqual([]);
  });

  it("exempts loopback locally, so parallel E2E workers do not 429 each other", () => {
    expect(
      rateLimitAllowList({ ...PRODUCTION, TRUST_PROXY: false }),
    ).toEqual(LOOPBACK);
  });

  it("keeps the phone exemption out until the fixed code is on", () => {
    // A local run with the flag off is a run against Twilio: real messages,
    // real cost, and the limiters are load-bearing.
    expect(
      rateLimitAllowList({
        TRUST_PROXY: false,
        ENABLE_FIXED_VERIFICATION_CODE: false,
        RATE_LIMIT_EXEMPT_PHONES: ["+15550000099"],
      }),
    ).toEqual(LOOPBACK);
  });

  it("adds the named phones once the fixed code is on", () => {
    expect(
      rateLimitAllowList({
        TRUST_PROXY: false,
        ENABLE_FIXED_VERIFICATION_CODE: true,
        RATE_LIMIT_EXEMPT_PHONES: ["+15550000099", "+15550000098"],
      }),
    ).toEqual([...LOOPBACK, "+15550000099", "+15550000098"]);
  });

  it("unlocks the phones on the flag alone, unlike loopback", () => {
    // Pinned deliberately: the two conditions are independent, and a
    // future edit that folds them into one would silently either hand
    // loopback out behind a proxy or take the suite's exemption away.
    expect(
      rateLimitAllowList({
        TRUST_PROXY: true,
        ENABLE_FIXED_VERIFICATION_CODE: true,
        RATE_LIMIT_EXEMPT_PHONES: ["+15550000099"],
      }),
    ).toEqual(["+15550000099"]);
  });

  it("is empty with no flags, no proxy and no numbers", () => {
    expect(
      rateLimitAllowList({
        TRUST_PROXY: true,
        ENABLE_FIXED_VERIFICATION_CODE: false,
        RATE_LIMIT_EXEMPT_PHONES: [],
      }),
    ).toEqual([]);
  });
});
