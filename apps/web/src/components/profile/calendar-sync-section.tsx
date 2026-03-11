"use client";

import { Loader2 } from "lucide-react";
import {
  useCalendarStatus,
  useEnableCalendar,
  useDisableCalendar,
  useRegenerateCalendar,
} from "@/hooks/use-calendar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
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

export function CalendarSyncSection() {
  const calendarStatus = useCalendarStatus();
  const enableCalendar = useEnableCalendar();
  const disableCalendar = useDisableCalendar();
  const regenerateCalendar = useRegenerateCalendar();

  const enabled = calendarStatus.data?.enabled ?? false;
  const calendarUrl = calendarStatus.data?.calendarUrl;
  const isSubscribing = enableCalendar.isPending;

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
    <>
      <Separator />

      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">
            Calendar Sync
          </h2>
          <p className="text-sm text-muted-foreground">
            Subscribe to see your trip events in your calendar app.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            className="justify-start rounded-md"
            disabled={isSubscribing}
            onClick={() => handleSubscribe("google")}
          >
            {isSubscribing ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <GoogleIcon className="w-4 h-4 mr-2" />
            )}
            Subscribe in Google Calendar
          </Button>

          <Button
            type="button"
            variant="outline"
            className="justify-start rounded-md"
            disabled={isSubscribing}
            onClick={() => handleSubscribe("apple")}
          >
            {isSubscribing ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <AppleIcon className="w-4 h-4 mr-2" />
            )}
            Subscribe in Apple Calendar
          </Button>
        </div>

        {enabled && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <button
              type="button"
              className="underline hover:text-foreground transition-colors"
              disabled={disableCalendar.isPending}
              onClick={() => disableCalendar.mutate()}
            >
              {disableCalendar.isPending ? "Unsubscribing..." : "Unsubscribe"}
            </button>
            <span aria-hidden="true">&middot;</span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="underline hover:text-foreground transition-colors"
                  disabled={regenerateCalendar.isPending}
                >
                  {regenerateCalendar.isPending
                    ? "Resetting..."
                    : "Reset calendar link"}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset calendar link?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will invalidate your current calendar link. You will
                    need to re-subscribe in your calendar app with the new link.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => regenerateCalendar.mutate()}
                  >
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          All trips are included by default. Exclude individual trips in trip
          settings.
        </p>
      </div>
    </>
  );
}
