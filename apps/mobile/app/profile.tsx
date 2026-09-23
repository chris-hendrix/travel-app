import { useCallback, useState } from "react";
import { Image, Linking, Platform, Pressable, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { InlineError } from "@/components/ui/InlineError";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { useDismiss } from "@/hooks/useDismiss";
import { joinFacts } from "@/lib/wording";
import {
  draftFromProfile,
  initials,
  validateProfile,
  type Profile,
  type ProfileDraft,
  type TemperatureUnit,
} from "@/lib/profile";
import { formatPhoneForDisplay } from "@/lib/phone";
import { appleCalendarUrl, googleCalendarUrl } from "@/lib/calendarLinks";
import { enableCalendar } from "@/lib/queries/calendar";
import { useProfile } from "@/lib/profileStore";
import { toErrorCopy } from "@/lib/queries/errors";
import { LEGAL_ROWS } from "@/lib/legal";
import { useAuth } from "@/lib/authStore";

/**
 * Fahrenheit first, because it is the default the API answers with
 * (`lib/mapping.ts`): the value you are most likely to already be on is
 * the one under the thumb that goes looking for it.
 */
const UNITS: Array<{ value: TemperatureUnit; label: string }> = [
  { value: "fahrenheit", label: "Fahrenheit" },
  { value: "celsius", label: "Celsius" },
];

/**
 * Profile. Who you are, what you are called, and the preferences the app
 * keeps about you — then the two things you can do about your account
 * from here, then the documents you agreed to.
 *
 * No heading on the fields: they are short enough to read as one list.
 *
 * No rules either. There were three across the bottom half — one per
 * block — and at that density a line stops marking anything: the eye
 * reads a ladder rather than two seams. What separates the three groups
 * below the fields is their headings ("Calendar", "Legal & privacy") and
 * the distance between them, which is four times the distance between two
 * buttons in one group. A very loud device used for everything is a very
 * quiet one.
 *
 * The way out is the last thing on the screen, under its one rule, below
 * the documents. Both platforms keep sign-out at the bottom of the
 * account screen, so that is where a thumb goes looking for it, and what
 * made it read as buried before was the three rules above it rather than
 * the position. It is not at the very top because the top is your own
 * face and name, the avatar in that band is already a control, and the
 * way back in is a texted code — a way out does not belong where the
 * thumb lands by accident. The foot also keeps the last slot free, which
 * is where a destructive action goes the day this account has one. It
 * does not yet: the lab's parking lot carries delete account as a pattern
 * waiting on a route, and an account here can only be banned.
 *
 * The identity block reads from the draft, not the saved profile, so
 * typing a new name sets the headline as you go: the clearest proof that
 * an edit landed, without a toast.
 *
 * The phone number is the account, so it is shown and not edited. Sign
 * out closes the session and leaves the flow where it can be entered
 * again, which is the login screen rather than the trips list.
 *
 * The read is the screen: loading, error, and offline are explicit —
 * the store hook cannot suspend because the provider sits above the
 * Suspense boundary in `app/_layout.tsx` (same constraint as the
 * notifications screen).
 */
export default function ProfileScreen() {
  const { profile, status, error, retry } = useProfile();

  if (status === "pending" || profile === null) {
    return (
      <FullscreenDialog title="Profile">
        <LoadingBlock label="Loading profile" />
      </FullscreenDialog>
    );
  }
  if (status === "error") {
    return (
      <FullscreenDialog title="Profile">
        <ProfileFailure error={error} onRetry={retry} />
      </FullscreenDialog>
    );
  }
  return <ProfileForm profile={profile} />;
}

/**
 * Where the me request failed, in place of the form. Offline renders
 * `OfflineBlock` with its default copy; anything else renders the
 * screen's sentence. Copy follows the trips-list gate: loading
 * `"Profile"`, error `"Couldn't load your profile"` + `Try again`.
 */
function ProfileFailure({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const copy = toErrorCopy(error);
  // `exactOptionalPropertyTypes` is on: only pass `onRetry` when the
  // copy offers a retry, never an explicit `undefined`.
  const retryProps = copy.retry ? { onRetry } : {};
  if (copy.offline) {
    return <OfflineBlock {...retryProps} />;
  }
  return (
    <InlineError
      message={copy.message ?? "Couldn't load your profile"}
      {...retryProps}
    />
  );
}

function ProfileForm({ profile }: { profile: Profile }) {
  const { saveProfile, savePhoto } = useProfile();
  const { signOut } = useAuth();
  const router = useRouter();
  const dismiss = useDismiss("/trips");

  const [draft, setDraft] = useState<ProfileDraft>(() =>
    draftFromProfile(profile),
  );
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The calendar's own two states, separate from the form's: subscribing
  // is not a save, and a failure in it must not read as one — the form
  // above is unsaved while this happens.
  const [calendarBusy, setCalendarBusy] = useState<"google" | "apple" | null>(
    null,
  );
  const [calendarFailure, setCalendarFailure] = useState<string | null>(null);
  const errors = submitted ? validateProfile(draft) : {};

  /**
   * The avatar is the control: tapping it opens the system photo library.
   * No permission call up front — the picker is the permission check, and
   * on web the browser only allows it from a real press.
   */
  const pickPhoto = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    const uri = result.canceled ? null : result.assets[0]?.uri;
    // Pick → upload (`POST /users/me/photo` through the store's
    // optimistic mutation); the me cache carries the server URL back.
    if (uri) void savePhoto(uri);
  }, [savePhoto]);

  /**
   * Ensure the feed exists, then hand its URL to the calendar chosen.
   *
   * The link is built rather than fetched: `googleCalendarUrl` and
   * `appleCalendarUrl` are the two clients of the one URL the API hands
   * back, and both are pure (`lib/calendarLinks.ts`).
   */
  async function subscribe(
    which: "google" | "apple",
    toLink: (feedUrl: string) => string,
  ) {
    setCalendarFailure(null);
    setCalendarBusy(which);
    try {
      const { calendarUrl } = await enableCalendar();
      await Linking.openURL(toLink(calendarUrl));
    } catch (caught) {
      const copy = toErrorCopy(caught);
      setCalendarFailure(
        copy.offline
          ? "You're offline. Check your connection and try again."
          : (copy.message ?? "Couldn't open your calendar."),
      );
    } finally {
      setCalendarBusy(null);
    }
  }

  async function save() {
    setSubmitted(true);
    setFailure(null);
    if (Object.keys(validateProfile(draft)).length > 0) return;

    // The write goes through `PUT /users/me` (failure rolls back in
    // the mutation and reads here, in the screen's existing
    // submit-area style — the edit-trip precedent).
    setBusy(true);
    try {
      await saveProfile(draft);
      dismiss();
    } catch (caught) {
      const copy = toErrorCopy(caught);
      if (copy.offline) {
        setFailure("You're offline. Check your connection and try again.");
      } else {
        setFailure(
          copy.message ??
            (caught instanceof Error
              ? caught.message
              : "Couldn't save your profile."),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <FullscreenDialog
      title="Profile"
      primaryTitle={busy ? "Saving changes" : "Save changes"}
      onPrimary={() => void save()}
      pending={busy}
    >
      {/* Identity. A square of ink rather than a circle: nothing else in
          the system is round except the countdown pill. */}
      <View className="flex-row items-center gap-5">
        <Pressable
          onPress={pickPhoto}
          aria-label="Change profile picture"
          className="cursor-pointer"
        >
          {profile.profilePhotoUrl ? (
            <Image
              source={{ uri: profile.profilePhotoUrl }}
              resizeMode="cover"
              className="h-20 w-20"
            />
          ) : (
            <View className="h-20 w-20 items-center justify-center bg-ink">
              <Text className="font-display text-4xl leading-none text-sand">
                {initials(draft.displayName)}
              </Text>
            </View>
          )}
        </Pressable>
        <View className="flex-1">
          <Text className="font-display text-3xl uppercase leading-tight text-ink">
            {draft.displayName.trim() || "Your name"}
          </Text>
          <Text className="mt-1 font-body text-sm text-ink">
            {formatPhoneForDisplay(profile.phoneNumber)}
          </Text>
          {profile.profilePhotoUrl ? (
            <Pressable onPress={() => void savePhoto(null)} className="mt-2 self-start">
              <Text className="font-body-bold text-sm text-ink underline">
                Remove photo
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <TextField
        label="Display name"
        value={draft.displayName}
        onChangeText={(displayName) =>
          setDraft((current) => ({ ...current, displayName }))
        }
        placeholder="Ada Lovelace"
        error={errors.displayName}
      />
      <TextField
        label="Venmo"
        value={draft.venmo}
        onChangeText={(venmo) => setDraft((current) => ({ ...current, venmo }))}
        placeholder="ada-lovelace"
        error={errors.venmo}
      />
      <TextField
        label="Instagram"
        value={draft.instagram}
        onChangeText={(instagram) =>
          setDraft((current) => ({ ...current, instagram }))
        }
        placeholder="ada.lovelace"
        error={errors.instagram}
      />

      <View className="gap-2">
        <Text className="font-body-bold text-sm text-ink">Temperature</Text>
        {/* A value, so it wears the cells every other choice in the app
            wears (components/ui/Segmented.tsx) — bordered, the chosen one
            inked — rather than bare words: a word with no box and no
            underline is a label, not something a thumb can be asked to
            press. It was a pair of Pressables built here, which is also
            why the run's layout switch had nothing to copy. */}
        <Segmented
          options={UNITS}
          value={draft.temperatureUnit}
          onChange={(unit) =>
            setDraft((current) => ({ ...current, temperatureUnit: unit }))
          }
        />
      </View>

      {failure ? (
        <Text className="font-body text-sm text-ink">{failure}</Text>
      ) : null}

      {/* The timezone is detected, so this is information rather than a
          field — and the wording stays device-agnostic, since the same
          screen renders on the web. */}
      <View className="gap-1">
        <Text className="font-body-bold text-sm text-ink">Timezone</Text>
        <Text className="font-body text-sm text-ink">
          {joinFacts(profile.timezone ?? "Not set", "automatic")}
        </Text>
      </View>

      {/* The calendar, opened by its heading rather than by a rule: the
          heading already says the screen changes here, and a line above it
          was the third of three in the bottom half of the screen, which is
          when a rule stops meaning anything.

          Full width on a phone, one under the other, like every other
          button in this system: a pair of halves would fit the labels but
          not the thumb, and the two are alternatives rather than a row to
          scan across. Enabling is idempotent, so a press ensures the feed
          exists and then opens it — there is no state to read and none to
          show, and no race between the two. */}
      <View className="gap-1 pt-6">
        <Text className="font-body-bold text-sm text-ink">Calendar</Text>
        <Text className="mt-1 font-body text-sm text-ink">
          Subscribe to every trip you are on, in the calendar you already
          read.
        </Text>
        <View className="mt-3 gap-3">
          <Button
            title={
              calendarBusy === "google"
                ? "Opening Google Calendar"
                : "Subscribe in Google Calendar"
            }
            variant="secondary"
            fullWidth
            disabled={calendarBusy === "google"}
            onPress={() => void subscribe("google", googleCalendarUrl)}
          />
          {/* Apple's Calendar claims `webcal:`, and it is the one platform
              whose calendar app is the point: Android has no Apple
              Calendar to open, so it is not offered one. */}
          {Platform.OS === "android" ? null : (
            <Button
              title={
                calendarBusy === "apple"
                  ? "Opening Apple Calendar"
                  : "Subscribe in Apple Calendar"
              }
              variant="secondary"
              fullWidth
              disabled={calendarBusy === "apple"}
              onPress={() => void subscribe("apple", appleCalendarUrl)}
            />
          )}
        </View>
        {calendarFailure ? (
          <Text className="mt-3 font-body text-sm text-ink">
            {calendarFailure}
          </Text>
        ) : null}
      </View>

      {/* The documents belong to the person, not to a trip: the consent
          is yours, and these are the ones you gave it to. Their heading is
          what sets them apart — the same device as the calendar's above. */}
      <View className="pt-6">
        <Text className="font-body-bold text-sm text-ink">
          Legal & privacy
        </Text>
        <View className="mt-2">
          {LEGAL_ROWS.map((row) => (
            <View key={row.href} className="py-1">
              <Link
                href={row.href}
                className="font-body-bold text-base text-ink underline"
              >
                {row.title}
              </Link>
            </View>
          ))}
        </View>
      </View>

      {/* The way out, last and under the screen's one rule.

          It was above the documents, then between them and the calendar,
          and the operator has put it here: the bottom of the scroll is
          where both platforms keep it, so it is where a thumb goes looking
          for it. What made it read as buried the first time was not its
          position — it was three rules stacked in the bottom half, so no
          line meant anything, and nothing at all marked the way out as its
          own thing. One rule, and the screen ends.

          No heading, and no colour. A heading over a button whose label
          says the same word is the restating this system took out once
          already — the ITINERARY eyebrow over the run's own day headings —
          and `Button`'s note reserves the alert for what cannot be taken
          back. Signing out can, with a code, and the action that really
          cannot — deleting the account — has no route behind it yet and
          would have nothing left to wear. */}
      <View className="border-t border-ink pt-6">
        <Button
          title="Sign out"
          variant="secondary"
          fullWidth
          // Await the real sign-out (server POST, token drop, cache
          // clear) before leaving: navigating first would let the
          // login screen render while signed-in data is still cached.
          onPress={() => void signOut().then(() => router.replace("/login"))}
        />
      </View>
    </FullscreenDialog>
  );
}
