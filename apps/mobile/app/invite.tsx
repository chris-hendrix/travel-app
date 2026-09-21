import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { InviteCard } from "@/components/trip/InviteCard";
import { Button } from "@/components/ui/Button";
import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { Screen } from "@/components/ui/Screen";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/authStore";
import { LEGAL_ROWS } from "@/lib/legal";
import { toErrorCopy } from "@/lib/queries/errors";
import { invitationPreviewOptions } from "@/lib/queries/invitations";

/**
 * The invitation: what a friend's text opens.
 *
 * The only screen a stranger reaches first, and deliberately thin.
 * Signing in is the acceptance — the server processes every pending
 * invitation for a number at verify (`processPendingInvitations`) — so
 * there is nothing to accept here, and nothing about the invitation has
 * to survive the sign-in flow.
 *
 * What this screen owes its reader is the reason to hand over a number
 * at all: who asked, where, and when. Then it hands them to the sign-in
 * the app already has, which is the same three screens everybody else
 * uses and which already knows how to end.
 *
 * An earlier version ran those three steps in place, on the argument
 * that a friend should not have to leave the thing they were just shown.
 * It read well and cost a step machine, a second copy of the consent
 * disclosure and three rewired auth screens, to end in the same place:
 * the trips list, with the trip in it.
 */
export default function Invite() {
  return <InviteScreen />;
}

function InviteScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const inviteId = typeof id === "string" && id.length > 0 ? id : undefined;
  // Public query: it fetches signed out (`GET
  // /invitations/:id/preview` carries no auth), so it is gated on the
  // id alone and never on auth state.
  const {
    status,
    data: preview,
    error,
    refetch,
  } = useQuery(invitationPreviewOptions(inviteId));

  // An id the server never issued, a withdrawn invitation, and an
  // expired one are one answer, because the endpoint 404s for all
  // three — matched here directly, never via `toErrorCopy` (whose
  // `INVITATION_NOT_FOUND` copy belongs to the accept mismatch).
  if (
    !inviteId ||
    (status === "success" && !preview) ||
    (status === "error" && error instanceof ApiError && error.status === 404)
  ) {
    return <GoneInvite onStartOwn={() => router.replace("/")} />;
  }

  if (status === "pending") {
    return (
      <Screen>
        <LoadingBlock label="This invitation" />
      </Screen>
    );
  }

  if (status === "error") {
    const copy = toErrorCopy(error);
    // `exactOptionalPropertyTypes` is on: only pass `onRetry` when the
    // copy offers a retry, never an explicit `undefined`.
    const retryProps = copy.retry
      ? { onRetry: () => void refetch() }
      : {};
    return (
      <Screen>
        {copy.offline ? (
          <OfflineBlock {...retryProps} />
        ) : (
          <InlineError
            message={copy.message ?? "Couldn't load this invitation"}
            {...retryProps}
          />
        )}
      </Screen>
    );
  }

  if (!preview) {
    return <GoneInvite onStartOwn={() => router.replace("/")} />;
  }

  return (
    <Screen lead>
      <InviteCard
        inviterName={preview.inviterName}
        tripName={preview.tripName}
        destination={preview.destination}
        startDate={preview.startDate}
        endDate={preview.endDate}
      />
      {user ? (
        // Signed in already, so there is no number to ask for. The trip
        // is the only thing left, and whether it is in their trips is
        // the server's business rather than this screen's.
        <Button
          title="Go to the trip"
          variant="accent"
          onPress={() =>
            router.replace(`/trips/detail?id=${preview.tripId}`)
          }
        />
      ) : (
        // The preview is public and acceptance happens server-side at
        // verify, so nothing about the invitation crosses sign-in.
        <Button
          title="Sign in to join"
          variant="accent"
          onPress={() => router.push("/login")}
        />
      )}
    </Screen>
  );
}

/**
 * The gone state, unchanged: "This invitation is gone / It has
 * expired, or someone has already used it." — the already-accepted
 * preview lands here too, which is what "already used" means.
 */
function GoneInvite({ onStartOwn }: { onStartOwn: () => void }) {
  return (
    <Screen>
      <View className="gap-8 pt-4 md:pt-14">
        <View className="gap-3">
          <Text className="font-display text-4xl uppercase leading-none text-ink">
            This invitation is gone
          </Text>
          <Text className="font-body text-base leading-snug text-ink">
            It has expired, or someone has already used it.
          </Text>
        </View>
        <Button title="Start your own trip" onPress={onStartOwn} />
        <View className="flex-row flex-wrap gap-x-6 gap-y-2">
          {LEGAL_ROWS.map((row) => (
            <Link
              key={row.href}
              href={row.href}
              className="font-body text-sm text-ink underline"
            >
              {row.short}
            </Link>
          ))}
        </View>
      </View>
    </Screen>
  );
}
