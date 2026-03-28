"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { isPushSupported, getPermissionState } from "@/lib/push-notifications";
import { useSubscribeToPush } from "@/hooks/use-push-notifications";

const PROMPT_KEY = "pwa-notification-prompt";
const PROMPT_SHOWN_KEY = "pwa-notification-prompt-shown";

/**
 * Contextual push notification permission prompt.
 * Only shows after the user has performed a meaningful action
 * (joining a trip, RSVPing to an event) — call `showNotificationPrompt()`.
 *
 * This component reads from localStorage to decide when to display.
 * It is rendered in the root layout but remains hidden until triggered.
 */
export function NotificationPrompt() {
  const [visible, setVisible] = useState(false);
  const subscribeToPush = useSubscribeToPush();

  useEffect(() => {
    // Don't show if:
    // - Push not supported
    // - Already granted or denied
    // - User has dismissed before
    // - Not triggered yet
    if (!isPushSupported()) return;
    const permission = getPermissionState();
    if (permission === "granted" || permission === "denied") return;
    if (localStorage.getItem(PROMPT_KEY) === "dismissed") return;

    // Only show if a trigger event has fired
    if (!localStorage.getItem(PROMPT_SHOWN_KEY)) return;

    setVisible(true);
  }, []);

  const handleEnable = useCallback(async () => {
    const success = await subscribeToPush();
    if (success) {
      localStorage.setItem(PROMPT_KEY, "dismissed");
    } else {
      // Permission was denied at browser level
      const permission = getPermissionState();
      if (permission === "denied") {
        localStorage.setItem(PROMPT_KEY, "dismissed");
      }
    }
    setVisible(false);
  }, [subscribeToPush]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(PROMPT_KEY, "dismissed");
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Enable notifications"
      style={{
        position: "fixed",
        bottom: "1rem",
        left: "1rem",
        right: "1rem",
        zIndex: 50,
        maxWidth: "24rem",
        marginInline: "auto",
        padding: "1rem 1.25rem",
        backgroundColor: "#2c2217",
        color: "#f5edd6",
        borderRadius: "0.75rem",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
        fontFamily:
          "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      }}
    >
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          position: "absolute",
          top: "0.5rem",
          right: "0.5rem",
          background: "none",
          border: "none",
          color: "#f5edd6",
          opacity: 0.5,
          cursor: "pointer",
        }}
      >
        <X size={16} />
      </button>

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
        <Bell size={20} style={{ flexShrink: 0, marginTop: "0.125rem", opacity: 0.7 }} />
        <div>
          <p
            style={{
              margin: 0,
              fontSize: "0.9375rem",
              fontWeight: 600,
              lineHeight: 1.3,
            }}
          >
            Get notified when your trip plans change
          </p>
          <p
            style={{
              margin: "0.375rem 0 0",
              fontSize: "0.8125rem",
              opacity: 0.7,
              lineHeight: 1.4,
            }}
          >
            We&apos;ll send updates about messages, itinerary changes, and
            invitations.
          </p>

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.875rem" }}>
            <button
              onClick={handleEnable}
              style={{
                padding: "0.5rem 1rem",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "#1a1814",
                backgroundColor: "#f5edd6",
                border: "none",
                borderRadius: "0.5rem",
                cursor: "pointer",
              }}
            >
              Enable notifications
            </button>
            <button
              onClick={handleDismiss}
              style={{
                padding: "0.5rem 1rem",
                fontSize: "0.8125rem",
                fontWeight: 500,
                color: "#f5edd6",
                backgroundColor: "transparent",
                border: "1px solid rgba(245,237,214,0.2)",
                borderRadius: "0.5rem",
                cursor: "pointer",
              }}
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Call this after a meaningful user action (e.g. joining a trip, RSVPing)
 * to trigger the notification permission prompt on next render.
 */
export function showNotificationPrompt() {
  if (typeof window === "undefined") return;
  if (getPermissionState() !== "default") return;
  localStorage.setItem(PROMPT_SHOWN_KEY, "1");
}
