import Twilio from "twilio";
import type { Logger } from "@/types/logger.js";

/**
 * The one fixed code, shared by MockVerificationService and the App Review
 * allowlist so the two never drift apart.
 */
export const FIXED_VERIFICATION_CODE = "123456";

/**
 * Verification Service Interface
 * Defines the contract for sending and checking verification codes.
 * Replaces the old ISMSService + AuthService code generation/storage flow.
 */
export interface IVerificationService {
  /**
   * Sends a verification code to the specified phone number
   * @param phoneNumber - The phone number to send the code to (E.164 format)
   */
  sendCode(phoneNumber: string): Promise<void>;

  /**
   * Checks a verification code for a phone number
   * @param phoneNumber - The phone number to check the code for (E.164 format)
   * @param code - The 6-digit verification code
   * @returns true if the code is valid, false otherwise
   */
  checkCode(phoneNumber: string, code: string): Promise<boolean>;
}

/**
 * Twilio Verify Service Implementation
 * Uses Twilio Verify API to send and check verification codes.
 * No phone number or 10DLC registration required — Twilio manages codes,
 * expiry, rate limits, and fraud protection.
 */
export class TwilioVerificationService implements IVerificationService {
  private client: Twilio.Twilio;
  private verifyServiceSid: string;
  private logger: Logger | undefined;

  constructor(opts: {
    accountSid: string;
    authToken: string;
    verifyServiceSid: string;
    logger?: Logger;
    client?: Twilio.Twilio;
  }) {
    this.client =
      opts.client ?? new Twilio.Twilio(opts.accountSid, opts.authToken);
    this.verifyServiceSid = opts.verifyServiceSid;
    this.logger = opts.logger;
  }

  async sendCode(phoneNumber: string): Promise<void> {
    await this.client.verify.v2
      .services(this.verifyServiceSid)
      .verifications.create({ to: phoneNumber, channel: "sms" });

    this.logger?.info({ phoneNumber }, "Twilio Verify: code sent");
  }

  async checkCode(phoneNumber: string, code: string): Promise<boolean> {
    const check = await this.client.verify.v2
      .services(this.verifyServiceSid)
      .verificationChecks.create({ to: phoneNumber, code });

    const approved = check.status === "approved";

    this.logger?.info(
      { phoneNumber, status: check.status },
      "Twilio Verify: code checked",
    );

    return approved;
  }
}

/**
 * ReviewAllowlist Verification Service
 *
 * Wraps another IVerificationService so that a small, explicitly configured set
 * of phone numbers (REVIEW_PHONES) can complete sign-in with the fixed code
 * without any Twilio call. This is what lets an Apple App Review sign-in run
 * against production without a real SIM or a Twilio Verify service.
 *
 * This is NOT the same mechanism as ENABLE_FIXED_VERIFICATION_CODE. That flag
 * swaps in MockVerificationService for every number and is forbidden in
 * production; the allowlist is safe in production because it only affects the
 * numbers named in REVIEW_PHONES.
 */
export class ReviewAllowlistVerificationService implements IVerificationService {
  private inner: IVerificationService;
  private allowlist: Set<string>;
  private logger: Logger | undefined;

  constructor(
    inner: IVerificationService,
    reviewPhones: string[],
    logger?: Logger,
  ) {
    this.inner = inner;
    this.allowlist = new Set(reviewPhones);
    this.logger = logger;
  }

  private isAllowlisted(phoneNumber: string): boolean {
    return this.allowlist.has(phoneNumber);
  }

  async sendCode(phoneNumber: string): Promise<void> {
    if (this.isAllowlisted(phoneNumber)) {
      this.logger?.info(
        { phoneNumber },
        `App Review allowlist: code not sent, use ${FIXED_VERIFICATION_CODE}`,
      );
      return;
    }
    await this.inner.sendCode(phoneNumber);
  }

  async checkCode(phoneNumber: string, code: string): Promise<boolean> {
    if (this.isAllowlisted(phoneNumber)) {
      return code === FIXED_VERIFICATION_CODE;
    }
    return this.inner.checkCode(phoneNumber, code);
  }
}

/**
 * Mock Verification Service Implementation
 * Uses a fixed code (123456) for development and testing.
 * No database or external service required.
 */
export class MockVerificationService implements IVerificationService {
  private logger: Logger | undefined;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  async sendCode(phoneNumber: string): Promise<void> {
    this.logger?.info(
      { phoneNumber },
      `Mock verification code: ${FIXED_VERIFICATION_CODE}`,
    );
  }

  async checkCode(_phoneNumber: string, code: string): Promise<boolean> {
    return code === FIXED_VERIFICATION_CODE;
  }
}
