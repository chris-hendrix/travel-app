import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { EventRow } from "@/components/trip/EventRow";
import { StayRow } from "@/components/trip/StayRow";
import type { Trip } from "@/components/trip/TripCard";
import { dayLabel, daysFrom, groupEventsByDay, liveEvents, tripIsOver } from "@/lib/itinerary";
import { useEvents as useEventsSection } from "@/lib/queries/events";
import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { ChipToggle } from "@/components/ui/ChipToggle";
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
 * days. So the top of an itinerary is always the day you are on, and
 * what has already happened piles up at the bottom when you ask for it.
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
 * No other control in view than the run's own filter, at its head: how
 * far down it you read. It was a row in Trip settings, which is where you
 * go to change a thing you are looking at — the switch belongs beside
 * what it switches, so you see what it did. The clock is not here either:
 * the header's zone token flips that, one tap away on every screen that
 * shows a time.
 *
 * There was a second control beside it, grid or list, and it is gone. A
 * run is a schedule you read rather than a gallery you browse, and the
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
  const { showPast, clock } = settingsFor(trip, now);
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

  // Past events is only a question while the trip is under way. Before it
  // starts there is nothing behind you to filter; once it is over
  // everything is, and a finished run is always whole — the switch cannot
  // be left off in a way that hides the trip, which is also why it is not
  // offered then. So: the chip renders in the middle of the trip and
  // nowhere else, and the stored answer only ever narrows an unfinished
  // run. (The store's default says the same thing for a first visit;
  // this is the rule, that is the starting point.)
  const over = tripIsOver(trip.endDate, today);
  const underway = today >= trip.startDate && !over;

  const days = groupEventsByDay(liveEvents(events), timeZone);
  // With the past on, the trip reads as one run from its first day to
  // its last; with it off, it starts at today.
  const shown = showPast || over ? days : daysFrom(days, today);

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
    <View className="gap-6">
      {/* No head label, and no controls of the page's: the run's structure
          is its own headings — the roofs, then the days — and what they
          are is what they say. There was an ITINERARY eyebrow above this
          block, which named a list that the day headings had already
          named one line further down, and it was there to anchor the two
          buttons that used to sit in it. Those moved to the page's
          action block (components/trip/TripActions.tsx), and the eyebrow
          went with them. */}

      {/* The run's own filter, at the head of the block it changes: how
          much of the run you are reading. It was a row in Trip settings,
          which is where you go to change a thing you are looking at —
          the switch belongs beside what it switches, so you see what it
          did. There was a grid-or-list switch beside it and there is not
          any more: see the note above the component.

          A run with no days gets nothing. The chip is about a list that
          is not there, so the head of an empty run was a cell and a chip
          over the word "nothing" — the loudest thing on the quietest
          screen, and inert. It is held back until the events read has
          landed, because until it has, "no days" and "not arrived yet"
          are the same picture: the run arrives whole, its control with
          its first heading rather than ahead of a loading block. */}
      {eventsStatus === "success" && !missingEvents && underway ? (
        <View className="flex-row justify-end">
          <ChipToggle
            label="Past events"
            selected={showPast}
            onPress={() => update(trip.id, { showPast: !showPast })}
          />
        </View>
      ) : null}

      {/* One table for the whole itinerary, with the days inside it:
          a table per day would put two rules 24px apart at every day
          boundary. The heading lumps a day together and the gap above
          it separates it from the day before. No rule above the table:
          the page's seam is the run's opening line. */}
      <View>
          {staysStatus === "loading" ? (
            <LoadingBlock label="Getting the stays" />
          ) : staysStatus === "offline" ? (
            <OfflineBlock onRetry={retryStays} />
          ) : staysStatus === "error" ? (
            <InlineError
              message="Couldn't load the stays"
              onRetry={retryStays}
            />
          ) : stays.length > 0 ? (
            // The table's first heading is the roofs, in the same face
            // as the days below it: the run opens with where you sleep.
            <View className="pt-6">
              <Text className="pb-3 font-display text-xl uppercase leading-none text-ink">
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
          ) : null}
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
            shown.map((day, index) => (
              <View
                key={day.date}
                // The heading needs air under the rule; a day break then
                // has to be roomier than a row break, or the two read the
                // same. A day following the stays is a block break too,
                // so it takes the roomy one either way the run opens.
                className={
                  index === 0 && stays.length === 0 ? "pt-6" : "pt-10"
                }
              >
                <Text className="pb-3 font-display text-xl uppercase leading-none text-ink">
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
                <Text className="font-display text-xl uppercase leading-none text-ink">
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
          ) : shown.length === 0 ? (
            <View className="gap-1">
              <Text className="font-display text-xl uppercase leading-none text-ink">
                Nothing ahead
              </Text>
              <Text className="font-body text-base text-ink">
                Everything on this trip has already happened. Turn on Past
                events to read it.
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
