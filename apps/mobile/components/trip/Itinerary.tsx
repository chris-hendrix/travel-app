import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { EventCard } from "@/components/trip/EventCard";
import { EventRow } from "@/components/trip/EventRow";
import { StayCard } from "@/components/trip/StayCard";
import { StayRow } from "@/components/trip/StayRow";
import { Grid } from "@/components/ui/Grid";
import type { Trip } from "@/components/trip/TripCard";
import { dayLabel, daysFrom, groupEventsByDay, liveEvents, tripIsOver } from "@/lib/itinerary";
import { useEvents as useEventsSection } from "@/lib/queries/events";
import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { Segmented } from "@/components/ui/Segmented";
import type { Layout } from "@/lib/tripSettingsStore";
import { useStays } from "@/lib/staysStore";
import { useStays as useStaysSection } from "@/lib/queries/stays";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useDisplayZone, zoneFor } from "@/lib/displayZone";
import { todayIn } from "@/lib/timezone";

/**
 * The two layouts, as the run's toggle reads them.
 *
 * List leads because it is the default (`lib/tripSettingsStore.tsx`):
 * the first cell is the one you are already in, so nothing moves under
 * your thumb when the run answers with what you expect. Grid second, as
 * the one you go to.
 */
const LAYOUTS: Array<{ value: Layout; label: string }> = [
  { value: "list", label: "List" },
  { value: "grid", label: "Grid" },
];

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
 * from, and each one wears what the layout says a thing wears, the run's
 * own tile or the run's own row.
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
 * No other controls in view than the run's own two, at its head: how far
 * down it you read, and whether it is a grid of cards or a list of rows.
 * Both were rows in Trip settings, which is where you go to change a
 * thing you are looking at — the switch belongs beside what it switches,
 * so you see what it did. The clock is not among them: the header's zone
 * token flips that, one tap away on every screen that shows a time.
 *
 * The two sit at the two edges of one row rather than shoulder to
 * shoulder, because they are not the same kind of thing: the layout
 * switch is a choice out of a few, the filter is a switch you turn on
 * separately from it. A single run of three identical cells reads as one
 * choice of three.
 *
 * What is left here is content, and the two chips that decide how much
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
  const { showPast, clock, layout } = settingsFor(trip, now);

  const cards = layout === "grid";
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

      {/* The run's own two controls, at the head of the block they
          change: whether it is cards or rows, and how much of it you
          read. The switch leads and always leads — it is the control for
          the thing you are looking at, and it is there every time this
          block is; the filter is the extra one, and it sits at the far
          edge so the two never read as one set. The switch is the same
          cells as every other choice in the app (`Segmented`), because a
          control that sometimes holds a value and sometimes does not is
          one control in this system, not two. */}
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <View className="flex-1">
          <Segmented
            options={LAYOUTS}
            value={layout}
            onChange={(next) => update(trip.id, { layout: next })}
            // A chrome row's height, not a button's: it shares this line
            // with the filter chip, and the two are one size.
            size="sm"
          />
        </View>
        {underway ? (
          <ChipToggle
            label="Past events"
            selected={showPast}
            onPress={() => update(trip.id, { showPast: !showPast })}
          />
        ) : null}
      </View>

      {cards ? (
        <>
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
            // A heading of the run's own, in the days' own face: the
            // roofs are the first block of it, not a preamble to it. No
            // rule above it — the page draws the one seam, under both of
            // its columns, and this block begins the run on its far side.
            <View className="gap-6">
              <Text className="font-display text-xl uppercase leading-none text-ink">
                Stays
              </Text>
              <Grid>
                {stays.map((stay) => (
                  <StayCard
                    key={stay.id}
                    stay={stay}
                    timeZone={timeZone}
                    onPress={() => openStay(stay.id)}
                  />
                ))}
              </Grid>
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
            <View className="gap-8">
              {shown.map((day) => (
                <View
                  key={day.date}
                  className="gap-6 border-t border-ink pt-6"
                >
                  <Text className="font-display text-xl uppercase leading-none text-ink">
                    {dayLabel(day.date, today)}
                  </Text>
                  <Grid>
                    {day.events.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        timeZone={timeZone}
                        onPress={() => openEvent(event.id)}
                      />
                    ))}
                  </Grid>
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        // One table for the whole itinerary, with the days inside it:
        // a table per day would put two rules 24px apart at every day
        // boundary. The heading lumps a day together and the gap above
        // it separates it from the day before. No rule above the table:
        // the page's seam is the run's opening line.
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
      )}

      {/* Empty is two different states, and they used to share one line
          of copy: a trip with nothing on it yet, and a trip whose days
          have all been and gone. The first is an invitation, the second
          is a hint about a setting. The ways in are in the action block
          at the top of the page, so the organizer's line names them
          rather than repeating them as controls a second time. Only once
          both reads have landed: while either loads or fails its section
          above owns the copy, and an empty read before arrival would
          flash. */}
      {eventsStatus !== "success" || staysStatus !== "success" ? null : days.length === 0 &&
        stays.length === 0 ? (
        <View className="gap-1">
          <Text className="font-display text-xl uppercase leading-none text-ink">
            Nothing planned yet
          </Text>
          <Text className="font-body text-base text-ink">
            {organizer
              ? "Add event and Add stay are at the top of the trip."
              : "Nothing has been added to this trip yet."}
          </Text>
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
  );
}
