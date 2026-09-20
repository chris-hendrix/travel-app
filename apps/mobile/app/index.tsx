import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Link, Redirect, useRouter } from "expo-router";
import { Building2, Calendar, Plane, Users } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { LEGAL_ROWS } from "@/lib/legal";
import { useAuth } from "@/lib/authStore";

/**
 * The landing: what the app is, for someone who has not signed in.
 *
 * The page's shape follows the pitch rather than the feature list: the
 * promise, the three things the trip holds, the mess it replaces, what
 * goes in the trip, how a trip gets there, then the same door again at
 * the bottom. Body copy runs the full column at every width, the same
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
export default function Landing() {
  const router = useRouter();
  const { user } = useAuth();

  // Somebody signed in has no business reading the pitch, and somebody
  // signed in without a name belongs on the screen that asks for it.
  if (user) {
    return <Redirect href={user.profileComplete ? "/trips" : "/complete-profile"} />;
  }

  return (
    <Screen>
      <View className="gap-16 pb-12 pt-4 md:pt-14">
        <View className="gap-6">
          <Text className="font-display text-6xl uppercase leading-[0.85] text-ink md:text-7xl">
            Group trips made easy
          </Text>
          <Text className="font-body text-lg leading-snug text-ink">
            The itinerary, the hotel or Airbnb, and the flights. All in one
            place.
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
            No passwords. Sign in via text.
          </Text>
        </View>

        {/* The hero names the three things the trip holds; this section
            says what it is like without them, rather than listing them a
            second time. Agitation, not a mirror. */}
        <View className="gap-4">
          <Text className="font-display text-2xl uppercase leading-tight text-ink">
            It starts in the group chat
          </Text>
          <Text className="font-body text-base leading-relaxed text-ink">
            Then the confirmations land in six different inboxes. By the time
            everyone lands, everyone is digging through their inbox for the
            same address.
          </Text>
        </View>

        <Section title="What goes in the trip">
          {WHAT_GOES_IN.map((feature) => (
            <View
              key={feature.title}
              className="flex-row gap-4 border-t border-ink py-5"
            >
              <feature.icon color="#000000" size={24} />
              <View className="flex-1 gap-1">
                <Text className="font-display text-xl uppercase leading-none text-ink">
                  {feature.title}
                </Text>
                <Text className="font-body text-sm leading-snug text-ink">
                  {feature.description}
                </Text>
              </View>
            </View>
          ))}
        </Section>

        <Section title="How Journiful works">
          {STEPS.map((step) => (
            <View
              key={step.number}
              className="flex-row gap-4 border-t border-ink py-5"
            >
              <Text className="font-display text-4xl leading-none text-ink">
                {step.number}
              </Text>
              <View className="flex-1 gap-1">
                <Text className="font-body-bold text-base text-ink">
                  {step.title}
                </Text>
                <Text className="font-body text-sm leading-snug text-ink">
                  {step.description}
                </Text>
              </View>
            </View>
          ))}
        </Section>

        {/* The closing band repeats the hero's ask rather than inventing a
            second one: one goal, one label, twice down the page. The line
            above it is the outcome rather than the promise, so the hero's
            "in one place" is not said a second time. */}
        <View className="gap-6">
          <Text className="font-display text-2xl uppercase leading-tight text-ink">
            Everyone on the trip, from the first text to the last flight
          </Text>
          <Button title="Get started" onPress={() => router.push("/login")} />
          {/* The one trust claim available before there are any users, and
              the one a reader is most likely to be assuming the opposite
              of: a new app is assumed to have a subscription in it. The
              hero's note answers the other question, the effort of getting
              in, because that is the one at the first button. */}
          <Text className="font-body text-sm text-ink">
            Free, with no ads.
          </Text>
        </View>

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

/**
 * A run of hairline rows under a heading. The closing rule is the
 * container's, so a list of four rules reads as one table rather than as
 * three dividers and an accident.
 */
function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-6">
      <Text className="font-display text-2xl uppercase leading-tight text-ink">
        {title}
      </Text>
      <View className="border-b border-ink">{children}</View>
    </View>
  );
}

/**
 * The four things the app is for, in the order they come up while a trip
 * is being planned: the plan, the roof, the travel, and everyone else.
 * Titles are sentence case because the display face uppercases them
 * anyway, and this copy gets reused verbatim where it does not.
 */
const WHAT_GOES_IN = [
  {
    icon: Calendar,
    title: "One itinerary",
    description: "The organizer builds it. Everyone reads the same one.",
  },
  {
    icon: Building2,
    title: "The hotel or Airbnb",
    description: "The address, the check-in, and the note about the door.",
  },
  {
    icon: Plane,
    title: "Everyone's travel",
    description: "Each person adds their flight. The trip shows who lands when.",
  },
  {
    icon: Users,
    title: "Everyone else",
    description: "Invited by name or number, and looking at the same trip.",
  },
] as const;

const STEPS = [
  {
    number: "1",
    title: "Create the trip",
    description: "Dates, a destination, and a name.",
  },
  {
    number: "2",
    title: "Invite your friends",
    description:
      "By name or by number. They get a text with a link, and they can see the trip before they sign up.",
  },
  {
    number: "3",
    title: "Build the plan",
    description:
      "The organizer adds the days, the stay, and the events. Everyone else answers and adds their own travel.",
  },
] as const;
