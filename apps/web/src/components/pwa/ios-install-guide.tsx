"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";

const DISMISS_KEY = "pwa-ios-guide-dismissed";

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // Must be Safari (not Chrome/Firefox/etc on iOS — though those also use WebKit,
  // they don't support add-to-home-screen the same way)
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true) ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

export function IosInstallGuide() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (!isIosSafari()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Install Journiful"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.6)",
        fontFamily:
          "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "24rem",
          margin: "0 1rem 2rem",
          padding: "1.5rem",
          backgroundColor: "#2c2217",
          color: "#f5edd6",
          borderRadius: "1rem",
          position: "relative",
        }}
      >
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            position: "absolute",
            top: "0.75rem",
            right: "0.75rem",
            background: "none",
            border: "none",
            color: "#f5edd6",
            opacity: 0.6,
            cursor: "pointer",
          }}
        >
          <X size={20} />
        </button>

        <h2
          style={{
            fontSize: "1.125rem",
            fontWeight: 700,
            marginBottom: "1.25rem",
          }}
        >
          Install Journiful
        </h2>

        <ol
          style={{
            margin: 0,
            paddingLeft: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            fontSize: "0.9375rem",
            lineHeight: 1.5,
          }}
        >
          <li>
            Tap the{" "}
            <Share
              size={16}
              style={{
                display: "inline-block",
                verticalAlign: "middle",
                marginInline: "0.15rem",
              }}
            />{" "}
            <strong>Share</strong> button in Safari
          </li>
          <li>
            Scroll down and tap{" "}
            <strong>&ldquo;Add to Home Screen&rdquo;</strong>
          </li>
          <li>
            Tap <strong>Add</strong> to confirm
          </li>
        </ol>

        {/* Arrow pointing toward Safari bottom bar */}
        <div
          style={{
            marginTop: "1.25rem",
            textAlign: "center",
            fontSize: "1.5rem",
            opacity: 0.5,
          }}
          aria-hidden
        >
          &#8595;
        </div>
      </div>
    </div>
  );
}
