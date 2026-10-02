import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { EventRow } from "@/components/trip/EventRow";
import { StayRow } from "@/components/trip/StayRow";
import type { Trip } from "@/components/trip/TripCard";
import { dayLabel, groupEventsByDay, liveEvents } from "@/lib/itinerary";
import { useEvents as useEventsSection } from "@/lib/queries/events";
import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { Band } from "@/components/ui/Band";
import { Column } from "@/components/ui/Column";
import { InlineAction } from "@/components/ui/InlineAction";
import { useStays } from "@/lib/staysStore";
import { useStays as useStaysSection } from "@/lib/queries/stays";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useDisplayZone, zoneFor } from "@/lib/displayZone";
import { todayIn } from "@/lib/timezone";

/**
 * A trip's days, each one a section holding that day's events.
 *
 * Today first, then the days ahead soonest first, then the days behind
 * most recent first — the trips screen's upcoming/past rule, applied to
 * days. The run is always whole: what has already happened stays in it,
 * at the bottom, because a trip you are halfway through is not a trip
 * that starts today.
 *
 * Before the first day sit the roofs, earliest first. Not days, and not
 * rows in the table by right: they are the base every day below departs
 * from, and each one wears the run's own row.
 *
 * A roof is not promoted and not indexed. There was a version where the
 * live one was a tile and the others were lines under it, on the
 * argument that five tiles above Today is the itinerary before the
 * itinerary starts. The argument was wrong in the same way it would be
 * for events: a roof is a thing in the run, so it is drawn by the same
 * component every other thing is, and the only difference is data. The
 * chip reads Stay, and the column an event spends on a clock carries the
 * span instead.
 *
 * The run used to own the way to add to it: Add event and Add stay sat
 * in this section's head, on the argument that the surface that holds a
 * list holds the way onto it. They moved up to the trip page's action
 * block (components/trip/TripActions.tsx), because the page's verbs
 * belong in one place and this head was the second of the three homes
 * they had — with Add the first event a third while the run was empty,
 * which existed only because this head sat below the fold.
 *
 * The head went with them, and the run's structure is now its own
 * headings: STAYS over the roofs, then a heading per day, all in the
 * display face at the same size, because they are the run's shape rather
 * than chrome about it. The eyebrow above them read ITINERARY, which is
 * the name of the block the day headings had already named one line
 * further down, and it existed to anchor the buttons that are no longer
 * here. What is left at the top of the run is a heading that says what
 * is under it.
 *
 * There is no control in view. The clock is not here: the header's zone
 * token flips that, one tap away on every screen that shows a time.
 *
 * There were two controls here and both are gone. The first was the
 * Past events chip, which narrowed the run to today and onward and put
 * the days behind behind a switch. It was a real question — how far down
 * the run do you want to read — and the answer was wrong, because the
 * control decided what the trip *was* rather than how it was drawn. A
 * trip in progress has already happened; hiding that is not a filter, it
 * is an edit. The run is now always whole, which also retires the
 * Nothing ahead branch that existed only to point at the switch.
 *
 * The second was grid or list, and it is gone. A run is a schedule you
 * read rather than a gallery you browse, and the
 * two renderings were a second way to draw the same screen: a state to
 * persist, a switch to hide whenever the run was empty, and no answer at
 * all for a run holding only a stay — which is the arrangement that had
 * shipped. One way to draw it has none of those questions.
 *
 * What is left here is content, and the one chip that decides how much
 * of it you are reading at once.
 *
 * Every card and row opens the same detail. Who is looking is read
 * from the server there, so the dialog cannot disagree with the trip
 * it hangs over.
 */
