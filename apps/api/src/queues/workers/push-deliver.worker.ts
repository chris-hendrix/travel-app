import type { Job } from "pg-boss";
import type { PushDeliverPayload, WorkerDeps } from "@/queues/types.js";

export async function handlePushDeliver(
  job: Job<PushDeliverPayload>,
  deps: WorkerDeps,
): Promise<void> {
  const { userId, title, body, url, tag } = job.data;
  await deps.pushService.sendToUser(userId, { title, body, url, tag });
}
