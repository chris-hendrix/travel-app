import { Text, View } from "react-native";
import { EventCard } from "@/components/trip/EventCard";
import { EventRow } from "@/components/trip/EventRow";
import { Grid } from "@/components/ui/Grid";
import type { Trip } from "@/components/trip/TripCard";
import { dayLabel, daysFrom, groupEventsByDay } from "@/lib/itinerary";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useEvents } from "@/lib/eventsStore";
import { todayIn } from "@/lib/timezone";

/**
 * A trip's days, each one a section holding that day's events.
 *
 * Today first, then the days ahead soonest first, then the days behind
 * most recent first — the trips screen's upcoming/past rule, applied to
 * days. So the top of an itinerary is always the day you are on, and
 * what has already happened piles up at the bottom when you ask for it.
 *
 * No controls in view: how much of it you read, whose clock you read it
 * on, and whether it is cards or a table are Trip settings, which live
 * in the header's action group with the trip's other buttons. What is
 * left here is content.
 */
export function Itinerary({
  trip,
  now = new Date(),
}: {
  trip: Trip;
  /** Injected so the grouping and the labels agree on the moment. */
  now?: Date;
}) {
  const { for: settingsFor } = useTripSettings();
  const { eventsForTrip } = useEvents();
  const { showPast, clock, layout } = settingsFor(trip, now);

  // The zone drives the grouping as well as the clock: an evening in
  // Mallorca belongs to the day it is in Mallorca.
  const timeZone = clock === "trip" ? trip.preferredTimezone : null;
  const today = todayIn(timeZone, now);

  const days = groupEventsByDay(eventsForTrip(trip), timeZone);
  // With the past on, the trip reads as one run from its first day to
  // its last; with it off, it starts at today.
  const shown = showPast ? days : daysFrom(days, today);

  return (
    <View className="gap-6">
      {layout === "list" ? (
        // One table for the whole itinerary, with the days inside it:
        // a table per day would put two rules 24px apart at every day
        // boundary. The heading lumps a day together and the gap above
        // it separates it from the day before.
        <View className="border-t border-ink">
          {shown.map((day, index) => (
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
                <EventRow key={event.id} event={event} timeZone={timeZone} />
              ))}
            </View>
          ))}
        </View>
      ) : (
        shown.map((day) => (
          <View key={day.date} className="gap-6 border-t border-ink pt-6">
            <Text className="font-display text-xl uppercase leading-none text-ink">
              {dayLabel(day.date, today)}
            </Text>
            <Grid>
              {day.events.map((event) => (
                <EventCard key={event.id} event={event} timeZone={timeZone} />
              ))}
            </Grid>
          </View>
        ))
      )}

      {shown.length === 0 ? (
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
