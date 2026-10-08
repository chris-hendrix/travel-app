import { Text, View } from "react-native";

import { TripCard, type Trip } from "@/components/trip/TripCard";
import { Band } from "@/components/ui/Band";
import { Button } from "@/components/ui/Button";
import { Column } from "@/components/ui/Column";
import { Grid } from "@/components/ui/Grid";
import { Section } from "@/components/ui/Section";
import type { DemoTripCard } from "@/lib/demo";

/**
 * The shelf: three real demo trips, the first sharing the mechanism band.
 *
 * The landing's whole argument is that a trip here is legible at a
 * glance, so the evidence is three trips and not a description of them.
 * The shape comes from two things that cannot both be satisfied the
 * obvious way:
 *
 * - **The band's height is the card's.** The mechanism row and the first
 *   card share one `baltic` band, and the band ends exactly where the
 *   card does — which is why the `Column` inside it is `flush` and the
 *   card, not the words, sets the height on wide. Dressed with the
 *   ordinary rhythm the band would read as a section the card happened
 *   to sit in, and the set of three would look detached from the
 *   mechanism that produced it. On a phone the row stacks, so this is a
 *   wide-only property: there the band is as tall as both.
 * - **The steps carry no rows rules.** `rule-soft` is 2.22:1 on `baltic`
 *   against its declared floor of 2.4, so the two steps are plain
 *   paragraphs in a `Section rule={false}` rather than the `RuledRows`
 *   table the landing used when they sat on sand. Two marks for one seam
 *   is also why the `Section` drops its ink rule: the band's own edge is
 *   the boundary above it.
 *
 * The other two cards are a two-up `Grid` on sand — the repo's one layout
 * above 768px, and the arrangement `Grid` documents. They are cards 2 and
 * 3 in the pin order (`lib/demo.ts`), never a re-sorted set: the bachelor
 * party leads because the deets band's copy describes its own detail (four
 * friends landing twenty minutes apart), and a shelf whose order moved with
 * the calendar would make that copy a lie twice a month.
 *
 * Routing stays with the caller. This component is the page's *shape*, and
 * a `Link` buried in it would be the second place that knows where the demo
 * lives — the lab renders this specimen too, where a press must log rather
 * than navigate.
 */
export function TripShelf({
  cards,
  today,
  onOpenTrip,
  onGetStarted,
}: {
  /** The three cards, in the pinned order — `demoTripCards(today)`. */
  cards: DemoTripCard[];
  /** Injected so the countdowns and the fixtures agree on "now". */
  today: Date;
  /** A card was pressed; it is handed the href the card carries. */
  onOpenTrip: (href: string) => void;
  /** The mechanism's own `Get started`, the second one on the page. */
  onGetStarted: () => void;
}) {
  const first = cards[0];
  const rest = cards.slice(1);
  // Three cards is the shelf, and `Grid` is two-up: a fourth would orphan.
  // Rendering nothing rather than a broken row is the honest refusal.
  if (!first) return null;

  return (
    <>
      <Band tone="baltic">
        <Column flush>
          <View className="flex-col gap-10 lg:flex-row lg:items-start lg:gap-6">
            <View className="min-w-0 flex-1 gap-6">
              <Section title="How it works" rule={false}>
                <Text className="font-body text-sm leading-snug text-ink">
                  Name the trip. Pick the dates and the place. Send the text.
                </Text>
                <Text className="font-body text-sm leading-snug text-ink">
                  Open the text. Say if they're coming. Add their flight.
                </Text>
              </Section>
              <Button title="Get started" onPress={onGetStarted} />
            </View>
            <View className="w-full max-w-[420px] lg:w-[420px] lg:flex-none">
              <TripCard
                trip={shelfTrip(first)}
                today={today}
                coverKind={first.coverKind}
                onPress={() => onOpenTrip(first.href)}
              />
            </View>
          </View>
        </Column>
      </Band>

      <Column>
        <Grid>
          {rest.map((card) => (
            <TripCard
              key={card.id}
              trip={shelfTrip(card)}
              today={today}
              coverKind={card.coverKind}
              onPress={() => onOpenTrip(card.href)}
            />
          ))}
        </Grid>
      </Column>
    </>
  );
}

/**
 * A shelf card as the `Trip` the card component takes.
 *
 * Only the fields `TripCard` reads are real. `image` is null on purpose:
 * a demo trip has no cover photo, which is what makes the card fall back
 * to `coverKind` — the occasion photo — instead of a remote file. The two
 * fields that exist only because `Trip` requires them are filled honestly
 * rather than plausibly: `going` is the fixture's own roster size, and
 * `preferredTimezone` is empty exactly as the fixture's detail row leaves
 * it, because nothing on this card reads a clock.
 */
function shelfTrip(card: DemoTripCard): Trip {
  return {
    id: card.id,
    title: card.title,
    location: card.location,
    image: null,
    coverImageUrl: null,
    going: card.going,
    description: null,
    preferredTimezone: "",
    startDate: card.startDate,
    endDate: card.endDate,
  };
}
