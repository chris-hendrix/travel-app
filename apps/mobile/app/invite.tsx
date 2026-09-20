import { Suspense } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { InviteCard } from "@/components/trip/InviteCard";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/lib/authStore";
import { LEGAL_ROWS } from "@/lib/legal";
import { useTrips } from "@/lib/tripsStore";
import { invitationById } from "@/mocks/invitations";

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
  return (
    <Suspense fallback={null}>
      <InviteScreen />
    </Suspense>
  );
}

function InviteScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { trips } = useTrips();

  const invitation = invitationById(typeof id === "string" ? id : undefined);
  const trip = invitation
    ? trips.find((candidate) => candidate.id === invitation.tripId)
    : undefined;

  // An id the server never issued, a withdrawn invitation, and an
  // expired one are one answer, because the endpoint returns null for
  // all three.
  if (!invitation || !trip) {
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
          <Button
            title="Start your own trip"
            onPress={() => router.replace("/")}
          />
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

  return (
    <Screen>
      <View className="gap-6 pt-4 md:pt-14">
        <InviteCard
          inviterName={invitation.inviterName}
          tripName={trip.title}
          destination={trip.location}
          startDate={trip.startDate}
          endDate={trip.endDate}
        />
        {user ? (
          // Signed in already, so there is no number to ask for. The trip
          // is the only thing left, and whether it is in their trips is
          // the server's business rather than this screen's.
          <Button
            title="Go to the trip"
            variant="accent"
            onPress={() =>
              router.replace(`/design/trips/detail?id=${trip.id}`)
            }
          />
        ) : (
          <Button
            title="Sign in to join"
            variant="accent"
            onPress={() => router.push("/login")}
          />
        )}
      </View>
    </Screen>
  );
}