export function Itinerary({
  trip,
  organizer = false,
  now = new Date(),
}: {
  trip: Trip;
  /** Your server-side role: organizers are the ones who can add to the run. */
  organizer?: boolean;
  /** Injected so the grouping and the labels agree on the moment. */
  now?: Date;
}) {
  const router = useRouter();
  const { for: settingsFor, update } = useTripSettings();
  // The events and stays reads are server state now (GET
  // /trips/:tripId/events and /trips/:tripId/accommodations),
  // explicit per section — the header above never blanks while they
  // load, and one section's failure never blanks the other. Travel is
  // server state too (GET /trips/:tripId/member-travel); its board
  // dialog owns that query, so it renders nowhere here.
  const { events, status: eventsStatus, retry: retryEvents } =
    useEventsSection(trip.id);
  const { status: staysStatus, retry: retryStays } = useStaysSection(trip.id);
  const { staysForTrip } = useStays();
  const { clock } = settingsFor(trip);
  const openEvent = (eventId: string) =>
    router.push(`/trips/events/detail?id=${trip.id}&event=${eventId}`);
  const openStay = (stayId: string) =>
    router.push(`/trips/stay/detail?id=${trip.id}&stay=${stayId}`);

  // The zone drives the grouping as well as the clock: an evening in
  // Mallorca belongs to the day it is in Mallorca.
  const timeZone = clock === "trip" ? trip.preferredTimezone : null;
  // And it is the one place a time's zone is stated: the chrome above
  // these rows names it for all of them.
  useDisplayZone(zoneFor(trip, clock, update));
  const today = todayIn(timeZone, now);

  const days = groupEventsByDay(liveEvents(events), timeZone);

  // Earliest first: the store already holds them in the order you will
  // sleep in them.
  const stays = staysForTrip(trip);

  // What the run is missing. An absent event list and an absent stay are
  // two different states that want two different verbs, so they are two
  // questions rather than one. `days`, not `shown`: a trip whose events
  // have all happened still has events, and its foot is not the place to
  // offer a first one.
  const missingEvents = days.length === 0;
  const missingStays = stays.length === 0;

  return (
    <View>
      {/* The stays table as a ground of its own, at the very top of the run
          so it meets the hero's band with no sand between. The plan argued
          against band-against-band; this one has the reason the argument was
          missing — the hero is the trip and this is where you sleep, and the
          seam lands on the heading rather than above it. It is also the one
          adjacency `design-lint.mjs` check 5 cannot see, because check 5
          works per file and the other band is in `trips/detail.tsx`. */}
      {/* The band is gated on there being stays, not on the read having
          finished. It used to wrap the whole ternary, so a trip with no
          stays rendered the ground with nothing in it — an empty blue stripe
          between the hero and the days, which is a colour saying "here is
          where you sleep" over nothing at all.

          Loading and failure are not a section, so they are not on the
          section's ground: a band is what marks *where you sleep*, and a
          block that says "couldn't load the stays" is a problem rather than
          a place. */}
      {staysStatus === "loading" ? (
        <Column>
          <LoadingBlock label="Getting the stays" />
        </Column>
      ) : staysStatus === "offline" ? (
        <Column>
          <OfflineBlock onRetry={retryStays} />
        </Column>
      ) : staysStatus === "error" ? (
        <Column>
          <InlineError
            message="Couldn't load the stays"
            onRetry={retryStays}
          />
        </Column>
      ) : stays.length > 0 ? (
        <Band tone="baltic">
          <Column>
            {/* The table's first heading is the roofs, in the same face as
                the days below it: the run opens with where you sleep. No
                padding of its own: the band's column sets the rhythm, and on
                a band padding is not air, it is colour — the seam above has
                to be where the section starts, or it divides nothing. */}
            <View>
              <Text className="pb-3 font-display-semibold text-heading-lg uppercase text-ink">
                Stays
              </Text>
              {stays.map((stay) => (
                <StayRow
                  key={stay.id}
                  stay={stay}
                  timeZone={timeZone}
                  onPress={() => openStay(stay.id)}
                />
              ))}
            </View>
          </Column>
        </Band>
      ) : null}

      <Column>
        {/* The column supplies the block's own air — `py-6 md:py-10`. This
            view used to repeat that rhythm on top of it, so the sand below
            the stays band opened on two of them plus the first day's, and
            a seam that carries one air everywhere else on the page was
            carrying three. The gap between the blocks is all it still owes. */}
        <View className="gap-6">
      {/* No head label, and no controls of the page's: the run's structure
          is its own headings — the roofs, then the days — and what they
          are is what they say. There was an ITINERARY eyebrow above this
          block, which named a list that the day headings had already
          named one line further down, and it was there to anchor the two
          buttons that used to sit in it. Those moved to the page's
          action block (components/trip/TripActions.tsx), and the eyebrow
          went with them. */}

      {/* One table for the whole itinerary, with the days inside it:
          a table per day would put two rules 24px apart at every day
          boundary. The heading lumps a day together and the gap above
          it separates it from the day before. No rule above the table:
          the page's seam is the run's opening line. */}
      <View>
          {eventsStatus === "loading" ? (
            <LoadingBlock label="Getting the run" />
          ) : eventsStatus === "offline" ? (
            <OfflineBlock onRetry={retryEvents} />
          ) : eventsStatus === "error" ? (
            <InlineError
              message="Couldn't load the run"
              onRetry={retryEvents}
            />
          ) : (
            days.map((day, index) => (
              <View
                key={day.date}
                // Only a day that follows another day needs a break of its
                // own: the first one is already set off by whatever came
                // before the run — the band's lower seam and the column's
                // padding under it, or the column's padding alone when
                // there is no band. Adding a second padding here stacked
                // two airs and opened a hole under the stays; on a page
                // whose other colour blocks carry one, 80px read as a gap
                // rather than a separation.
                className={index === 0 ? "" : "pt-10"}
              >
                <Text className="pb-3 font-display-semibold text-heading-lg uppercase text-ink">
                  {dayLabel(day.date, today)}
                </Text>
                {day.events.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    timeZone={timeZone}
                    onPress={() => openEvent(event.id)}
                  />
                ))}
              </View>
            ))
          )}
      </View>

      {/* The foot of the run: what it is missing, and the words for it.

          Two states, and they used to share one condition and one line
          of copy. A trip with nothing on it is an invitation; a trip
          whose days have all been and gone is a hint about a setting.
          The condition used to be "no events AND no stays", which meant
          a trip holding a stay and no events fell through to the second
          state and was told its events had already happened — of a list
          that never existed. The two questions are asked separately now,
          so the run says only what is true of it.

          A sentence, with the way out of it inside the line. The verbs
          are words in the prose rather than a row of controls under it:
          a row of underlined words is a toolbar, and this is an empty
          state talking, not a menu. They are still pressed rather than
          followed — each opens the same dialog the block's boxes do —
          and they carry `QuietAction`'s two marks, bold and underlined.
          No colour: a colour here is a role, and a link in a sentence is
          doing neither of the jobs the palette's two name.

          What the sentence offers follows what is missing, and nothing
          more: a run with no events offers the event, and offers the
          stay too only when it has none. A run that holds events and no
          stay is offered nothing — it is working, and a stay prompt
          under a full itinerary points at the top of the page, which is
          where stays actually render.

          Only once both reads have landed: while either loads or fails
          its section above owns the copy, and an empty read before
          arrival would flash. */}
      {eventsStatus !== "success" || staysStatus !== "success" ? null : (
        <View className="gap-4">
          {missingEvents ? (
            <View className="gap-1">
              {/* The heading is the state, and it is only said when the
                  state is whole: a trip holding a stay and no events is
                  not "nothing planned", it is missing a plan, and the
                  sentence below says exactly that on its own. */}
              {missingStays ? (
                <Text className="font-display-semibold text-heading-lg uppercase text-ink">
                  Nothing planned yet
                </Text>
              ) : null}
              {organizer ? (
                <Text className="font-body text-base text-ink">
                  {missingStays ? (
                    <>
                      Add{" "}
                      <InlineAction
                        label="a stay"
                        onPress={() =>
                          router.push(`/trips/stay/new?id=${trip.id}`)
                        }
                      />{" "}
                      or{" "}
                      <InlineAction
                        label="an event"
                        onPress={() =>
                          router.push(`/trips/events/new?id=${trip.id}`)
                        }
                      />{" "}
                      to get started.
                    </>
                  ) : (
                    <>
                      Add{" "}
                      <InlineAction
                        label="an event"
                        onPress={() =>
                          router.push(`/trips/events/new?id=${trip.id}`)
                        }
                      />{" "}
                      to get started.
                    </>
                  )}
                </Text>
              ) : missingStays ? (
                <Text className="font-body text-base text-ink">
                  Nothing has been added to this trip yet.
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      )}
        </View>
      </Column>
    </View>
  );
}
