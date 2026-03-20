import { describe, it, expect, vi } from "vitest";
import { MockSMSService } from "@/services/sms.service.js";

describe("sms.service", () => {
  describe("sendMessage", () => {
    const testPhone = "+14155552671";
    const testMessage = "Your Journiful verification code is: 123456";

    it("should exist and be callable", async () => {
      const service = new MockSMSService();
      expect(service.sendMessage).toBeDefined();
      expect(typeof service.sendMessage).toBe("function");
      await expect(
        service.sendMessage(testPhone, testMessage),
      ).resolves.toBeUndefined();
    });

    it("should not throw when no logger is provided", async () => {
      const service = new MockSMSService();
      await expect(
        service.sendMessage(testPhone, testMessage),
      ).resolves.toBeUndefined();
    });

    it("should call logger.info with phone number and message when logger is provided", async () => {
      const mockLogger = {
        info: vi.fn(),
      };

      const service = new MockSMSService(mockLogger);
      await service.sendMessage(testPhone, testMessage);

      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        { phoneNumber: testPhone, message: testMessage },
        "SMS Message Sent",
      );
    });

    it("should include phone number in log output", async () => {
      const mockLogger = {
        info: vi.fn(),
      };

      const service = new MockSMSService(mockLogger);
      await service.sendMessage(testPhone, testMessage);

      const logData = mockLogger.info.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(logData.phoneNumber).toBe(testPhone);
    });

    it("should include message content in log output", async () => {
      const mockLogger = {
        info: vi.fn(),
      };

      const service = new MockSMSService(mockLogger);
      await service.sendMessage(testPhone, testMessage);

      const logData = mockLogger.info.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(logData.message).toBe(testMessage);
    });

    it("should handle different message content", async () => {
      const mockLogger = {
        info: vi.fn(),
      };

      const service = new MockSMSService(mockLogger);
      const customMessage = "You've been invited to a trip on Journiful!";
      await service.sendMessage(testPhone, customMessage);

      const logData = mockLogger.info.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(logData.message).toBe(customMessage);
    });

    it("should include 'SMS Message Sent' as log message", async () => {
      const mockLogger = {
        info: vi.fn(),
      };

      const service = new MockSMSService(mockLogger);
      await service.sendMessage(testPhone, testMessage);

      const logMessage = mockLogger.info.mock.calls[0][1];
      expect(logMessage).toBe("SMS Message Sent");
    });
  });
});
