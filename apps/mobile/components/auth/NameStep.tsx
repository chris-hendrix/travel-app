import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { ActionRow } from "@/components/ui/ActionRow";
import { Button } from "@/components/ui/Button";
import { QuietAction } from "@/components/ui/QuietAction";
import { TextField } from "@/components/ui/TextField";
import { draftFromProfile, initials } from "@/lib/profile";
import { formatPhoneForDisplay } from "@/lib/phone";
import { joinFacts } from "@/lib/wording";
import { useAuth } from "@/lib/authStore";
import { useProfile } from "@/lib/profileStore";

/**
 * The last step, and the only thing the API insists on before the app is
 * usable: what to call you.
 *
 * The web asks for a timezone here. The app detects one, so it is shown
 * as a fact rather than asked for, which is the same call the profile
 * screen already makes.
 *
 * The name is drawn above the field as it is typed, on the same ink
 * square the profile screen uses, because that is the clearest proof an
 * edit landed and it costs nothing to keep the two screens agreeing. It
 * also carries the number that was just verified, which is the one fact
 * worth confirming at the moment an account is created.
 */
export function NameStep({
  title,
  body,
  onSaved,
  onLeave,
  leaveLabel = "Sign out",
}: {
  title?: string;
  body?: ReactNode;
  onSaved: () => void;
  /** The labelled exit under the button. Omitted when there is none. */
  onLeave?: () => void;
  leaveLabel?: string;
}) {
  const { user, completeProfile } = useAuth();
  const { profile, saveProfile } = useProfile();

  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const trimmed = name.trim();
  const error =
    submitted && trimmed.length < 3
      ? "At least three characters, so the group knows who you are."
      : undefined;

  async function save() {
    setSubmitted(true);
    if (trimmed.length < 3) return;

    setBusy(true);
    try {
      await completeProfile(trimmed);
      // The name belongs to the person, not to the session: the profile
      // screen reads this store, so the mock writes both.
      saveProfile({ ...draftFromProfile(profile), displayName: trimmed });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-6">
      {title ? (
        <View className="gap-3">
          <Text className="font-display text-4xl uppercase leading-none text-ink">
            {title}
          </Text>
          {body ? (
            <Text className="font-body text-base leading-snug text-ink">
              {body}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View className="flex-row items-center gap-5">
        <View className="h-16 w-16 items-center justify-center bg-ink">
          <Text className="font-display text-3xl leading-none text-sand">
            {initials(trimmed)}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="font-display text-2xl uppercase leading-tight text-ink">
            {trimmed || "Your name"}
          </Text>
          <Text className="font-body text-sm text-ink">
            {formatPhoneForDisplay(user?.phoneNumber ?? "")}
          </Text>
        </View>
      </View>

      <TextField
        label="Display name"
        value={name}
        onChangeText={setName}
        placeholder="Ada Lovelace"
        error={error}
        maxLength={50}
        autoFocus
      />

      <View className="gap-1">
        <Text className="font-body-bold text-sm text-ink">Timezone</Text>
        <Text className="font-body text-sm text-ink">
          {joinFacts(profile.timezone ?? "Not set", "automatic")}
        </Text>
      </View>

      <ActionRow>
        <Button
          title={busy ? "Saving" : "Continue"}
          disabled={busy}
          onPress={() => void save()}
        />
        {onLeave ? (
          <QuietAction label={leaveLabel} align="center" onPress={onLeave} />
        ) : null}
      </ActionRow>
    </View>
  );
}
