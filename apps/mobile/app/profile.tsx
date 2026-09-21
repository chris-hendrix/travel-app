import { useCallback, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { InlineError } from "@/components/ui/InlineError";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
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
import { useProfile } from "@/lib/profileStore";
import { toErrorCopy } from "@/lib/queries/errors";
import { LEGAL_ROWS } from "@/lib/legal";
import { useAuth } from "@/lib/authStore";

const UNITS: Array<{ value: TemperatureUnit; label: string }> = [
  { value: "celsius", label: "Celsius" },
  { value: "fahrenheit", label: "Fahrenheit" },
];

/**
 * Profile. Who you are, what you are called, and the two preferences the
 * app keeps about you — then the documents you agreed to, then the way
 * out.
 *
 * No heading on the fields: they are short enough to read as one list,
 * and a rule only earns its place where the content changes kind — in
 * front of the legal list, and in front of Sign out.
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
        <LoadingBlock label="Profile" />
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
      primaryDisabled={busy}
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
        <View className="flex-row gap-2">
          {UNITS.map((unit) => (
            <Pressable
              key={unit.value}
              onPress={() =>
                setDraft((current) => ({
                  ...current,
                  temperatureUnit: unit.value,
                }))
              }
            >
              <Text
                className={`px-4 py-2 text-base ${
                  draft.temperatureUnit === unit.value
                    ? "bg-ink font-body-bold text-sand"
                    : "font-body text-ink"
                }`}
              >
                {unit.label}
              </Text>
            </Pressable>
          ))}
        </View>
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

      {/* The documents belong to the person, not to a trip: the consent
          is yours, and these are the ones you gave it to. A rule, because
          it is a different kind of content from the fields above —
          nothing on this side of it is edited. */}
      <View className="border-t border-ink pt-5">
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

      <View className="border-t border-ink pt-5">
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
