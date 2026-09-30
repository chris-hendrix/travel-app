import { useState } from "react";
import { Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InlineError } from "@/components/ui/InlineError";
import { TextField } from "@/components/ui/TextField";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useDismiss } from "@/hooks/useDismiss";
import { ApiError } from "@/lib/api";
import { toErrorCopy } from "@/lib/queries/errors";
import { useCreateGuest } from "@/lib/queries/members";
import { useTrip } from "@/lib/tripsStore";

/**
 * Add a guest — one name field, nothing else. A guest needs no app:
 * the organizer plans for them, so the screen asks for the name and
 * the server assigns everything else.
 *
 * Organizer-only, held to that by where it is reached from: the roll
 * call only offers the way in on its organizer variant. The API is
 * the real gate; this is the screen not pretending otherwise.
 */
export default function NewGuest() {
  return (
    <TripGate label="Loading new guest">
      <NewGuestScreen />
    </TripGate>
  );
}

function NewGuestScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);
  // The roll call is the screen behind this one, so a deep link lands
  // back on the roster rather than the app's home.
  const dismiss = useDismiss(trip ? `/trips/members?id=${trip.id}` : "/trips");
  // No optimistic row: the server assigns the id, so the roster grows
  // on success (in `useCreateGuest`) rather than on submit.
  const createGuest = useCreateGuest(trip?.id ?? "");
  // The last save's failure, fed to the dialog's InlineError. The
  // dialog stays open on failure: dismissing would pretend it saved.
  const [serverError, setServerError] = useState<string | null>(null);
  // A write in flight. The bar's primary stops on it, so a second
  // press cannot make a second guest.
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  if (!trip) {
    return <NotFound />;
  }

  const trimmed = name.trim();

  function submit() {
    if (trimmed === "" || saving) return;
    // The failure clears first, so a retry that succeeds leaves no
    // stale copy behind.
    setServerError(null);
    setSaving(true);
    void createGuest
      .mutateAsync({ displayName: trimmed })
      .then(
        () => dismiss(),
        (error: unknown) =>
          setServerError(
            error instanceof ApiError &&
              error.code === "MEMBER_LIMIT_EXCEEDED"
              ? "This trip is full."
              : (toErrorCopy(error).message ?? "Couldn't add the guest."),
          ),
      )
      .finally(() => setSaving(false));
  }

  return (
    <FullscreenDialog
      title="Add a guest"
      primaryTitle={saving ? "Adding guest" : "Add guest"}
      onPrimary={submit}
      primaryDisabled={trimmed === ""}
      pending={saving}
      dismissHref={`/trips/members?id=${trip.id}`}
    >
      <Stack.Screen options={{ presentation: "modal" }} />
      {serverError ? <InlineError message={serverError} /> : null}
      <Text className="font-body text-sm text-ink">{trip.title}</Text>

      <View className="gap-1">
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Mom"
        />
        <Text className="font-body text-sm text-ink">
          Plan for them without inviting them.
        </Text>
      </View>
    </FullscreenDialog>
  );
}
