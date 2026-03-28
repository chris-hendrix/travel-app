import webpush from "web-push";
import { eq } from "drizzle-orm";
import { pushSubscriptions } from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";
import type { PushPayload } from "@journiful/shared/types";
import type { Logger } from "@/types/logger.js";

/**
 * Push Service Interface
 * Manages push subscriptions and delivers push notifications
 */
export interface IPushService {
  addSubscription(
    userId: string,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ): Promise<void>;
  removeSubscription(endpoint: string): Promise<void>;
  getUserSubscriptions(
    userId: string,
  ): Promise<{ endpoint: string; p256dh: string; auth: string }[]>;
  sendToUser(userId: string, payload: PushPayload): Promise<void>;
}

export class PushService implements IPushService {
  private enabled: boolean;

  constructor(
    private db: AppDatabase,
    private logger: Logger,
    vapidPublicKey: string,
    vapidPrivateKey: string,
    vapidSubject: string,
  ) {
    this.enabled = !!(vapidPublicKey && vapidPrivateKey);
    if (this.enabled) {
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    } else {
      this.logger.info(
        "VAPID keys not configured — push notifications disabled",
      );
    }
  }

  async addSubscription(
    userId: string,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ): Promise<void> {
    await this.db
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent ?? null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          userAgent: userAgent ?? null,
        },
      });
  }

  async removeSubscription(endpoint: string): Promise<void> {
    await this.db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async getUserSubscriptions(
    userId: string,
  ): Promise<{ endpoint: string; p256dh: string; auth: string }[]> {
    return this.db
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.enabled) return;

    const subs = await this.getUserSubscriptions(userId);
    const payloadStr = JSON.stringify(payload);

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadStr,
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          // Subscription expired or invalid — clean up
          await this.removeSubscription(sub.endpoint);
          this.logger.info(
            { endpoint: sub.endpoint },
            "removed expired push subscription",
          );
        } else if (statusCode === 429) {
          // Rate limited — rethrow so pg-boss retries the job
          throw err;
        } else {
          this.logger.error(
            { err, endpoint: sub.endpoint },
            "push notification delivery failed",
          );
        }
      }
    }
  }
}
