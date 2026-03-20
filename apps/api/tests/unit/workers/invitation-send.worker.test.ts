import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "pg-boss";
import { handleInvitationSend } from "@/queues/workers/invitation-send.worker.js";
import type { InvitationSendPayload, WorkerDeps } from "@/queues/types.js";

describe("invitation-send.worker", () => {
  let mockDeps: WorkerDeps;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDeps = {
      db: {} as unknown as WorkerDeps["db"],
      boss: {} as unknown as WorkerDeps["boss"],
      smsService: {
        sendMessage: vi.fn(),
      },
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
    };
  });

  it("should call smsService.sendMessage with correct phoneNumber and message", async () => {
    const mockJob = {
      id: "test-job-id",
      name: "invitation/send",
      data: {
        phoneNumber: "+15559876543",
        message: "You've been invited to a trip on Journiful!",
      },
      expireInSeconds: 300,
      heartbeatSeconds: null,
      signal: new AbortController().signal,
    } as Job<InvitationSendPayload>;

    await handleInvitationSend(mockJob, mockDeps);

    expect(mockDeps.smsService.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockDeps.smsService.sendMessage).toHaveBeenCalledWith(
      "+15559876543",
      "You've been invited to a trip on Journiful!",
    );
  });

  it("should propagate errors from smsService.sendMessage", async () => {
    const mockJob = {
      id: "test-job-id",
      name: "invitation/send",
      data: {
        phoneNumber: "+15559876543",
        message: "You've been invited to a trip on Journiful!",
      },
      expireInSeconds: 300,
      heartbeatSeconds: null,
      signal: new AbortController().signal,
    } as Job<InvitationSendPayload>;

    const smsError = new Error("SMS delivery failed");
    vi.mocked(mockDeps.smsService.sendMessage).mockRejectedValueOnce(smsError);

    await expect(handleInvitationSend(mockJob, mockDeps)).rejects.toThrow(
      "SMS delivery failed",
    );
  });
});
