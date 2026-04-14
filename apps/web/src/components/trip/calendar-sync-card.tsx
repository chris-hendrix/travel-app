"use client";

import { useState } from "react";
import { CalendarDays, Loader2, X } from "lucide-react";
import { useMounted } from "@/hooks/use-mounted";
import { useCalendarStatus, useEnableCalendar } from "@/hooks/use-calendar";

const DISMISS_KEY = "calendar-sync-card-dismissed";

function isDismissed(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(DISMISS_KEY) === "true";
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

export function CalendarSyncCard() {
  const mounted = useMounted();
  const [dismissed, setDismissed] = useState(false);
  const calendarStatus = useCalendarStatus();
  const enableCalendar = useEnableCalendar();

  const enabled = calendarStatus.data?.enabled ?? false;
  const calendarUrl = calendarStatus.data?.calendarUrl;
  const isSubscribing = enableCalendar.isPending;

  // Don't render on server; check localStorage only after mount
  if (!mounted) return null;
  if (isDismissed() || dismissed || enabled) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
  }

  async function handleSubscribe(platform: "google" | "apple") {
    let url = calendarUrl;

    if (!enabled) {
      const result = await enableCalendar.mutateAsync();
      url = result.calendarUrl;
    }

    if (!url) return;

    if (platform === "google") {
      const googleUrl = `https://www.google.com/calendar/render?cid=${encodeURIComponent(url)}`;
      window.open(googleUrl, "_blank");
    } else {
      window.location.href = url;
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-md border border-dashed border-muted-foreground/25 bg-muted/30 p-3">
      <CalendarDays className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">Sync to your calendar</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          See trip events in Google Calendar or Apple Calendar.
        </p>
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => handleSubscribe("google")}
            disabled={isSubscribing}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50 cursor-pointer"
          >
            {isSubscribing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <GoogleIcon className="w-3.5 h-3.5" />
            )}
            Google
          </button>
          <span className="text-muted-foreground/40">·</span>
          <button
            onClick={() => handleSubscribe("apple")}
            disabled={isSubscribing}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50 cursor-pointer"
          >
            {isSubscribing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <AppleIcon className="w-3.5 h-3.5" />
            )}
            Apple
          </button>
        </div>
      </div>
      <button
        onClick={dismiss}
        className="p-1 shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors rounded-sm cursor-pointer"
        aria-label="Dismiss calendar sync suggestion"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
