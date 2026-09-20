import { Suspense, useState } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { CodeStep } from "@/components/auth/CodeStep";
import { NameStep } from "@/components/auth/NameStep";
import { PhoneStep } from "@/components/auth/PhoneStep";
import { InviteCard } from "@/components/trip/InviteCard";
import { Button } from "@/components/ui/Button";
import { QuietAction } from "@/components/ui/QuietAction";
import { Screen } from "@/components/ui/Screen";
import { useLeaveFlow } from "@/hooks/useLeaveFlow";
import { useAuth } from "@/lib/authStore";
import { LEGAL_ROWS } from "@/lib/legal";
import { useTrips } from "@/lib/tripsStore";
import { addressedTo, invitationById } from "@/mocks/invitations";

type Step = "phone" | "code" | "name";

/**
 * The invitation: what a friend's text opens.
 *
 * The only screen in the app that a stranger reaches first, and the only
 * one whose reader has no account by definition. It is therefore the
 * whole of the traveler's way in: the four facts the preview endpoint
 * returns, and then the same three steps the sign-in screen uses, in
 * place rather than behind three more screens.
 *
 * That in-place part is the design. Sending somebody to /login and back
 * would mean carrying this invitation through the auth flow so the flow
 * knows where to end, and it would ask a friend to leave the thing they
 * were just shown. Here the card stays above the field the whole way, so
 * the trip is on screen while they decide.
 *
 * Signing in is the acceptance. The server processes every pending
 * invitation for a number at verify (`processPendingInvitations`), so
 * there is no accept step to design and nothing to keep on the client
 * afterwards. A reader who is already signed in has no number to give,
 * and there the one action is the accept endpoint's stand-in.
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
  const leave = useLeaveFlow();
  const { user, signOut } = useAuth();
  const { trips } = useTrips();
  const [step, setStep] = useState<Step>("phone");

  const invitation = invitationById(typeof id === "string" ? id : undefined);
  const trip = invitation
    ? trips.find((candidate) => candidate.id === invitation.tripId)
    : undefined;

  // Where the whole thing ends: the trip, on the traveler's side of it.
  // The API's answer to accepting is a membership, and a membership is
  // this screen. `POST /invitations/:id/accept` stands in for the jump.
  const join = () => {
    if (trip) router.replace(`/design/trips/detail?id=${trip.id}`);
  };

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

  const card = (
    <InviteCard
      inviterName={invitation.inviterName}
      tripName={trip.title}
      destination={trip.location}
      startDate={trip.startDate}
      endDate={trip.endDate}
    />
  );

  // Signed in with a name already: there is nothing left to ask, so the
  // one action is the one the API has for this reader.
  if (user?.profileComplete) {
    return (
      <Screen>
        <View className="gap-6 pt-4 md:pt-14">
          {card}
          {addressedTo(invitation, user.phoneNumber) ? (
            <Button title="Join the trip" variant="accent" onPress={join} />
          ) : (
            // The invitation is addressed to a number, and this is not
            // it. The client can only compare the last four digits, so
            // the sentence is a warning rather than a verdict: the
            // server refuses the join either way.
            <View className="gap-4">
              <Text className="font-body text-base leading-snug text-ink">
                This invitation was sent to a different number.
              </Text>
              <QuietAction
                label="Sign out and use that number"
                onPress={() => signOut()}
              />
            </View>
          )}
        </View>
      </Screen>
    );
  }

  // Signed in without a name: a deep link can arrive between the code
  // and the name, and the trip is waiting on the other side of it.
  if (user) {
    return (
      <Screen>
        <View className="gap-6 pt-4 md:pt-14">
          {card}
          <NameStep onSaved={join} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="gap-6 pt-4 md:pt-14">
        {card}
        {step === "phone" ? (
          <PhoneStep
            submitLabel="Join the trip"
            onSent={() => setStep("code")}
            onLeave={leave}
          />
        ) : null}
        {step === "code" ? (
          <CodeStep
            onVerified={(requiresProfile) =>
              requiresProfile ? setStep("name") : join()
            }
            onChangeNumber={() => setStep("phone")}
          />
        ) : null}
        {step === "name" ? <NameStep onSaved={join} /> : null}
      </View>
    </Screen>
  );
}
