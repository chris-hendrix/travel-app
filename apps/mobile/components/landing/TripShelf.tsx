import { Text, View } from "react-native";

import { TripCard, type Trip } from "@/components/trip/TripCard";
import { Band } from "@/components/ui/Band";
import { Column } from "@/components/ui/Column";
import { Grid } from "@/components/ui/Grid";
import { Section } from "@/components/ui/Section";
import type { DemoTripCard } from "@/lib/demo";

/**
 * The shelf: three real demo trips, the first sharing the mechanism band.
 *
 * The landing's whole argument is that a trip here is legible at a
 * glance, so the evidence is three trips and not a description of them.
 * The band is where that argument is made, and it has three properties
 * worth stating, because each was arrived at by looking at it:
 *
 * - **The band's air is the page's rhythm.** The mechanism row and the
 *   first card share one `baltic` ground, in the page's own container: the
 *   card is inset by the same 24/40 a block gets, so the band sits 80px
 *   from the deets paragraph above it and 80px from the card row below,
 *   which is exactly the air between the hero's band and the deets. A
 *   first pass gave the ground its own, larger padding on the argument
 *   that a colour change deserves more room than a block does; it read as
 *   a card floating in teal, because the band then had 2.6× the page's
 *   rhythm around it and the rhythm is what the eye is following down the
 *   page.
 * - **The mechanism sits centred against the card.** A heading and two
 *   short paragraphs against a photo and three lines of type: pinned to
 *   the top, the block left the band's lower half empty and read as a
 *   layout that had run out. Centred, the two columns are one composition,
 *   and the placement is the band's own air above and below the words.
 * - **The steps carry no row rules.** `rule-soft` is 2.22:1 on `baltic`
 *   against its declared floor of 2.4, so the two steps are plain
 *   paragraphs in a `Section rule={false}` rather than the `RuledRows`
 *   table the landing used when they sat on sand. Two marks for one seam
 *   is also why the `Section` drops its ink rule: the band's own edge is
 *   the boundary above it.
 *
 * There is deliberately no call to action in here. The hero carries the
 * page's only button: a second `Get started` beside the mechanism was the
 * one thing in the band that was neither the mechanism nor evidence of it,
 * and it pulled a reader's thumb back up the page they had just come down.
 * The cards are the band's affordances.
 *
 * The other two cards are labelled `More trips to open` and share a two-up
 * `Grid` on sand, in the page's own container — the repo's one layout above
 * 768px, and the arrangement `Grid` documents. They are cards 2 and 3 in the
 * pin order (`lib/demo.ts`), never a re-sorted set: the bachelor party leads
 * because the deets paragraph describes its own detail (four friends landing
 * twenty minutes apart), and a shelf whose order moved with the calendar
 * would make that copy a lie twice a month. They are cards 2 and 3 in the pin order (`lib/demo.ts`), never
 * a re-sorted set: the bachelor party leads because the deets paragraph
 * describes its own detail (four friends landing twenty minutes apart), and
 * a shelf whose order moved with the calendar would make that copy a lie
 * twice a month.
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
}: {
  /** The three cards, in the pinned order — `demoTripCards(today)`. */
  cards: DemoTripCard[];
  /** Injected so the countdowns and the fixtures agree on "now". */
  today: Date;
  /** A card was pressed; it is handed the href the card carries. */
  onOpenTrip: (href: string) => void;
}) {
  const first = cards[0];
  const rest = cards.slice(1);
  // Three cards is the shelf, and `Grid` is two-up: a fourth would orphan.
  // Rendering nothing rather than a broken row is the honest refusal.
  if (!first) return null;

  return (
    <>
      <Band tone="baltic">
        <Column>
          <View className="flex-col gap-10 lg:flex-row lg:items-center lg:gap-6">
            <View className="min-w-0 flex-1">
              <Section title="How it works" rule={false}>
                <Text className="font-body text-base leading-relaxed text-ink">
                  Name the trip. Pick the dates and the place. Send the text.
                </Text>
                <Text className="font-body text-base leading-relaxed text-ink">
                  Open the text. Say if they're coming. Add their flight.
                </Text>
              </Section>
            </View>
            {/* The card's own width, and nothing of this row's. The
                wrapper carries exactly what a `Grid` cell carries —
                `w-full` until the page reaches its wide column, an exact
                420px there — so the card in the band wraps and resizes in
                step with the two below it. An unconditional `max-w-[420px]`
                was tried first: below `lg` that kept this card capped while
                the `Grid`'s went full width, so the shelf showed two
                layouts at once on a tablet. */}
            <View className="w-full lg:w-[420px] lg:flex-none">
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
        {/* The lower row is labelled, and the label is a description rather
            than a pitch: a reader who has just been shown the mechanism has
            no way to know that the tiles under it are trips they can open,
            and "open" is the page's own word for what a tile does (the demo
            is the thing every card opens). Not a second heading of the
            page's rank — it is the same `Section` form the mechanism uses,
            so the shelf reads as one block with two rows rather than as two
            sections. `rule={false}` because the boundary above it is the
            band's own edge and a rule there would cut the second row off
            from the first, which is the opposite of the point. */}
        <Section title="More trips to open" rule={false}>
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
        </Section>
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
