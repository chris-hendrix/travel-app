import Twilio from "twilio";
import type { Logger } from "@/types/logger.js";
import { env } from "@/config/env.js";

export type SMSChannel = "invite" | "notification";

/**
 * SMS Service Interface
 */
export interface ISMSService {
  sendMessage(
    phoneNumber: string,
    message: string,
    channel?: SMSChannel,
  ): Promise<void>;
}

/** SMSChannel → Twilio Messaging Service SID */
const SID_MAP: Partial<Record<SMSChannel, string>> = {
  ...(env.TWILIO_INVITE_MESSAGING_SERVICE_SID && {
    invite: env.TWILIO_INVITE_MESSAGING_SERVICE_SID,
  }),
  // Future: ...(env.TWILIO_NOTIFICATION_MESSAGING_SERVICE_SID && {
  //   notification: env.TWILIO_NOTIFICATION_MESSAGING_SERVICE_SID,
  // }),
};

const client =
  env.TWILIO_ACCOUNT_SID &&
  env.TWILIO_AUTH_TOKEN &&
  Object.keys(SID_MAP).length > 0
    ? new Twilio.Twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
    : null;

/**
 * SMS Service
 *
 * When Twilio credentials and at least one Messaging Service SID are present,
 * sends real SMS via Twilio. Otherwise, logs messages (mock mode).
 */
export class SMSService implements ISMSService {
  private logger: Logger | undefined;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  async sendMessage(
    phoneNumber: string,
    message: string,
    channel?: SMSChannel,
  ): Promise<void> {
    if (!client) {
      this.logger?.info({ phoneNumber, message, channel }, "SMS Message Sent");
      return;
    }

    const sid = channel ? SID_MAP[channel] : undefined;
    if (!sid) {
      this.logger?.info(
        { phoneNumber, channel },
        "SMS: no Messaging Service SID configured for channel, skipping",
      );
      return;
    }

    await client.messages.create({
      to: phoneNumber,
      messagingServiceSid: sid,
      body: message,
    });

    this.logger?.info({ phoneNumber, channel }, "SMS: message sent via Twilio");
  }
}
