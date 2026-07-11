import webpush from "web-push";
import admin, { type App } from "firebase-admin";
import { getMessaging } from "firebase-admin/messaging";
import { and, eq } from "drizzle-orm";
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
    sub: {
      endpoint?: string;
      keys?: { p256dh: string; auth: string };
      token?: string;
      platform: "ios" | "android" | "web";
      provider: "vapid" | "fcm";
    },
    userAgent?: string,
  ): Promise<void>;
  removeSubscription(endpoint: string, userId?: string): Promise<void>;
  getUserSubscriptions(
    userId: string,
  ): Promise<{ endpoint: string; p256dh: string; auth: string }[]>;
  sendToUser(userId: string, payload: PushPayload): Promise<void>;
}

export class PushService implements IPushService {
  private enabled: boolean;
  private admin: App | null = null;

  constructor(
    private db: AppDatabase,
    private logger: Logger,
    vapidPublicKey: string,
    vapidPrivateKey: string,
    vapidSubject: string,
    firebaseServiceAccount?: string,
  ) {
    let vapidConfigured = false;
    if (vapidPublicKey && vapidPrivateKey) {
      try {
        webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
        vapidConfigured = true;
      } catch (err) {
        this.logger.error(
          { err },
          "Invalid VAPID keys — web push disabled",
        );
      }
    }

    // Initialize Firebase Admin if service account is provided
    if (firebaseServiceAccount) {
      try {
        const serviceAccount = JSON.parse(firebaseServiceAccount);
        this.admin = admin.initializeApp({
          credential: admin.cert(serviceAccount),
        }, "push-service");
        this.logger.info("Firebase Admin initialized for FCM push delivery");
      } catch (err) {
        this.logger.error({ err }, "Failed to initialize Firebase Admin");
      }
    }

    this.enabled = vapidConfigured || this.admin !== null;
    if (!this.enabled) {
      this.logger.info(
        "VAPID keys not configured — push notifications disabled",
      );
    }
  }

  async addSubscription(
    userId: string,
    sub: {
      endpoint?: string;
      keys?: { p256dh: string; auth: string };
      token?: string;
      platform: "ios" | "android" | "web";
      provider: "vapid" | "fcm";
    },
    userAgent?: string,
  ): Promise<void> {
    if (sub.provider === "fcm") {
      // For FCM, use a synthetic endpoint to satisfy the unique constraint
      await this.db
        .insert(pushSubscriptions)
        .values({
          userId,
          endpoint: `fcm:${sub.token}`,
          p256dh: "",
          auth: "",
          token: sub.token!,
          platform: sub.platform,
          provider: sub.provider,
          userAgent: userAgent ?? null,
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: {
            token: sub.token!,
            platform: sub.platform,
            userAgent: userAgent ?? null,
          },
          setWhere: eq(pushSubscriptions.userId, userId),
        });
    } else {
      // VAPID: insert or update by endpoint
      await this.db
        .insert(pushSubscriptions)
        .values({
          userId,
          endpoint: sub.endpoint!,
          p256dh: sub.keys!.p256dh,
          auth: sub.keys!.auth,
          platform: sub.platform,
          provider: "vapid",
          userAgent: userAgent ?? null,
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: {
            p256dh: sub.keys!.p256dh,
            auth: sub.keys!.auth,
            platform: sub.platform,
            userAgent: userAgent ?? null,
          },
          setWhere: eq(pushSubscriptions.userId, userId),
        });
    }
  }

  async removeSubscription(endpoint: string, userId?: string): Promise<void> {
    const conditions = [eq(pushSubscriptions.endpoint, endpoint)];
    if (userId) {
      conditions.push(eq(pushSubscriptions.userId, userId));
    }
    await this.db
      .delete(pushSubscriptions)
      .where(and(...conditions));
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

    const subs = await this.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    const fcmSubs = subs.filter((s) => s.provider === "fcm" && s.token);
    const vapidSubs = subs.filter((s) => s.provider !== "fcm" || !s.token);

    // Send via FCM
    for (const sub of fcmSubs) {
      if (this.admin) {
        try {
          await getMessaging(this.admin).send({
            token: sub.token!,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: {
              url: payload.url ?? "/",
              tag: payload.tag ?? "",
            },
            android: {
              priority: "high",
              notification: {
                channelId: "default",
                clickAction: "FCM_PLUGIN_ACTIVITY",
              },
            },
          });
        } catch (err: unknown) {
          const code = (err as { code?: string }).code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-argument"
          ) {
            // Token is invalid or unregistered — clean up
            await this.removeSubscription(sub.endpoint);
            this.logger.info({ token: sub.token }, "removed invalid FCM token");
          } else {
            this.logger.error(
              { err, token: sub.token },
              "FCM delivery failed",
            );
          }
        }
      }
    }

    // Send via VAPID (existing logic)
    const payloadStr = JSON.stringify(payload);
    for (const sub of vapidSubs) {
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
