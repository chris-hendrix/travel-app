"use client";

import { useState } from "react";
import { CalendarPlus, Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  useCalendarStatus,
  useEnableCalendar,
  useDisableCalendar,
  useRegenerateCalendar,
} from "@/hooks/use-calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
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

export function CalendarSyncSection() {
  const calendarStatus = useCalendarStatus();
  const enableCalendar = useEnableCalendar();
  const disableCalendar = useDisableCalendar();
  const regenerateCalendar = useRegenerateCalendar();
  const [copied, setCopied] = useState(false);

  const enabled = calendarStatus.data?.enabled ?? false;
  const calendarUrl = calendarStatus.data?.calendarUrl;
  const isToggling = enableCalendar.isPending || disableCalendar.isPending;

  function handleToggle(checked: boolean) {
    if (checked) {
      enableCalendar.mutate();
    } else {
      disableCalendar.mutate();
    }
  }

  async function handleCopy() {
    if (!calendarUrl) return;
    const httpsUrl = calendarUrl.replace(/^webcal:\/\//, "https://");
    await navigator.clipboard.writeText(httpsUrl);
    toast.success("Calendar URL copied!");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            Subscribe to your trip events in your calendar app
          </p>
        </div>

        <div className="flex items-center justify-between">
          <label
            htmlFor="calendar-sync-toggle"
            className="text-sm font-medium text-foreground"
          >
            Enable calendar sync
          </label>
          {isToggling ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : (
            <Switch
              id="calendar-sync-toggle"
              checked={enabled}
              onCheckedChange={handleToggle}
              disabled={calendarStatus.isLoading}
            />
          )}
        </div>

        {enabled && calendarUrl && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                Your calendar subscription URL
              </label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={calendarUrl}
                  className="h-10 text-sm border-input bg-muted cursor-default rounded-xl"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-xl"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                asChild
              >
                <a href={calendarUrl}>
                  <CalendarPlus className="w-4 h-4 mr-1.5" />
                  Add to Calendar
                </a>
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    disabled={regenerateCalendar.isPending}
                  >
                    {regenerateCalendar.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-1.5" />
                    )}
                    Regenerate URL
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Regenerate calendar URL?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will invalidate your current calendar URL. You will
                      need to re-subscribe in your calendar app with the new URL.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => regenerateCalendar.mutate()}
                    >
                      Regenerate
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <p className="text-sm text-muted-foreground">
              All trips are included by default. Exclude individual trips in
              trip settings.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
