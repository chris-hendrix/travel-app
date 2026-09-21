import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { EventCard } from "@/components/trip/EventCard";
import { EventRow } from "@/components/trip/EventRow";
import { StayCard } from "@/components/trip/StayCard";
import { StayRow } from "@/components/trip/StayRow";
import { Button } from "@/components/ui/Button";
import { Grid } from "@/components/ui/Grid";
import type { Trip } from "@/components/trip/TripCard";
import { dayLabel, daysFrom, groupEventsByDay, liveEvents } from "@/lib/itinerary";
import { useEvents as useEventsSection } from "@/lib/queries/events";
import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { useStays } from "@/lib/staysStore";
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
 * The run also owns the way to add to it. Add event and Add stay sit in
 * the section head rather than in the stack at the top of the screen:
 * the surface that holds a list holds the way onto it.
 *
 * They are buttons, and they were quiet words. The words were the two
 * most-used verbs on this screen wearing the quietest treatment in the
 * system, where an underlined label in a section head reads as a link in
 * a paragraph. They are secondary rather than primary, because the trip
 * page spends its one loud button on Invite people, and each fills the
 * width on a phone and hugs its label from md, where the two of them sit
 * in a row.
 *
 * No other controls in view: how much of it you read, whose clock you
 * read it on, and whether it is cards or a table are Trip settings,
 * which live in the header's action group with the trip's other buttons.
 * What is left here is content.
 *
 * Every card and row opens the same detail. Who is looking is carried
 * down from the screen above rather than asked again, so the dialog
 * cannot disagree with the trip it hangs over.
 */
export function Itinerary({
  trip,
  as = "traveler",
  now = new Date(),
}: {
  trip: Trip;
  /** Passed straight through to each detail dialog. */
  as?: "organizer" | "traveler";
  /** Injected so the grouping and the labels agree on the moment. */
  now?: Date;
}) {
  const router = useRouter();
  const { for: settingsFor, update } = useTripSettings();
  // The events read is server state now (GET /trips/:tripId/events),
  // explicit per section — the header above never blanks while it
  // loads. Stays and travel still read their mocks (Phase 6 Tasks
  // 3–4 rewire those), so only the events half below is query-backed.
  const { events, status: eventsStatus, retry: retryEvents } =
    useEventsSection(trip.id);
  const { staysForTrip } = useStays();
  const { showPast, clock, layout } = settingsFor(trip, now);

  const organizer = as === "organizer";
  const cards = layout === "cards";
  const openEvent = (eventId: string) =>
    router.push(
      `/trips/events/detail?id=${trip.id}&event=${eventId}&as=${as}`,
    );
  const openStay = (stayId: string) =>
    router.push(
      `/trips/stay/detail?id=${trip.id}&stay=${stayId}&as=${as}`,
    );
  const addEvent = () => router.push(`/trips/events/new?id=${trip.id}`);
  const addStay = () => router.push(`/trips/stay/new?id=${trip.id}`);

  // The zone drives the grouping as well as the clock: an evening in
  // Mallorca belongs to the day it is in Mallorca.
  const timeZone = clock === "trip" ? trip.preferredTimezone : null;
  // And it is the one place a time's zone is stated: the chrome above
  // these rows names it for all of them.
  useDisplayZone(zoneFor(trip, clock, update));
  const today = todayIn(timeZone, now);

  const days = groupEventsByDay(liveEvents(events), timeZone);
  // With the past on, the trip reads as one run from its first day to
  // its last; with it off, it starts at today.
  const shown = showPast ? days : daysFrom(days, today);

  // Earliest first: the store already holds them in the order you will
  // sleep in them.
  const stays = staysForTrip(trip);

  return (
    <View className="gap-6">
      {/* The run's head. The label names the one block on this screen
          that is a list of many things rather than a fact about the
          trip, and it is what anchors the organizer's two actions: a
          pair of boxes on their own line, with nothing above them, reads
          as chrome that fell off something else. */}
      <View className="gap-3">
        <Text className="font-body-bold text-sm uppercase tracking-widest text-ink">
          Itinerary
        </Text>
        {organizer ? (
          <View className="flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <Button
              title="Add event"
              variant="secondary"
              onPress={addEvent}
            />
            <Button
              title="Add stay"
              variant="secondary"
              onPress={addStay}
            />
          </View>
        ) : null}
      </View>

      {cards ? (
        <>
          {stays.length > 0 ? (
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
          ) : null}
          {eventsStatus === "loading" ? (
            <LoadingBlock label="The run" />
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
        // it separates it from the day before.
        <View className="border-t border-ink">
          {stays.map((stay) => (
            <StayRow
              key={stay.id}
              stay={stay}
              timeZone={timeZone}
              onPress={() => openStay(stay.id)}
            />
          ))}
          {eventsStatus === "loading" ? (
            <LoadingBlock label="The run" />
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
                // same.
                className={index === 0 ? "pt-6" : "pt-10"}
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
          is a hint about a setting. The ways in are in the head, so
          neither block repeats them. Only once the events read has
          landed: while it loads or fails the section above owns the
          copy, and an empty read before arrival would flash. */}
      {eventsStatus !== "success" ? null : days.length === 0 ? (
        <View className="gap-1 border-t border-ink pt-6">
          <Text className="font-display text-xl uppercase leading-none text-ink">
            Nothing planned yet
          </Text>
          <Text className="font-body text-base text-ink">
            {organizer
              ? "Start with the first event, or add where you're sleeping."
              : "Nothing has been added to this trip yet."}
          </Text>
        </View>
      ) : shown.length === 0 ? (
        <View className="gap-1 border-t border-ink pt-6">
          <Text className="font-display text-xl uppercase leading-none text-ink">
            Nothing ahead
          </Text>
          <Text className="font-body text-base text-ink">
            This trip is behind you. Turn on Past events to read it.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
