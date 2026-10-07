import { Text, View } from "react-native";
import { Link, Redirect, useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import { BootCover } from "@/components/ui/BootCover";
import { Screen } from "@/components/ui/Screen";
import { Section } from "@/components/ui/Section";
import { RuledRows } from "@/components/ui/RuledRows";
import { LEGAL_ROWS } from "@/lib/legal";
import { isDemoIdentity, useAuth } from "@/lib/authStore";
import { destinationForRequiresProfile } from "@/lib/queries/auth";
import { Band } from "@/components/ui/Band";
import { Column } from "@/components/ui/Column";
import { PhoneThread } from "@/components/landing/PhoneThread";
import {
  DEMO_INVITATION_ID,
  DEMO_INVITER_NAME,
  DEMO_TRIP_ID,
  buildDemoTrip,
} from "@/lib/demo";

/**
 * The landing: what the app is, for someone who has not signed in.
 *
 * The page's shape follows the pitch rather than the feature list: the
 * promise, the mess it replaces, what happens beside the thread that
 * proves it. Body copy runs the full column on a phone and half of it
 * on wide, now that the steps share their column with the thread.
 *
 * Every claim on it is held to what the app does. Three claims are
 * gone: the group does not contribute to the itinerary (the organizer
 * authors it), there is no group vote on lodging (an organizer adds the
 * stay, and everyone reads it), and knowing who is coming is not the
 * draw (the organizer invited them, so they already know). What the
 * group gets is the plan in front of them, which is why the invitation
 * and the sign-in are both a text, and why the hero states the category
 * rather than the container.
 *
 * The entry gate is here: somebody already signed in has no business
 * reading the pitch, so they go to the trips list. A first run and a
 * returning signed-out reader both get the landing for now, since
 * nothing is persisted that could tell the two apart.
 */
/**
 * The cold-start gate: while the stored token is being revalidated
 * (`restoring`) no route decision is made yet, so a token-holder is
 * never bounced through the pitch on the way in. Signed out gets the
 * landing; signed in goes to the trips list, or to the screen that
 * asks for a name when the profile is still empty.
 */
export default function Index() {
  const { status, user } = useAuth();

  if (status === "restoring") {
    // The boot cover owns the frame: no `Screen` (a cover does not scroll) and
    // no `Column` of its own, because the cover holds its own measure. See
    // `components/ui/BootCover.tsx` for why the first frame has to be the
    // splash's own mark at the splash's own size.
    return <BootCover label="Signing you in" />;
  }

  // Somebody signed in has no business reading the pitch, and somebody
  // signed in without a name belongs on the screen that asks for it.
  // The demo fixture is viewer identity, not a session (`isDemoIdentity`):
  // arriving here with it still installed — the browser back button out
  // of `/demo`, whose unmount cleanup runs after this render — reads the
  // pitch instead of bouncing to `/trips` with no session.
  if (status === "signed-in" && user && !isDemoIdentity(user)) {
    return (
      <Redirect
        href={destinationForRequiresProfile(!user.profileComplete)}
      />
    );
  }

  return <Landing />;
}

function Landing() {
  const router = useRouter();
  // The band's invitation reads the fixture live, so the card shows
  // the same Cabo values the demo opens — including dates derived
  // from today, which is why this is computed, not a literal.
  const demoTrip = buildDemoTrip(new Date());

  return (
    <Screen>
      {/*
        Three sand columns and one band, and the band is a *sibling* of
        the columns rather than a child of one — a full-bleed ground
        cannot exist inside a constrained column, which is the whole
        reason `Screen` stopped wrapping its children. Sand either side
        of the band, never band-against-band (`design-lint.mjs` check 5).
      */}
      {/* `lead` is the system's air-above-a-display-opener (it names
          the landing), and its `pb` closes the hero at the same 24/40
          rhythm every other block keeps — the hand-rolled `pb-12` below
          the note doubled the hero-to-band gap against all the others. */}
      <Column lead>
        <Text className="font-display-black text-display-lg uppercase text-ink">
          An itinerary your friends will actually read.
        </Text>
        <Text className="font-body text-lg leading-snug text-ink">
          Coordinate your trip without overwhelming your friends.
        </Text>
        {/* No `fullWidth`: the button already fills the width on a phone
            and hugs its edge from md up, which is the behaviour a hero
            wants. A full-width bar on a desktop column reads as a
            banner, not a button. */}
        <Button title="Get started" onPress={() => router.push("/login")} />
        {/* The friction answer, directly under the button, where the
            closing band puts the cost answer under its own. Getting in
            is the question a reader has while their thumb is over this
            one. */}
        <Text className="font-body text-sm text-ink">
          No passwords. Sign in with a text.
        </Text>
      </Column>

      {/* The first band. It names what the trip is like without the app
          rather than listing the three things again — agitation, not a
          mirror — and it is the one paragraph on this page a reader is
          meant to feel, which is why it is the one that changes ground. */}
      <Band tone="lilac">
        <Column>
          <View className="gap-4">
            <Text className="font-display-semibold text-heading-lg uppercase text-ink">
              The deets are all over the place.
            </Text>
            <Text className="font-body text-base leading-relaxed text-ink">
              Trying to land at the same time as everyone else? Need the
              door code, but the person who booked the Airbnb is still in
              the air?
            </Text>
          </View>
        </Column>
      </Band>

      {/*
        The claim and its evidence share one block: the steps say "open
        the text", and the thread beside them is the text. DOM order is
        steps first, phone second — a phone stacks that to steps-then-
        thread, and `lg:flex-row` keeps that order on wide with the
        thread on the right. The 864px inner column is two 420px
        cards plus the gap (`Column.tsx`), so the thread keeps its
        measure and the steps take the rest, which is why the row turns
        at `lg` and not `md`. One `Section`, two rows — the organizer's,
        then the friends' — with the single soft rule between them
        marking the send/open handoff: the one divider on this page that
        earns its place.
      */}
      <Column>
        <View className="flex-col gap-10 lg:flex-row lg:items-start lg:gap-6">
          <View className="min-w-0 flex-1">
            <Section title="What happens">
              <RuledRows>
                <View className="py-5">
                  <Text className="font-body text-sm leading-snug text-ink">
                    Name the trip. Pick the dates and the place. Send the text.
                  </Text>
                </View>
                <View className="py-5">
                  <Text className="font-body text-sm leading-snug text-ink">
                    Open the text. Say if they're coming. Add their flight.
                  </Text>
                </View>
              </RuledRows>
            </Section>
          </View>
          <View className="w-full max-w-[420px] gap-5 lg:w-[420px] lg:flex-none">
            <PhoneThread
              dayLabel="Today"
              messageText={`${DEMO_INVITER_NAME} invited you to "${demoTrip.title}" on Journiful!`}
              linkLabel={`https://journiful.app/invite\n?id=${DEMO_INVITATION_ID}`}
              href={`/demo?id=${DEMO_TRIP_ID}`}
            />
            {/* The one trust claim available before there are any users,
                and the one a reader is most likely to be assuming the
                opposite of: a new app is assumed to have a subscription
                in it. The hero's note answers the other question, the
                effort of getting in, because that is the one at the first
                button. */}
            <Text className="font-body text-sm text-ink">
              Free, with no ads.
            </Text>
          </View>
        </View>
      </Column>

      {/* The baltic proof band stood here: cut when the thread moved up
          beside the steps, leaving the lilac its single seam. */}

      <Column>
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
      </Column>
    </Screen>
  );
}
