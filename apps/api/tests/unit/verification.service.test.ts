import { describe, it, expect, vi } from "vitest";
import type Twilio from "twilio";
import {
  FIXED_VERIFICATION_CODE,
  MockVerificationService,
  ReviewAllowlistVerificationService,
  TwilioVerificationService,
  type IVerificationService,
} from "@/services/verification.service.js";

describe("MockVerificationService", () => {
  describe("sendCode", () => {
    it("should log the fixed code when logger is provided", async () => {
      const mockLogger = { info: vi.fn() };
      const service = new MockVerificationService(mockLogger);

      await service.sendCode("+14155552671");

      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        { phoneNumber: "+14155552671" },
        "Mock verification code: 123456",
      );
    });

    it("should not throw when no logger is provided", async () => {
      const service = new MockVerificationService();
      await expect(service.sendCode("+14155552671")).resolves.toBeUndefined();
    });
  });

  describe("checkCode", () => {
    it("should return true for code 123456", async () => {
      const service = new MockVerificationService();
      expect(await service.checkCode("+14155552671", "123456")).toBe(true);
    });

    it("should return false for any other code", async () => {
      const service = new MockVerificationService();
      expect(await service.checkCode("+14155552671", "000000")).toBe(false);
      expect(await service.checkCode("+14155552671", "654321")).toBe(false);
    });
  });
});

describe("TwilioVerificationService", () => {
  const mockCreate = vi.fn();
  const mockCheckCreate = vi.fn();

  function createService() {
    const mockClient = {
      verify: {
        v2: {
          services: () => ({
            verifications: { create: mockCreate },
            verificationChecks: { create: mockCheckCreate },
          }),
        },
      },
    } as unknown as Twilio.Twilio;

    return new TwilioVerificationService({
      accountSid: "AC_test",
      authToken: "auth_test",
      verifyServiceSid: "VA_test",
      client: mockClient,
    });
  }

  describe("sendCode", () => {
    it("should call Twilio Verify API with correct params", async () => {
      mockCreate.mockResolvedValueOnce({ sid: "VE123", status: "pending" });

      const service = createService();
      await service.sendCode("+14155552671");

      expect(mockCreate).toHaveBeenCalledWith({
        to: "+14155552671",
        channel: "sms",
      });
    });
  });

  describe("checkCode", () => {
    it("should return true when Twilio returns approved", async () => {
      mockCheckCreate.mockResolvedValueOnce({ status: "approved" });

      const service = createService();
      const result = await service.checkCode("+14155552671", "123456");
      expect(result).toBe(true);
      expect(mockCheckCreate).toHaveBeenCalledWith({
        to: "+14155552671",
        code: "123456",
      });
    });

    it("FIXED_VERIFICATION_CODE is the one shared constant", () => {
      expect(FIXED_VERIFICATION_CODE).toBe("123456");
    });

    it("should return false when Twilio returns pending", async () => {
      mockCheckCreate.mockResolvedValueOnce({ status: "pending" });

      const service = createService();
      const result = await service.checkCode("+14155552671", "000000");
      expect(result).toBe(false);
    });
  });
});

describe("ReviewAllowlistVerificationService", () => {
  function wrapped(inner: Partial<IVerificationService> = {}): IVerificationService {
    return inner as IVerificationService;
  }

  it("accepts the fixed code for an allowlisted number without calling the wrapped service", async () => {
    const inner = wrapped({
      checkCode: vi.fn().mockResolvedValue(false),
      sendCode: vi.fn().mockResolvedValue(undefined),
    });

    const service = new ReviewAllowlistVerificationService(inner, [
      "+15550000099",
    ]);

    expect(await service.checkCode("+15550000099", "123456")).toBe(true);
    expect(inner.checkCode).not.toHaveBeenCalled();
  });

  it("rejects a wrong code for an allowlisted number without calling the wrapped service", async () => {
    const inner = wrapped({
      checkCode: vi.fn().mockResolvedValue(true),
      sendCode: vi.fn().mockResolvedValue(undefined),
    });

    const service = new ReviewAllowlistVerificationService(inner, [
      "+15550000099",
    ]);

    expect(await service.checkCode("+15550000099", "000000")).toBe(false);
    expect(inner.checkCode).not.toHaveBeenCalled();
  });

  it("delegates to the wrapped service for a number that is not allowlisted", async () => {
    const inner = wrapped({
      checkCode: vi.fn().mockResolvedValue(true),
      sendCode: vi.fn().mockResolvedValue(undefined),
    });

    const service = new ReviewAllowlistVerificationService(inner, [
      "+15550000099",
    ]);

    expect(await service.checkCode("+15551112222", "000000")).toBe(true);
    expect(inner.checkCode).toHaveBeenCalledWith("+15551112222", "000000");
  });

  it("logs and sends nothing on sendCode for an allowlisted number", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const inner = wrapped({
      checkCode: vi.fn().mockResolvedValue(false),
      sendCode: vi.fn().mockResolvedValue(undefined),
    });

    const service = new ReviewAllowlistVerificationService(
      inner,
      ["+15550000099"],
      logger,
    );

    await service.sendCode("+15550000099");

    expect(inner.sendCode).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it("delegates sendCode for a number that is not allowlisted", async () => {
    const inner = wrapped({
      checkCode: vi.fn().mockResolvedValue(false),
      sendCode: vi.fn().mockResolvedValue(undefined),
    });

    const service = new ReviewAllowlistVerificationService(inner, [
      "+15550000099",
    ]);

    await service.sendCode("+15551112222");

    expect(inner.sendCode).toHaveBeenCalledWith("+15551112222");
  });

  it("is exactly the old behaviour when the allowlist is empty", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const inner = wrapped({
      checkCode: vi.fn().mockResolvedValue(false),
      sendCode: vi.fn().mockResolvedValue(undefined),
    });

    const service = new ReviewAllowlistVerificationService(inner, [], logger);

    await service.sendCode("+15550000099");
    expect(await service.checkCode("+15550000099", "000000")).toBe(false);
    expect(inner.sendCode).toHaveBeenCalledWith("+15550000099");
    expect(inner.checkCode).toHaveBeenCalledWith("+15550000099", "000000");
  });
});
