import { Text, View } from "react-native";
import { Link, Redirect, useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import { BootCover } from "@/components/ui/BootCover";
import { Screen } from "@/components/ui/Screen";
import { Section } from "@/components/ui/Section";
import { RuledRows } from "@/components/ui/RuledRows";
import { LEGAL_ROWS } from "@/lib/legal";
import { useAuth } from "@/lib/authStore";
import { destinationForRequiresProfile } from "@/lib/queries/auth";
import { Band } from "@/components/ui/Band";
import { Column } from "@/components/ui/Column";
import { Image } from "@/components/ui/Image";
import demoTripShot from "@/assets/demo/trip.png";

/**
 * The landing: what the app is, for someone who has not signed in.
 *
 * The page's shape follows the pitch rather than the feature list: the
 * promise, the mess it replaces, what the organizer does, what the
 * friends do, then what the friends see — the demo — at the bottom. Body copy runs the full column at every width, the same
 * way the rules and the card grid do.
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
  if (status === "signed-in" && user) {
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

  return (
    <Screen>
      {/*
        Three sand columns and two bands, and the bands are *siblings* of the
        columns rather than children of one — a full-bleed ground cannot exist
        inside a constrained column, which is the whole reason `Screen` stopped
        wrapping its children.

        The landing's vertical rhythm was a single `gap-16` inside a single
        column. It is now composed from the pieces, and that is the visible
        cost of putting a full-bleed ground in the middle of a page: the
        `gap-16` cannot span a seam. Sand either side of each band, never
        band-against-band (`design-lint.mjs` check 5), because two touching
        grounds say "these are two things" with nothing to say what the
        division means.
      */}
      <Column>
        <View className="gap-6 pb-12 pt-4 md:pt-14">
          <Text className="font-display-black text-display-lg uppercase text-ink">
            An itinerary your friends will actually read.
          </Text>
          <Text className="font-body text-lg leading-snug text-ink">
            The Airbnb, the flights, the events and the places. All of it
            from one text.
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
        </View>
      </Column>

      {/* The first band. It names what the trip is like without the app
          rather than listing the three things again — agitation, not a
          mirror — and it is the one paragraph on this page a reader is
          meant to feel, which is why it is the one that changes ground. */}
      <Band tone="lilac">
        <Column>
          <View className="gap-4">
            <Text className="font-display-semibold text-heading-lg uppercase text-ink">
              It starts in your group chat
            </Text>
            <Text className="font-body text-base leading-relaxed text-ink">
              The door code is buried in an email. Four friends land twenty
              minutes apart and take four Ubers.
            </Text>
          </View>
        </Column>
      </Band>

      <Column>
        <View className="gap-16">
          {/* Two single-row tables, each row a paragraph with no marker:
              what the organizer does, then what the friends do. Each row
              keeps one soft rule from `RuledRows`; the block's own ink
              rule above the heading closes the top of the table. */}
          <Section title="What you do">
            <RuledRows>
              <View className="py-5">
                <Text className="font-body text-sm leading-snug text-ink">
                  Name the trip. Pick the dates and the place. Send the text.
                </Text>
              </View>
            </RuledRows>
          </Section>

          <Section title="What your friends do">
            <RuledRows>
              <View className="py-5">
                <Text className="font-body text-sm leading-snug text-ink">
                  Open the text. Say if they're coming. Add their flight.
                </Text>
              </View>
            </RuledRows>
          </Section>
        </View>
      </Column>

      {/* The closing band shows what the trip looks like to a friend:
          the captured demo trip (Phase 4) and the link to the live demo.
          One navigation word, not a second button — a ground change
          carrying a button is not a seam. */}
      <Band tone="baltic">
        <Column>
          <View className="gap-6">
            <Text className="font-display-semibold text-heading-lg uppercase text-ink">
              What your friends see
            </Text>
            {/*
              The proof: the demo trip's detail, captured, not drawn.
              Captured at a 390-wide viewport from the served export:
              `/demo` cold-loaded, the Cabo card tapped, the hero
              (`e86`) and the run (`e135`) shot as elements and stacked
              (hero rows 0-765, run rows 620-1145) into the committed
              `assets/demo/trip.png` (390x1290). Re-capture when the
              detail hero changes shape, or when the fixture moves: the
              rows below the seam are the Cabo trip from
              `lib/demo.ts` (`buildDemoTrip` — five-day Fri-Tue window,
              Casa Verde stay, seven events, four arrivals) served through
              `lib/demo/adapter.ts`, with the invented `description` the
              real Description block renders (`demo-fixture.test.ts`
              holds the prose). Never raw `expo-image` here: classNames
              are dropped on the native view (`image-classes.test.ts`).
              The `md:` cap keeps the 390px capture at its own width
              inside the wider column instead of stretching it.
            */}
            <Image
              source={demoTripShot}
              contentFit="cover"
              className="w-full md:max-w-[390px] aspect-[390/1290]"
              accessibilityLabel="A trip in the app: the Cabo itinerary with its events"
            />
            <Link href="/demo" className="font-body text-sm text-ink underline">
              Look at a real trip
            </Link>
            {/* The one trust claim available before there are any users, and
                the one a reader is most likely to be assuming the opposite
                of: a new app is assumed to have a subscription in it. The
                hero's note answers the other question, the effort of getting
                in, because that is the one at the first button. */}
            <Text className="font-body text-sm text-ink">
              Free, with no ads.
            </Text>
          </View>
        </Column>
      </Band>

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
