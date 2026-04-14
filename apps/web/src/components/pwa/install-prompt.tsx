"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-install-dismissed";
const DISMISS_DAYS = 7;

function isDismissed(): boolean {
  if (typeof window === "undefined") return true;
  const ts = localStorage.getItem(DISMISS_KEY);
  if (!ts) return false;
  const elapsed = Date.now() - Number(ts);
  return elapsed < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (isDismissed()) return;
    // Already in standalone mode — no need to prompt
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    // Skip on desktop — PWA install only adds value on mobile
    if (!("ontouchstart" in window || navigator.maxTouchPoints > 0)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      if (dismissedRef.current || isDismissed()) return;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
    setDeferredPrompt(null);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  if (!visible) return null;

  return (
    <div
      role="banner"
      style={{
        position: "fixed",
        bottom: "1rem",
        left: "1rem",
        right: "1rem",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.875rem 1rem",
        backgroundColor: "#2c2217",
        color: "#f5edd6",
        borderRadius: "0.75rem",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
        fontFamily:
          "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
        maxWidth: "28rem",
        marginInline: "auto",
      }}
    >
      <p style={{ flex: 1, fontSize: "0.875rem", margin: 0, lineHeight: 1.4 }}>
        Install Journiful for the best experience
      </p>

      <button
        onClick={install}
        style={{
          flexShrink: 0,
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
        Install
      </button>

      <button
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        style={{
          flexShrink: 0,
          padding: "0.25rem",
          background: "none",
          border: "none",
          color: "#f5edd6",
          opacity: 0.6,
          cursor: "pointer",
        }}
      >
        <X size={18} />
      </button>
    </div>
  );
}
