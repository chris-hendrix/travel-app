import { useEffect, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { ActionRow } from "@/components/ui/ActionRow";
import { Button } from "@/components/ui/Button";
import { QuietAction } from "@/components/ui/QuietAction";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/lib/authStore";
import { initials } from "@/lib/profile";
import { formatPhoneForDisplay } from "@/lib/phone";
import { joinFacts } from "@/lib/wording";

/**
 * The third screen, and the only thing the API insists on before the app
 * is usable: what to call you.
 *
 * The web asks for a timezone here. The app detects one, so it is shown
 * as a fact rather than asked for, which is the same call the profile
 * screen already makes.
 *
 * The name is drawn above the field as it is typed, on the same ink
 * square the profile screen uses, because that is the clearest proof an
 * edit landed and it costs nothing to keep the two screens agreeing.
 */
export default function CompleteProfile() {
  const router = useRouter();
  const { user, completeProfile, signOut } = useAuth();

  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const trimmed = name.trim();
  // The app detects the timezone rather than asking for it (see the
  // header comment); the server row is the source of truth once the
  // profile screen is wired (Phase 7), so this is display-only here.
  const deviceTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Not set";
  const error =
    submitted && trimmed.length < 3
      ? "At least three characters, so the group knows who you are."
      : undefined;

  // No session, nothing to complete. And somebody who is already through
  // belongs past this screen, which is what pressing back arrives as.
  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  async function save() {
    setSubmitted(true);
    if (trimmed.length < 3) return;

    setBusy(true);
    try {
      await completeProfile(trimmed);
      router.replace("/trips");
    } finally {
      setBusy(false);
    }
  }

  if (user?.profileComplete) return <Redirect href="/trips" />;
  if (!user) return <Redirect href="/login" />;

  return (
    <Screen lead>
      <View className="gap-3">
        <Text className="font-display text-4xl uppercase leading-none text-ink">
          Complete your profile
        </Text>
        <Text className="font-body text-base leading-snug text-ink">
          Tell the group who you are. You can change it later.
        </Text>
      </View>

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
          {joinFacts(deviceTimezone, "automatic")}
        </Text>
      </View>

      <ActionRow>
        <Button
          title={busy ? "Saving" : "Continue"}
          disabled={busy}
          onPress={() => void save()}
        />
        {/* Signing out rather than navigating home: at this point the
            session exists and the name does not, so the landing would
            only send them straight back here. */}
        <QuietAction
          label="Sign out"
          align="center"
          onPress={() => {
            signOut();
            router.replace("/");
          }}
        />
      </ActionRow>
    </Screen>
  );
}
