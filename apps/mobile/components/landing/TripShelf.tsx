import { Text, View } from "react-native";

import { TripCard, type Trip } from "@/components/trip/TripCard";
import { Band } from "@/components/ui/Band";
import { Column } from "@/components/ui/Column";
import { Grid } from "@/components/ui/Grid";
import { Section } from "@/components/ui/Section";
import type { DemoTripCard } from "@/lib/demo";

/**
 * The shelf's name. It sits below the band rather than above it, and its
 * wording carries all three tiles rather than the two under it — the thing a
 * reader has to know is that the trip in the band is openable too, and a
 * heading over two of the three says the opposite. `More trips to open` was
 * the first attempt and it made exactly that mistake.
 *
 * The wording is the page's own register — plain, concrete, no pitch: what
 * the tiles are (real trips) and what you do with them (look through them).
 * "look through" is the honest verb for what pressing one does, since the
 * demo lets a reader read a trip rather than edit it.
 */
const SHELF_TITLE = "Real trips to look through";

/**
 * The shelf: three real demo trips, the first sharing the mechanism band.
 *
 * The landing's whole argument is that a trip here is legible at a
 * glance, so the evidence is three trips and not a description of them.
 * The band is where that argument is made, and it has three properties
 * worth stating, because each was arrived at by looking at it:
 *
 * - **The steps name their subjects, and there are only two of them.**
 *   `Name the trip. Pick the dates and the place. Send the text.` was six
 *   imperatives with no actor, and "the text" arrived from nowhere: the
 *   reader is a stranger who has never seen an invite. The rows are now the
 *   two parties and the two moves — **You** set the trip up and invite by
 *   phone number; **They** open the invite in the text and join — with
 *   `join` taken from the invite screen's own button ("Sign in to join") so
 *   the landing and the screen behind it use one vocabulary.
 *
 *   A member can also answer the invite and add their own travel, and
 *   neither is in here. Answering is a formality in a group that already
 *   knows each other, and the page had already cut "knowing who is coming"
 *   as a selling point (`app/index.tsx`); travel, the stay and the itinerary
 *   are the trip's *contents*, so featuring one of them as a chore here made
 *   it read as an arbitrary third thing. `That's it.` closes the block and
 *   scopes what it claims: that is the whole setup, not the whole product.
 *
 * - **The band's air is the page's rhythm.** The mechanism row and the
 *   first card share one `baltic` ground, in the page's own container: the
 *   card is inset by the same 40/56 a block gets, so the band sits 80px
 *   from the deets paragraph above it and 80px from the card row below on a
 *   phone, and 112px from each on a wide one — the page's `roomy` seam, the
 *   same air between the hero's band and the deets. A first pass gave the
 *   ground its own, larger padding — 40/64 against a page still on 24/40 —
 *   on the argument that a colour change deserves more room than a block
 *   does; it read as a card floating in teal, because the band then had
 *   2.6× the page's rhythm around it and the rhythm is what the eye is
 *   following down the page. The fix was to raise the page under it rather
 *   than to lower the band: `Column`'s `roomy` variant is the whole landing
 *   wearing one rhythm, which keeps the ratio between a seam and a block's
 *   own interior while giving both more air.
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
 * The other two cards are a two-up `Grid` on sand, in the page's own
 * container — the repo's one layout above 768px, and the arrangement `Grid`
 * documents. They are cards 2 and 3 in the pin order (`lib/demo.ts`), never
 * a re-sorted set: the **beach** trip leads because the deets paragraph
 * describes its own detail (four friends landing twenty minutes apart), and
 * a shelf whose order moved with the calendar would make that copy a lie
 * twice a month. They share the heading below the band with card 1 — one
 * name for all three tiles, which is why the wording carries the set.
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
        <Column roomy>
          <View className="flex-col gap-10 lg:flex-row lg:items-center lg:gap-6">
            <View className="min-w-0 flex-1">
              <Section title="How it works" rule={false}>
                <Text className="font-body text-base leading-relaxed text-ink">
                  You name the trip, pick the dates and the place, and invite
                  your friends by phone number.
                </Text>
                <Text className="font-body text-base leading-relaxed text-ink">
                  They open the invite in the text and join.
                </Text>
                {/* The beat, not a third step. `pt-2` on top of the
                    `Section`'s own gap is what separates a block closing
                    from a thing still to do — and it is inside the
                    `Section` rather than a direct child of the `Column`,
                    which is the boundary the column-padding check guards. */}
                <View className="pt-2">
                  <Text className="font-body text-base leading-relaxed text-ink">
                    That's it.
                  </Text>
                </View>
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

      <Column roomy>
        {/* Below the band, where the reader has just met the first trip, so
            the heading arrives after the thing it is naming rather than
            before it. Its wording carries the whole set, not this row:
            `More trips to open` was the first attempt and it said the wrong
            thing — a heading over two of three tiles reads as though the
            third, the one the reader is looking at, is not one of them, and
            the tile nobody could tell was openable was that first one.
            `rule={false}` because a rule here would cut the second row off
            from the band above it, which is the opposite of the point. */}
        <Section title={SHELF_TITLE} rule={false}>
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
