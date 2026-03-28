"use client";

import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  getUpdatePreferencesErrorMessage,
} from "@/hooks/use-notifications";
import {
  useMySettings,
  useUpdateMySettings,
  getUpdateMySettingsErrorMessage,
} from "@/hooks/use-invitations";
import {
  useCalendarStatus,
  useUpdateTripCalendarExclusion,
} from "@/hooks/use-calendar";
import { isPushSupported } from "@/lib/push-notifications";
import {
  usePushPermission,
  useSubscribeToPush,
} from "@/hooks/use-push-notifications";

function CalendarTripSection({
  tripId,
  calendarExcluded,
}: {
  tripId: string;
  calendarExcluded: boolean;
}) {
  const calendarStatus = useCalendarStatus();
  const updateExclusion = useUpdateTripCalendarExclusion(tripId);

  if (!calendarStatus.data?.enabled) return null;

  return (
    <>
      <Separator className="my-4" />
      <p className="text-sm font-medium mt-4 mb-2">Calendar</p>
      <div className="flex items-center justify-between py-3">
        <div className="space-y-0.5">
          <Label htmlFor="calendar-include" className="text-sm font-medium">
            Include in calendar
          </Label>
          <p className="text-xs text-muted-foreground">
            When this trip's events change, your calendar subscription will
            reflect the updates.
          </p>
        </div>
        <Switch
          id="calendar-include"
          checked={!calendarExcluded}
          onCheckedChange={(checked) =>
            updateExclusion.mutate({ excluded: !checked })
          }
          disabled={updateExclusion.isPending}
          aria-label="Include in calendar"
        />
      </div>
    </>
  );
}

function PushNotificationSection() {
  const { permission } = usePushPermission();
  const subscribeToPush = useSubscribeToPush();
  const pushSupported = typeof window !== "undefined" && isPushSupported();

  if (!pushSupported) return null;

  const handleEnable = async () => {
    await subscribeToPush();
  };

  return (
    <>
      <Separator className="my-4" />
      <p className="text-sm font-medium mt-4 mb-2">Push Notifications</p>
      <div className="flex items-center justify-between py-3">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Browser push</Label>
          <p className="text-xs text-muted-foreground">
            {permission === "granted"
              ? "Push notifications are enabled."
              : permission === "denied"
                ? "Push notifications are blocked. Enable them in your browser settings."
                : "Receive push notifications in this browser."}
          </p>
        </div>
        {permission === "default" && (
          <button
            onClick={handleEnable}
            className="text-xs font-semibold px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Enable
          </button>
        )}
        {permission === "granted" && (
          <span className="text-xs font-medium text-success">Enabled</span>
        )}
        {permission === "denied" && (
          <span className="text-xs font-medium text-destructive">Blocked</span>
        )}
      </div>
    </>
  );
}

interface NotificationPreferencesProps {
  tripId: string;
}

const preferences = [
  {
    key: "dailyItinerary" as const,
    label: "Daily Itinerary",
    description: "Receive a summary of the day's events at 8am",
  },
  {
    key: "tripMessages" as const,
    label: "Trip Messages",
    description: "Get notified when someone posts a new message",
  },
];

export function NotificationPreferences({
  tripId,
}: NotificationPreferencesProps) {
  const { data: prefs, isLoading } = useNotificationPreferences(tripId);
  const updatePreferences = useUpdateNotificationPreferences(tripId);
  const { data: mySettings, isLoading: isMySettingsLoading } =
    useMySettings(tripId);
  const updateMySettings = useUpdateMySettings(tripId);

  function handleToggle(
    key: "dailyItinerary" | "tripMessages",
    checked: boolean,
  ) {
    if (!prefs) return;

    updatePreferences.mutate(
      {
        dailyItinerary: prefs.dailyItinerary,
        tripMessages: prefs.tripMessages,
        [key]: checked,
      },
      {
        onSuccess: () => {
          toast.success("Preferences updated");
        },
        onError: (error) => {
          const message = getUpdatePreferencesErrorMessage(error);
          toast.error(message ?? "Failed to update preferences");
        },
      },
    );
  }

  const handleSharePhoneToggle = (checked: boolean) => {
    updateMySettings.mutate(
      { sharePhone: checked },
      {
        onSuccess: () => toast.success("Privacy settings updated"),
        onError: (error) => {
          const message = getUpdateMySettingsErrorMessage(error);
          toast.error(message || "Failed to update privacy settings");
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4 py-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-5 w-9 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {preferences.map((pref, index) => (
        <div key={pref.key}>
          <div className="flex items-center justify-between py-4">
            <div className="space-y-1 pr-4">
              <Label
                htmlFor={`pref-${pref.key}`}
                className="text-sm font-medium"
              >
                {pref.label}
              </Label>
              <p className="text-sm text-muted-foreground">
                {pref.description}
              </p>
            </div>
            <Switch
              id={`pref-${pref.key}`}
              checked={prefs?.[pref.key] ?? true}
              onCheckedChange={(checked) => handleToggle(pref.key, checked)}
              aria-label={pref.label}
            />
          </div>
          {index < preferences.length - 1 && <Separator />}
        </div>
      ))}
      <Separator className="my-4" />
      <p className="text-sm font-medium mt-4 mb-2">Privacy</p>
      {isMySettingsLoading ? (
        <div className="flex items-center justify-between py-3">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-5 w-9 rounded-full" />
        </div>
      ) : (
        <div className="flex items-center justify-between py-3">
          <div className="space-y-0.5">
            <Label htmlFor="share-phone" className="text-sm font-medium">
              Share phone number
            </Label>
            <p className="text-xs text-muted-foreground">
              Allow other trip members to see your phone number
            </p>
          </div>
          <Switch
            id="share-phone"
            checked={mySettings?.sharePhone ?? false}
            onCheckedChange={handleSharePhoneToggle}
            aria-label="Share phone number"
          />
        </div>
      )}
      <PushNotificationSection />
      <p className="mt-4 text-xs text-muted-foreground">
        Notifications are sent in-app, via push, and via SMS to your phone
        number.
      </p>
      <CalendarTripSection
        tripId={tripId}
        calendarExcluded={mySettings?.calendarExcluded ?? false}
      />
    </div>
  );
}
