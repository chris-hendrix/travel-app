import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { Building2, Calendar, Plane, Users } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { LEGAL_ROWS } from "@/lib/legal";

/**
 * The landing: what the app is, for someone who has not signed in.
 *
 * The page's shape follows the pitch rather than the feature list: the
 * promise, the four things it holds, the mess it replaces, what goes in
 * the trip, how a trip gets there, then the same door again at the
 * bottom. Body copy runs the full column at every width, the same way
 * the rules and the card grid do.
 *
 * Every claim on it is held to what the app does. Two that the copy
 * used to make are gone because the app does the opposite: the group
 * does not contribute to the itinerary (the organizer authors it), and
 * there is no group vote on lodging (an organizer adds the stay, and
 * everyone reads it). The one thing the old copy left out was the
 * coordination itself (invites, answers, who's coming), which is the
 * product's whole reason for existing.
 *
 * Not gated on anything yet. When the sign-in screen lands this becomes
 * the branch it takes when nobody is signed in, and the trips list the
 * branch it takes when somebody is. The same shape as the web's home
 * page, which sends a signed-in reader to /trips.
 */
export default function Landing() {
  const router = useRouter();

  return (
    <Screen>
      <View className="gap-16 pb-12 pt-4 md:pt-14">
        <View className="gap-6">
          <Text className="font-display text-6xl uppercase leading-[0.85] text-ink md:text-7xl">
            One place for the whole trip
          </Text>
          <Text className="font-body text-lg leading-snug text-ink">
            The itinerary, the hotel or Airbnb, the flights, and who's in.
            All in one place.
          </Text>
          {/* No `fullWidth`: the button already fills the width on a phone
              and hugs its edge from md up, which is the behaviour a hero
              wants. A full-width bar on a desktop column reads as a
              banner, not a button. */}
          <Button title="Get started" onPress={() => router.push("/trips")} />
        </View>

        {/* The deck lists the four things; this section says where they
            live instead of listing them again. Agitation, not a mirror. */}
        <View className="gap-4">
          <Text className="font-display text-2xl uppercase leading-tight text-ink">
            It starts in the group chat
          </Text>
          <Text className="font-body text-base leading-relaxed text-ink">
            Then it moves to a spreadsheet, and ends with a forwarded booking
            confirmation. By the time everyone lands, nobody is looking at the
            same plan.
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
            second one: one goal, one label, twice down the page. */}
        <View className="gap-6">
          <Text className="font-display text-2xl uppercase leading-tight text-ink">
            One place, from the first text to the last flight
          </Text>
          <Button title="Get started" onPress={() => router.push("/trips")} />
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
 * is being planned: the plan, the roof, the travel, and everyone's
 * answers. Titles are sentence case because the display face uppercases
 * them anyway, and this copy gets reused verbatim where it does not.
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
    title: "Who's in",
    description: "An answer from everyone, and invites by name or number.",
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
    description: "By name or by number. They get a text, and they're in.",
  },
  {
    number: "3",
    title: "Build the plan",
    description:
      "The organizer adds the days, the stay, and the events. Everyone else answers and adds their own travel.",
  },
] as const;
