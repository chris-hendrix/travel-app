import { mutationOptions } from "@tanstack/react-query";
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
 * the server's value. `calendarExcluded` rides along in the response
 * but has no mobile write path (ledger #4, at the settings screen).
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
