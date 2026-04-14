"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

export function SwUpdatePrompt() {
  const [waitingWorker, setWaitingWorker] =
    useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator))
      return;

    // Check for a waiting SW on load
    navigator.serviceWorker.ready.then((registration) => {
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
      }

      // Listen for new SWs that install while the page is open
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            setWaitingWorker(newWorker);
          }
        });
      });
    });
  }, []);

  const handleUpdate = useCallback(() => {
    if (!waitingWorker) return;
    // The SW calls skipWaiting() on install, so it may already be active.
    // Send SKIP_WAITING as a fallback, then reload regardless.
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    // If controllerchange already fired (SW auto-skipped), reload after a brief delay
    setTimeout(() => window.location.reload(), 300);
  }, [waitingWorker]);

  if (!waitingWorker) return null;

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        top: "1rem",
        left: "1rem",
        right: "1rem",
        zIndex: 50,
        maxWidth: "24rem",
        marginInline: "auto",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.75rem 1rem",
        backgroundColor: "#2c2217",
        color: "#f5edd6",
        borderRadius: "0.75rem",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
        fontFamily:
          "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      }}
    >
      <RefreshCw size={18} style={{ flexShrink: 0, opacity: 0.7 }} />
      <p style={{ flex: 1, margin: 0, fontSize: "0.875rem", lineHeight: 1.4 }}>
        A new version is available
      </p>
      <button
        onClick={handleUpdate}
        style={{
          flexShrink: 0,
          padding: "0.375rem 0.875rem",
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: "#1a1814",
          backgroundColor: "#f5edd6",
          border: "none",
          borderRadius: "0.5rem",
          cursor: "pointer",
        }}
      >
        Refresh
      </button>
    </div>
  );
}
