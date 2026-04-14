import type { Job } from "pg-boss";
import type { InvitationSendPayload, WorkerDeps } from "@/queues/types.js";

export async function handleInvitationSend(
  job: Job<InvitationSendPayload>,
  deps: WorkerDeps,
): Promise<void> {
  const { phoneNumber, message } = job.data;
  await deps.smsService.sendMessage(phoneNumber, message, "invite");
}
