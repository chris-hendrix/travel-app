import { useCallback, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { Link, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { RuledBlock } from "@/components/ui/RuledBlock";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { InlineError } from "@/components/ui/InlineError";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { QuietAction } from "@/components/ui/QuietAction";
import { Segmented } from "@/components/ui/Segmented";
import { useDismiss } from "@/hooks/useDismiss";
import {
  draftFromProfile,
  initials,
  UNITS,
  validateProfile,
  type Profile,
  type ProfileDraft,
} from "@/lib/profile";
import { formatPhoneForDisplay } from "@/lib/phone";
import { appleCalendarUrl, googleCalendarUrl } from "@/lib/calendarLinks";
import { disableCalendar, enableCalendar, regenerateCalendar } from "@/lib/queries/calendar";
import { useProfile } from "@/lib/profileStore";
import { toErrorCopy } from "@/lib/queries/errors";
import { LEGAL_ROWS } from "@/lib/legal";
import { useAuth } from "@/lib/authStore";
import { useMotion } from "@/hooks/useMotion";
import { POP_FILL, initialsHue } from "@/lib/eventColors";

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
  const motion = useMotion();
  const { saveProfile, savePhoto } = useProfile();
  const { signOut, isAdmin } = useAuth();
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
  const [calendarBusy, setCalendarBusy] = useState<
    "google" | "apple" | "stop" | "reset" | null
  >(null);
  const [calendarFailure, setCalendarFailure] = useState<string | null>(null);
  // Both words end the current link — the token is nulled by one and
  // replaced by the other — so both take two presses, because the cost
  // is the same and only one of them used to ask. The scaffold's
  // destructive foot fires on one press with no confirm step, so the
  // confirm lives here, in the block, as a second row of the buttons
  // this screen already uses — no new dialog to learn.
  const [confirming, setConfirming] = useState<"stop" | "reset" | null>(null);
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

  /**
   * Revoke the feed: the URL stops working, and no new one is issued —
   * which breaks every calendar subscribed to it exactly as replacing
   * the URL does, which is why it asks twice too. Arming a reset is
   * abandoned with it — there is nothing left whose replacement could
   * break a subscription.
   */
  async function unsubscribe() {
    setCalendarFailure(null);
    setConfirming(null);
    setCalendarBusy("stop");
    try {
      await disableCalendar();
    } catch (caught) {
      const copy = toErrorCopy(caught);
      setCalendarFailure(
        copy.offline
          ? "You're offline. Check your connection and try again."
          : (copy.message ?? "Couldn't stop your calendar updates."),
      );
    } finally {
      setCalendarBusy(null);
    }
  }

  /**
   * Replace the feed URL after the second press. The first press only
   * arms the confirm above the buttons; the old link dies here, so
   * every calendar subscribed to it must be set up again. Which calendar
   * re-opens is the chooser's call, the same as the subscribe above —
   * an Apple subscription reset into Google is a link that opens on
   * nothing — so this takes the same target the subscribe buttons pass.
   */
  async function resetLink(toLink: (feedUrl: string) => string) {
    setCalendarFailure(null);
    setCalendarBusy("reset");
    try {
      const { calendarUrl } = await regenerateCalendar();
      setConfirming(null);
      await Linking.openURL(toLink(calendarUrl));
    } catch (caught) {
      const copy = toErrorCopy(caught);
      setCalendarFailure(
        copy.offline
          ? "You're offline. Check your connection and try again."
          : (copy.message ?? "Couldn't reset your calendar link."),
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
      {/* The way in for an admin, first on the screen rather than last
          where it sat between the calendar and the documents. It is a
          whole other surface, two screens of scroll away from the top of
          a dialog, and the only reader who can open it is the one who
          came here for it. Absent for everyone else — not disabled, not
          empty, and nothing explains why: a profile screen should not
          advertise a surface its reader cannot open.

          A box rather than a word. Every other row on this screen that
          goes somewhere is a document, and a document is a word; this is
          not one, and it is the only destination here that is a mode
          rather than a page. `secondary` and not `primary`, because the
          screen's one filled box is the ActionBar's Save changes.

          The heading and the sentence are the ones the block wore where
          it used to sit, so its shape still matches `Legal & privacy`
          below and nothing new is added to the system. No `fullWidth`,
          like every other content button: it fills a phone and hugs the
          start edge from md up, and a box stretched the width of a
          960px column around the two words "User management" is a
          panel, not a control. */}
      {isAdmin ? (
        <View>
          <Text className="font-body-bold text-sm text-ink">Admin</Text>
          <Text className="mt-2 font-body text-sm text-ink">
            Search every user, and act on one.
          </Text>
          <View className="mt-3">
            <Button
              title="User management"
              variant="secondary"
              onPress={() => router.push("/admin/users")}
            />
          </View>
        </View>
      ) : null}

      {/* Identity. A square of ink rather than a circle: nothing else in
          the system is round except the countdown pill. */}
      <View className="flex-row items-center gap-5">
        <Pressable
          onPress={pickPhoto}
          aria-label="Change profile picture"
          className={`cursor-pointer ${motion.pressDim}`}
        >
          {profile.profilePhotoUrl ? (
            <Image
              source={{ uri: profile.profilePhotoUrl }}
              contentFit="cover"
              cachePolicy="memory-disk"
              className="h-20 w-20"
            />
          ) : (
            <View
                className={`h-20 w-20 items-center justify-center ${POP_FILL[initialsHue(draft.displayName)]}`}
              >
              <Text className="font-display-extrabold text-display-md text-ink">
                {initials(draft.displayName)}
              </Text>
            </View>
          )}
        </Pressable>
        <View className="flex-1">
          <Text className="font-display-bold text-display-sm uppercase text-ink">
            {draft.displayName.trim() || "Your name"}
          </Text>
          <Text className="mt-1 font-body text-sm text-ink">
            {formatPhoneForDisplay(profile.phoneNumber)}
          </Text>
          {profile.profilePhotoUrl ? (
            <Pressable
              onPress={() => void savePhoto(null)}
              className={`mt-2 self-start ${motion.press}`}
            >
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
        <Text className="font-body-bold text-sm text-ink">Units</Text>
        {/* The whole measurement system, not one of its results: the
            same choice reads temperatures and reads distances, so a
            control named "Temperature" would be asking to be renamed
            the day a distance is shown. `US` and `Metric` are the
            words the phone in the reader's hand already uses. */}
        {/* A value, so it wears the cells every other choice in the app
            wears (components/ui/Segmented.tsx) — bordered, the chosen one
            inked — rather than bare words: a word with no box and no
            underline is a label, not something a thumb can be asked to
            press. It was a pair of Pressables built here, which is also
            why the run's layout switch had nothing to copy. */}
        <Segmented
          options={UNITS}
          value={draft.temperatureUnit}
          // `content`, not the fill default: two short labels spread
          // across a wide column are two labels with a canyon between
          // them. A phone is unchanged, where the cells still split the
          // width. The RSVP keeps the default, because three cells
          // sharing a width is what makes it read as one control.
          width="content"
          onChange={(unit) =>
            setDraft((current) => ({ ...current, temperatureUnit: unit }))
          }
        />
      </View>

      {failure ? (
        <Text className="font-body text-sm text-ink">{failure}</Text>
      ) : null}

      {/* No timezone row. There was one, and it read `Not set ·
          automatic`: `users.timezone` is written by the web app's
          complete-profile form and by nothing else, so an account made on
          a phone has it null — and nothing on the server reads the column
          for anything. What the app actually reads times on is the
          device's own zone, and the chrome already says so, live and
          interactively, through the token in the header. Two statements of
          one fact, one of them wrong, is worse than one. */}

      {/* The calendar, opened by its heading rather than by a rule: the
          heading already says the screen changes here, and a line above it
          was the third of three in the bottom half of the screen, which is
          when a rule stops meaning anything.

          One under the other, at every width: a button is one choice, and
          a pair of halves in a row turns this list into a choice it was
          never meant to be — then wraps to a ragged 2+1 on a phone. Wide,
          each drops to its content width on the start edge. Enabling is
          idempotent, so a press ensures the feed exists and then opens
          it: no state to read, none to show, and no race between the
          two. */}
      <View className="gap-1">
        <Text className="font-body-bold text-sm text-ink">Calendar</Text>
        <Text className="mt-1 font-body text-sm text-ink">
          Subscribe to every trip you are on, in the calendar you already
          read. Your link is a secret: anyone with it can read your trips.
        </Text>
        <View className="mt-3 gap-3">
          <Button
            title={
              calendarBusy === "google"
                ? "Opening Google Calendar"
                : "Subscribe in Google Calendar"
            }
            variant="secondary"
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
        {/* Taking the link back. Both words end the current link — the
            token is nulled by one and replaced by the other — so the
            calendar you subscribed from stops updating either way, and
            that is what both confirms say. Only the afterwards differs:
            one leaves nothing, the other re-subscribes you. */}
        {confirming ? (
          <View className="mt-3 gap-2">
            <Text className="font-body text-sm text-ink">
              {confirming === "stop"
                ? "Your current link stops working, and every calendar you added it to will need removing."
                : "This will invalidate your current calendar link. You will need to re-subscribe in your calendar app with the new link."}
            </Text>
            <View className="gap-3">
              <Button
                title="Cancel"
                variant="secondary"
                disabled={calendarBusy !== null}
                onPress={() => setConfirming(null)}
              />
              {confirming === "stop" ? (
                <Button
                  title={
                    calendarBusy === "stop" ? "Stopping..." : "Stop updates"
                  }
                  variant="danger"
                  disabled={calendarBusy !== null}
                  onPress={() => void unsubscribe()}
                />
              ) : (
                <>
                  <Button
                    title={
                      calendarBusy === "reset"
                        ? "Resetting..."
                        : "Reset in Google Calendar"
                    }
                    variant="danger"
                    disabled={calendarBusy !== null}
                    onPress={() => void resetLink(googleCalendarUrl)}
                  />
                  {/* The same platform parity as the subscribe above:
                      Android has no Apple Calendar to re-open, so it is
                      not offered one. */}
                  {Platform.OS === "android" ? null : (
                    <Button
                      title={
                        calendarBusy === "reset"
                          ? "Resetting..."
                          : "Reset in Apple Calendar"
                      }
                      variant="danger"
                      disabled={calendarBusy !== null}
                      onPress={() => void resetLink(appleCalendarUrl)}
                    />
                  )}
                </>
              )}
            </View>
          </View>
        ) : (
          // Taking the link back is a word, not a box. Both are
          // maintenance on a link rather than a thing to do on this
          // screen, and as a pair of `secondary` boxes they were two more
          // controls in a block that already has two, which is four
          // stacked boxes under one heading and reads as a menu. The
          // system's quieter things are words (the roll-call doors, the
          // read-more), and these are the same kind of thing.
          //
          // Neither word is "unsubscribe": it read as reversible, and it
          // is the same irreversible thing as the reset beside it.
          //
          // A write in flight holds the row instead of disabling it:
          // `QuietAction` has no disabled state, so the guard is the early
          // return the RSVP control uses.
          <View className="mt-3 gap-2">
            <Text className="font-body text-sm text-ink">
              Both of these end the link your calendars are reading, so the
              calendar you subscribed from stops updating.
            </Text>
            <View
              // The row is inert while a write is in flight, and the guard in
              // each handler is what makes it so — so the state is announced
              // here, the way the trip page's RSVP control does it. `role`
              // because a state prop on an element that is not anything is a
              // flag a screen reader is not obliged to read out.
              role="group"
              aria-busy={calendarBusy !== null}
              className="flex-row flex-wrap items-center gap-2"
            >
              <QuietAction
                label={
                  calendarBusy === "stop" ? "Stopping..." : "Stop updates"
                }
                onPress={() => {
                  if (calendarBusy !== null) return;
                  setConfirming("stop");
                }}
              />
              <Text className="font-body text-sm text-ink">·</Text>
              <QuietAction
                label="Reset calendar link"
                onPress={() => {
                  if (calendarBusy !== null) return;
                  setConfirming("reset");
                }}
              />
            </View>
          </View>
        )}
      </View>

      {/* The documents belong to the person, not to a trip: the consent
          is yours, and these are the ones you gave it to. Their heading is
          what sets them apart — the same device as the calendar's above. */}
      <View>
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
      <RuledBlock>
        <Button
          title="Sign out"
          variant="secondary"
          // No fullWidth: it fills a phone and hugs the start edge from md
          // up, which is what every other content button in this system
          // does — a lone action stretched across a wide screen is a band,
          // not a button.
          // Await the real sign-out (server POST, token drop, cache
          // clear) before leaving: navigating first would let the
          // login screen render while signed-in data is still cached.
          onPress={() => void signOut().then(() => router.replace("/login"))}
        />
      </RuledBlock>
    </FullscreenDialog>
  );
}
