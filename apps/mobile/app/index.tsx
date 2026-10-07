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
  // The band's invitation reads the fixture live, so the card shows
  // the same Cabo values the demo opens — including dates derived
  // from today, which is why this is computed, not a literal.
  const demoTrip = buildDemoTrip(new Date());

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

      {/* The closing band shows the invitation the friend gets: one block
          in normal flow holding the one incoming message, and the invite
          link inside it going to the live trip it opens. One action, not
          two — the bubble's link IS the band's action, so there is no
          second link beside it: two links to the same place is the
          repeated ask this page's own design notes warn about. */}
      <Band tone="baltic">
        <Column>
          {/*
            One sensible column: the heading, the block, the note. The
            block sits at a phone-ish width, the band's height follows the
            content — no absolute positioning, no negative offsets, no
            bleeding, no cropping. The proof is demonstrated, not asserted:
            the service's message (`components/landing/PhoneThread.tsx`) —
            status bar, header, date separator, the template's words, then
            the URL as plain text, underlined and tappable — reading the
            same fixture the demo serves (`buildDemoTrip`: the Cabo trip,
            five-day Fri-Tue window, Casa Verde stay, seven events, four
            arrivals; `DEMO_INVITATION_ID` for the URL), so the message and
            the trip it opens can never drift apart. The words are the
            API's verbatim template, not copy written for this page.
            Neither lint budget moved for this — the underline count stays
            put (one link removed, one added) and the block's boxes use
            bare `border`, which is a box edge rather than a rule site
            (`scripts/design-lint.mjs` checks 3, 9 and 11).
          */}
          <View className="max-w-[420px] gap-5 md:mx-auto md:w-full">
            <Text className="font-display-semibold text-heading-lg uppercase text-ink md:text-center">
              What your friends see
            </Text>
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
            <Text className="font-body text-sm text-ink md:text-center">
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
