import { Text, View } from "react-native";
import { Link, Redirect, useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import { BootCover } from "@/components/ui/BootCover";
import { Screen } from "@/components/ui/Screen";
import { LEGAL_ROWS } from "@/lib/legal";
import { isDemoIdentity, useAuth } from "@/lib/authStore";
import { destinationForRequiresProfile } from "@/lib/queries/auth";
import { Band } from "@/components/ui/Band";
import { Column } from "@/components/ui/Column";
import { TripShelf } from "@/components/landing/TripShelf";
import { demoTripCards } from "@/lib/demo";

/**
 * The landing: what the app is, for someone who has not signed in.
 *
 * The page's shape follows the pitch rather than the feature list: the
 * promise on a band of its own, the mess it replaces on the page's sand,
 * and then the evidence — three real demo trips, the first sharing the
 * mechanism's band (`components/landing/TripShelf.tsx`, where the shape's
 * two constraints are written down). Nothing here describes the product
 * that a reader cannot then go and press: every card opens that trip.
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
 * The hero's band is `bpink`, the palette's measured-but-unassigned pink:
 * colouring the top is the one way to open the page without putting a
 * ground boundary through the shelf, which is what made the first card
 * read as detached. `lilac` is the invitation's own ground, and the
 * mechanism's band stays `baltic`, because pink and lilac are the band
 * set's tightest pair at 6.5 dE.
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
  // The shelf's cards read the fixtures live, so the countdowns and the
  // dates move with today — a literal here would go stale, which is what
  // `lib/demo.ts` derives them from a clock for.
  const today = new Date();
  const cards = demoTripCards(today);

  return (
    <Screen>
      {/*
        Three blocks of sand and two bands, and each band is a *sibling*
        of the columns rather than a child of one — a full-bleed ground
        cannot exist inside a constrained column, which is the whole
        reason `Screen` stopped wrapping its children. Sand between the
        two bands, never band-against-band (`design-lint.mjs` check 5):
        the hero's pink and the shelf's baltic are separated by the deets.
      */}
      {/* The hero's own ground. It was sand, which left the page opening
          on the same colour as everything else and made the first card's
          band the only colour above the fold — so the card read as a
          detached object rather than as the page's evidence. */}
      <Band tone="bpink">
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
              closing block puts the cost answer under its own. Getting in
              is the question a reader has while their thumb is over this
              one. */}
          <Text className="font-body text-sm text-ink">
            No passwords. Sign in with a text.
          </Text>
        </Column>
      </Band>

      {/* The agitation paragraph, on the page's own sand. It named what a
          trip is like without the app rather than listing the three
          things again, and it is the one paragraph here a reader is meant
          to feel. It kept a lilac band until the hero took a ground of its
          own: two pale bands with a paragraph between them read as two
          sections, and the shelf needs exactly one coloured anchor. */}
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

      {/* The mechanism and its evidence. The shelf owns its own band, so
          it renders as a direct child of `Screen` — see
          `components/landing/TripShelf.tsx`. */}
      <TripShelf
        cards={cards}
        today={today}
        onOpenTrip={(href) => router.push(href)}
        onGetStarted={() => router.push("/login")}
      />

      {/* The close: the one trust claim available before there are any
          users, then the legal rows. The claim moved here with the fake
          phone that used to carry it — a new app is assumed to have a
          subscription in it, and the cost answer belongs where a reader
          has finished looking rather than beside the mechanism. */}
      <Column>
        <View className="gap-6">
          <Text className="font-body text-sm text-ink">
            Free, with no ads.
          </Text>
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
      </Column>
    </Screen>
  );
}
