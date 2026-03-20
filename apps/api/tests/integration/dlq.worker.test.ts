import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "pg-boss";
import { handleDlq } from "@/queues/workers/dlq.worker.js";
import type { WorkerDeps } from "@/queues/types.js";
import { QUEUE } from "@/queues/types.js";

describe("DLQ Worker Integration", () => {
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

  it("should process a failed notification batch payload", async () => {
    const mockJob = {
      id: "failed-batch-001",
      name: QUEUE.NOTIFICATION_BATCH_DLQ,
      data: {
        tripId: "trip-abc-123",
        type: "trip_message",
        title: "New message in Paris Trip",
        body: "Alice: Hey everyone!",
        excludeUserId: "user-alice-456",
      },
      expireInSeconds: 300,
      heartbeatSeconds: null,
      signal: new AbortController().signal,
    } as Job<unknown>;

    await handleDlq(mockJob, mockDeps);

    expect(mockDeps.logger.error).toHaveBeenCalledTimes(1);
    expect(mockDeps.logger.error).toHaveBeenCalledWith(
      {
        queue: QUEUE.NOTIFICATION_BATCH_DLQ,
        jobId: "failed-batch-001",
        data: {
          tripId: "trip-abc-123",
          type: "trip_message",
          title: "New message in Paris Trip",
          body: "Alice: Hey everyone!",
          excludeUserId: "user-alice-456",
        },
      },
      "Job moved to dead letter queue",
    );
  });

  it("should process a failed notification deliver payload", async () => {
    const mockJob = {
      id: "failed-deliver-002",
      name: QUEUE.NOTIFICATION_DELIVER_DLQ,
      data: {
        phoneNumber: "+15551234567",
        message: "You have a new message in Paris Trip",
      },
      expireInSeconds: 300,
      heartbeatSeconds: null,
      signal: new AbortController().signal,
    } as Job<unknown>;

    await handleDlq(mockJob, mockDeps);

    expect(mockDeps.logger.error).toHaveBeenCalledWith(
      {
        queue: QUEUE.NOTIFICATION_DELIVER_DLQ,
        jobId: "failed-deliver-002",
        data: {
          phoneNumber: "+15551234567",
          message: "You have a new message in Paris Trip",
        },
      },
      "Job moved to dead letter queue",
    );
  });

  it("should process a failed invitation send payload", async () => {
    const mockJob = {
      id: "failed-invite-003",
      name: QUEUE.INVITATION_SEND_DLQ,
      data: {
        phoneNumber: "+15559876543",
        message: "You've been invited to join Tokyo Trip on Journiful!",
      },
      expireInSeconds: 300,
      heartbeatSeconds: null,
      signal: new AbortController().signal,
    } as Job<unknown>;

    await handleDlq(mockJob, mockDeps);

    expect(mockDeps.logger.error).toHaveBeenCalledWith(
      {
        queue: QUEUE.INVITATION_SEND_DLQ,
        jobId: "failed-invite-003",
        data: {
          phoneNumber: "+15559876543",
          message: "You've been invited to join Tokyo Trip on Journiful!",
        },
      },
      "Job moved to dead letter queue",
    );
  });

  it("should process a failed daily itineraries payload", async () => {
    const mockJob = {
      id: "failed-daily-004",
      name: QUEUE.DAILY_ITINERARIES_DLQ,
      data: {},
      expireInSeconds: 600,
      heartbeatSeconds: null,
      signal: new AbortController().signal,
    } as Job<unknown>;

    await handleDlq(mockJob, mockDeps);

    expect(mockDeps.logger.error).toHaveBeenCalledWith(
      {
        queue: QUEUE.DAILY_ITINERARIES_DLQ,
        jobId: "failed-daily-004",
        data: {},
      },
      "Job moved to dead letter queue",
    );
  });

  it("should handle all four DLQ queue types without errors", async () => {
    const dlqQueues = [
      QUEUE.NOTIFICATION_DELIVER_DLQ,
      QUEUE.INVITATION_SEND_DLQ,
      QUEUE.NOTIFICATION_BATCH_DLQ,
      QUEUE.DAILY_ITINERARIES_DLQ,
    ];

    for (const queueName of dlqQueues) {
      const mockJob = {
        id: `job-${queueName}`,
        name: queueName,
        data: { source: "integration-test" },
        expireInSeconds: 300,
        heartbeatSeconds: null,
        signal: new AbortController().signal,
      } as Job<unknown>;

      await expect(handleDlq(mockJob, mockDeps)).resolves.toBeUndefined();
    }

    expect(mockDeps.logger.error).toHaveBeenCalledTimes(4);
  });

  it("should be resilient to null data", async () => {
    const mockJob = {
      id: "null-data-job",
      name: QUEUE.NOTIFICATION_BATCH_DLQ,
      data: null,
      expireInSeconds: 300,
      heartbeatSeconds: null,
      signal: new AbortController().signal,
    } as Job<unknown>;

    await expect(handleDlq(mockJob, mockDeps)).resolves.toBeUndefined();

    expect(mockDeps.logger.error).toHaveBeenCalledWith(
      {
        queue: QUEUE.NOTIFICATION_BATCH_DLQ,
        jobId: "null-data-job",
        data: null,
      },
      "Job moved to dead letter queue",
    );
  });
});
