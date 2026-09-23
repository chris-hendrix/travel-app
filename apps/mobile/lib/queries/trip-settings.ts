import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/**
 * Trip settings write-through (Phase 4, Task 6).
 *
 * The split is the plan's confirmed settings contract:
 * - `sharePhone` rides `PATCH /trips/:tripId/my-settings`, whose body
 *   covers only `sharePhone` (`updateMySettingsSchema` in
 *   `shared/schemas/invitation.ts`).
 * - `dailyItinerary`/`tripMessages` ride full-replace
 *   `PUT /trips/:tripId/notification-preferences` with BOTH booleans
 *   required (`notificationPreferencesSchema` in
 *   `shared/schemas/notification.ts`) — hence read-modify-write.
 * - `clock`/`layout`/`showPast`/`pushEnabled` never reach this module:
 *   they stay device-local in `lib/tripSettingsStore.tsx`.
 *
 * zod is not a mobile dep, so the shapes are declared inline,
 * mirroring the schemas (the `CreateTripRequest` precedent in
 * `lib/queries/trips.ts`).
 */

/** Inline mirror of `notificationPreferencesSchema`'s shape. */
export type NotificationPreferences = {
  dailyItinerary: boolean;
  tripMessages: boolean;
};

/** `GET|PUT /trips/:tripId/notification-preferences` response shape. */
type NotificationPreferencesResponse = {
  success: true;
  preferences: NotificationPreferences;
};

/** `PATCH /trips/:tripId/my-settings` response shape. */
type MySettingsResponse = {
  success: true;
  sharePhone: boolean;
  calendarExcluded: boolean;
};

/**
 * `PUT /trips/:tripId/members/me/calendar` response shape
 * (`calendarSuccessResponseSchema` in `shared/schemas/calendar.ts`): the
 * endpoint answers success and nothing else, so the value written is the
 * one the caller already knows.
 */
type CalendarExclusionResponse = { success: true };

/** Key factory for the trip-settings domain. */
export const tripSettingsKeys = {
  all: ["tripSettings"] as const,
  mySettings: (tripId: string) =>
    [...tripSettingsKeys.all, "mySettings", tripId] as const,
  notificationPreferences: (tripId: string) =>
    [...tripSettingsKeys.all, "notificationPreferences", tripId] as const,
};

/**
 * `GET /trips/:tripId/my-settings`, mapped to the member's own pair.
 * The only per-member own-settings read: it carries both `sharePhone`
 * and `calendarExcluded` (the roster's rows carry `sharePhone` alone,
 * and trip detail carries neither).
 */
export async function getMySettings(
  tripId: string,
): Promise<{ sharePhone: boolean; calendarExcluded: boolean }> {
  const body = await apiFetch<MySettingsResponse>(
    `/trips/${tripId}/my-settings`,
  );
  return {
    sharePhone: body.sharePhone,
    calendarExcluded: body.calendarExcluded,
  };
}

/** Query read for the member's own pair, backing the settings screen. */
export const mySettingsOptions = (tripId: string) =>
  queryOptions({
    queryKey: tripSettingsKeys.mySettings(tripId),
    queryFn: () => getMySettings(tripId),
  });

/** Query read for the notification pair, backing the settings screen. */
export const notificationPreferencesOptions = (tripId: string) =>
  queryOptions({
    queryKey: tripSettingsKeys.notificationPreferences(tripId),
    queryFn: () => getNotificationPreferences(tripId),
  });

/**
 * `GET /trips/:tripId/notification-preferences`, mapped to the
 * preference pair. The read half of the read-modify-write the PUT's
 * full-replace shape forces.
 */
export async function getNotificationPreferences(
  tripId: string,
): Promise<NotificationPreferences> {
  const body = await apiFetch<NotificationPreferencesResponse>(
    `/trips/${tripId}/notification-preferences`,
  );
  return body.preferences;
}

/**
 * `PATCH /trips/:tripId/my-settings` with `{sharePhone}`, returning
 * the server's value. `calendarExcluded` rides along in the response but
 * is written through its own endpoint, below.
 */
export async function updateSharePhone(
  tripId: string,
  sharePhone: boolean,
): Promise<boolean> {
  const body = await apiFetch<MySettingsResponse>(
    `/trips/${tripId}/my-settings`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sharePhone }),
    },
  );
  return body.sharePhone;
}

/**
 * `PUT /trips/:tripId/members/me/calendar` with `{excluded}` — the
 * per-trip half of the calendar feed.
 *
 * Its own endpoint rather than the my-settings PATCH, which is what the
 * screen's TODO assumed it had to be: the server has filtered the feed on
 * this flag all along (`calendar.service.ts`, `eq(members.calendarExcluded,
 * false)`), and the web app has called this route since before the mobile
 * screen existed (`apps/web/src/hooks/use-calendar.ts`). Until the feed
 * became subscribable from Profile nothing could see the flag, which is
 * how a switch that writes to nothing survived.
 */
export async function updateCalendarIncluded(
  tripId: string,
  included: boolean,
): Promise<boolean> {
  await apiFetch<CalendarExclusionResponse>(
    `/trips/${tripId}/members/me/calendar`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ excluded: !included }),
    },
  );
  return included;
}

/**
 * Read-modify-write for one notification boolean: GET the pair first,
 * flip the patched key, PUT both back, return the server's pair.
 */
// TODO(BE): Notification preferences are a full-replace `PUT` with both booleans required; the client does read-modify-write. A `PATCH` would remove the read.
export async function updateNotificationPreference(
  tripId: string,
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const current = await getNotificationPreferences(tripId);
  const next: NotificationPreferences = { ...current, ...patch };
  const body = await apiFetch<NotificationPreferencesResponse>(
    `/trips/${tripId}/notification-preferences`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    },
  );
  return body.preferences;
}

/** Mutation wrapper for callers that fire `updateSharePhone` via TanStack Query. */
export const updateSharePhoneOptions = () =>
  mutationOptions({
    mutationKey: ["tripSettings", "sharePhone"],
    mutationFn: ({ tripId, sharePhone }: { tripId: string; sharePhone: boolean }) =>
      updateSharePhone(tripId, sharePhone),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { updateSharePhoneOptions as updateSharePhoneMutation };

/** Mutation wrapper for callers that fire `updateNotificationPreference` via TanStack Query. */
export const updateNotificationPreferenceOptions = () =>
  mutationOptions({
    mutationKey: ["tripSettings", "notificationPreference"],
    mutationFn: ({
      tripId,
      patch,
    }: {
      tripId: string;
      patch: Partial<NotificationPreferences>;
    }) => updateNotificationPreference(tripId, patch),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { updateNotificationPreferenceOptions as updateNotificationPreferenceMutation };
